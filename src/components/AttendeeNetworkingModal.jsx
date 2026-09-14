import { useState } from 'react';
import { Check, UserPlus } from 'lucide-react';
import Sheet from './Sheet';

export default function AttendeeNetworkingModal({ event, isOpen, onClose }) {
  const [connectedIds, setConnectedIds] = useState(new Set());
  const attendees = event?.attendees || [];

  const toggleConnect = (idx) => {
    setConnectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <Sheet
      open={isOpen && Boolean(event)}
      onClose={onClose}
      title="Who's going"
      subtitle={event?.name}
      footer={<p className="text-center text-[13px] text-text-muted">Connect before the event to plan meetups.</p>}
    >
      {attendees.length > 0 ? (
        <ul className="-mx-2 divide-y divide-white/5">
          {attendees.map((person, idx) => {
            const isConnected = connectedIds.has(idx);
            return (
              <li key={idx} className="flex items-center gap-3 px-2 py-3.5">
                <span
                  className="brand-gradient w-11 h-11 rounded-full flex items-center justify-center text-base font-bold text-white shrink-0"
                  aria-hidden="true"
                >
                  {person.name.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white truncate">{person.name}</p>
                  <p className="text-sm text-text-secondary truncate">{person.role}</p>
                  {person.lookingToConnect && (
                    <p className="text-[13px] text-text-muted truncate">Looking for {person.lookingToConnect}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => toggleConnect(idx)}
                  aria-pressed={isConnected}
                  className={`h-9 px-4 rounded-full text-sm font-semibold inline-flex items-center gap-1.5 shrink-0 transition-colors duration-200 ${
                    isConnected
                      ? 'bg-white/8 text-text-secondary'
                      : 'bg-accent/15 text-accent-hover hover:bg-accent/25'
                  }`}
                >
                  {isConnected ? (
                    <>
                      <Check className="w-4 h-4" />
                      Connected
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      Connect
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-10 text-center text-text-secondary">No one has shared a profile yet. Be the first.</p>
      )}
    </Sheet>
  );
}
