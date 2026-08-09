import { useState } from 'react';
import { X, Users, UserPlus, Briefcase, MessageSquare, Check, Sparkles } from 'lucide-react';

export default function AttendeeNetworkingModal({ event, isOpen, onClose }) {
  const [connectedIds, setConnectedIds] = useState(new Set());

  if (!isOpen || !event) return null;

  const attendees = event.attendees || [];

  const toggleConnect = (idx) => {
    setConnectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-surface border border-white/10 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl relative max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-white">Attendee Directory & Networking</h3>
              <p className="text-xs text-text-secondary">{event.name}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-text-secondary hover:text-white bg-white/5 rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {attendees.length > 0 ? (
            attendees.map((person, idx) => {
              const isConnected = connectedIds.has(idx);
              return (
                <div
                  key={idx}
                  className="bg-slate-900/90 border border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:border-accent/40 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-accent to-purple-600 font-bold text-white flex items-center justify-center text-sm shadow-md shrink-0">
                      {person.name.charAt(0)}
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-white">{person.name}</h4>
                      <p className="text-xs text-accent font-medium flex items-center gap-1 mt-0.5">
                        <Briefcase className="w-3 h-3" /> {person.role}
                      </p>
                      {person.lookingToConnect && (
                        <p className="text-[11px] text-text-secondary mt-1">
                          <span className="text-purple-400 font-semibold">Looking for:</span> {person.lookingToConnect}
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => toggleConnect(idx)}
                    className={`w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                      isConnected
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-accent/20 text-accent border border-accent/30 hover:bg-accent hover:text-white'
                    }`}
                  >
                    {isConnected ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Connected
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-3.5 h-3.5" /> Connect
                      </>
                    )}
                  </button>
                </div>
              );
            })
          ) : (
            <div className="text-center py-10 text-text-secondary text-sm">
              No public attendee profiles listed yet. Be the first to join and share your vibe!
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-slate-950 text-center text-xs text-text-secondary flex items-center justify-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" />
          <span>Connect before the event to share ideas & plan meetups!</span>
        </div>
      </div>
    </div>
  );
}
