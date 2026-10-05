import { useSwipe } from '../lib/useSwipe';
import { MEET_INTENTS, useSignedAvatar } from '../lib/meetQueries';

const INTENT_LABELS = Object.fromEntries(MEET_INTENTS.map(({ id, label }) => [id, label]));
const THRESHOLD = 90;

// Cards behind the top one sit slightly smaller and lower, as a stack.
const STACK = [
  { scale: 1, y: 0 },
  { scale: 0.96, y: 8 },
  { scale: 0.92, y: 16 },
];

// One person's card. Only the top card can be dragged; the like and pass
// buttons live outside it, so pointer capture never swallows their taps.
export default function SwipeCard({ userId, profile, onLike, onPass, stackIndex = 0 }) {
  const isTop = stackIndex === 0;
  const { offsetX, rotation, isDragging, bind } = useSwipe({ onLike, onPass, threshold: THRESHOLD });
  const { data: photo } = useSignedAvatar(userId, profile.avatar_path);
  const intents = (profile.intents ?? []).filter((i) => INTENT_LABELS[i]);
  const { scale, y } = STACK[stackIndex] ?? STACK[STACK.length - 1];

  const style = isTop
    ? {
        transform: `translateX(${offsetX}px) rotate(${rotation}deg)`,
        transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)',
        cursor: isDragging ? 'grabbing' : 'grab',
        // Vertical drags still scroll the page; horizontal ones swipe.
        touchAction: 'pan-y',
      }
    : { transform: `scale(${scale}) translateY(${y}px)`, transition: 'transform 0.2s ease' };

  const likeOpacity = isTop ? Math.max(0, Math.min(1, offsetX / THRESHOLD)) : 0;
  const passOpacity = isTop ? Math.max(0, Math.min(1, -offsetX / THRESHOLD)) : 0;

  return (
    <div
      className="absolute inset-0 select-none"
      style={{ ...style, zIndex: 10 - stackIndex }}
      aria-hidden={!isTop}
      {...(isTop ? bind : {})}
    >
      <div className="relative w-full h-full rounded-3xl overflow-hidden bg-surface border border-white/10">
        {photo ? (
          <img src={photo} alt="" draggable={false} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-white/5">
            <span className="text-7xl font-bold text-white/20">
              {profile.display_name?.[0]?.toUpperCase() ?? '?'}
            </span>
          </div>
        )}

        <div className="absolute inset-0 bg-linear-to-t from-black/85 via-black/10 to-transparent" />

        {isTop && (
          <>
            <div className="absolute inset-0 bg-green/30 pointer-events-none" style={{ opacity: likeOpacity }} />
            <div className="absolute inset-0 bg-red/30 pointer-events-none" style={{ opacity: passOpacity }} />
          </>
        )}

        <div className="absolute bottom-0 inset-x-0 p-5">
          <p className="text-2xl font-bold text-white leading-tight">
            {profile.display_name || 'Guest'}
            {profile.age != null && <span className="font-normal text-white/70">, {profile.age}</span>}
          </p>
          {profile.headline && <p className="text-sm text-white/80 mt-0.5 line-clamp-1">{profile.headline}</p>}
          {intents.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {intents.map((i) => (
                <span key={i} className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                  {INTENT_LABELS[i]}
                </span>
              ))}
            </div>
          )}
          {profile.looking_for && (
            <p className="mt-2 text-[13px] text-white/70 line-clamp-2">Looking for {profile.looking_for}</p>
          )}
        </div>
      </div>
    </div>
  );
}
