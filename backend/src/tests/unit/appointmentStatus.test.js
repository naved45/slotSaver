import { describe, it, expect } from 'vitest';
import { canTransition } from '../../services/appointmentStatus.js';

describe('appointment status transitions', () => {
  it.each([
    ['requested', 'confirmed'],
    ['requested', 'cancelled'],
    ['confirmed', 'completed'],
    ['confirmed', 'no_show'],
    ['confirmed', 'cancelled'],
  ])('allows %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each([
    ['completed', 'confirmed'],
    ['cancelled', 'confirmed'],
    ['no_show', 'completed'],
    ['requested', 'completed'],
  ])('rejects %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });
});
