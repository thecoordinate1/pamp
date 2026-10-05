import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { EyeOff, MapPinned, Search } from 'lucide-react';
import Navbar from './components/Navbar';
import TabBar from './components/TabBar';
import PartyCard from './components/PartyCard';
import EventFilter from './components/EventFilter';
import MeetPage from './components/MeetPage';
import FacecardSection from './components/FacecardSection';
import TicketModal from './components/TicketModal';
import AttendeeNetworkingModal from './components/AttendeeNetworkingModal';
import InstallPrompt from './components/InstallPrompt';
import SignInSheet from './components/SignInSheet';
import ProfileSheet from './components/ProfileSheet';
import ShareSheet from './components/ShareSheet';
import EventInviteSheet from './components/EventInviteSheet';
import MyPassesSheet from './components/MyPassesSheet';
import SharedPassSheet from './components/SharedPassSheet';
import PasswordResetSheet from './components/PasswordResetSheet';
import LocationCard from './components/LocationCard';
import { useAuth } from './lib/authContext';
import { formatEventDate } from './lib/format';
import { captureInvite, referralMetadata, saveInvite, withoutInvitePart } from './lib/invite';
import { groupPassesByEvent } from './lib/passes';
import {
  useCreateEvent,
  useCreateGuestRequest,
  useDecideGuestRequest,
  useEvents,
  useGuestRequests,
  useHostEvents,
  useMyGuestRequests,
  useIsAdmin,
  useMyPasses,
  useMyRsvps,
  useRevealedLocations,
  useToggleRsvp,
  useUpdateEvent,
} from './lib/queries';

// Loaded when first opened: the map pulls in Leaflet, the host screen the QR
// scanner, and the admin screen is only ever seen by admins. Keeping them out of
// the first download matters on mobile data.
const EventMap = lazy(() => import('./components/EventMap'));
const HostDashboard = lazy(() => import('./components/HostDashboard'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));

function PageLoading({ label }) {
  return (
    <div role="status" aria-live="polite" className="py-24 text-center text-text-secondary">
      {label}
    </div>
  );
}

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
  const { user, offlineUserId } = useAuth();

  const { data: events = [], isLoading, isError, error } = useEvents();
  const { data: rsvps = new Set() } = useMyRsvps(user?.id);
  const { data: isAdmin = false } = useIsAdmin(user?.id);
  // Offline with an expired session there is no user, but the passes saved on
  // this phone for the last account are still shown. Nothing is fetched for them.
  const { data: myPasses = [], isError: passesOffline } = useMyPasses(user?.id ?? offlineUserId, {
    fetch: Boolean(user),
  });
  const passesByEvent = useMemo(() => groupPassesByEvent(myPasses), [myPasses]);
  const toggleRsvp = useToggleRsvp(user?.id);
  const createEvent = useCreateEvent(user?.id);
  const updateEvent = useUpdateEvent();
  const createGuestRequest = useCreateGuestRequest(user?.id);
  const decideGuestRequest = useDecideGuestRequest();

  // Page Navigation State: 'explore' | 'map' | 'host' | 'people' | 'facecard'
  const [activePage, setActivePage] = useState('explore');
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedCity, setSelectedCity] = useState('All Zambia');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [ticketModalEvent, setTicketModalEvent] = useState(null);
  const [networkingModalEvent, setNetworkingModalEvent] = useState(null);
  const [shareEvent, setShareEvent] = useState(null);
  // { action, mode }: what the person was trying to do, and whether to open
  // on sign-in or sign-up.
  const [signIn, setSignIn] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [passesOpen, setPassesOpen] = useState(false);
  // Exact locations on the map, for the person who asked: signing out or
  // switching account turns it off without an effect.
  const [revealedBy, setRevealedBy] = useState(null);
  const [sharedPassClosed, setSharedPassClosed] = useState(false);

  // A shared link (?event=…&ref=…) is read once, on load, and kept until used.
  // This copy is the source of truth; storage is written through on a best
  // effort basis, so invites still work where a browser blocks storage.
  const [invite, setInvite] = useState(() => captureInvite());
  const updateInvite = (next) => {
    saveInvite(next);
    setInvite(next);
  };
  // When an account signs out or another takes over, drop the links it opened
  // here too (auth.jsx clears the stored copy). A first sign-in is not that:
  // someone signing up from an invite keeps it.
  const [inviteOwner, setInviteOwner] = useState(user?.id ?? null);
  if ((user?.id ?? null) !== inviteOwner) {
    if (inviteOwner) {
      setInvite(null);
      setSharedPassClosed(false);
    }
    setInviteOwner(user?.id ?? null);
  }
  // Who closed the invite sheet. It comes back once if that changes, so someone
  // who signs up from it lands on the event they were invited to.
  const [inviteSeenBy, setInviteSeenBy] = useState(undefined);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [activePage]);

  // Events this user hosts, and the guest requests waiting on them.
  const { data: myEvents = [] } = useHostEvents(user?.id);
  const myEventIds = useMemo(() => myEvents.map((e) => e.id), [myEvents]);
  const { data: guestRequests = [] } = useGuestRequests(myEventIds);
  const { data: myRequests = [] } = useMyGuestRequests(user?.id);

  // Browsing is open to everyone; anything that writes needs an account.
  // Someone who arrived through an invite is shown sign-up first.
  const requireAuth = (action, fn, mode) => (...args) => {
    if (!user) {
      setSignIn({ action, mode: mode ?? (invite?.ref ? 'signup' : 'signin') });
      return undefined;
    }
    return fn(...args);
  };

  const handleRSVP = requireAuth('RSVP', (eventId) =>
    toggleRsvp.mutate({ eventId, isAttending: rsvps.has(eventId) })
  );

  const handleCreateEvent = requireAuth('host an event', (newEvent) =>
    createEvent.mutate(newEvent, { onSuccess: () => setActivePage('explore') })
  );

  const handleUpdateEvent = (id, changes) =>
    updateEvent.mutate({ id, changes });

  // Returns the mutation's promise, so the form only says "sent" once it was.
  const handleNewFacecardRequest = requireAuth('request to join an event', (req) =>
    createGuestRequest.mutateAsync({
      eventId: req.eventId,
      reason: req.reason,
      selfiePath: req.selfiePath ?? null,
    })
  );

  const handleGetTickets = requireAuth('get a pass', (evt) => setTicketModalEvent(evt));

  // Sharing carries the sharer's referral code, so it needs an account.
  const handleShare = requireAuth('share events and earn rewards', (evt) => setShareEvent(evt), 'signup');

  // An existing account needs no referral, and a new one already sent its code
  // with sign-up, so once someone is signed in the code has done its job.
  useEffect(() => {
    if (user && invite?.ref) {
      const next = withoutInvitePart(invite, 'ref');
      saveInvite(next);
      setInvite(next);
    }
  }, [user, invite]);

  const invitedEvent = invite?.eventId ? events.find((e) => e.id === invite.eventId) ?? null : null;

  // A link to an event that is gone, or no longer published, is dropped.
  useEffect(() => {
    if (invite?.eventId && !isLoading && !isError && !invitedEvent) {
      const next = withoutInvitePart(invite, 'eventId');
      saveInvite(next);
      setInvite(next);
    }
  }, [invite, isLoading, isError, invitedEvent]);

  // A pass a friend sent (?pass=…) opens first, signed in or not.
  // Declared before showInvite so showInvite can reference it without hitting
  // the temporal dead zone.
  const sharedPassToken = invite?.passToken;
  const showSharedPass = Boolean(sharedPassToken) && !sharedPassClosed && !signIn && !ticketModalEvent;

  const showInvite =
    Boolean(invitedEvent) &&
    !showSharedPass &&
    // Dismissed while signed out: not shown again until they sign in.
    !(invite?.dismissedAt && !user) &&
    inviteSeenBy !== (user?.id ?? null) &&
    !ticketModalEvent &&
    !shareEvent &&
    !signIn &&
    !networkingModalEvent;

  const closeInvite = () => {
    // A signed-in person has now seen it: done. A visitor will see it once
    // more after signing up, so it is kept, marked as dismissed until then.
    if (user) updateInvite(withoutInvitePart(invite, 'eventId'));
    else if (invite) updateInvite({ ...invite, dismissedAt: Date.now() });
    setInviteSeenBy(user?.id ?? null);
  };

  // Every event this person holds passes for. The live event is used when the
  // list has loaded, and the copy saved with the pass when it has not.
  const passEvents = useMemo(() => {
    const list = [];
    for (const [eventId, passes] of passesByEvent) {
      const event = events.find((e) => e.id === eventId) ?? passes.find((p) => p.event)?.event;
      if (event) list.push({ event, passes });
    }
    return list.sort((a, b) => `${a.event.date}`.localeCompare(`${b.event.date}`));
  }, [passesByEvent, events]);

  const openPass = (event) => {
    setPassesOpen(false);
    setTicketModalEvent(event);
  };

  // Reveal locations: the exact spot of every event this person holds a pass
  // to. The database only returns locations they are allowed to see.
  const revealing = Boolean(user) && revealedBy === user?.id;
  const passEventIds = useMemo(() => [...passesByEvent.keys()], [passesByEvent]);
  const {
    data: revealed,
    isLoading: revealLoading,
    isError: revealError,
  } = useRevealedLocations(passEventIds, revealing);
  const handleReveal = requireAuth('reveal event locations', () =>
    setRevealedBy((who) => (who === user.id ? null : user.id))
  );
  const closeSharedPass = ({ forget } = {}) => {
    setSharedPassClosed(true);
    if (forget) updateInvite(withoutInvitePart(invite, 'passToken'));
  };
  // Actions taken from the invite close it first, so sheets never stack.
  const fromInvite = (fn) => (...args) => {
    closeInvite();
    fn(...args);
  };

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
      <Navbar
        activeSection={activePage}
        onNavigate={setActivePage}
        onOpenProfile={() => setProfileOpen(true)}
        onSignIn={() => setSignIn({ action: 'continue', mode: invite?.ref ? 'signup' : 'signin' })}
        passCount={passEvents.reduce((n, e) => n + e.passes.length, 0)}
        onOpenPasses={() => setPassesOpen(true)}
      />

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
                body={
                  passEvents.length > 0
                    ? 'Check your connection. Your passes are saved on this phone and still work.'
                    : error?.message ?? 'Check your connection and try again.'
                }
                action={
                  <div className="mt-6 flex flex-wrap justify-center gap-3">
                    {passEvents.length > 0 && (
                      <button type="button" onClick={() => setPassesOpen(true)} className="btn-accent">
                        Show my passes
                      </button>
                    )}
                    <button type="button" onClick={() => window.location.reload()} className="btn-secondary">
                      Try again
                    </button>
                  </div>
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
                    onShare={handleShare}
                    passes={passesByEvent.get(evt.id)}
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
                <div className="flex flex-wrap gap-2 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={handleReveal}
                    aria-pressed={revealing}
                    className={revealing ? 'btn-secondary' : 'btn-accent'}
                  >
                    {revealing ? <EyeOff className="w-4 h-4" /> : <MapPinned className="w-4 h-4" />}
                    {revealing ? 'Hide exact locations' : 'Reveal locations'}
                  </button>
                  <button type="button" onClick={() => setActivePage('explore')} className="btn-secondary">
                    View as list
                  </button>
                </div>
              }
            />
            <Suspense fallback={<PageLoading label="Loading map…" />}>
              <EventMap
                events={filteredEvents}
                onSelectEvent={setNetworkingModalEvent}
                onGetTickets={handleGetTickets}
                passesByEvent={passesByEvent}
                revealed={revealing ? revealed : undefined}
              />
            </Suspense>

            {revealing && (
              <section aria-labelledby="pass-locations" className="mt-8">
                <h2 id="pass-locations" className="text-xl font-bold text-white">
                  Where your passes are for
                </h2>
                {passEvents.length === 0 ? (
                  <div className="card mt-4 p-6 text-center">
                    <p className="text-text-secondary">
                      You do not have any passes yet. Get one and its exact location shows here.
                    </p>
                    <button type="button" onClick={() => setActivePage('explore')} className="btn-accent mt-4">
                      Browse events
                    </button>
                  </div>
                ) : revealLoading ? (
                  <div className="mt-4 h-24 rounded-3xl bg-white/5 animate-pulse" aria-hidden="true" />
                ) : revealError ? (
                  <p className="card mt-4 p-6 text-center text-text-secondary">
                    Could not load the locations. Check your connection and try again.
                  </p>
                ) : (
                  <ul className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {passEvents.map(({ event }) => {
                      const location = revealed?.get(event.id);
                      return (
                        <li key={event.id} className="card p-4">
                          <p className="eyebrow">{formatEventDate(event.date, event.time)}</p>
                          <p className="font-semibold text-white">{event.name}</p>
                          {location?.fullAddress || location?.coordinates ? (
                            <LocationCard location={location} className="mt-3 border-0 bg-white/5" />
                          ) : (
                            <p className="mt-2 text-sm text-text-muted">
                              The host has not added the exact location yet. It shows here once they do.
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            )}
          </section>
        )}

        {activePage === 'host' && (
          <section className="animate-fade-in pt-8 sm:pt-14">
            {user ? (
              <Suspense fallback={<PageLoading label="Loading your events…" />}>
                <HostDashboard
                  events={myEvents}
                  facecards={guestRequests}
                  onApproveFacecard={(id) => decideGuestRequest.mutate({ id, status: 'approved' })}
                  onDeclineFacecard={(id) => decideGuestRequest.mutate({ id, status: 'declined' })}
                  onCreateEvent={handleCreateEvent}
                  onUpdateEvent={handleUpdateEvent}
                />
              </Suspense>
            ) : (
              <StateCard
                title="Sign in to host"
                body="Create an account to post events and manage your guest list."
                action={
                  <button type="button" onClick={() => setSignIn({ action: 'host an event', mode: 'signin' })} className="btn-accent mt-6">
                    Sign in
                  </button>
                }
              />
            )}
          </section>
        )}

        {activePage === 'people' && (
          <section className="animate-fade-in pt-8 sm:pt-14">
            <MeetPage
              passEvents={passEvents}
              onSignIn={() => setSignIn({ action: 'meet people at events', mode: 'signin' })}
              onBrowse={() => setActivePage('explore')}
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
              hostEvents={myEvents}
              myRequests={myRequests}
              hostRequests={guestRequests}
              onUpdateRequest={(id, status) => decideGuestRequest.mutate({ id, status })}
              onNewRequest={handleNewFacecardRequest}
            />
          </section>
        )}
        {activePage === 'admin' && (
          <section className="animate-fade-in pt-8 sm:pt-14">
            <PageHeader
              eyebrow="Admin"
              title="Platform overview"
              description="Everything happening across PAMP."
            />
            {isAdmin ? (
              <Suspense fallback={<PageLoading label="Loading…" />}>
                <AdminDashboard />
              </Suspense>
            ) : (
              <StateCard
                title="Not available"
                body="This area is for platform admins."
                action={
                  <button type="button" onClick={() => setActivePage('explore')} className="btn-secondary mt-6">
                    Back to events
                  </button>
                }
              />
            )}
          </section>
        )}
      </main>

      <TabBar active={activePage} onNavigate={setActivePage} />
      <InstallPrompt />

      <EventInviteSheet
        event={invitedEvent}
        open={showInvite}
        onClose={closeInvite}
        signedIn={Boolean(user)}
        onSignUp={fromInvite(() =>
          setSignIn({ action: `get your pass for ${invitedEvent?.name ?? 'this event'}`, mode: 'signup' })
        )}
        onRSVP={fromInvite(handleRSVP)}
        isRSVPed={Boolean(invitedEvent && rsvps.has(invitedEvent.id))}
        onFacecard={fromInvite(() => setActivePage('facecard'))}
        onGetTickets={fromInvite(handleGetTickets)}
        onViewAttendees={fromInvite(setNetworkingModalEvent)}
        onShare={fromInvite(handleShare)}
        passes={invitedEvent ? passesByEvent.get(invitedEvent.id) : undefined}
      />

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

      <ShareSheet
        key={`share-${shareEvent?.id}`}
        event={shareEvent}
        open={Boolean(shareEvent)}
        onClose={() => setShareEvent(null)}
      />

      <PasswordResetSheet />

      <SharedPassSheet
        token={sharedPassToken}
        open={showSharedPass}
        onClose={closeSharedPass}
        signedIn={Boolean(user)}
        onSignUp={() => {
          setSharedPassClosed(true);
          setSignIn({ action: 'join PAMP', mode: 'signup' });
        }}
      />

      <MyPassesSheet
        open={passesOpen}
        onClose={() => setPassesOpen(false)}
        passEvents={passEvents}
        offline={!user || passesOffline}
        onOpen={openPass}
      />

      <SignInSheet
        open={Boolean(signIn)}
        action={signIn?.action ?? 'continue'}
        initialMode={signIn?.mode ?? 'signin'}
        referral={referralMetadata(invite)}
        inviteEventId={invite?.eventId}
        onClose={() => setSignIn(null)}
      />

      <ProfileSheet
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        isAdmin={isAdmin}
        onNavigate={setActivePage}
      />
    </div>
  );
}
