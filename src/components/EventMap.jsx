import { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Calendar, MapPin, Users, Ticket, Sparkles } from 'lucide-react';

// Custom SVG map pins for categories
const createCustomIcon = (category) => {
  const colorMap = {
    tech_business: '#00E5FF',
    party: '#E040FB',
    creative_arts: '#FFD700',
    vip_lounge: '#7C4DFF',
    default: '#E040FB'
  };
  const color = colorMap[category] || colorMap.default;

  const svgHtml = `
    <div style="
      background-color: ${color};
      width: 32px;
      height: 32px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 15px ${color};
      border: 2px solid #ffffff;
    ">
      <div style="
        width: 12px;
        height: 12px;
        background-color: #0d0f17;
        border-radius: 50%;
        transform: rotate(45deg);
      "></div>
    </div>
  `;

  return L.divIcon({
    html: svgHtml,
    className: 'custom-leaflet-marker',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  });
};

export default function EventMap({ events, onSelectEvent, onGetTickets }) {
  const defaultCenter = [-15.416, 28.322]; // Lusaka center

  return (
    <div className="relative w-full h-[520px] rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
      <MapContainer
        center={defaultCenter}
        zoom={12}
        scrollWheelZoom={false}
        className="w-full h-full z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />

        {events.map((evt) => {
          if (!evt.coordinates || evt.coordinates.length !== 2) return null;
          return (
            <Marker
              key={evt.id}
              position={evt.coordinates}
              icon={createCustomIcon(evt.category)}
            >
              <Popup className="custom-map-popup">
                <div className="p-1 max-w-[240px]">
                  <img
                    src={evt.image}
                    alt={evt.name}
                    className="w-full h-28 object-cover rounded-xl mb-2"
                  />
                  <span className="inline-block px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full bg-accent/20 text-accent mb-1">
                    {evt.vibe}
                  </span>
                  <h4 className="font-bold text-sm text-gray-900 leading-tight mb-1">
                    {evt.name}
                  </h4>
                  <div className="flex items-center gap-1 text-xs text-gray-600 mb-2">
                    <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
                    <span className="truncate">{evt.area}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <span className="font-bold text-xs text-purple-700">
                      {evt.ticketPrice === 0 ? 'FREE' : `${evt.currency || 'ZMW'} ${evt.ticketPrice}`}
                    </span>
                    <button
                      onClick={() => onGetTickets(evt)}
                      className="px-2.5 py-1 text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg hover:opacity-90 shadow-sm flex items-center gap-1"
                    >
                      <Ticket className="w-3 h-3" /> Get Pass
                    </button>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Map Overlay Badge */}
      <div className="absolute top-4 left-4 z-[400] bg-slate-900/90 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 shadow-lg flex items-center gap-2 text-white">
        <Sparkles className="w-4 h-4 text-accent animate-pulse" />
        <span className="text-xs font-semibold">Live Events Map — Lusaka & Beyond</span>
      </div>
    </div>
  );
}
