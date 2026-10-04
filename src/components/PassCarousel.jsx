import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, CheckCircle2, ChevronLeft, ChevronRight, Send, Undo2 } from 'lucide-react';
import { formatEventDate } from '../lib/format';

const timeOf = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// A guest card: the event, who is on the guest list, and the code that gets
// them in. A pass admits one person once, so after the scan it shows as used.
export function PassCard({ event, pass, guestLine, label }) {
  const used = pass.status === 'checked_in';
  return (
    <article className="overflow-hidden rounded-3xl text-left shadow-[0_24px_60px_rgba(124,77,255,0.25)]">
      <div className="brand-gradient px-5 py-4 text-white">
        <p className="text-[13px] font-semibold text-white/80">{label}</p>
        <p className="mt-0.5 text-lg font-bold leading-snug">{event.name}</p>
        <p className="text-sm text-white/90">
          {formatEventDate(event.date, event.time)} · {event.area}
        </p>
      </div>
      <div className="bg-white px-5 pt-5 pb-6 flex flex-col items-center text-[#0D0D0D]">
        <p className="text-[13px] text-black/60 text-center">{guestLine}</p>
        <div className="relative mt-3">
          <QRCodeSVG value={pass.code} size={176} level="H" className={used ? 'opacity-15' : undefined} />
          {used && (
            <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
              <span className="-rotate-12 rounded-xl border-4 border-[#15803d] bg-white/80 px-3 py-1 text-xl font-black tracking-widest text-[#15803d]">
                USED
              </span>
            </span>
          )}
        </div>
        <p className="mt-4 text-[11px] font-medium uppercase tracking-wide text-black/50">Pass ID</p>
        <p className={`font-mono text-2xl font-bold tracking-[0.2em] ${used ? 'text-black/35 line-through' : ''}`}>
          {pass.code}
        </p>
        <p
          className={`mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold ${
            used ? 'bg-[#16a34a]/12 text-[#15803d]' : 'bg-black/5 text-black/60'
          }`}
        >
          {used ? (
            <>
              <CheckCircle2 className="w-4 h-4" />
              Used · checked in{pass.checkedInAt ? ` at ${timeOf(pass.checkedInAt)}` : ''}
            </>
          ) : (
            'Unused · admits one person, once'
          )}
        </p>
      </div>
    </article>
  );
}

// What can be done with one of your own passes: send it to a friend, send the
// same link again, or take it back if it went to the wrong person.
function PassActions({ pass, onShare, onReclaim, busy, notice }) {
  const [confirming, setConfirming] = useState(false);
  if (pass.status === 'checked_in') return null;

  if (!pass.sharedAt) {
    return (
      <div className="mt-4">
        <button type="button" onClick={() => onShare(pass)} disabled={busy} className="btn-secondary w-full">
          <Send className="w-4 h-4" />
          Send to a friend
        </button>
        {notice && <p role="status" className="mt-2 text-center text-[13px] text-green">{notice}</p>}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      <p className="flex items-center justify-center gap-1.5 text-[13px] text-text-secondary">
        <Check className="w-3.5 h-3.5 text-green" />
        Sent to a friend. It still works for whoever is scanned first.
      </p>
      {confirming ? (
        <div className="rounded-2xl bg-white/5 p-3 text-center">
          <p className="text-[13px] text-text-secondary">
            This gives the pass a new code. The link and QR you sent stop working.
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setConfirming(false)} className="btn-secondary flex-1">
              Keep it shared
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                onReclaim(pass);
              }}
              disabled={busy}
              className="btn-accent flex-1"
            >
              Take it back
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={() => onShare(pass)} disabled={busy} className="btn-secondary flex-1">
            <Send className="w-4 h-4" />
            Send again
          </button>
          <button type="button" onClick={() => setConfirming(true)} disabled={busy} className="btn-secondary flex-1">
            <Undo2 className="w-4 h-4" />
            Take it back
          </button>
        </div>
      )}
      {notice && <p role="status" className="text-center text-[13px] text-green">{notice}</p>}
    </div>
  );
}

// Swipe sideways through passes; the buttons and dots do the same for anyone
// not swiping.
export default function PassCarousel({ event, passes, holderName, onShare, onReclaim, busyCode, notices = {}, focusIndex = 0 }) {
  const railRef = useRef(null);
  const [index, setIndex] = useState(0);
  const current = Math.min(index, Math.max(0, passes.length - 1));

  const scrollTo = (i, behavior = 'smooth') => {
    const rail = railRef.current;
    if (rail) rail.scrollTo({ left: i * rail.clientWidth, behavior });
  };

  // Opens on the requested pass, for example the first new one after buying more.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const i = Math.min(focusIndex, Math.max(0, passes.length - 1));
    rail.scrollTo({ left: i * rail.clientWidth, behavior: 'auto' });
  }, [focusIndex, passes.length]);

  const onScroll = () => {
    const rail = railRef.current;
    if (!rail || !rail.clientWidth) return;
    const i = Math.round(rail.scrollLeft / rail.clientWidth);
    if (i !== index) setIndex(i);
  };

  const total = passes.length;

  return (
    <div>
      <div
        ref={railRef}
        onScroll={onScroll}
        role="region"
        aria-roledescription="carousel"
        aria-label="Your passes"
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {passes.map((pass, i) => (
          <div
            key={pass.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`Pass ${i + 1} of ${total}`}
            className="w-full shrink-0 snap-center px-1"
          >
            <PassCard
              event={event}
              pass={pass}
              label={`PAMP guest pass${total > 1 ? ` · ${i + 1} of ${total}` : ''}`}
              guestLine={holderName ? `On the guest list · ${holderName}` : 'On the guest list'}
            />
            <PassActions
              pass={pass}
              onShare={onShare}
              onReclaim={onReclaim}
              busy={busyCode === pass.code}
              notice={notices[pass.id]}
            />
          </div>
        ))}
      </div>

      {total > 1 && (
        <div className="mt-4 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => scrollTo(Math.max(0, current - 1))}
            disabled={current === 0}
            className="btn-icon w-10 h-10 disabled:opacity-40"
            aria-label="Previous pass"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {passes.map((pass, i) => (
              <span
                key={pass.id}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  i === current ? 'w-5 bg-accent' : 'w-1.5 bg-white/25'
                }`}
              />
            ))}
          </div>
          <span className="sr-only" aria-live="polite">
            Pass {current + 1} of {total}
          </span>
          <button
            type="button"
            onClick={() => scrollTo(Math.min(total - 1, current + 1))}
            disabled={current === total - 1}
            className="btn-icon w-10 h-10 disabled:opacity-40"
            aria-label="Next pass"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}
