import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import Navbar from './components/Navbar';
import TabBar from './components/TabBar';
import PartyCard from './components/PartyCard';
import EventMap from './components/EventMap';
import EventFilter from './components/EventFilter';
import HostDashboard from './components/HostDashboard';
import FacecardSection from './components/FacecardSection';
import TicketModal from './components/TicketModal';
import AttendeeNetworkingModal from './components/AttendeeNetworkingModal';
import InstallPrompt from './components/InstallPrompt';
import { initialEvents, initialFacecardRequests } from './data/eventsData';
import { getLocalStore, setLocalStore } from './lib/supabaseClient';

function PageHeader({ eyebrow, title, description, action }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
      <div>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-3xl sm:text-5xl font-bold tracking-[-0.03em] text-white">{title}</h1>
        {description && <p className="mt-3 text-base sm:text-lg text-text-secondary max-w-xl">{description}</p>}
      </div>
      {action}
    </div>
  );
}

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

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [activePage]);

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

  const resetFilters = () => {
    setActiveCategory('all');
    setSelectedCity('All Zambia');
    setSearchQuery('');
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
    <div className="min-h-screen bg-background text-text-primary">
      <Navbar activeSection={activePage} onNavigate={setActivePage} />

      <main className="max-w-6xl mx-auto px-5 md:px-8 pt-[calc(3.5rem+env(safe-area-inset-top))] pb-32 md:pb-20">
        {activePage === 'explore' && (
          <section className="animate-fade-in">
            <div className="pt-10 pb-10 sm:pt-20 sm:pb-16 text-center">
              <p className="eyebrow mb-4">Zambia's events & networking hub</p>
              <h1 className="text-[2.75rem] leading-[1.02] sm:text-7xl font-extrabold tracking-[-0.04em] text-white">
                Find the party.
                <br />
                <span className="brand-text">Meet your people.</span>
              </h1>
              <p className="mt-5 text-lg sm:text-xl text-text-secondary max-w-xl mx-auto">
                Afrobeats galas, founder mixers and rooftop lounges in Lusaka, Kitwe and Ndola.
              </p>

              <div className="relative mt-10 max-w-xl mx-auto">
                <Search className="w-5 h-5 text-text-muted absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  aria-label="Search events"
                  placeholder="Search events, areas or vibes"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input-dark h-13 pl-12 rounded-full"
                />
              </div>
            </div>

            <EventFilter
              activeCategory={activeCategory}
              onCategoryChange={setActiveCategory}
              selectedCity={selectedCity}
              onCityChange={setSelectedCity}
            />

            <div className="flex items-baseline justify-between mt-12 mb-6">
              <h2 className="text-2xl sm:text-3xl font-bold text-white">All events</h2>
              <p className="text-sm text-text-muted">
                {filteredEvents.length} {filteredEvents.length === 1 ? 'event' : 'events'}
              </p>
            </div>

            {filteredEvents.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12">
                {filteredEvents.map((evt) => (
                  <PartyCard
                    key={evt.id}
                    party={evt}
                    onRSVP={handleRSVP}
                    isRSVPed={rsvps.has(evt.id)}
                    onFacecard={() => setActivePage('facecard')}
                    onGetTickets={setTicketModalEvent}
                    onViewAttendees={setNetworkingModalEvent}
                  />
                ))}
              </div>
            ) : (
              <div className="card max-w-md mx-auto px-8 py-12 text-center">
                <span className="mx-auto mb-4 flex w-12 h-12 items-center justify-center rounded-full bg-white/6">
                  <Search className="w-5 h-5 text-text-secondary" />
                </span>
                <h3 className="text-lg font-semibold text-white">No events match</h3>
                <p className="mt-1 text-text-secondary">Try another area, vibe or category.</p>
                <button type="button" onClick={resetFilters} className="btn-secondary mt-6">
                  Clear filters
                </button>
              </div>
            )}
          </section>
        )}

        {activePage === 'map' && (
          <section className="animate-fade-in pt-8 sm:pt-14">
            <PageHeader
              eyebrow="Map"
              title="What's on near you"
              description="Every event, pinned. Tap a pin for details."
              action={
                <button type="button" onClick={() => setActivePage('explore')} className="btn-secondary self-start sm:self-auto">
                  View as list
                </button>
              }
            />
            <EventMap
              events={filteredEvents}
              onSelectEvent={setNetworkingModalEvent}
              onGetTickets={setTicketModalEvent}
            />
          </section>
        )}

        {activePage === 'host' && (
          <section className="animate-fade-in pt-8 sm:pt-14">
            <HostDashboard
              events={events}
              facecards={facecards}
              onApproveFacecard={handleApproveFacecard}
              onDeclineFacecard={handleDeclineFacecard}
              onCreateEvent={handleCreateEvent}
            />
          </section>
        )}

        {activePage === 'facecard' && (
          <section className="animate-fade-in pt-8 sm:pt-14">
            <PageHeader
              eyebrow="Facecard"
              title="Get on the guest list"
              description="Send the host a selfie and a note. If they approve, you're in."
            />
            <FacecardSection
              parties={events}
              facecardRequests={facecards}
              onUpdateRequest={(id, status) =>
                status === 'approved' ? handleApproveFacecard(id) : handleDeclineFacecard(id)
              }
              onNewRequest={handleNewFacecardRequest}
            />
          </section>
        )}
      </main>

      <TabBar active={activePage} onNavigate={setActivePage} />
      <InstallPrompt />

      <TicketModal
        key={`ticket-${ticketModalEvent?.id}`}
        event={ticketModalEvent}
        isOpen={Boolean(ticketModalEvent)}
        onClose={() => setTicketModalEvent(null)}
      />

      <AttendeeNetworkingModal
        key={`attendees-${networkingModalEvent?.id}`}
        event={networkingModalEvent}
        isOpen={Boolean(networkingModalEvent)}
        onClose={() => setNetworkingModalEvent(null)}
      />
    </div>
  );
}
