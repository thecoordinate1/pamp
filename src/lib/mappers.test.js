import { describe, expect, it } from 'vitest';
import {
  ngweeToZmw,
  rowToAttendee,
  rowToEvent,
  zmwToNgwee,
} from './mappers';

describe('money conversion', () => {
  it('converts ngwee to kwacha', () => {
    expect(ngweeToZmw(15000)).toBe(150);
    expect(ngweeToZmw(15750)).toBe(157.5);
    expect(ngweeToZmw(0)).toBe(0);
  });

  it('treats a missing amount as zero rather than NaN', () => {
    expect(ngweeToZmw(null)).toBe(0);
    expect(ngweeToZmw(undefined)).toBe(0);
    expect(zmwToNgwee(null)).toBe(0);
    expect(zmwToNgwee('')).toBe(0);
  });

  it('rounds to whole ngwee so no fraction of a coin is ever stored', () => {
    expect(zmwToNgwee(157.5)).toBe(15750);
    // 0.1 + 0.2 style drift must not leak into a stored amount.
    expect(zmwToNgwee(0.07)).toBe(7);
    expect(zmwToNgwee(1.005)).toBe(101);
    expect(Number.isInteger(zmwToNgwee(99.999))).toBe(true);
  });

  it('round-trips a price without losing value', () => {
    for (const kwacha of [0, 5, 100, 150, 157.5, 499.99]) {
      expect(ngweeToZmw(zmwToNgwee(kwacha))).toBeCloseTo(kwacha, 2);
    }
  });
});

describe('rowToEvent', () => {
  const row = {
    id: 'e1',
    host_id: 'h1',
    name: 'Neon Nights',
    category: 'party',
    status: 'published',
    starts_on: '2026-03-21',
    start_time: '20:00',
    city: 'Lusaka',
    area: 'Kabulonga',
    vibe: 'Afrobeats',
    dress_code: 'All White',
    description: 'Big one.',
    image_url: 'https://example.test/a.jpg',
    host_display_name: 'Mwila K.',
    ticket_price_ngwee: 20000,
    currency: 'ZMW',
    rsvp_count: 47,
    area_latitude: -15.42,
    area_longitude: 28.33,
  };

  it('maps snake_case columns onto the shape the components expect', () => {
    const evt = rowToEvent(row);
    expect(evt.dressCode).toBe('All White');
    expect(evt.image).toBe('https://example.test/a.jpg');
    expect(evt.host).toBe('Mwila K.');
    expect(evt.date).toBe('2026-03-21');
    expect(evt.rsvpCount).toBe(47);
  });

  it('exposes the price in kwacha, not ngwee', () => {
    expect(rowToEvent(row).ticketPrice).toBe(200);
  });

  it('gives coordinates as a [lat, lng] pair for the map', () => {
    expect(rowToEvent(row).coordinates).toEqual([-15.42, 28.33]);
  });

  it('returns null coordinates when the event has no public point, so the map skips it', () => {
    const evt = rowToEvent({ ...row, area_latitude: null, area_longitude: null });
    expect(evt.coordinates).toBeNull();
  });

  it('defaults a missing rsvp_count to zero', () => {
    expect(rowToEvent({ ...row, rsvp_count: null }).rsvpCount).toBe(0);
  });

  it('returns null for a missing row', () => {
    expect(rowToEvent(null)).toBeNull();
  });
});

describe('rowToAttendee', () => {
  const base = {
    user_id: 'u1',
    show_publicly: true,
    featured_by_host: false,
    profiles: { display_name: 'Sepo L.', headline: 'Event Manager', looking_for: 'Sponsors' },
  };

  it('builds a profile link for each supported platform', () => {
    const cases = {
      instagram: 'https://instagram.com/sepo',
      tiktok: 'https://tiktok.com/@sepo',
      x: 'https://x.com/sepo',
      snapchat: 'https://snapchat.com/add/sepo',
      facebook: 'https://facebook.com/sepo',
    };
    for (const [platform, url] of Object.entries(cases)) {
      const a = rowToAttendee({
        ...base,
        profiles: { ...base.profiles, social_platform: platform, social_handle: 'sepo' },
      });
      expect(a.socialUrl).toBe(url);
    }
  });

  it('strips a leading @ from the handle', () => {
    const a = rowToAttendee({
      ...base,
      profiles: { ...base.profiles, social_platform: 'instagram', social_handle: '@sepo' },
    });
    expect(a.socialUrl).toBe('https://instagram.com/sepo');
  });

  it('keeps only digits for a WhatsApp number', () => {
    const a = rowToAttendee({
      ...base,
      profiles: { ...base.profiles, social_platform: 'whatsapp', social_handle: '+260 97 123 4567' },
    });
    expect(a.socialUrl).toBe('https://wa.me/260971234567');
  });

  it('has no link when the attendee shared no social account', () => {
    expect(rowToAttendee(base).socialUrl).toBeNull();
  });

  it('carries both visibility flags through', () => {
    const a = rowToAttendee({ ...base, featured_by_host: true });
    expect(a.showPublicly).toBe(true);
    expect(a.featuredByHost).toBe(true);
  });

  it('falls back to Guest when a profile is not readable', () => {
    expect(rowToAttendee({ user_id: 'u2', profiles: null }).name).toBe('Guest');
  });
});
