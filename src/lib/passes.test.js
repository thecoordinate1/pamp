import { describe, expect, it } from 'vitest';
import {
  forgetStoredPasses,
  groupPassesByEvent,
  readStoredPasses,
  storePasses,
  summarisePasses,
} from './passes';

// A Storage double, so these tests never depend on the jsdom page's own state.
function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    dump: () => Object.fromEntries(data),
  };
}

const pass = (eventId, status = 'valid', code = `${eventId}-${status}`) => ({ eventId, status, code });

describe('groupPassesByEvent', () => {
  it('collects each event’s passes together, in order', () => {
    const byEvent = groupPassesByEvent([pass('a'), pass('b'), pass('a', 'checked_in')]);
    expect(byEvent.get('a').map((p) => p.status)).toEqual(['valid', 'checked_in']);
    expect(byEvent.get('b')).toHaveLength(1);
    expect(byEvent.get('missing')).toBeUndefined();
  });

  it('copes with no passes at all', () => {
    expect(groupPassesByEvent(undefined).size).toBe(0);
  });
});

describe('summarisePasses', () => {
  it('reports nobody in before the door', () => {
    expect(summarisePasses([pass('a'), pass('a')])).toEqual({
      count: 2,
      checkedIn: 0,
      attended: false,
      allIn: false,
    });
  });

  it('marks a person as attended once any of their passes is scanned', () => {
    expect(summarisePasses([pass('a', 'checked_in'), pass('a')])).toMatchObject({
      checkedIn: 1,
      attended: true,
      allIn: false,
    });
  });

  it('knows when every pass is in', () => {
    expect(summarisePasses([pass('a', 'checked_in')]).allIn).toBe(true);
    expect(summarisePasses([]).allIn).toBe(false);
  });
});

describe('passes kept on the phone', () => {
  it('round-trips with the time they were saved', () => {
    const storage = memoryStorage();
    storePasses('u1', [pass('a')], storage, 1000);
    expect(readStoredPasses('u1', storage)).toEqual({ savedAt: 1000, passes: [pass('a')] });
  });

  it('keeps each person’s passes apart', () => {
    const storage = memoryStorage();
    storePasses('u1', [pass('a')], storage, 1);
    expect(readStoredPasses('u2', storage)).toBeUndefined();
  });

  it('ignores anything unreadable instead of throwing', () => {
    const storage = memoryStorage({ 'pamp:passes:u1': '{not json' });
    expect(readStoredPasses('u1', storage)).toBeUndefined();
    expect(readStoredPasses('u1', memoryStorage({ 'pamp:passes:u1': '{"passes":"x"}' }))).toBeUndefined();
    expect(readStoredPasses(undefined, storage)).toBeUndefined();
  });

  it('survives a phone that refuses to store anything', () => {
    const broken = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('full');
      },
    };
    expect(() => storePasses('u1', [pass('a')], broken)).not.toThrow();
    expect(readStoredPasses('u1', broken)).toBeUndefined();
  });

  it('forgets every account’s passes on sign-out and leaves other data alone', () => {
    const storage = memoryStorage({ 'pamp:invite': '{}', theme: 'dark' });
    storePasses('u1', [pass('a')], storage, 1);
    storePasses('u2', [pass('b')], storage, 1);
    forgetStoredPasses(storage);
    expect(Object.keys(storage.dump()).sort()).toEqual(['pamp:invite', 'theme']);
  });
});
