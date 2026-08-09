import { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import PartyCard from './components/PartyCard';
import EventMap from './components/EventMap';
import EventFilter from './components/EventFilter';
import HostDashboard from './components/HostDashboard';
import FacecardSection from './components/FacecardSection';
import TicketModal from './components/TicketModal';
import AttendeeNetworkingModal from './components/AttendeeNetworkingModal';
import { initialEvents, initialFacecardRequests } from './data/eventsData';
import { getLocalStore, setLocalStore } from './lib/supabaseClient';
import { Search, Map, Flame, ShieldAlert, PlusCircle, Sparkles, Compass } from 'lucide-react';

export default function App() {
  // Persistent state with localStorage fallback
  const [events, setEvents] = useState(() => getLocalStore('pamp_events', initialEvents));
  const [facecards, setFacecards] = useState(() => getLocalStore('pamp_facecards', initialFacecardRequests));
  const [rsvps, setRsvps] = useState(new Set());

  // Page Navigation State: 'explore' | 'map' | 'host' | 'facecard'
  const [activePage, setActivePage] = useState('explore');
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedCity, setSelectedCity] = useState('All Zambia');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [ticketModalEvent, setTicketModalEvent] = useState(null);
  const [networkingModalEvent, setNetworkingModalEvent] = useState(null);

  // Persist state updates
  useEffect(() => {
    setLocalStore('pamp_events', events);
  }, [events]);

  useEffect(() => {
    setLocalStore('pamp_facecards', facecards);
  }, [facecards]);

  const handleRSVP = (eventId) => {
    setRsvps((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
        setEvents((list) =>
          list.map((e) => (e.id === eventId ? { ...e, rsvpCount: Math.max(0, e.rsvpCount - 1) } : e))
        );
      } else {
        next.add(eventId);
        setEvents((list) =>
          list.map((e) => (e.id === eventId ? { ...e, rsvpCount: e.rsvpCount + 1 } : e))
        );
      }
      return next;
    });
  };

  const handleCreateEvent = (newEvent) => {
    setEvents((prev) => [newEvent, ...prev]);
    setActivePage('explore');
  };

  const handleApproveFacecard = (id) => {
    setFacecards((prev) =>
      prev.map((f) => (f.id === id ? { ...f, status: 'approved' } : f))
    );
  };

  const handleDeclineFacecard = (id) => {
    setFacecards((prev) =>
      prev.map((f) => (f.id === id ? { ...f, status: 'declined' } : f))
    );
  };

  const handleNewFacecardRequest = (req) => {
    setFacecards((prev) => [req, ...prev]);
  };

  // Filtered Events Logic
  const filteredEvents = events.filter((e) => {
    const matchCategory = activeCategory === 'all' || e.category === activeCategory;
    const matchCity = selectedCity === 'All Zambia' || e.city === selectedCity || e.area.includes(selectedCity);
    const matchSearch =
      searchQuery === '' ||
      e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.area.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.vibe.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCategory && matchCity && matchSearch;
  });

  return (
    <div className="min-h-screen bg-background text-text-primary selection:bg-accent selection:text-white pb-24">
      {/* Top Navbar */}
      <Navbar activeSection={activePage} onNavigate={(page) => setActivePage(page)} />

      {/* Main Container with Page View Snapshot feel */}
      <main className="pt-20 px-4 max-w-7xl mx-auto min-h-[calc(100vh-6rem)]">
        {/* ================= PAGE 1: EXPLORE EVENTS ================= */}
        {activePage === 'explore' && (
          <div className="animate-fade-in space-y-8">
            {/* Landing Hero Header */}
            <div className="text-center py-6 max-w-4xl mx-auto">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-accent text-xs font-bold mb-4 backdrop-blur-md shadow-lg animate-pulse">
                <Sparkles className="w-4 h-4 text-accent" /> Zambia's Social Event & Networking Hub
              </div>
              <h1 className="text-3xl sm:text-5xl font-black tracking-tight mb-4 leading-tight">
                Discover <span className="bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(135deg, #E040FB, #7C4DFF, #00E5FF)' }}>Events & Mixers</span>
              </h1>
              <p className="text-sm sm:text-base text-text-secondary max-w-2xl mx-auto mb-6">
                From Afrobeats galas to tech founder mixers and rooftop lounges in Lusaka, Kitwe, and Ndola.
              </p>

              {/* Search Bar */}
              <div className="max-w-2xl mx-auto relative">
                <Search className="w-5 h-5 text-text-secondary absolute left-4 top-3.5" />
                <input
                  type="text"
                  placeholder="Search by event, area (e.g. Kabulonga, Roma), or vibe..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-surface/90 border border-white/15 rounded-2xl pl-12 pr-4 py-3 text-sm text-white focus:outline-none focus:border-accent shadow-xl backdrop-blur-xl"
                />
              </div>
            </div>

            {/* Category Filter Bar */}
            <EventFilter
              activeCategory={activeCategory}
              onCategoryChange={setActiveCategory}
              selectedCity={selectedCity}
              onCityChange={setSelectedCity}
            />

            {/* Events Grid */}
            {filteredEvents.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredEvents.map((evt) => (
                  <PartyCard
                    key={evt.id}
                    party={evt}
                    onRSVP={handleRSVP}
                    isRSVPed={rsvps.has(evt.id)}
                    onFacecard={() => setActivePage('facecard')}
                    onGetTickets={(e) => setTicketModalEvent(e)}
                    onViewAttendees={(e) => setNetworkingModalEvent(e)}
                  />
                ))}
              </div>
            ) : (
              <div className="bg-surface/80 border border-white/10 rounded-3xl p-12 text-center max-w-md mx-auto">
                <p className="text-4xl mb-3">🔍</p>
                <h3 className="text-lg font-bold text-white mb-1">No matching events found</h3>
                <p className="text-xs text-text-secondary mb-4">Try adjusting your filters or search term.</p>
                <button
                  onClick={() => { setActiveCategory('all'); setSelectedCity('All Zambia'); setSearchQuery(''); }}
                  className="btn-accent px-4 py-2 text-xs font-bold"
                >
                  Reset Filters
                </button>
              </div>
            )}
          </div>
        )}

        {/* ================= PAGE 2: LIVE MAP VIEW ================= */}
        {activePage === 'map' && (
          <div className="animate-fade-in space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-white flex items-center gap-2">
                  📍 Interactive Event Map
                </h2>
                <p className="text-xs text-text-secondary">Pinpointed live events across Zambia</p>
              </div>
              <button
                onClick={() => setActivePage('explore')}
                className="btn-outline px-3 py-1.5 text-xs font-bold"
              >
                Back to List View
              </button>
            </div>

            <EventMap
              events={filteredEvents}
              onSelectEvent={(evt) => setNetworkingModalEvent(evt)}
              onGetTickets={(evt) => setTicketModalEvent(evt)}
            />
          </div>
        )}

        {/* ================= PAGE 3: HOST PORTAL ================= */}
        {activePage === 'host' && (
          <div className="animate-fade-in space-y-6">
            <HostDashboard
              events={events}
              facecards={facecards}
              onApproveFacecard={handleApproveFacecard}
              onDeclineFacecard={handleDeclineFacecard}
              onCreateEvent={handleCreateEvent}
            />
          </div>
        )}

        {/* ================= PAGE 4: FACECARD VIP SECTION ================= */}
        {activePage === 'facecard' && (
          <div className="animate-fade-in space-y-6">
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-bold mb-2">
                <ShieldAlert className="w-3.5 h-3.5" /> Exclusive Guestlist & VIP Invites
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-white">Facecard VIP Engine</h2>
              <p className="text-xs text-text-secondary max-w-md mx-auto">
                Upload your selfie to request exclusive guestlist access from verified hosts.
              </p>
            </div>

            <FacecardSection
              parties={events}
              facecardRequests={facecards}
              onUpdateRequest={(id, status) =>
                status === 'approved' ? handleApproveFacecard(id) : handleDeclineFacecard(id)
              }
              onNewRequest={handleNewFacecardRequest}
            />
          </div>
        )}
      </main>

      {/* ================= FLOATING BOTTOM NAVIGATION BAR ================= */}
      {/* Positioned fixed at the bottom, never obscured by search bars or content */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md bg-slate-950/90 border border-white/15 rounded-3xl p-1.5 shadow-2xl backdrop-blur-xl flex items-center justify-around">
        <button
          onClick={() => setActivePage('explore')}
          className={`flex-1 py-2.5 rounded-2xl text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all ${
            activePage === 'explore'
              ? 'bg-accent text-white shadow-lg shadow-accent/30 scale-105'
              : 'text-text-secondary hover:text-white'
          }`}
        >
          <Flame className="w-4 h-4" />
          <span>Events</span>
        </button>

        <button
          onClick={() => setActivePage('map')}
          className={`flex-1 py-2.5 rounded-2xl text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all ${
            activePage === 'map'
              ? 'bg-accent text-white shadow-lg shadow-accent/30 scale-105'
              : 'text-text-secondary hover:text-white'
          }`}
        >
          <Map className="w-4 h-4" />
          <span>Map</span>
        </button>

        <button
          onClick={() => setActivePage('host')}
          className={`flex-1 py-2.5 rounded-2xl text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all ${
            activePage === 'host'
              ? 'bg-accent text-white shadow-lg shadow-accent/30 scale-105'
              : 'text-text-secondary hover:text-white'
          }`}
        >
          <PlusCircle className="w-4 h-4" />
          <span>Host</span>
        </button>

        <button
          onClick={() => setActivePage('facecard')}
          className={`flex-1 py-2.5 rounded-2xl text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all ${
            activePage === 'facecard'
              ? 'bg-accent text-white shadow-lg shadow-accent/30 scale-105'
              : 'text-text-secondary hover:text-white'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>Facecard</span>
        </button>
      </div>

      {/* ================= MODALS ================= */}
      <TicketModal
        event={ticketModalEvent}
        isOpen={Boolean(ticketModalEvent)}
        onClose={() => setTicketModalEvent(null)}
      />

      <AttendeeNetworkingModal
        event={networkingModalEvent}
        isOpen={Boolean(networkingModalEvent)}
        onClose={() => setNetworkingModalEvent(null)}
      />
    </div>
  );
}
