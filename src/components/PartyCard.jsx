import { useState } from 'react';
import { Calendar, MapPin, Ticket, Users, ShieldAlert, Sparkles, Check } from 'lucide-react';
import VibeRating from './VibeRating';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-ZM', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function PartyCard({
  party,
  onRSVP,
  isRSVPed,
  onFacecard,
  onGetTickets,
  onViewAttendees
}) {
  const [imgLoaded, setImgLoaded] = useState(false);

  const priceText = party.ticketPrice === 0 ? 'FREE ENTRY' : `${party.currency || 'ZMW'} ${party.ticketPrice}`;
  const attendeeCount = party.attendees?.length || 0;

  return (
    <div className="bg-surface/90 border border-white/10 rounded-3xl overflow-hidden shadow-xl hover:border-accent/40 transition-all duration-300 flex flex-col group hover:-translate-y-1">
      {/* Image Header */}
      <div className="relative h-52 overflow-hidden bg-slate-900">
        <img
          src={party.image}
          alt={party.name}
          className={`w-full h-full object-cover transition-all duration-700 ${
            imgLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-105'
          } group-hover:scale-105`}
          onLoad={() => setImgLoaded(true)}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />

        {/* Vibe badge */}
        <div className="absolute top-3 left-3 flex gap-2">
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-accent/90 text-white backdrop-blur-md shadow-md">
            {party.vibe}
          </span>
        </div>

        {/* Price Pill */}
        <div className="absolute top-3 right-3">
          <span className="px-3 py-1 rounded-full text-xs font-black bg-slate-900/90 text-emerald-400 border border-emerald-500/30 backdrop-blur-md shadow-md">
            {priceText}
          </span>
        </div>

        {/* Host Avatar / Tag */}
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
          <div className="text-xs text-white font-medium drop-shadow-md">
            Hosted by <strong className="text-accent">{party.host}</strong>
          </div>
          <span className="text-xs text-cyan-300 font-bold bg-black/60 px-2.5 py-1 rounded-lg backdrop-blur-sm">
            🔥 {party.rsvpCount} Attending
          </span>
        </div>
      </div>

      {/* Card Content */}
      <div className="p-5 flex flex-col flex-1 space-y-4">
        <div>
          <h3 className="text-lg font-black text-white leading-snug mb-1 group-hover:text-accent transition-colors">
            {party.name}
          </h3>

          <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
            <span className="flex items-center gap-1 font-semibold text-gray-300">
              <Calendar className="w-3.5 h-3.5 text-accent" /> {formatDate(party.date)} • {party.time}
            </span>
            <span className="flex items-center gap-1 font-semibold text-gray-300">
              <MapPin className="w-3.5 h-3.5 text-cyan-400" /> {party.area}
            </span>
          </div>
        </div>

        <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed flex-1">
          {party.description}
        </p>

        {/* Dress code & Networking Teaser */}
        <div className="pt-2 border-t border-white/5 space-y-2">
          {party.dressCode && (
            <div className="text-[11px] text-text-secondary flex items-center gap-1.5">
              <span className="text-gray-400">Dress Code:</span>
              <span className="font-semibold text-white bg-white/5 px-2 py-0.5 rounded-md">
                👗 {party.dressCode}
              </span>
            </div>
          )}

          {/* Attendee Networking Trigger */}
          <button
            onClick={() => onViewAttendees(party)}
            className="w-full text-left bg-slate-900/90 border border-white/5 hover:border-accent/30 p-2.5 rounded-xl flex items-center justify-between text-xs text-text-secondary transition-colors"
          >
            <div className="flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-accent" />
              <span>
                <strong className="text-white">{attendeeCount > 0 ? attendeeCount : 'Several'} professionals</strong> listed to connect
              </span>
            </div>
            <span className="text-[10px] text-accent font-bold uppercase tracking-wider">
              View List →
            </span>
          </button>
        </div>

        {/* Live Vibe Rating Widget */}
        <VibeRating eventId={party.id} initialScore={party.vibeScore || 92} />

        {/* Action Button Bar */}
        <div className="pt-2 flex items-center gap-2">
          {/* Get Pass / Ticket Button */}
          <button
            onClick={() => onGetTickets(party)}
            className="flex-1 btn-accent py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg shadow-accent/20"
          >
            <Ticket className="w-4 h-4" /> Get Entry Pass
          </button>

          {/* RSVP Button */}
          <button
            onClick={() => onRSVP(party.id)}
            className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-all ${
              isRSVPed
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                : 'bg-white/5 text-white border-white/10 hover:bg-white/10'
            }`}
            title="RSVP to event"
          >
            {isRSVPed ? <Check className="w-4 h-4" /> : "RSVP"}
          </button>

          {/* Facecard VIP Trigger */}
          <button
            onClick={() => onFacecard(party)}
            className="p-2.5 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 transition-colors"
            title="Request VIP Facecard Pass"
          >
            <ShieldAlert className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
