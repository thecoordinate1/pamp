import { Flame } from 'lucide-react';

// An event's vibe score, when it has one. There is no voting behind it yet, so
// it is a label rather than a button: tapping used to bump a number that was
// never saved and reset on reload.
export default function VibeRating({ score }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[13px] font-semibold bg-white/6 text-text-secondary"
      aria-label={`Vibe ${score}% lit`}
    >
      <Flame className="w-3.5 h-3.5" aria-hidden="true" />
      {score}% lit
    </span>
  );
}
