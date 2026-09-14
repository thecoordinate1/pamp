import { useState } from 'react';
import { Check, Crown, MapPin, Users } from 'lucide-react';
import VibeRating from './VibeRating';
import { formatEventDate } from '../lib/format';

export default function PartyCard({
  party,
  onRSVP,
  isRSVPed,
  onFacecard,
  onGetTickets,
  onViewAttendees
}) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const isFree = !party.ticketPrice;
  const priceText = isFree ? 'Free' : `${party.currency || 'ZMW'} ${party.ticketPrice}`;

  return (
    <article className="group flex flex-col">
      <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-surface">
        <img
          src={party.image}
          alt=""
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
          className={`h-full w-full object-cover transition-[opacity,transform] duration-700 ease-apple group-hover:scale-[1.03] ${
            imgLoaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
        <div className="absolute inset-0 bg-linear-to-t from-black/60 via-black/0 to-black/0" />
        <span className="glass absolute top-3 right-3 rounded-full px-3 py-1 text-[13px] font-semibold text-white">
          {priceText}
        </span>
        <span className="absolute bottom-3 left-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-white/90">
          <Users className="w-3.5 h-3.5" />
          {party.rsvpCount} going
        </span>
      </div>

      <div className="pt-4 flex flex-col flex-1">
        <p className="eyebrow">{formatEventDate(party.date, party.time)}</p>
        <h3 className="mt-1 text-xl font-bold leading-snug text-white">{party.name}</h3>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-text-secondary">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{party.area}</span>
        </p>

        <p className="mt-3 text-[15px] leading-relaxed text-text-secondary line-clamp-2">{party.description}</p>

        <p className="mt-3 text-[13px] text-text-muted">
          Hosted by <span className="font-medium text-text-primary">{party.host}</span>
          {party.dressCode && <span> · {party.dressCode}</span>}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <VibeRating initialScore={party.vibeScore || 92} />
          <button
            type="button"
            onClick={() => onViewAttendees(party)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[13px] font-semibold bg-white/6 text-text-secondary hover:text-white hover:bg-white/10 transition-colors duration-200"
          >
            <Users className="w-3.5 h-3.5" />
            Who's going
          </button>
        </div>

        <div className="mt-auto pt-5 flex items-center gap-2">
          <button type="button" onClick={() => onGetTickets(party)} className="btn-accent flex-1">
            {isFree ? 'Get free pass' : 'Get pass'}
          </button>
          <button
            type="button"
            onClick={() => onRSVP(party.id)}
            aria-pressed={isRSVPed}
            className={`btn-secondary px-4 ${isRSVPed ? 'text-green bg-green/10 hover:bg-green/15' : ''}`}
          >
            {isRSVPed ? (
              <>
                <Check className="w-4 h-4" />
                Going
              </>
            ) : (
              'RSVP'
            )}
          </button>
          <button
            type="button"
            onClick={() => onFacecard(party)}
            className="btn-icon"
            aria-label="Request a VIP invite with Facecard"
            title="Request a VIP invite"
          >
            <Crown className="w-[18px] h-[18px] text-accent" />
          </button>
        </div>
      </div>
    </article>
  );
}
