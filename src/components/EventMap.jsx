import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin } from 'lucide-react';

const CATEGORY_PINS = [
  { id: 'party', label: 'Parties', color: '#E040FB' },
  { id: 'vip_lounge', label: 'VIP lounge', color: '#7C4DFF' },
  { id: 'tech_business', label: 'Tech & business', color: '#00E5FF' },
  { id: 'creative_arts', label: 'Creative', color: '#FFD740' },
];

const iconCache = new Map();

function pinIcon(category) {
  const color = (CATEGORY_PINS.find((c) => c.id === category) || CATEGORY_PINS[0]).color;
  if (!iconCache.has(color)) {
    iconCache.set(
      color,
      L.divIcon({
        className: '',
        html: `<span style="display:block;width:22px;height:22px;border-radius:9999px;background:${color};border:3px solid #0D0D0D;box-shadow:0 0 0 2px ${color}66,0 6px 16px rgba(0,0,0,.5)"></span>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        popupAnchor: [0, -14],
      })
    );
  }
  return iconCache.get(color);
}

export default function EventMap({ events, onSelectEvent, onGetTickets }) {
  const defaultCenter = [-15.416, 28.322]; // Lusaka center

  return (
    <div className="relative w-full h-[62vh] min-h-[420px] overflow-hidden rounded-3xl border border-white/10">
      <MapContainer center={defaultCenter} zoom={12} scrollWheelZoom={false} className="w-full h-full z-0">
        {/* OSM tiles need no key but are only for light use; move to a paid tile plan before launch. */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          className="map-tiles-dark"
          maxZoom={19}
        />

        {events.map((evt) => {
          if (!evt.coordinates || evt.coordinates.length !== 2) return null;
          return (
            <Marker key={evt.id} position={evt.coordinates} icon={pinIcon(evt.category)}>
              <Popup className="custom-map-popup" closeButton={false}>
                <div className="w-56">
                  <img src={evt.image} alt="" className="w-full h-28 object-cover rounded-xl" />
                  <div className="eyebrow mt-3">{evt.vibe}</div>
                  <div className="mt-0.5 text-[15px] font-bold leading-snug text-white">{evt.name}</div>
                  <div className="mt-1 flex items-center gap-1 text-xs text-text-secondary">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span className="truncate">{evt.area}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-white">
                      {evt.ticketPrice ? `${evt.currency || 'ZMW'} ${evt.ticketPrice}` : 'Free'}
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => onSelectEvent(evt)}
                        className="h-8 px-3 rounded-full text-xs font-semibold bg-white/10 text-white hover:bg-white/15"
                      >
                        Who's going
                      </button>
                      <button
                        type="button"
                        onClick={() => onGetTickets(evt)}
                        className="brand-gradient h-8 px-3 rounded-full text-xs font-semibold text-white"
                      >
                        Get pass
                      </button>
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      <ul
        aria-label="Map legend"
        className="glass absolute left-3 top-3 z-[400] rounded-2xl px-3.5 py-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-text-secondary"
      >
        {CATEGORY_PINS.map(({ id, label, color }) => (
          <li key={id} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} aria-hidden="true" />
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}
