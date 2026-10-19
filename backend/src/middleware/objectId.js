import mongoose from 'mongoose';
import { AppError } from '../utils/appError.js';

/** Rejects malformed ids before they reach Mongo. Returns 404 so ids are not probed. */
export function requireObjectIdParams(...names) {
  return (req, res, next) => {
    for (const name of names) {
      const value = req.params[name];
      if (value !== undefined && !mongoose.isValidObjectId(value)) {
        return next(new AppError(404, 'NOT_FOUND', 'Resource not found'));
      }
    }
    return next();
  };
}
