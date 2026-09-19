import { describe, expect, it } from 'vitest';
import { formatEventDate } from './format';

describe('formatEventDate', () => {
  it('returns an empty string when there is no date', () => {
    expect(formatEventDate(undefined)).toBe('');
    expect(formatEventDate('')).toBe('');
  });

  it('formats a date without a time', () => {
    expect(formatEventDate('2026-03-21')).toBe('Sat, 21 Mar');
  });

  it('appends the time when one is given', () => {
    expect(formatEventDate('2026-03-21', '20:00')).toBe('Sat, 21 Mar · 20:00');
  });

  it('reads the date in local time, not UTC', () => {
    // Parsing '2026-03-21' as UTC would shift to the 20th west of Greenwich.
    expect(formatEventDate('2026-03-21')).toContain('21');
  });
});
