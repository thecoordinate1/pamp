import { useEffect, useMemo, useState } from 'react';
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
import SignInSheet from './components/SignInSheet';
import { useAuth } from './lib/authContext';
import {
  useCreateEvent,
  useCreateGuestRequest,
  useDecideGuestRequest,
  useEvents,
  useGuestRequests,
  useMyRsvps,
  useToggleRsvp,
} from './lib/queries';

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

function StateCard({ title, body, action }) {
  return (
    <div className="card max-w-md mx-auto px-8 py-12 text-center">
      <span className="mx-auto mb-4 flex w-12 h-12 items-center justify-center rounded-full bg-white/6">
        <Search className="w-5 h-5 text-text-secondary" />
      </span>
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mt-1 text-text-secondary">{body}</p>
      {action}
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="card overflow-hidden" aria-hidden="true">
      <div className="h-44 bg-white/5 animate-pulse" />
      <div className="p-5 space-y-3">
        <div className="h-3 w-24 rounded-full bg-white/5 animate-pulse" />
        <div className="h-5 w-3/4 rounded-full bg-white/5 animate-pulse" />
        <div className="h-3 w-1/2 rounded-full bg-white/5 animate-pulse" />
      </div>
    </div>
  );
}

export default function App() {
  const { user } = useAuth();

  const { data: events = [], isLoading, isError, error } = useEvents();
  const { data: rsvps = new Set() } = useMyRsvps(user?.id);
  const toggleRsvp = useToggleRsvp(user?.id);
  const createEvent = useCreateEvent(user?.id);
  const createGuestRequest = useCreateGuestRequest(user?.id);
  const decideGuestRequest = useDecideGuestRequest();

  // Page Navigation State: 'explore' | 'map' | 'host' | 'facecard'
  const [activePage, setActivePage] = useState('explore');
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedCity, setSelectedCity] = useState('All Zambia');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [ticketModalEvent, setTicketModalEvent] = useState(null);
  const [networkingModalEvent, setNetworkingModalEvent] = useState(null);
  const [signInFor, setSignInFor] = useState(null);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [activePage]);

  // Events this user hosts, and the guest requests waiting on them.
  const myEvents = useMemo(
    () => (user ? events.filter((e) => e.hostId === user.id) : []),
    [events, user]
  );
  const myEventIds = useMemo(() => myEvents.map((e) => e.id), [myEvents]);
  const { data: guestRequests = [] } = useGuestRequests(myEventIds);

  // Browsing is open to everyone; anything that writes needs an account.
  const requireAuth = (action, fn) => (...args) => {
    if (!user) {
      setSignInFor(action);
      return;
    }
    fn(...args);
  };

  const handleRSVP = requireAuth('RSVP', (eventId) =>
    toggleRsvp.mutate({ eventId, isAttending: rsvps.has(eventId) })
  );

  const handleCreateEvent = requireAuth('host an event', (newEvent) =>
    createEvent.mutate(newEvent, { onSuccess: () => setActivePage('explore') })
  );

  const handleNewFacecardRequest = requireAuth('request a facecard', (req) =>
    createGuestRequest.mutate({
      eventId: req.partyId,
      reason: req.message ?? req.reason,
      selfiePath: req.selfiePath ?? null,
    })
  );

  const handleGetTickets = requireAuth('get a pass', (evt) => setTicketModalEvent(evt));

  const resetFilters = () => {
    setActiveCategory('all');
    setSelectedCity('All Zambia');
    setSearchQuery('');
  };

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
              <p className="eyebrow mb-4">Zambia&apos;s events &amp; networking hub</p>
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
              {!isLoading && !isError && (
                <p className="text-sm text-text-muted">
                  {filteredEvents.length} {filteredEvents.length === 1 ? 'event' : 'events'}
                </p>
              )}
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12">
                {[0, 1, 2].map((i) => (
                  <CardSkeleton key={i} />
                ))}
              </div>
            ) : isError ? (
              <StateCard
                title="Couldn't load events"
                body={error?.message ?? 'Check your connection and try again.'}
                action={
                  <button type="button" onClick={() => window.location.reload()} className="btn-secondary mt-6">
                    Try again
                  </button>
                }
              />
            ) : filteredEvents.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12">
                {filteredEvents.map((evt) => (
                  <PartyCard
                    key={evt.id}
                    party={evt}
                    onRSVP={handleRSVP}
                    isRSVPed={rsvps.has(evt.id)}
                    onFacecard={() => setActivePage('facecard')}
                    onGetTickets={handleGetTickets}
                    onViewAttendees={setNetworkingModalEvent}
                  />
                ))}
              </div>
            ) : events.length === 0 ? (
              <StateCard
                title="No events yet"
                body="Nothing has been posted yet. Be the first to host one."
                action={
                  <button type="button" onClick={() => setActivePage('host')} className="btn-accent mt-6">
                    Host an event
                  </button>
                }
              />
            ) : (
              <StateCard
                title="No events match"
                body="Try another area, vibe or category."
                action={
                  <button type="button" onClick={resetFilters} className="btn-secondary mt-6">
                    Clear filters
                  </button>
                }
              />
            )}
          </section>
        )}

        {activePage === 'map' && (
          <section className="animate-fade-in pt-8 sm:pt-14">
            <PageHeader
              eyebrow="Map"
              title="What's on near you"
              description="Every event, pinned to its neighbourhood. Tap a pin for details."
              action={
                <button type="button" onClick={() => setActivePage('explore')} className="btn-secondary self-start sm:self-auto">
                  View as list
                </button>
              }
            />
            <EventMap
              events={filteredEvents}
              onSelectEvent={setNetworkingModalEvent}
              onGetTickets={handleGetTickets}
            />
          </section>
        )}

        {activePage === 'host' && (
          <section className="animate-fade-in pt-8 sm:pt-14">
            {user ? (
              <HostDashboard
                events={myEvents}
                facecards={guestRequests}
                onApproveFacecard={(id) => decideGuestRequest.mutate({ id, status: 'approved' })}
                onDeclineFacecard={(id) => decideGuestRequest.mutate({ id, status: 'declined' })}
                onCreateEvent={handleCreateEvent}
              />
            ) : (
              <StateCard
                title="Sign in to host"
                body="Create an account to post events and manage your guest list."
                action={
                  <button type="button" onClick={() => setSignInFor('host an event')} className="btn-accent mt-6">
                    Sign in
                  </button>
                }
              />
            )}
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
              facecardRequests={guestRequests}
              onUpdateRequest={(id, status) => decideGuestRequest.mutate({ id, status })}
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

      <SignInSheet
        open={Boolean(signInFor)}
        action={signInFor ?? 'continue'}
        onClose={() => setSignInFor(null)}
      />
    </div>
  );
}
