/**
 * TTL indexes let MongoDB delete expired documents automatically. Correctness never depends
 * on them: every read also checks expiry. Test runs against FerretDB (which lacks TTL
 * support) set MONGO_TTL_INDEXES=off; production always keeps them on.
 */
export function ttlOptions() {
  return process.env.MONGO_TTL_INDEXES === 'off' ? {} : { expireAfterSeconds: 0 };
}
