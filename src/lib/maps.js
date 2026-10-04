// Links that open the phone's maps app (Google Maps on most Android phones)
// with directions to an event. A pin the host placed beats a typed address,
// which beats nothing.
export function directionsUrl({ coordinates, fullAddress } = {}) {
  if (Array.isArray(coordinates) && coordinates.length === 2 && coordinates.every(Number.isFinite)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${coordinates[0]},${coordinates[1]}`;
  }
  const address = fullAddress?.trim();
  if (address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  }
  return null;
}
