import { CheckCircle2, ChevronRight, WifiOff } from 'lucide-react';
import Sheet from './Sheet';
import { formatEventDate } from '../lib/format';
import { summarisePasses } from '../lib/passes';

// Every event this person holds passes for. Built from the copy kept on the
// phone, which carries enough of each event to open its passes, so this works
// at the door with no signal even when the event list cannot load.
export default function MyPassesSheet({ open, onClose, passEvents, offline, onOpen }) {
  return (
    <Sheet open={open} onClose={onClose} title="Your passes" subtitle="Each pass admits one person, once.">
      {offline && (
        <p className="mb-4 flex items-center gap-1.5 text-[13px] text-text-muted">
          <WifiOff className="w-3.5 h-3.5" />
          No connection. These are the passes saved on this phone.
        </p>
      )}
      {passEvents.length === 0 ? (
        <p className="card p-6 text-center text-text-secondary">
          No passes yet. Get one from any event and it is kept here, ready for the door.
        </p>
      ) : (
        <ul className="space-y-3">
          {passEvents.map(({ event, passes }) => {
            const s = summarisePasses(passes);
            return (
              <li key={event.id}>
                <button
                  type="button"
                  onClick={() => onOpen(event)}
                  className="card w-full flex items-center gap-4 p-3 text-left transition-colors duration-200 hover:bg-white/5"
                >
                  {event.image ? (
                    <img src={event.image} alt="" className="w-14 h-14 rounded-2xl object-cover shrink-0" />
                  ) : (
                    <span className="w-14 h-14 rounded-2xl bg-white/5 shrink-0" aria-hidden="true" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="eyebrow block">{formatEventDate(event.date, event.time)}</span>
                    <span className="block font-semibold text-white truncate">{event.name}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-text-muted">
                      {s.allIn && <CheckCircle2 className="w-3.5 h-3.5 text-green" />}
                      {s.count} {s.count === 1 ? 'pass' : 'passes'}
                      {s.checkedIn > 0 && ` · ${s.checkedIn} used`}
                    </span>
                  </span>
                  <ChevronRight className="w-5 h-5 text-text-muted shrink-0" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
