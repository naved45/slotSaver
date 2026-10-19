import { Router } from 'express';
import { devOutbox } from '../services/email/outbox.js';
import { getContext } from '../context.js';
import { AppError } from '../utils/appError.js';

/** Development-only inspection of previewed emails. Not mounted in production. */
const router = Router();

router.get('/outbox', (req, res) => {
  if (!getContext().config.devOutboxEnabled) throw new AppError(404, 'NOT_FOUND', 'Resource not found');
  res.json({ data: devOutbox.list() });
});

export default router;
