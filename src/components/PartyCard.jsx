import { useState } from 'react';

const vibeColors = {
  'Afrobeats & Amapiano': { bg: 'bg-accent-dim', text: 'text-accent' },
  'Throwback / Retro': { bg: 'bg-amber-dim', text: 'text-amber' },
  'Pool Party': { bg: 'bg-cyan-dim', text: 'text-cyan' },
  'EDM / Rave': { bg: 'bg-green-dim', text: 'text-green' },
  'Elegant / Chic': { bg: 'bg-amber-dim', text: 'text-amber' },
  'Day Party / Brunch': { bg: 'bg-cyan-dim', text: 'text-cyan' },
  'Masquerade / Mystery': { bg: 'bg-accent-dim', text: 'text-accent' },
  'Zambian Music Only': { bg: 'bg-green-dim', text: 'text-green' },
};

function formatDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-ZM', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function PartyCard({ party, onRSVP, isRSVPed, onFacecard }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const colors = vibeColors[party.vibe] || { bg: 'bg-accent-dim', text: 'text-accent' };

  return (
    <div className="glass-card glass-card-hover overflow-hidden fade-in-up flex flex-col">
      {/* Image */}
      <div className="relative h-48 overflow-hidden bg-surface">
        <img
          src={party.image}
          alt={party.name}
          className={`w-full h-full object-cover transition-all duration-700 ${imgLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-105'}`}
          onLoad={() => setImgLoaded(true)}
        />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(13,13,13,0.8) 0%, transparent 60%)' }} />
        
        {/* Vibe badge */}
        <div className="absolute top-3 left-3">
          <span className={`badge ${colors.bg} ${colors.text}`}>
            {party.vibe}
          </span>
        </div>

        {/* RSVP count */}
        <div className="absolute top-3 right-3">
          <span className="badge bg-surface/80 text-text-primary backdrop-blur-sm">
            🔥 {party.rsvpCount} going
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-5 flex flex-col flex-1">
        <h3 className="text-lg font-bold text-text-primary mb-1">{party.name}</h3>
        
        <div className="flex items-center gap-2 text-text-secondary text-sm mb-1">
          <span>📅</span>
          <span>{formatDate(party.date)}</span>
          <span className="text-text-muted">•</span>
          <span>{party.time}</span>
        </div>

        <div className="flex items-center gap-2 text-text-secondary text-sm mb-3">
          <span>📍</span>
          <span>{party.area}</span>
        </div>

        {/* Dress code pill */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-text-muted">Dress code:</span>
          <span className="badge bg-surface-lighter text-text-primary">
            👗 {party.dressCode}
          </span>
        </div>

        <p className="text-sm text-text-secondary mb-4 line-clamp-2 flex-1">{party.description}</p>

        {/* Host */}
        <div className="flex items-center gap-2 mb-4 text-sm text-text-muted">
          <span>🎤</span>
          <span>Hosted by <span className="text-text-primary font-medium">{party.host}</span></span>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-auto">
          <button
            onClick={() => onRSVP(party.id)}
            className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all duration-300 cursor-pointer
              ${isRSVPed
                ? 'bg-accent text-white shadow-lg shadow-accent/25'
                : 'btn-outline'
              }`}
          >
            {isRSVPed ? '✓ Going!' : "I'm In 🙌"}
          </button>
          <button
            onClick={() => onFacecard(party)}
            className="px-4 py-2.5 rounded-xl font-semibold text-sm bg-surface-lighter text-text-primary hover:bg-surface-light transition cursor-pointer"
            title="Request invite via Facecard"
          >
            📸
          </button>
        </div>
      </div>
    </div>
  );
}
