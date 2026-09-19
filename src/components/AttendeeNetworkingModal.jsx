import { ExternalLink, Eye, EyeOff, Star } from 'lucide-react';
import Sheet from './Sheet';
import { useAuth } from '../lib/authContext';
import { useAttendees, useFeatureAttendee, useSetAttendeeVisibility } from '../lib/queries';

const PLATFORM_LABEL = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  x: 'X',
  snapchat: 'Snapchat',
  facebook: 'Facebook',
  whatsapp: 'WhatsApp',
};

export default function AttendeeNetworkingModal({ event, isOpen, onClose }) {
  const { user } = useAuth();
  // Row-level security decides what comes back: people at the same event see
  // each other, and everyone sees attendees the host has featured publicly.
  const { data: attendees = [], isLoading } = useAttendees(isOpen ? event?.id : null);
  const setVisibility = useSetAttendeeVisibility(user?.id);
  const featureAttendee = useFeatureAttendee();

  const isHost = Boolean(user && event?.hostId === user.id);
  const mine = attendees.find((a) => a.userId === user?.id);

  return (
    <Sheet
      open={isOpen && Boolean(event)}
      onClose={onClose}
      title="Attending this event"
      subtitle={event?.name}
      footer={<p className="text-center text-[13px] text-text-muted">Connect before the event to plan meetups.</p>}
    >
      {mine && (
        <div className="card mb-4 flex items-center gap-3 p-4">
          <span className="flex w-10 h-10 items-center justify-center rounded-full bg-white/6 shrink-0">
            {mine.showPublicly ? <Eye className="w-5 h-5 text-accent" /> : <EyeOff className="w-5 h-5 text-text-secondary" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-white">Show me in this list</p>
            <p className="text-[13px] text-text-muted">
              {mine.showPublicly
                ? mine.featuredByHost
                  ? 'You are visible to everyone, including people not signed in.'
                  : 'Other attendees can see you. The host can also feature you publicly.'
                : 'Only the host can see you right now.'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={mine.showPublicly}
            aria-label="Show me in this list"
            disabled={setVisibility.isPending}
            onClick={() =>
              setVisibility.mutate({ eventId: event.id, showPublicly: !mine.showPublicly })
            }
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50 ${
              mine.showPublicly ? 'bg-accent' : 'bg-white/15'
            }`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform duration-200 ${
                mine.showPublicly ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      )}

      {isLoading ? (
        <ul className="-mx-2 divide-y divide-white/5" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex items-center gap-3 px-2 py-3.5">
              <span className="w-11 h-11 rounded-full bg-white/5 animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 rounded-full bg-white/5 animate-pulse" />
                <div className="h-3 w-24 rounded-full bg-white/5 animate-pulse" />
              </div>
            </li>
          ))}
        </ul>
      ) : attendees.length > 0 ? (
        <ul className="-mx-2 divide-y divide-white/5">
          {attendees.map((person) => (
            <li key={person.userId} className="flex items-center gap-3 px-2 py-3.5">
              <span
                className="brand-gradient w-11 h-11 rounded-full flex items-center justify-center text-base font-bold text-white shrink-0"
                aria-hidden="true"
              >
                {person.name.charAt(0)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-white truncate">
                  {person.name}
                  {person.featuredByHost && (
                    <span className="ml-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent">Featured</span>
                  )}
                </p>
                {person.role && <p className="text-sm text-text-secondary truncate">{person.role}</p>}
                {person.lookingToConnect && (
                  <p className="text-[13px] text-text-muted truncate">Looking for {person.lookingToConnect}</p>
                )}
              </div>

              {isHost && person.userId !== user?.id ? (
                <button
                  type="button"
                  disabled={!person.showPublicly || featureAttendee.isPending}
                  title={person.showPublicly ? undefined : 'They have not opted in to being listed yet'}
                  onClick={() =>
                    featureAttendee.mutate({
                      eventId: event.id,
                      attendeeId: person.userId,
                      featured: !person.featuredByHost,
                    })
                  }
                  className={`h-9 px-4 rounded-full text-sm font-semibold inline-flex items-center gap-1.5 shrink-0 transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
                    person.featuredByHost
                      ? 'bg-white/8 text-text-secondary'
                      : 'bg-accent/15 text-accent-hover hover:bg-accent/25'
                  }`}
                >
                  <Star className="w-4 h-4" />
                  {person.featuredByHost ? 'Featured' : 'Feature'}
                </button>
              ) : (
                person.socialUrl && (
                  <a
                    href={person.socialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-9 px-4 rounded-full text-sm font-semibold inline-flex items-center gap-1.5 shrink-0 bg-accent/15 text-accent-hover hover:bg-accent/25 transition-colors duration-200"
                  >
                    <ExternalLink className="w-4 h-4" />
                    {PLATFORM_LABEL[person.socialPlatform] ?? 'Profile'}
                  </a>
                )
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-10 text-center text-text-secondary">
          No one has chosen to be listed yet. Opt in from your RSVP to appear here.
        </p>
      )}
    </Sheet>
  );
}
