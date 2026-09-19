import { ExternalLink } from 'lucide-react';
import Sheet from './Sheet';
import { useAttendees } from '../lib/queries';

const PLATFORM_LABEL = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  x: 'X',
  snapchat: 'Snapchat',
  facebook: 'Facebook',
  whatsapp: 'WhatsApp',
};

export default function AttendeeNetworkingModal({ event, isOpen, onClose }) {
  // Row-level security decides what comes back: people at the same event see
  // each other, and everyone sees attendees the host has featured publicly.
  const { data: attendees = [], isLoading } = useAttendees(isOpen ? event?.id : null);

  return (
    <Sheet
      open={isOpen && Boolean(event)}
      onClose={onClose}
      title="Attending this event"
      subtitle={event?.name}
      footer={<p className="text-center text-[13px] text-text-muted">Connect before the event to plan meetups.</p>}
    >
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
                <p className="font-semibold text-white truncate">{person.name}</p>
                {person.role && <p className="text-sm text-text-secondary truncate">{person.role}</p>}
                {person.lookingToConnect && (
                  <p className="text-[13px] text-text-muted truncate">Looking for {person.lookingToConnect}</p>
                )}
              </div>
              {person.socialUrl && (
                <a
                  href={person.socialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-9 px-4 rounded-full text-sm font-semibold inline-flex items-center gap-1.5 shrink-0 bg-accent/15 text-accent-hover hover:bg-accent/25 transition-colors duration-200"
                >
                  <ExternalLink className="w-4 h-4" />
                  {PLATFORM_LABEL[person.socialPlatform] ?? 'Profile'}
                </a>
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
