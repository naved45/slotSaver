import { DateTime } from 'luxon';

export const MINUTE = 60_000;

export function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * MINUTE);
}

/** Local YYYY-MM-DD of an instant in a timezone. */
export function localDate(instant, timezone) {
  return DateTime.fromJSDate(instant, { zone: timezone }).toISODate();
}
