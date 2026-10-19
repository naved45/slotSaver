import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { limits } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { tokenSchema } from '../validators/schemas.js';
import * as team from '../services/team.service.js';

const router = Router();

/** Accepting an invitation requires a signed-in, verified user whose email matches the invitation. */
router.post('/accept', requireAuth(), limits.invitation(), validate(tokenSchema), async (req, res) => {
  res.json({ data: await team.acceptInvitation(req.user, req.body.token, { requestId: req.id }) });
});

export default router;
