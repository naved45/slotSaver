import {
  Organization, Service, StaffProfile, Customer, WaitlistEntry, SlotOffer, Appointment,
  liveOfferFields, releaseOfferFields, slotKey,
} from '../models/index.js';
import { generateToken, hashToken } from '../utils/tokens.js';
import { AppError } from '../utils/appError.js';
import { getContext } from '../context.js';
import { seal } from '../utils/secretBox.js';
import { recordAudit } from './audit.service.js';
import { rankWaitlistCandidates } from './waitlist.service.js';
import { staffSlots, formatWhen } from './schedule.service.js';
import { scheduleNotification } from './notification.service.js';
import { enqueue } from '../jobs/queue.js';
import { MINUTE } from '../utils/time.js';
import { logger } from '../utils/logger.js';

const DEFAULT_OFFER_MINUTES = 60;

/**
 * Offers a freed slot to the best eligible waitlist entry. One live offer per slot and per
 * entry is enforced by sparse unique indexes. Expired or declined candidates are skipped.
 * Returns the created offer, or null when nobody is eligible.
 */
export async function offerSlotToWaitlist({ orgId, serviceId, staffId, startAt, endAt, sourceAppointmentId = null, now = new Date(), requestId = null }) {
  const org = await Organization.findById(orgId).lean();
  const service = await Service.findOne({ _id: serviceId, organizationId: orgId, active: true }).lean();
  const staff = await StaffProfile.findOne({ _id: staffId, organizationId: orgId, active: true }).lean();
  if (!org || !service || !staff) return null;

  // Only offer times that are genuinely bookable (inside hours, not a closure, not already taken).
  const day = localDay(startAt, org.timezone);
  const slots = await staffSlots({ org, service, staff, from: day, to: day, now });
  const bookable = slots.some((d) => d.slots.some((s) => s.startAt.getTime() === startAt.getTime()));
  if (!bookable) return null;
  if (await Appointment.exists({ organizationId: orgId, activeSlotKey: slotKey(staffId, startAt) })) return null;

  const entries = await WaitlistEntry.find({
    organizationId: orgId,
    serviceId,
    status: 'active',
    expiresAt: { $gt: now },
  }).lean();
  if (!entries.length) return null;

  const prior = await SlotOffer.find({
    organizationId: orgId,
    staffId,
    startAt,
    status: { $in: ['declined', 'expired', 'superseded'] },
  }).distinct('waitlistEntryId');
  const alreadyOffered = new Set(prior.map(String));

  const ranked = rankWaitlistCandidates(
    entries.filter((e) => !alreadyOffered.has(String(e._id))),
    { serviceId, staffId, startAt },
    org.timezone,
    now
  );

  const offerMinutes = org.bookingPolicy?.slotOfferExpiryMinutes ?? DEFAULT_OFFER_MINUTES;
  for (const { entry } of ranked) {
    const customer = await Customer.findById(entry.customerId).lean();
    if (!customer?.consent?.email) continue;

    const token = generateToken();
    // An offer never outlives its slot.
    const expiresAt = new Date(Math.min(now.getTime() + offerMinutes * MINUTE, startAt.getTime()));
    let offer;
    try {
      offer = await SlotOffer.create({
        organizationId: orgId,
        waitlistEntryId: entry._id,
        customerId: customer._id,
        serviceId,
        staffId,
        startAt,
        endAt,
        status: 'pending',
        expiresAt,
        tokenHash: hashToken(token),
        sourceAppointmentId,
        deliveredAt: now,
        ...liveOfferFields({ staffId, startAt, waitlistEntryId: entry._id }),
      });
    } catch (err) {
      if (err?.code !== 11000) throw err;
      const msg = String(err.message);
      if (msg.includes('activeSlotKey')) return null; // someone else already holds a live offer for this slot
      continue; // this entry already has a live offer elsewhere; try the next candidate
    }

    const acceptUrl = `${getContext().config.appBaseUrl}/offers/${token}`;
    await scheduleNotification({
      organizationId: orgId,
      type: 'waitlist_offer',
      recipientEmail: customer.email,
      customerId: customer._id,
      offerId: offer._id,
      scheduledFor: now,
      payload: {
        orgName: org.name,
        serviceName: service.name,
        whenText: formatWhen(startAt, org.timezone),
        expiresText: formatWhen(expiresAt, org.timezone),
        sealedLink: seal(acceptUrl),
      },
      idempotencyKey: `offer:${offer._id}:created`,
    });
    await enqueue({
      type: 'expire_offer',
      payload: { offerId: String(offer._id) },
      idempotencyKey: `expire:${offer._id}`,
      runAt: expiresAt,
    });
    await recordAudit({ organizationId: orgId, actorType: 'system', action: 'offer.created', resourceType: 'slot_offer', resourceId: offer._id, after: { staffId, startAt, expiresAt, sequence: offer.sequence }, requestId });
    return offer.toObject();
  }
  return null;
}

function localDay(instant, timezone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

/** Terminal transitions release the slot keys so the next candidate can be offered. */
async function closeOffer(offerId, fromStatuses, toStatus, extra = {}) {
  return SlotOffer.findOneAndUpdate(
    { _id: offerId, status: { $in: fromStatuses } },
    { $set: { status: toStatus, respondedAt: new Date(), ...extra }, $unset: releaseOfferFields },
    { new: true }
  );
}

/**
 * Called by the expiry job. Only closes a pending offer whose expiry has actually passed, so an
 * early or repeated run is harmless (idempotent).
 */
export async function expireOffer(offerId, now = new Date()) {
  const offer = await SlotOffer.findOneAndUpdate(
    { _id: offerId, status: 'pending', expiresAt: { $lte: now } },
    { $set: { status: 'expired', respondedAt: now }, $unset: releaseOfferFields },
    { new: true }
  );
  if (!offer) return { skipped: true };
  await recordAudit({ organizationId: offer.organizationId, actorType: 'system', action: 'offer.expired', resourceType: 'slot_offer', resourceId: offer._id });
  await advance(offer, now);
  return { expired: true };
}

/** Next candidate for the same slot after decline, expiry, or a failed acceptance. */
async function advance(offer, now = new Date()) {
  await offerSlotToWaitlist({
    orgId: offer.organizationId,
    serviceId: offer.serviceId,
    staffId: offer.staffId,
    startAt: offer.startAt,
    endAt: offer.endAt,
    sourceAppointmentId: offer.sourceAppointmentId,
    now,
  });
}

async function findByToken(token) {
  const hash = hashToken(token);
  return SlotOffer.findOne({ tokenHash: hash }).lean();
}

/** Public guest view of an offer (no secrets, no other customers' data). */
export async function getOfferForGuest(token) {
  const offer = await findByToken(token);
  if (!offer) throw new AppError(404, 'NOT_FOUND', 'This offer link is not valid');
  const [org, service] = await Promise.all([
    Organization.findById(offer.organizationId).select('name timezone').lean(),
    Service.findById(offer.serviceId).select('name durationMinutes').lean(),
  ]);
  const live = offer.status === 'pending' && offer.expiresAt > new Date();
  return {
    status: live ? 'pending' : offer.status === 'pending' ? 'expired' : offer.status,
    organization: org?.name,
    serviceName: service?.name,
    startText: formatWhen(offer.startAt, org.timezone),
    expiresText: formatWhen(offer.expiresAt, org.timezone),
  };
}

export async function declineOffer(token, meta = {}) {
  const offer = await findByToken(token);
  if (!offer) throw new AppError(404, 'NOT_FOUND', 'This offer link is not valid');
  const closed = await closeOffer(offer._id, ['pending'], 'declined');
  if (!closed) throw new AppError(410, 'OFFER_NOT_AVAILABLE', 'This offer is no longer available');
  await recordAudit({ organizationId: offer.organizationId, actorType: 'customer', action: 'offer.declined', resourceType: 'slot_offer', resourceId: offer._id, requestId: meta.requestId });
  await advance(closed);
  return { status: 'declined' };
}

/**
 * Accepts an offer. The first valid acceptance wins: the claim is an atomic status change
 * from pending to accepting, and the appointment write is guarded by the slot key index.
 */
export async function acceptOffer(token, { placeAppointment }, meta = {}) {
  const now = new Date();
  const claimed = await SlotOffer.findOneAndUpdate(
    { tokenHash: hashToken(token), status: 'pending', expiresAt: { $gt: now } },
    { $set: { status: 'accepting' } },
    { new: true }
  );
  if (!claimed) {
    const existing = await findByToken(token);
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'This offer link is not valid');
    throw new AppError(410, 'OFFER_NOT_AVAILABLE', 'This offer has expired or was already answered');
  }

  try {
    const org = await Organization.findById(claimed.organizationId).lean();
    const service = await Service.findById(claimed.serviceId).lean();
    const staff = await StaffProfile.findById(claimed.staffId).lean();
    const customer = await Customer.findById(claimed.customerId).lean();
    const entry = await WaitlistEntry.findById(claimed.waitlistEntryId).lean();
    if (!org || !service || !staff || !customer || !entry) throw new AppError(409, 'SLOT_UNAVAILABLE', 'This slot is no longer available');

    const appointment = await placeAppointment({
      org,
      service,
      staff,
      startAt: claimed.startAt,
      customer,
      source: 'waitlist',
      recoveredFromOfferId: claimed._id,
      actorType: 'customer',
      requestId: meta.requestId,
    });

    await SlotOffer.updateOne(
      { _id: claimed._id },
      { $set: { status: 'accepted', respondedAt: new Date(), resultAppointmentId: appointment._id }, $unset: releaseOfferFields }
    );
    await WaitlistEntry.updateOne({ _id: entry._id }, { $set: { status: 'booked' } });
    await recordAudit({ organizationId: org._id, actorType: 'customer', action: 'offer.accepted', resourceType: 'slot_offer', resourceId: claimed._id, after: { appointmentId: appointment._id }, requestId: meta.requestId });
    return appointment;
  } catch (err) {
    await SlotOffer.updateOne(
      { _id: claimed._id, status: 'accepting' },
      { $set: { status: 'expired', respondedAt: new Date() }, $unset: releaseOfferFields }
    );
    if (err instanceof AppError && err.code === 'SLOT_UNAVAILABLE') {
      await SlotOffer.updateOne(
        { _id: claimed._id, status: 'accepting' },
        { $set: { status: 'expired', respondedAt: new Date() }, $unset: releaseOfferFields }
      );
      await recordAudit({ organizationId: claimed.organizationId, actorType: 'system', action: 'offer.expired', resourceType: 'slot_offer', resourceId: claimed._id, after: { reason: 'slot_taken' } });
      await advance(claimed);
    } else {
      // Unexpected failure: return the offer to pending so the customer can retry before it expires.
      await SlotOffer.updateOne({ _id: claimed._id, status: 'accepting' }, { $set: { status: 'pending' } });
      logger.error('offer_accept_failed', { offerId: String(claimed._id), message: err.message });
    }
    throw err;
  }
}

/** Manual override for owners and admins: expire the current offer and optionally advance. */
export async function overrideOffer({ orgId, offerId, action, actorUserId, requestId }) {
  const offer = await closeOffer(offerId, ['pending', 'accepting'], 'expired', { overrideBy: actorUserId });
  if (!offer || String(offer.organizationId) !== String(orgId)) {
    throw new AppError(409, 'CONFLICT', 'This offer can no longer be changed');
  }
  await recordAudit({ organizationId: orgId, actorUserId, action: `offer.override.${action}`, resourceType: 'slot_offer', resourceId: offer._id, requestId });
  if (action === 'expire_and_advance') await advance(offer);
  return { status: 'expired' };
}

/** Removing an entry also withdraws any live offer for it. */
export async function removeWaitlistEntry(orgId, entryId, actorUserId, requestId) {
  const entry = await WaitlistEntry.findOneAndUpdate({ _id: entryId, organizationId: orgId }, { $set: { status: 'removed' } }, { new: true }).lean();
  if (!entry) throw new AppError(404, 'NOT_FOUND', 'Resource not found');
  const live = await SlotOffer.findOne({ waitlistEntryId: entryId, status: { $in: ['pending', 'accepting'] } });
  if (live) {
    const closed = await closeOffer(live._id, ['pending', 'accepting'], 'expired');
    if (closed) await advance(closed);
  }
  await recordAudit({ organizationId: orgId, actorUserId, action: 'waitlist.removed', resourceType: 'waitlist_entry', resourceId: entryId, requestId });
  return entry;
}

