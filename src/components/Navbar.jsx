import { NAV_ITEMS } from './navItems';

// Top bar: wordmark everywhere, section links on desktop (phones use the TabBar).
export default function Navbar({ activeSection, onNavigate }) {
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

        <button
          type="button"
          onClick={() => onNavigate('host')}
          className="btn-accent hidden md:inline-flex min-h-9 h-9 px-4 text-sm"
        >
          Host an event
        </button>
      </div>
    </header>
  );
}
