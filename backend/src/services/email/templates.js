/**
 * Plain, accessible email templates. Only non-secret fields are interpolated except for
 * action links, which are passed in already built and are never logged.
 */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function wrap(title, bodyHtml) {
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#0B1437;line-height:1.5">
<h1 style="font-size:20px">${esc(title)}</h1>${bodyHtml}
<p style="font-size:12px;color:#475569">SlotSaver · Smart Appointment Scheduling for Your Business</p></body></html>`;
}

export const templates = {
  email_verify: ({ link }) => ({
    subject: 'Verify your SlotSaver email',
    text: `Confirm your email address to finish setting up SlotSaver:\n${link}\nThis link expires in 24 hours. If you did not sign up, ignore this email.`,
    html: wrap('Verify your email', `<p><a href="${esc(link)}">Confirm my email</a></p><p>This link expires in 24 hours.</p>`),
  }),
  password_reset: ({ link }) => ({
    subject: 'Reset your SlotSaver password',
    text: `Use this link to reset your password:\n${link}\nIt expires in 30 minutes and can be used once. If you did not ask for this, ignore this email.`,
    html: wrap('Reset your password', `<p><a href="${esc(link)}">Choose a new password</a></p><p>It expires in 30 minutes.</p>`),
  }),
  invitation: ({ link, orgName, role }) => ({
    subject: `You are invited to ${orgName} on SlotSaver`,
    text: `You were invited to join ${orgName} as ${role}.\nAccept the invitation: ${link}\nThis link expires in 7 days.`,
    html: wrap(`Join ${esc(orgName)}`, `<p>You were invited as <strong>${esc(role)}</strong>.</p><p><a href="${esc(link)}">Accept invitation</a></p>`),
  }),
  booking_confirmation: ({ orgName, serviceName, whenText, manageLink }) => ({
    subject: `Your booking at ${orgName} is confirmed`,
    text: `Hi, your ${serviceName} at ${orgName} is confirmed for ${whenText}.\nManage or cancel: ${manageLink}`,
    html: wrap('Booking confirmed', `<p>Your <strong>${esc(serviceName)}</strong> at ${esc(orgName)} is confirmed for ${esc(whenText)}.</p><p><a href="${esc(manageLink)}">Manage booking</a></p>`),
  }),
  appointment_reminder: ({ orgName, serviceName, whenText, manageLink }) => ({
    subject: `Reminder: ${serviceName} at ${orgName}`,
    text: `Reminder: ${serviceName} at ${orgName} on ${whenText}.\nManage booking: ${manageLink}`,
    html: wrap('Appointment reminder', `<p>${esc(serviceName)} at ${esc(orgName)} on ${esc(whenText)}.</p><p><a href="${esc(manageLink)}">Manage booking</a></p>`),
  }),
  booking_cancellation: ({ orgName, serviceName, whenText }) => ({
    subject: `Your booking at ${orgName} was cancelled`,
    text: `Your ${serviceName} at ${orgName} on ${whenText} has been cancelled.`,
    html: wrap('Booking cancelled', `<p>Your ${esc(serviceName)} at ${esc(orgName)} on ${esc(whenText)} has been cancelled.</p>`),
  }),
  reschedule_confirmation: ({ orgName, serviceName, whenText, manageLink }) => ({
    subject: `Your booking at ${orgName} was moved`,
    text: `Your ${serviceName} at ${orgName} is now ${whenText}.\nManage booking: ${manageLink}`,
    html: wrap('Booking moved', `<p>Your ${esc(serviceName)} at ${esc(orgName)} is now ${esc(whenText)}.</p><p><a href="${esc(manageLink)}">Manage booking</a></p>`),
  }),
  waitlist_offer: ({ orgName, serviceName, whenText, acceptLink, expiresText }) => ({
    subject: `A slot opened up at ${orgName}`,
    text: `A ${serviceName} slot is available at ${orgName} on ${whenText}.\nAccept (first come, first served): ${acceptLink}\nThis offer expires ${expiresText}.`,
    html: wrap('A slot opened up', `<p>A <strong>${esc(serviceName)}</strong> slot is available at ${esc(orgName)} on ${esc(whenText)}.</p><p><a href="${esc(acceptLink)}">Accept this slot</a></p><p>This offer expires ${esc(expiresText)}.</p>`),
  }),
  waitlist_offer_expired: ({ orgName, serviceName }) => ({
    subject: `Your ${serviceName} offer at ${orgName} has ended`,
    text: `The slot offer for ${serviceName} at ${orgName} is no longer available.`,
    html: wrap('Offer ended', `<p>The slot offer for ${esc(serviceName)} at ${esc(orgName)} is no longer available.</p>`),
  }),
  staff_notification: ({ subject, text }) => ({
    subject,
    text,
    html: wrap(subject, `<p>${esc(text)}</p>`),
  }),
};
