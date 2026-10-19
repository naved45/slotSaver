/**
 * Process-wide dependencies (config and email adapter). Set once by createApp so that
 * services can read configuration without threading it through every call.
 */
let ctx = null;

export function setContext(value) {
  ctx = value;
}

export function getContext() {
  if (!ctx) throw new Error('Context not initialized. Call createApp() first.');
  return ctx;
}
