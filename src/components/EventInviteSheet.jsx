import { Sparkles } from 'lucide-react';
import Sheet from './Sheet';
import PartyCard from './PartyCard';

// What someone sees after opening a shared event link: the event itself, with
// a way in for people who do not have an account yet.
export default function EventInviteSheet({ event, open, onClose, signedIn, onSignUp, ...cardProps }) {
  return (
    <Sheet
      open={open && Boolean(event)}
      onClose={onClose}
      title="You're invited"
      subtitle={event?.name}
      footer={
        signedIn ? undefined : (
          <button type="button" onClick={onSignUp} className="btn-accent w-full">
            Sign up to get your pass
          </button>
        )
      }
    >
      {!signedIn && (
        <p className="mb-5 flex items-start gap-2.5 rounded-2xl bg-accent/10 px-4 py-3 text-sm text-text-secondary">
          <Sparkles className="w-4 h-4 mt-0.5 shrink-0 text-accent" />
          A friend shared this with you. Create a free PAMP account to get your pass, RSVP and see
          who&apos;s going.
        </p>
      )}
      {event && <PartyCard party={event} {...cardProps} />}
    </Sheet>
  );
}
