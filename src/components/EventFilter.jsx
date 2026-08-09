import { Sparkles, Briefcase, Flame, Palette, Crown, Compass } from 'lucide-react';

export default function EventFilter({ activeCategory, onCategoryChange, selectedCity, onCityChange }) {
  const categories = [
    { id: 'all', label: 'All Experiences', icon: Compass },
    { id: 'tech_business', label: 'Tech & Business', icon: Briefcase },
    { id: 'party', label: 'Parties & Nightlife', icon: Flame },
    { id: 'creative_arts', label: 'Creative & Arts', icon: Palette },
    { id: 'vip_lounge', label: 'VIP Lounge', icon: Crown },
  ];

  const cities = ['All Zambia', 'Lusaka', 'Ndola', 'Kitwe', 'Livingstone'];

  return (
    <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 mb-8">
      {/* Category Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-none">
        {categories.map((cat) => {
          const Icon = cat.icon;
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => onCategoryChange(cat.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold whitespace-nowrap transition-all duration-300 ${
                isActive
                  ? 'bg-gradient-to-r from-accent to-purple-600 text-white shadow-lg shadow-accent/25 scale-105 border border-white/20'
                  : 'bg-surface/80 text-text-secondary hover:text-white hover:bg-surface border border-white/5'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-accent'}`} />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* City Dropdown */}
      <div className="flex items-center gap-2 shrink-0">
        <select
          value={selectedCity}
          onChange={(e) => onCityChange(e.target.value)}
          className="bg-surface border border-white/10 text-white text-xs font-medium rounded-xl px-3 py-2.5 focus:outline-none focus:border-accent transition-colors cursor-pointer"
        >
          {cities.map((city) => (
            <option key={city} value={city} className="bg-slate-900 text-white">
              📍 {city}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
