import { NAV_ITEMS } from './navItems';

// Floating glass tab bar for phones; desktop uses the top Navbar instead.
export default function TabBar({ active, onNavigate }) {
  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed inset-x-0 bottom-0 z-50 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-none"
    >
      <div className="glass pointer-events-auto mx-auto max-w-md rounded-full p-1.5 flex shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
        {NAV_ITEMS.map(({ id, tabLabel, icon: Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex-1 min-h-[52px] rounded-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors duration-200 ${
                isActive ? 'bg-white/10 text-accent' : 'text-text-muted hover:text-white'
              }`}
            >
              <Icon className="w-5 h-5" strokeWidth={isActive ? 2.4 : 2} />
              <span>{tabLabel}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
