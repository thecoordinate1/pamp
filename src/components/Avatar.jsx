import { BadgeCheck } from 'lucide-react';

const initialOf = (name) => ((name || '').match(/[A-Za-z0-9]/)?.[0] || '?').toUpperCase();

// A person's profile picture, or the first letter of their name on the brand
// gradient when there is none or this viewer may not see it. Size and text size
// come from className.
export function Avatar({ src, name, className = 'w-11 h-11 text-base' }) {
  if (src) {
    return <img src={src} alt="" className={`${className} rounded-full object-cover shrink-0`} />;
  }
  return (
    <span
      aria-hidden="true"
      className={`brand-gradient ${className} rounded-full flex items-center justify-center font-bold text-white shrink-0`}
    >
      {initialOf(name)}
    </span>
  );
}

// An admin has checked that this person matches their photo.
export function VerifiedBadge({ className = 'w-4 h-4' }) {
  return (
    <BadgeCheck
      role="img"
      aria-label="Verified"
      className={`${className} inline-block shrink-0 align-[-0.125em] text-accent`}
    />
  );
}

// Name, badge and @username, as people are listed across the app.
export function PersonName({ name, username, verified, className = '' }) {
  return (
    <span className={`min-w-0 ${className}`}>
      <span className="inline-flex max-w-full items-center gap-1 font-semibold text-white">
        <span className="truncate">{name}</span>
        {verified && <VerifiedBadge />}
      </span>
      {username && <span className="block truncate text-[13px] font-normal text-text-muted">@{username}</span>}
    </span>
  );
}
