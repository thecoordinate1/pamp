import { NAV_ITEMS } from './navItems';
import { useAuth } from '../lib/authContext';

// Top bar: wordmark everywhere, section links on desktop (phones use the TabBar).
// The account control sits here at every width, because the TabBar already
// carries four tabs and a fifth crowds it on a phone.
export default function Navbar({ activeSection, onNavigate, onOpenProfile, onSignIn }) {
  const { user, loading } = useAuth();
  const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || '';
  const initial = (displayName.match(/[A-Za-z0-9]/)?.[0] ?? '?').toUpperCase();

  return (
    <header className="glass border-x-0 border-t-0 fixed top-0 inset-x-0 z-50 pt-[env(safe-area-inset-top)]">
      <div className="max-w-6xl mx-auto h-14 px-5 md:px-8 flex items-center justify-between gap-6">
        <button
          type="button"
          onClick={() => onNavigate('explore')}
          className="flex items-center gap-2.5 rounded-full"
          aria-label="PAMP home"
        >
          <span className="brand-gradient w-8 h-8 rounded-[10px] flex items-center justify-center text-base font-extrabold text-white">
            P
          </span>
          <span className="text-lg font-bold tracking-tight text-white">PAMP</span>
        </button>

        <nav aria-label="Primary" className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map(({ id, label }) => {
            const isActive = activeSection === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onNavigate(id)}
                aria-current={isActive ? 'page' : undefined}
                className={`px-3.5 h-9 rounded-full text-sm font-medium transition-colors duration-200 ${
                  isActive ? 'text-white bg-white/10' : 'text-text-secondary hover:text-white'
                }`}
              >
                {label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('host')}
            className="btn-accent hidden md:inline-flex min-h-9 h-9 px-4 text-sm"
          >
            Host an event
          </button>

          {loading ? (
            <span className="w-9 h-9 rounded-full bg-white/5 animate-pulse" aria-hidden="true" />
          ) : user ? (
            <button
              type="button"
              onClick={onOpenProfile}
              title={displayName || 'Your profile'}
              aria-label="Your profile"
              className="brand-gradient w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-sm font-bold text-white transition-transform duration-200 active:scale-95"
            >
              {initial}
            </button>
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              className="btn-secondary min-h-9 h-9 px-4 text-sm"
            >
              Sign in
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
