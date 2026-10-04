import { useEffect, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair } from 'lucide-react';

const LUSAKA = [-15.416, 28.322];
// Six decimals is about 10cm: more precise than any phone, so nothing is lost.
const round6 = (n) => Math.round(n * 1e6) / 1e6;

const pinIcon = L.divIcon({
  className: '',
  html: '<span style="display:block;width:26px;height:26px;border-radius:9999px;background:#E040FB;border:4px solid #fff;box-shadow:0 0 0 3px #E040FB66,0 8px 20px rgba(0,0,0,.5)"></span>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

function TapToPlace({ onPick }) {
  useMapEvents({
    click: (e) => onPick([round6(e.latlng.lat), round6(e.latlng.lng)]),
  });
  return null;
}

// Brings the pin into view when it is set from outside the map, such as by
// "Use my location", without yanking the map around on every tap.
function KeepInView({ point }) {
  const map = useMap();
  useEffect(() => {
    if (point && !map.getBounds().contains(point)) {
      map.setView(point, Math.max(map.getZoom(), 16));
    }
  }, [map, point]);
  return null;
}

// The exact spot an event happens. `value` is [lat, lng] or null.
export default function LocationPicker({ value, onChange, idPrefix = 'location' }) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setError('This device cannot share its location. Tap the map instead.');
      return;
    }
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onChange([round6(pos.coords.latitude), round6(pos.coords.longitude)]);
      },
      () => {
        setLocating(false);
        setError('Could not get your location. Allow location access, or tap the map instead.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  return (
    <div>
      <div
        className="relative h-56 sm:h-64 overflow-hidden rounded-2xl border border-white/10"
        role="application"
        aria-label="Map. Tap where the event is to place the pin."
        aria-describedby={`${idPrefix}-hint`}
      >
        <MapContainer
          center={value ?? LUSAKA}
          zoom={value ? 16 : 12}
          scrollWheelZoom={false}
          className="w-full h-full z-0"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            className="map-tiles-dark"
            maxZoom={19}
          />
          <TapToPlace onPick={onChange} />
          <KeepInView point={value} />
          {value && (
            <Marker
              position={value}
              icon={pinIcon}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const ll = e.target.getLatLng();
                  onChange([round6(ll.lat), round6(ll.lng)]);
                },
              }}
            />
          )}
        </MapContainer>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p id={`${idPrefix}-hint`} className="text-[13px] text-text-muted">
          {value ? 'Drag the pin to adjust it.' : 'Tap the map where the event is.'}
        </p>
        <button type="button" onClick={useMyLocation} disabled={locating} className="chip">
          <Crosshair className="w-4 h-4" />
          {locating ? 'Finding you…' : 'Use my location'}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red">
          {error}
        </p>
      )}
    </div>
  );
}
