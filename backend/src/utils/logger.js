/** Minimal structured logger. Redacts sensitive keys so secrets never reach logs. */
const REDACT_KEYS = /pass(word)?|token|secret|cookie|authorization|hash/i;

export function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = REDACT_KEYS.test(k) ? '[REDACTED]' : redact(v);
    }
    return out;
  }
  return value;
}

export const logger = {
  info: (msg, fields = {}) => write('info', msg, fields),
  warn: (msg, fields = {}) => write('warn', msg, fields),
  error: (msg, fields = {}) => write('error', msg, fields),
};

function write(level, msg, fields) {
  const line = JSON.stringify({ level, time: new Date().toISOString(), msg, ...redact(fields) });
  if (level === 'error') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}
