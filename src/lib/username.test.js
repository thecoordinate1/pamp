import { describe, expect, it } from 'vitest';
import { cleanUsername, usernameProblem } from './username';

describe('cleanUsername', () => {
  it('lowers case, drops the @ and anything a username cannot hold', () => {
    expect(cleanUsername(' @Mwila K!95 ')).toBe('mwilak95');
    expect(cleanUsername('a'.repeat(30))).toHaveLength(20);
  });
});

describe('usernameProblem', () => {
  it('accepts the shapes the database accepts', () => {
    for (const ok of ['mwila', 'mwila.k_95', '_dj_', 'abc']) expect(usernameProblem(ok), ok).toBeNull();
  });

  it('explains the ones it refuses', () => {
    expect(usernameProblem('mw')).toMatch(/at least 3/);
    expect(usernameProblem('.mwila')).toMatch(/single dots/);
    expect(usernameProblem('mw..ila')).toMatch(/single dots/);
    expect(usernameProblem('pamp_fan')).toMatch(/reserved/);
    expect(usernameProblem('admin')).toMatch(/reserved/);
  });
});
