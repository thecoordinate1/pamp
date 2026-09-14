import { useState } from 'react';
import { Flame } from 'lucide-react';

export default function VibeRating({ initialScore = 92 }) {
  const [score, setScore] = useState(initialScore);
  const [hasVoted, setHasVoted] = useState(false);

  const handleVote = () => {
    if (hasVoted) return;
    setScore((s) => Math.min(100, s + 1));
    setHasVoted(true);
  };

  return (
    <button
      type="button"
      onClick={handleVote}
      disabled={hasVoted}
      aria-pressed={hasVoted}
      aria-label={hasVoted ? `You hyped this. ${score}% lit` : `Vibe ${score}% lit. Tap to hype it`}
      className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[13px] font-semibold transition-colors duration-200 ${
        hasVoted
          ? 'bg-accent/15 text-accent-hover'
          : 'bg-white/6 text-text-secondary hover:text-white hover:bg-white/10'
      }`}
    >
      <Flame className="w-3.5 h-3.5" fill={hasVoted ? 'currentColor' : 'none'} />
      {score}% lit
    </button>
  );
}
