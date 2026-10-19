import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { limits } from '../middleware/rateLimit.js';
import { requireObjectIdParams } from '../middleware/objectId.js';
import * as schemas from '../validators/schemas.js';
import * as c from '../controllers/auth.controller.js';
import { z } from 'zod';
import * as account from '../services/account.service.js';
import { inputOf } from '../middleware/validate.js';
import { clearSessionCookie } from '../middleware/cookies.js';
import { getContext } from '../context.js';

const router = Router();

router.post('/signup', limits.signup(), validate(schemas.signupSchema), c.signup);
router.post('/verify-email', validate(schemas.tokenSchema), c.verifyEmail);
router.post('/resend-verification', limits.passwordReset(), validate(z.object({ email: schemas.email })), c.resendVerification);
router.post('/login', limits.login(), validate(schemas.loginSchema), c.login);
router.post('/logout', requireAuth({ allowUnverified: true }), c.logout);
router.get('/me', requireAuth({ allowUnverified: true }), c.me);
router.post('/forgot-password', limits.passwordReset(), validate(schemas.emailOnlySchema), c.forgotPassword);
router.post('/reset-password', limits.passwordReset(), validate(schemas.resetPasswordSchema), c.resetPassword);
router.get('/sessions', requireAuth({ allowUnverified: true }), c.listSessions);
router.delete('/sessions/:sessionId', requireAuth({ allowUnverified: true }), requireObjectIdParams('sessionId'), c.revokeSession);

router.get('/export', requireAuth({ allowUnverified: true }), async (req, res) => {
  res.json({ data: await account.exportAccount(req.user) });
});
router.delete('/account', requireAuth({ allowUnverified: true }), validate(z.object({ password: z.string().min(1).max(128) })), async (req, res) => {
  await account.deleteAccount(req.user, inputOf(req).password, { requestId: req.id });
  clearSessionCookie(res, { secure: getContext().config.cookieSecure });
  res.status(204).end();
});

export default router;
