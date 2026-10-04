import { describe, expect, it } from 'vitest';
import { formatEventDate, zambiaDateString } from './format';

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

describe('zambiaDateString', () => {
  it('uses Zambian time, not the time zone of the phone', () => {
    // 23:30 UTC on 4 October is already 01:30 on 5 October in Lusaka (UTC+2).
    const lateUtc = Date.UTC(2026, 9, 4, 23, 30);
    expect(zambiaDateString(0, lateUtc)).toBe('2026-10-05');
    expect(zambiaDateString(-1, lateUtc)).toBe('2026-10-04');
  });
});
