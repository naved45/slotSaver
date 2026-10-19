import bcrypt from 'bcryptjs';

// bcrypt cost 12 balances work factor and latency for an MVP deployment.
const COST = 12;

export function hashPassword(password) {
  return bcrypt.hash(password, COST);
}

export function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// A real bcrypt hash generated at startup. Comparing against it on unknown emails keeps
// response timing similar, which reduces account enumeration via timing.
const DUMMY_HASH = bcrypt.hashSync('slotsaver-timing-placeholder', COST);
export function dummyVerify(password) {
  return bcrypt.compare(password, DUMMY_HASH);
}
