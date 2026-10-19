/**
 * Portable uniqueness keys. A document carries activeSlotKey (or activeWaitlistKey) only while
 * it holds a slot or offer. When it is released, the field is $unset, and a sparse unique index
 * ignores it. This replaces partial-filter indexes, which not every MongoDB-compatible server supports.
 */
export function slotKey(staffId, startAt) {
  return `${String(staffId)}|${new Date(startAt).toISOString()}`;
}
