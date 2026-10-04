import { Sparkles } from 'lucide-react';
import Sheet from './Sheet';
import LocationCard from './LocationCard';
import { PassCard } from './PassCarousel';
import { useSharedPass } from '../lib/queries';

// What a friend sees after opening a pass someone sent them: a guest card that
// gets them in, signed in or not. An account is offered, never required, so a
// slow sign-up can never keep someone waiting at the door.
export default function SharedPassSheet({ token, open, onClose, signedIn, onSignUp }) {
  const { data: shared, isLoading, isError } = useSharedPass(token, { enabled: open });

  const used = shared?.pass.status === 'checked_in';
  // A link that is used up or no longer works is forgotten on close. A live one
  // is kept, so the pass opens again when the app does, say at the door.
  const close = () => onClose({ forget: !isLoading && !isError && (!shared || used) });
  let title = 'Shared pass';
  if (shared) title = used ? 'Pass used' : "You're on the guest list";

  return (
    <Sheet
      open={open}
      onClose={close}
      title={title}
      subtitle={shared?.event.name}
      footer={
        <button type="button" onClick={close} className="btn-accent w-full">
          Done
        </button>
      }
    >
      {isLoading && <div className="h-96 rounded-3xl bg-white/5 animate-pulse" aria-hidden="true" />}

      {!isLoading && !shared && (
        <p className="card p-6 text-center text-text-secondary">
          {isError
            ? 'Could not load this pass. Check your connection and try again.'
            : 'This pass link no longer works. Ask the friend who sent it to send it again.'}
        </p>
      )}

      {shared && (
        <div>
          <p className="mb-5 text-center text-sm text-text-secondary">
            {used
              ? 'This pass has been scanned, so it cannot be used again.'
              : `${shared.fromName} sent you this pass. Show the QR at the door. It works for one person, once.`}
          </p>
          <PassCard
            event={shared.event}
            pass={shared.pass}
            label="PAMP guest pass"
            guestLine={`On the guest list · Guest of ${shared.fromName}`}
          />
          {!used && <LocationCard location={shared.location} className="mt-5" />}
          {!signedIn && (
            <div className="mt-6 rounded-2xl bg-accent/10 px-4 py-4">
              <p className="flex items-start gap-2.5 text-sm text-text-secondary">
                <Sparkles className="w-4 h-4 mt-0.5 shrink-0 text-accent" />
                Make a free PAMP account to RSVP, see who&apos;s going, and get passes of your own.
              </p>
              <button type="button" onClick={onSignUp} className="btn-secondary w-full mt-3">
                Create my account
              </button>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
