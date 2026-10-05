import { useState } from 'react';
import { ArrowLeft, Heart, MessageCircle, X } from 'lucide-react';
import Sheet from './Sheet';
import SwipeCard from './SwipeCard';
import { useAuth } from '../lib/authContext';
import { formatEventDate } from '../lib/format';
import { socialUrl } from '../lib/mappers';
import {
  MEET_INTENTS,
  useMeetDeck,
  useMeetSettings,
  useMyMatches,
  useRecordSwipe,
  useSaveMeetSettings,
  useSignedAvatar,
} from '../lib/meetQueries';

const handleText = (platform, handle) => (platform === 'whatsapp' ? `+${handle}` : `@${handle}`);
const toggled = (list, id) => (list.includes(id) ? list.filter((i) => i !== id) : [...list, id]);

function IntentPicker({ value, onToggle, disabled }) {
  return (
    <div className="flex flex-wrap gap-2">
      {MEET_INTENTS.map(({ id, label }) => {
        const active = value.includes(id);
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onToggle(id)}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors disabled:opacity-60 ${
              active
                ? 'bg-accent/15 text-accent border-accent/30'
                : 'bg-white/6 text-text-secondary border-transparent hover:bg-white/10'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function MeetAvatar({ userId, path, name, className = 'w-12 h-12' }) {
  const { data: url } = useSignedAvatar(userId, path);
  return (
    <span className={`${className} shrink-0 rounded-full overflow-hidden bg-white/8 flex items-center justify-center`}>
      {url ? (
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="font-bold text-white/40">{name?.[0]?.toUpperCase() ?? '?'}</span>
      )}
    </span>
  );
}

function OptIn({ userId, initialIntents }) {
  const save = useSaveMeetSettings(userId);
  const [intents, setIntents] = useState(initialIntents);

  return (
    <div className="max-w-md mx-auto">
      <div className="text-center">
        <span className="mx-auto mb-5 flex w-16 h-16 items-center justify-center rounded-full bg-accent/10">
          <Heart className="w-8 h-8 text-accent" />
        </span>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-[-0.03em] text-white">Meet your people</h1>
        <p className="mt-3 text-text-secondary">
          Swipe through people going to the same events as you. When you both like each other, you each get the
          other&apos;s social handle.
        </p>
      </div>

      <p className="field-label mt-8 mb-3">What are you open to?</p>
      <IntentPicker value={intents} onToggle={(id) => setIntents((v) => toggled(v, id))} disabled={save.isPending} />

      <p className="mt-6 text-[13px] text-text-muted">
        Your card shows your name, profile picture and age, plus what you have written on your profile. Only people
        with a pass to the same event who have turned this on too can see it, and your handle goes only to a match.
        You can turn it off at any time.
      </p>

      {save.isError && (
        <p role="alert" className="mt-4 text-sm text-red">
          {save.error.message ?? 'Could not turn this on. Try again.'}
        </p>
      )}

      <button
        type="button"
        onClick={() => save.mutate({ visible: true, intents })}
        disabled={save.isPending}
        className="btn-accent w-full mt-6"
      >
        {save.isPending ? 'Turning on…' : 'Show me in the deck'}
      </button>

      <MatchList userId={userId} hideWhenEmpty />
    </div>
  );
}

function EventList({ passEvents, onSelect, onBrowse }) {
  return (
    <section aria-labelledby="meet-events" className="mt-8">
      <h2 id="meet-events" className="text-xl font-bold text-white mb-4">
        Your events
      </h2>
      {passEvents.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="text-text-secondary">Get a pass to an event and you can meet the people going.</p>
          <button type="button" onClick={onBrowse} className="btn-accent mt-4">
            Browse events
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {passEvents.map(({ event }) => (
            <li key={event.id}>
              <button
                type="button"
                onClick={() => onSelect(event.id)}
                className="card w-full flex items-center gap-4 p-3 pr-5 text-left hover:bg-white/5 transition-colors"
              >
                {event.image ? (
                  <img src={event.image} alt="" className="w-16 h-16 rounded-2xl object-cover shrink-0" />
                ) : (
                  <span className="w-16 h-16 rounded-2xl bg-white/5 shrink-0" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="eyebrow block truncate">{formatEventDate(event.date, event.time)}</span>
                  <span className="block font-semibold text-white truncate">{event.name}</span>
                  <span className="block text-sm text-text-secondary truncate">{event.area}</span>
                </span>
                <Heart className="w-5 h-5 text-accent shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MatchList({ userId, hideWhenEmpty = false }) {
  const { data: matches = [], isLoading, isError } = useMyMatches(userId);
  if (hideWhenEmpty && matches.length === 0) return null;

  return (
    <section aria-labelledby="meet-matches" className="mt-10">
      <h2 id="meet-matches" className="text-xl font-bold text-white mb-4">
        Your matches
      </h2>
      {isLoading ? (
        <div className="h-20 rounded-3xl bg-white/5 animate-pulse" aria-hidden="true" />
      ) : isError ? (
        <p className="card p-6 text-center text-text-secondary">Could not load your matches. Check your connection.</p>
      ) : matches.length === 0 ? (
        <p className="card p-6 text-center text-text-secondary">
          No matches yet. When you and someone both like each other, they show up here with their handle.
        </p>
      ) : (
        <ul className="space-y-3">
          {matches.map((m) => {
            const url = socialUrl(m.social_platform, m.social_handle);
            return (
              <li key={m.match_id} className="card flex items-center gap-4 p-4">
                <MeetAvatar userId={userId} path={m.avatar_path} name={m.display_name} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white truncate">{m.display_name || 'Guest'}</p>
                  <p className="text-sm text-text-secondary truncate">
                    {m.social_handle ? handleText(m.social_platform, m.social_handle) : 'No handle added yet'}
                    {m.event_name && ` · ${m.event_name}`}
                  </p>
                </div>
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary shrink-0 px-4 py-2 text-sm"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Say hi
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function CardSettings({ userId, settings }) {
  const save = useSaveMeetSettings(userId);
  // While a save is in flight, show what was asked for rather than the old value.
  const intents = save.isPending ? save.variables.intents : settings.intents;

  return (
    <section aria-labelledby="meet-card" className="card mt-10 p-5">
      <h2 id="meet-card" className="font-semibold text-white">
        Your card
      </h2>
      <p className="mt-1 mb-3 text-sm text-text-secondary">What you are open to</p>
      <IntentPicker
        value={intents}
        onToggle={(id) => save.mutate({ visible: true, intents: toggled(intents, id) })}
        disabled={save.isPending}
      />
      {save.isError && (
        <p role="alert" className="mt-3 text-sm text-red">
          {save.error.message ?? 'Could not save. Try again.'}
        </p>
      )}
      <button
        type="button"
        onClick={() => save.mutate({ visible: false, intents })}
        disabled={save.isPending}
        className="btn-secondary mt-5"
      >
        Hide me from Meet
      </button>
      <p className="mt-2 text-[13px] text-text-muted">Your matches stay, and you can turn it back on any time.</p>
    </section>
  );
}

function MatchSheet({ userId, match, onClose }) {
  const url = socialUrl(match.social_platform, match.social_handle);
  return (
    <Sheet
      open
      onClose={onClose}
      title="It's a match"
      subtitle={`You and ${match.display_name || 'this person'} both liked each other`}
      footer={
        <button type="button" onClick={onClose} className="btn-accent w-full">
          Keep swiping
        </button>
      }
    >
      <div className="flex flex-col items-center text-center pb-2">
        <MeetAvatar userId={userId} path={match.avatar_path} name={match.display_name} className="w-24 h-24 text-3xl" />
        {match.social_handle ? (
          <>
            <p className="mt-5 text-sm text-text-secondary">Say hi before the night</p>
            <p className="mt-1 font-mono text-lg text-white">{handleText(match.social_platform, match.social_handle)}</p>
            {url && (
              <a href={url} target="_blank" rel="noopener noreferrer" className="btn-secondary mt-4">
                <MessageCircle className="w-4 h-4" />
                Say hi
              </a>
            )}
          </>
        ) : (
          <p className="mt-5 text-sm text-text-secondary">
            They have not added a social handle yet. They are in your matches, so look out for them at the event.
          </p>
        )}
      </div>
    </Sheet>
  );
}

function DeckView({ userId, event, onBack }) {
  const { data: cards = [], isLoading, isFetching, isError, refetch } = useMeetDeck(userId, event.id);
  const swipe = useRecordSwipe(userId, event.id);
  const [match, setMatch] = useState(null);
  const [error, setError] = useState('');
  const top = cards[0];

  // mutateAsync, not mutate: every swipe's own promise settles, so a quick
  // second swipe cannot hide the match the first one made.
  const decide = async (direction) => {
    if (!top) return;
    setError('');
    try {
      const result = await swipe.mutateAsync({ card: top, direction });
      if (result.matched) setMatch({ ...top, ...result });
    } catch {
      setError('That swipe did not go through. Check your connection and try again.');
    }
  };

  const name = top?.display_name || 'this person';

  return (
    <div className="max-w-sm mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button type="button" onClick={onBack} className="btn-icon w-10 h-10 shrink-0" aria-label="Back to your events">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <p className="eyebrow truncate">{formatEventDate(event.date, event.time)}</p>
          <h1 className="font-bold text-white truncate">{event.name}</h1>
        </div>
      </div>

      {isLoading || (!top && isFetching) ? (
        <div className="h-[480px] max-h-[65vh] rounded-3xl bg-white/5 animate-pulse" aria-hidden="true" />
      ) : isError && !top ? (
        <div className="card p-8 text-center">
          <p className="text-text-secondary">Could not load who is going. Check your connection and try again.</p>
          <button type="button" onClick={() => refetch()} className="btn-secondary mt-4">
            Try again
          </button>
        </div>
      ) : !top ? (
        <div className="card px-8 py-12 text-center">
          <Heart className="w-10 h-10 text-text-muted mx-auto mb-4" />
          <h2 className="font-semibold text-white">You have seen everyone for now</h2>
          <p className="mt-1 text-sm text-text-secondary">
            More people show up here as they get passes and turn on Meet.
          </p>
        </div>
      ) : (
        <>
          <div className="relative h-[480px] max-h-[65vh]">
            {cards.slice(0, 3).map((card, i) => (
              <SwipeCard
                key={card.id}
                userId={userId}
                profile={card}
                stackIndex={i}
                onLike={i === 0 ? () => decide('like') : undefined}
                onPass={i === 0 ? () => decide('pass') : undefined}
              />
            ))}
          </div>
          <div className="mt-6 flex justify-center gap-8">
            <button
              type="button"
              onClick={() => decide('pass')}
              aria-label={`Pass on ${name}`}
              className="w-16 h-16 rounded-full bg-surface border border-white/10 flex items-center justify-center shadow-lg hover:bg-white/10 transition-colors"
            >
              <X className="w-7 h-7 text-text-secondary" />
            </button>
            <button
              type="button"
              onClick={() => decide('like')}
              aria-label={`Like ${name}`}
              className="w-16 h-16 rounded-full bg-accent/10 border border-accent/30 flex items-center justify-center shadow-lg hover:bg-accent/20 transition-colors"
            >
              <Heart className="w-7 h-7 text-accent" />
            </button>
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="mt-4 text-center text-sm text-red">
          {error}
        </p>
      )}

      {match && <MatchSheet userId={userId} match={match} onClose={() => setMatch(null)} />}
    </div>
  );
}

function MeetHome({ userId, passEvents, onBrowse }) {
  const { data: settings, isLoading, isError, refetch } = useMeetSettings(userId);
  const [eventId, setEventId] = useState(null);

  if (isLoading) {
    return <div className="max-w-md mx-auto h-64 rounded-3xl bg-white/5 animate-pulse" aria-hidden="true" />;
  }
  if (isError) {
    return (
      <div className="card max-w-md mx-auto p-8 text-center">
        <p className="text-text-secondary">Could not load Meet your people. Check your connection and try again.</p>
        <button type="button" onClick={() => refetch()} className="btn-secondary mt-4">
          Try again
        </button>
      </div>
    );
  }
  if (!settings.visible) return <OptIn userId={userId} initialIntents={settings.intents} />;

  const event = passEvents.find((pe) => pe.event.id === eventId)?.event;
  if (event) return <DeckView userId={userId} event={event} onBack={() => setEventId(null)} />;

  return (
    <div className="max-w-2xl mx-auto">
      <p className="eyebrow mb-2">Meet</p>
      <h1 className="text-3xl sm:text-5xl font-bold tracking-[-0.03em] text-white">Meet your people</h1>
      <p className="mt-3 text-base sm:text-lg text-text-secondary">Pick an event to see who else is going.</p>

      <EventList passEvents={passEvents} onSelect={setEventId} onBrowse={onBrowse} />
      <MatchList userId={userId} />
      <CardSettings userId={userId} settings={settings} />
    </div>
  );
}

export default function MeetPage({ passEvents, onSignIn, onBrowse }) {
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="card max-w-md mx-auto px-8 py-12 text-center">
        <Heart className="w-10 h-10 text-accent mx-auto mb-4" />
        <h1 className="text-xl font-bold text-white">Meet your people</h1>
        <p className="mt-2 text-text-secondary">Sign in to meet people going to the same events as you.</p>
        <button type="button" onClick={onSignIn} className="btn-accent mt-6">
          Sign in
        </button>
      </div>
    );
  }

  // Keyed by account, so nothing one person picked carries over to the next.
  return <MeetHome key={user.id} userId={user.id} passEvents={passEvents} onBrowse={onBrowse} />;
}
