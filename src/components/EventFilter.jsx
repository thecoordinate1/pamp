import { Briefcase, Compass, Crown, Flame, MapPin, Palette } from 'lucide-react';

const CATEGORIES = [
  { id: 'all', label: 'All', icon: Compass },
  { id: 'tech_business', label: 'Tech & business', icon: Briefcase },
  { id: 'party', label: 'Parties', icon: Flame },
  { id: 'creative_arts', label: 'Creative', icon: Palette },
  { id: 'vip_lounge', label: 'VIP lounge', icon: Crown },
];

const CITIES = ['All Zambia', 'Lusaka', 'Ndola', 'Kitwe', 'Livingstone'];

export default function EventFilter({ activeCategory, onCategoryChange, selectedCity, onCityChange }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
      <div
        role="group"
        aria-label="Filter by category"
        className="flex flex-1 items-center gap-2 overflow-x-auto scrollbar-none -mx-5 px-5 sm:mx-0 sm:px-0"
      >
        {CATEGORIES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className="chip"
            aria-pressed={activeCategory === id}
            onClick={() => onCategoryChange(id)}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      <label className="relative shrink-0 sm:w-44">
        <span className="sr-only">City</span>
        <MapPin className="w-4 h-4 text-text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <select
          value={selectedCity}
          onChange={(e) => onCityChange(e.target.value)}
          className="input-dark min-h-9 py-1.5 pl-9 text-base sm:text-sm rounded-full"
        >
          {CITIES.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
