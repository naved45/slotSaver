import crypto from 'node:crypto';

/** Accepts a safe inbound x-request-id or generates one. Echoed on the response. */
export function requestId(req, res, next) {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(incoming)
    ? incoming
    : crypto.randomUUID();
  req.id = id;
  res.setHeader('x-request-id', id);
  next();
}
