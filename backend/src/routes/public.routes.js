import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { limits } from '../middleware/rateLimit.js';
import * as s from '../validators/operations.schemas.js';
import * as c from '../controllers/public.controller.js';

const router = Router();

router.get('/businesses/:slug', c.business);
router.get('/businesses/:slug/services/:serviceSlug/availability', validate(s.availabilityQuery, 'query'), c.availability);
router.post('/businesses/:slug/services/:serviceSlug/bookings', limits.publicBooking(), validate(s.publicBookingInput), c.createBooking);

router.get('/guest/appointments/:token', limits.guestAction(), c.guestView);
router.post('/guest/appointments/:token/cancel', limits.guestAction(), c.guestCancel);
router.post('/guest/appointments/:token/reschedule', limits.guestAction(), validate(s.rescheduleInput), c.guestReschedule);

router.get('/slot-offers/:token', limits.guestAction(), c.offerView);
router.post('/slot-offers/:token/accept', limits.guestAction(), c.offerAccept);
router.post('/slot-offers/:token/decline', limits.guestAction(), c.offerDecline);

export default router;
