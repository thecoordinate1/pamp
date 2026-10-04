import { describe, expect, it } from 'vitest';
import { directionsUrl } from './maps';

describe('directionsUrl', () => {
  it('routes to the exact pin when the host placed one', () => {
    expect(directionsUrl({ coordinates: [-15.4167, 28.2833], fullAddress: 'Plot 4, Leopards Hill' })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=-15.4167,28.2833'
    );
  });

  it('falls back to searching the typed address', () => {
    expect(directionsUrl({ coordinates: null, fullAddress: ' Plot 4, Leopards Hill Rd & 5th ' })).toBe(
      'https://www.google.com/maps/search/?api=1&query=Plot%204%2C%20Leopards%20Hill%20Rd%20%26%205th'
    );
  });

  it('gives nothing when there is nowhere to go', () => {
    expect(directionsUrl({ coordinates: null, fullAddress: '   ' })).toBeNull();
    expect(directionsUrl({ coordinates: [Number.NaN, 28] })).toBeNull();
    expect(directionsUrl()).toBeNull();
  });
});
