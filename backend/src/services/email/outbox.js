/**
 * Development-only outbox. In non-production environments, emails that would be sent
 * are kept here (in memory, capped) so developers and tests can read them, including
 * action links. This is never a delivery record: entries are labelled as previews.
 * It is disabled when ENABLE_DEV_OUTBOX=false or NODE_ENV=production.
 */
const MAX = 200;
const entries = [];

export const devOutbox = {
  push(entry) {
    entries.push({ ...entry, createdAt: new Date().toISOString() });
    if (entries.length > MAX) entries.shift();
  },
  list() {
    return entries.slice().reverse();
  },
  clear() {
    entries.length = 0;
  },
  /** Most recent preview addressed to `to` whose subject matches `subjectPart`. */
  find(to, subjectPart) {
    return entries
      .slice()
      .reverse()
      .find((e) => e.to === to && (!subjectPart || e.subject.includes(subjectPart)));
  },
};
