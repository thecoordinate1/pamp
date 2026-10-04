import { MapPin, Navigation } from 'lucide-react';
import { directionsUrl } from '../lib/maps';

// Where an event is, for someone allowed to know, with a way to get there.
export default function LocationCard({ location, className = '' }) {
  const url = directionsUrl(location ?? {});
  if (!location?.fullAddress && !url) return null;

  return (
    <div className={`card p-4 ${className}`}>
      <p className="flex items-center gap-1.5 text-[13px] font-medium text-text-muted">
        <MapPin className="w-3.5 h-3.5" />
        Where
      </p>
      <p className="mt-1 text-white">{location.fullAddress || 'The host has pinned the exact spot.'}</p>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="btn-secondary w-full mt-3">
          <Navigation className="w-4 h-4" />
          Directions
        </a>
      )}
    </div>
  );
}
