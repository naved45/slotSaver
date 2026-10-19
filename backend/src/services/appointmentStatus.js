/** Allowed appointment status transitions. Anything else is rejected with 409. */
export const APPOINTMENT_STATUSES = ['requested', 'confirmed', 'completed', 'cancelled', 'no_show'];

const TRANSITIONS = {
  requested: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'no_show', 'cancelled'],
  completed: [],
  cancelled: [],
  no_show: [],
};

export function canTransition(from, to) {
  return (TRANSITIONS[from] ?? []).includes(to);
}

/** Statuses that hold a slot (count toward busy time and the unique guard). */
export const ACTIVE_STATUSES = ['requested', 'confirmed'];
