import { useState } from 'react';
import { Flame, ThumbsUp, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function VibeRating({ eventId, initialScore = 92 }) {
  const [score, setScore] = useState(initialScore);
  const [hasVoted, setHasVoted] = useState(false);

  const handleVote = (delta) => {
    if (hasVoted) return;
    setScore(score + delta);
    setHasVoted(true);

    if (delta > 0) {
      confetti({
        particleCount: 40,
        spread: 50,
        origin: { y: 0.8 }
      });
    }
  };

  return (
    <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center justify-center animate-pulse">
          <Flame className="w-4 h-4" />
        </div>
        <div>
          <div className="text-[10px] text-text-secondary font-semibold uppercase tracking-wider">
            Live Crowd Vibe
          </div>
          <div className="text-xs font-black text-white flex items-center gap-1">
            <span className="text-orange-400">{score}% Lit</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => handleVote(1)}
          disabled={hasVoted}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
            hasVoted
              ? 'bg-white/5 text-gray-500 cursor-not-allowed'
              : 'bg-orange-500/20 text-orange-400 hover:bg-orange-500 hover:text-white border border-orange-500/30'
          }`}
        >
          🔥 Fire (+1)
        </button>
      </div>
    </div>
  );
}
