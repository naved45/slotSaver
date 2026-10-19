import * as booking from '../services/booking.service.js';
import * as offers from '../services/offer.service.js';
import { inputOf } from '../middleware/validate.js';

const meta = (req) => ({ requestId: req.id, ip: req.ip });

export async function business(req, res) {
  res.json({ data: await booking.getPublicBusiness(req.params.slug) });
}

export async function availability(req, res) {
  const q = inputOf(req, 'query');
  res.json({ data: await booking.getPublicAvailability(req.params.slug, req.params.serviceSlug, q) });
}

export async function createBooking(req, res) {
  const body = inputOf(req);
  const out = await booking.createPublicBooking(req.params.slug, req.params.serviceSlug, body, meta(req));
  // The guest's manage link is emailed, never returned in the response.
  res.status(out.replayed ? 200 : 201).json({
    data: {
      appointment: { id: out.appointment._id, startAt: out.appointment.startAt, endAt: out.appointment.endAt, status: out.appointment.status, priceMinor: out.appointment.priceMinor, currency: out.appointment.currency },
      message: body.consent?.email ? 'Booked. A confirmation is on its way to your email.' : 'Booked. You did not opt in to emails, so no confirmation was sent.',
    },
  });
}

export async function guestView(req, res) {
  res.json({ data: await booking.getGuestAppointment(req.params.token) });
}

export async function guestCancel(req, res) {
  res.json({ data: await booking.cancelByGuest(req.params.token, meta(req)) });
}

export async function guestReschedule(req, res) {
  res.json({ data: await booking.rescheduleByGuest(req.params.token, inputOf(req).startAt, meta(req)) });
}

export async function offerView(req, res) {
  res.json({ data: await offers.getOfferForGuest(req.params.token) });
}

export async function offerAccept(req, res) {
  const appt = await booking.acceptSlotOffer(req.params.token, meta(req));
  res.status(201).json({
    data: { appointment: { id: appt._id, startAt: appt.startAt, endAt: appt.endAt, status: appt.status, priceMinor: appt.priceMinor, currency: appt.currency }, message: 'Booked. You are confirmed for this slot.' },
  });
}

export async function offerDecline(req, res) {
  res.json({ data: await offers.declineOffer(req.params.token, meta(req)) });
}
