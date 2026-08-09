import { useState } from 'react';
import { Map, Flame, ShieldAlert, PlusCircle, Sparkles, UserCheck } from 'lucide-react';

export default function Navbar({ activeSection, onNavigate }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { id: 'browse', label: 'Explore Events', icon: Flame },
    { id: 'map', label: 'Live Map', icon: Map },
    { id: 'facecard', label: 'Facecard VIP', icon: ShieldAlert },
    { id: 'host', label: 'Host Portal', icon: PlusCircle },
  ];

  const handleNav = (id) => {
    onNavigate(id);
    setMobileOpen(false);
  };

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-50 border-b border-white/10"
        style={{ background: 'rgba(13,15,23,0.88)', backdropFilter: 'blur(16px)' }}
      >
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          {/* Logo */}
          <button onClick={() => onNavigate('hero')} className="flex items-center gap-2 group cursor-pointer">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl font-black text-white shadow-lg"
              style={{ background: 'linear-gradient(135deg, #E040FB, #7C4DFF)', boxShadow: '0 0 20px rgba(224,64,251,0.4)' }}
            >
              P
            </div>
            <div className="text-left">
              <span className="text-xl font-extrabold tracking-tight text-white block leading-none">
                PAM<span className="text-accent">P</span>
              </span>
              <span className="text-[9px] font-bold text-accent uppercase tracking-widest block mt-0.5">
                Events & Networking
              </span>
            </div>
          </button>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNav(item.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer flex items-center gap-2 ${
                    isActive
                      ? 'bg-accent/20 text-accent border border-accent/30 shadow-md'
                      : 'text-text-secondary hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-accent' : 'text-text-secondary'}`} />
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* Desktop Action CTA */}
          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={() => handleNav('host')}
              className="btn-accent px-4 py-2 text-xs font-bold flex items-center gap-1.5 shadow-md"
            >
              <Sparkles className="w-3.5 h-3.5" /> Host an Event
            </button>
          </div>

          {/* Mobile Hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/5 transition cursor-pointer"
            aria-label="Toggle menu"
          >
            <div className="flex flex-col gap-1.5">
              <span className={`block w-5 h-0.5 bg-white transition-all duration-300 ${mobileOpen ? 'rotate-45 translate-y-2' : ''}`} />
              <span className={`block w-5 h-0.5 bg-white transition-all duration-300 ${mobileOpen ? 'opacity-0' : ''}`} />
              <span className={`block w-5 h-0.5 bg-white transition-all duration-300 ${mobileOpen ? '-rotate-45 -translate-y-2' : ''}`} />
            </div>
          </button>
        </div>
      </nav>

      {/* Mobile Nav Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-slate-950/95 backdrop-blur-xl flex flex-col items-center justify-center gap-6 p-6 animate-fade-in md:hidden">
          {navItems.map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => handleNav(item.id)}
                className="text-xl font-bold text-white hover:text-accent transition flex items-center gap-3"
              >
                <Icon className="w-5 h-5 text-accent" />
                {item.label}
              </button>
            );
          })}
          <button
            onClick={() => handleNav('host')}
            className="btn-accent px-6 py-3 text-sm font-bold mt-4 flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" /> Host an Event
          </button>
        </div>
      )}
    </>
  );
}
