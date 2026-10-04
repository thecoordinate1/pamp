import { describe, expect, it, vi } from 'vitest';
import { captureInvite, inviteUrl, readInvite, referralMetadata, saveInvite, withoutInvitePart } from './invite';

const EVENT = '3f2b6c1e-8a4d-4f0e-9b7a-2c5d8e1f0a9b';
const CODE = 'K7MPQ2XZ';
const DAY = 24 * 60 * 60 * 1000;

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

const at = (search, pathname = '/') => ({ search, pathname, hash: '' });
const fakeHistory = () => ({ state: null, replaceState: vi.fn() });

describe('inviteUrl', () => {
  it('builds an event invite carrying the sharer’s code', () => {
    expect(inviteUrl({ origin: 'https://pamp.example', eventId: EVENT, code: CODE })).toBe(
      `https://pamp.example/?event=${EVENT}&ref=${CODE}`
    );
  });

  it('builds a plain profile invite, and a bare event link when there is no code yet', () => {
    expect(inviteUrl({ origin: 'https://pamp.example', code: CODE })).toBe(`https://pamp.example/?ref=${CODE}`);
    expect(inviteUrl({ origin: 'https://pamp.example', eventId: EVENT })).toBe(
      `https://pamp.example/?event=${EVENT}`
    );
  });
});

describe('captureInvite', () => {
  it('keeps the event and code from the link and cleans the address bar', () => {
    const storage = memoryStorage();
    const history = fakeHistory();
    const invite = captureInvite({
      location: at(`?event=${EVENT}&ref=${CODE.toLowerCase()}&utm=wa`),
      history,
      storage,
      now: 5,
    });
    expect(invite).toEqual({ eventId: EVENT, ref: CODE, at: 5 });
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/?utm=wa');
    expect(readInvite(storage, 5)).toEqual(invite);
  });

  it('drops values that are not a real event id or code', () => {
    const storage = memoryStorage();
    const invite = captureInvite({
      location: at('?event=../../etc&ref=<script>'),
      history: fakeHistory(),
      storage,
      now: 1,
    });
    expect(invite).toBeNull();
  });

  it('remembers an invite across visits until it expires', () => {
    const storage = memoryStorage();
    captureInvite({ location: at(`?ref=${CODE}`), history: fakeHistory(), storage, now: 0 });
    const later = captureInvite({ location: at(''), history: fakeHistory(), storage, now: 29 * DAY });
    expect(later?.ref).toBe(CODE);
    expect(readInvite(storage, 31 * DAY)).toBeNull();
  });

  it('lets a newer link replace what it carries and keep the rest', () => {
    const storage = memoryStorage();
    captureInvite({ location: at(`?event=${EVENT}&ref=${CODE}`), history: fakeHistory(), storage, now: 1 });
    const next = captureInvite({ location: at('?ref=ABCDEFGH'), history: fakeHistory(), storage, now: 2 });
    expect(next).toEqual({ eventId: EVENT, ref: 'ABCDEFGH', at: 2 });
  });

  it('does nothing without a location, as during a server render', () => {
    expect(captureInvite({ location: undefined })).toBeNull();
  });
});

describe('withoutInvitePart and saveInvite', () => {
  it('drops the event but keeps the code, then nothing is left', () => {
    const invite = { eventId: EVENT, ref: CODE, at: 1 };
    expect(withoutInvitePart(invite, 'eventId')).toEqual({ ref: CODE, at: 1 });
    expect(withoutInvitePart({ ref: CODE, at: 1 }, 'ref')).toBeNull();
    expect(withoutInvitePart(null, 'ref')).toBeNull();
  });

  it('writes an invite through to storage, and clears it once empty', () => {
    const storage = memoryStorage();
    saveInvite({ eventId: EVENT, at: Date.now() }, storage);
    expect(readInvite(storage)?.eventId).toBe(EVENT);
    saveInvite(null, storage);
    expect(readInvite(storage)).toBeNull();
  });

  it('shows a fresh link again even after an earlier invite was dismissed', () => {
    const storage = memoryStorage();
    saveInvite({ eventId: EVENT, at: 1, dismissedAt: 2 }, storage);
    const invite = captureInvite({ location: at(`?ref=${CODE}`), history: fakeHistory(), storage, now: 3 });
    expect(invite).toEqual({ eventId: EVENT, ref: CODE, at: 3 });
  });
});

describe('a browser that blocks storage', () => {
  it('still reads the link instead of crashing', () => {
    const blocked = Object.defineProperty({}, 'localStorage', {
      get() {
        throw new Error('SecurityError');
      },
    });
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => blocked.localStorage });
    try {
      const invite = captureInvite({ location: at(`?event=${EVENT}&ref=${CODE}`), history: fakeHistory(), now: 9 });
      expect(invite).toEqual({ eventId: EVENT, ref: CODE, at: 9 });
      expect(readInvite()).toBeNull();
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
    }
  });
});

describe('referralMetadata', () => {
  it('sends the code, and the event when there is one', () => {
    expect(referralMetadata({ ref: CODE, eventId: EVENT })).toEqual({
      referral_code: CODE,
      referral_event: EVENT,
    });
    expect(referralMetadata({ ref: CODE })).toEqual({ referral_code: CODE });
  });

  it('sends nothing without a code', () => {
    expect(referralMetadata({ eventId: EVENT })).toBeUndefined();
    expect(referralMetadata(null)).toBeUndefined();
  });
});
