import { useState } from 'react';

export default function Navbar({ activeSection, onNavigate }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { id: 'browse', label: 'Browse', icon: '🔥' },
    { id: 'post', label: 'Post a Party', icon: '🎉' },
    { id: 'facecard', label: 'Facecard', icon: '📸' },
  ];

  const handleNav = (id) => {
    onNavigate(id);
    setMobileOpen(false);
  };

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50"
        style={{ background: 'rgba(13,13,13,0.85)', backdropFilter: 'blur(16px)' }}>
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          {/* Logo */}
          <button onClick={() => onNavigate('hero')} className="flex items-center gap-2 group cursor-pointer">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg font-black"
              style={{ background: 'linear-gradient(135deg, #E040FB, #7C4DFF)' }}>
              P
            </div>
            <span className="text-xl font-extrabold tracking-tight">
              PAM<span className="text-accent">P</span>
            </span>
          </button>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => handleNav(item.id)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer
                  ${activeSection === item.id
                    ? 'bg-accent-dim text-accent'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-light'
                  }`}
              >
                <span className="mr-1.5">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>

          {/* Mobile Hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden w-10 h-10 rounded-xl flex items-center justify-center hover:bg-surface-light transition cursor-pointer"
            aria-label="Toggle menu"
          >
            <div className="flex flex-col gap-1.5">
              <span className={`block w-5 h-0.5 bg-text-primary transition-all duration-300 ${mobileOpen ? 'rotate-45 translate-y-2' : ''}`} />
              <span className={`block w-5 h-0.5 bg-text-primary transition-all duration-300 ${mobileOpen ? 'opacity-0' : ''}`} />
              <span className={`block w-5 h-0.5 bg-text-primary transition-all duration-300 ${mobileOpen ? '-rotate-45 -translate-y-2' : ''}`} />
            </div>
          </button>
        </div>
      </nav>

      {/* Mobile Nav Overlay */}
      {mobileOpen && (
        <div className="mobile-nav-overlay" onClick={() => setMobileOpen(false)}>
          {navItems.map((item, i) => (
            <button
              key={item.id}
              onClick={() => handleNav(item.id)}
              className="text-2xl font-bold text-text-primary hover:text-accent transition fade-in-up cursor-pointer"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <span className="mr-3">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
