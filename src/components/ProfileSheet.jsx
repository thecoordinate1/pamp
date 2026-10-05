import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { BarChart3, Camera, Check, Copy, LogOut, Share2, Sparkles } from 'lucide-react';
import Sheet from './Sheet';
import { Avatar, VerifiedBadge } from './Avatar';
import { useAuth } from '../lib/authContext';
import { inviteUrl } from '../lib/invite';
import { ngweeToZmw } from '../lib/mappers';
import { describePointEntry } from '../lib/points';
import {
  useMyPhotoReview,
  useMyPoints,
  useMyProfile,
  useMyReferral,
  usePhotoUrls,
  usePlatformSettings,
  usePointHistory,
  useSetAvatar,
  useUpdateProfile,
  useUsernameAvailable,
} from '../lib/queries';
import { useShareLink } from '../lib/useShareLink';
import { cleanUsername, usernameProblem } from '../lib/username';

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'x', label: 'X' },
  { id: 'snapchat', label: 'Snapchat' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'whatsapp', label: 'WhatsApp' },
];

// Mirrors the check constraint on profiles.social_handle.
const HANDLE_RE = /^[A-Za-z0-9._+-]{1,40}$/;

// This person's referral code and its QR. Both are fixed for the life of the
// account, so anything already shared keeps crediting them.
function InviteCard({ userId }) {
  const { data: referral } = useMyReferral(userId);
  const url = referral?.code ? inviteUrl({ code: referral.code }) : '';
  const { copy, share, copied, canShare, error } = useShareLink(url, {
    title: 'Join me on PAMP',
    text: 'Find the best events in Zambia on PAMP',
  });

  if (!referral?.code) return null;

  return (
    <section aria-labelledby="invite-heading" className="card mb-6 p-4">
      <div className="flex items-center gap-4">
        <div className="shrink-0 rounded-2xl bg-white p-2">
          <QRCodeSVG value={url} size={88} level="M" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 id="invite-heading" className="text-[13px] font-medium text-text-muted">
            Your invite code
          </h3>
          <p className="font-mono text-2xl font-bold tracking-[0.15em] text-white">{referral.code}</p>
          <p className="text-[13px] text-text-muted">
            {referral.joined === 1 ? '1 friend has' : `${referral.joined} friends have`} joined with it
          </p>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={copy} className="btn-secondary flex-1">
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copied' : 'Copy link'}
        </button>
        {canShare && (
          <button type="button" onClick={share} className="btn-secondary flex-1">
            <Share2 className="w-4 h-4" />
            Invite
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red">
          {error}
        </p>
      )}
    </section>
  );
}

// The profile picture, and where the verified badge stands. The picture is the
// facecard selfie, and changing it here sends it back to be checked.
function PhotoCard({ userId, profile }) {
  const setAvatar = useSetAvatar(userId);
  const { data: reviewedPath } = useMyPhotoReview(userId);
  const path = profile?.avatar_path ?? null;
  const { data: photoUrls } = usePhotoUrls([path]);
  const inputRef = useRef(null);
  const [error, setError] = useState('');

  // identity_verified_at is missing until the migration that adds badges runs.
  const hasBadges = Boolean(profile) && 'identity_verified_at' in profile;
  const verified = Boolean(profile?.identity_verified_at);

  let status = 'Hosts of your events see it. Other guests see it only where you choose to be listed.';
  if (hasBadges) {
    if (verified) status = 'An admin checked that you match your photo.';
    else if (path && reviewedPath === path) status = 'This photo did not pass the check. Use a clear photo of just your face.';
    else if (path) status = 'An admin will check this photo is you. Then you get the badge and can spend points.';
    else status = 'Add a clear photo of your face. Once an admin checks it, you get the badge and can spend points.';
  }

  const choose = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    try {
      await setAvatar.mutateAsync(file);
    } catch (err) {
      setError(err.message ?? 'Could not save that photo. Try another one.');
    }
  };

  return (
    <section aria-label="Profile picture" className="card mb-6 flex items-center gap-4 p-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={setAvatar.isPending}
        aria-label={path ? 'Change your profile picture' : 'Add a profile picture'}
        className="relative shrink-0 rounded-full disabled:opacity-60"
      >
        <Avatar src={photoUrls?.get(path)} name={profile?.display_name} className="w-20 h-20 text-2xl" />
        <span className="absolute -bottom-0.5 -right-0.5 flex w-7 h-7 items-center justify-center rounded-full bg-accent text-white">
          <Camera className="w-4 h-4" />
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="user"
        className="sr-only"
        tabIndex={-1}
        onChange={choose}
      />
      <div className="min-w-0 flex-1">
        <p className="inline-flex max-w-full items-center gap-1 font-semibold text-white">
          <span className="truncate">{profile?.display_name || 'Your profile'}</span>
          {verified && <VerifiedBadge />}
        </p>
        {profile?.username && <p className="text-[13px] text-text-muted truncate">@{profile.username}</p>}
        <p className="mt-1 text-[13px] text-text-secondary">
          {setAvatar.isPending ? 'Saving your photo…' : status}
        </p>
        {error && (
          <p role="alert" className="mt-1 text-[13px] text-red">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

// Points: what this person holds, how to earn more, and where they went.
function RewardsCard({ userId, verified }) {
  const { data: points } = useMyPoints(userId);
  const { data: settings } = usePlatformSettings();
  const [showHistory, setShowHistory] = useState(false);
  const { data: history = [], isLoading } = usePointHistory(userId, showHistory);

  // Null until the points migration has run.
  if (!points) return null;

  const worth = ngweeToZmw(points.balance * points.pointValueNgwee);
  const perEvent = settings?.pointsPerAttendance;
  const perFriend = settings?.pointsPerReferral;

  return (
    <section aria-labelledby="points-heading" className="card mb-6 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 id="points-heading" className="flex items-center gap-1.5 text-[13px] font-medium text-text-muted">
            <Sparkles className="w-3.5 h-3.5 text-accent" />
            Your points
          </h3>
          <p className="text-3xl font-bold tracking-tight text-white tabular-nums">{points.balance.toLocaleString()}</p>
          <p className="text-[13px] text-text-muted">
            Worth K{worth.toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          aria-expanded={showHistory}
          className="text-sm font-medium text-accent-hover hover:underline"
        >
          {showHistory ? 'Hide history' : 'History'}
        </button>
      </div>
      {perEvent != null && (
        <p className="mt-3 text-[13px] text-text-secondary">
          Earn {perEvent} points every time you are checked in at an event, and {perFriend} when a friend
          you invited goes to their first one.{' '}
          {verified ? 'Spend them on paid passes at checkout.' : 'Get verified to spend them on paid passes.'}
        </p>
      )}
      {showHistory && (
        <ul className="mt-4 space-y-2" aria-busy={isLoading}>
          {history.length === 0 && !isLoading && (
            <li className="text-[13px] text-text-muted">Nothing yet. Your first event check-in earns points.</li>
          )}
          {history.map((entry) => (
            <li key={entry.id} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-text-secondary">{describePointEntry(entry)}</span>
              <span className={`shrink-0 font-semibold tabular-nums ${entry.points > 0 ? 'text-green' : 'text-text-muted'}`}>
                {entry.points > 0 ? '+' : '−'}
                {Math.abs(entry.points).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function ProfileSheet({ open, onClose, isAdmin = false, onNavigate }) {
  const { user, signOut } = useAuth();
  const { data: profile, isLoading } = useMyProfile(user?.id);
  const updateProfile = useUpdateProfile(user?.id);

  const [form, setForm] = useState({
    displayName: '',
    headline: '',
    lookingFor: '',
    socialPlatform: '',
    socialHandle: '',
    username: '',
  });
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setForm({
      displayName: profile.display_name ?? '',
      headline: profile.headline ?? '',
      lookingFor: profile.looking_for ?? '',
      socialPlatform: profile.social_platform ?? '',
      socialHandle: profile.social_handle ?? '',
      username: profile.username ?? '',
    });
  }, [profile]);

  // A username is checked a moment after typing stops, and only once it is a
  // valid shape that differs from the saved one.
  const savedUsername = profile?.username ?? '';
  const usernameChanged = form.username !== savedUsername;
  const usernameIssue = usernameChanged ? usernameProblem(form.username) : null;
  const [checkName, setCheckName] = useState('');
  useEffect(() => {
    const ready = usernameChanged && form.username && !usernameIssue;
    const timer = setTimeout(() => setCheckName(ready ? form.username : ''), 400);
    return () => clearTimeout(timer);
  }, [form.username, usernameChanged, usernameIssue]);
  const { data: usernameFree, isFetching: checkingName } = useUsernameAvailable(checkName);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setSaved(false);
    setError('');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    // A WhatsApp number is naturally typed with spaces and a +, none of which
    // the social_handle constraint allows, so reduce it to digits first.
    const typed = form.socialHandle.replace(/^@/, '').trim();
    const handle = form.socialPlatform === 'whatsapp' ? typed.replace(/[^0-9]/g, '') : typed;

    if (!form.displayName.trim()) {
      setError('Add the name you want people to see.');
      return;
    }
    if (form.socialPlatform && !handle) {
      setError('Add your handle, or clear the platform.');
      return;
    }
    if (handle && !HANDLE_RE.test(handle)) {
      setError(
        form.socialPlatform === 'whatsapp'
          ? 'Enter your number in digits, like 260971234567.'
          : 'Handles can use letters, numbers, dots, dashes and underscores.'
      );
      return;
    }

    if (usernameIssue) {
      setError(usernameIssue);
      return;
    }

    try {
      await updateProfile.mutateAsync({
        ...form,
        socialHandle: handle,
        // Sent only when changed: see useUpdateProfile.
        username: usernameChanged ? form.username : undefined,
      });
      setSaved(true);
    } catch (err) {
      if (err?.code === '23505' && /username/.test(err.message ?? '')) {
        setError('Someone just took that username. Try another.');
      } else if (err?.code === '42703') {
        setError('Usernames are not switched on yet. Clear it to save the rest.');
      } else {
        setError(err.message ?? 'Could not save your profile. Try again.');
      }
    }
  };

  const footer = (
    <div className="flex items-center justify-between gap-4">
      <button
        type="button"
        onClick={() => { signOut(); onClose(); }}
        className="btn-secondary px-4 text-text-secondary"
      >
        <LogOut className="w-4 h-4" />
        Sign out
      </button>
      <button type="submit" form="profile-form" disabled={updateProfile.isPending} className="btn-accent px-6">
        {updateProfile.isPending ? 'Saving...' : 'Save'}
      </button>
    </div>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Your profile"
      subtitle="This is what other people at an event see."
      footer={footer}
    >
      <PhotoCard userId={user?.id} profile={profile} />
      <RewardsCard userId={user?.id} verified={Boolean(profile?.identity_verified_at)} />
      <InviteCard userId={user?.id} />
      {isLoading ? (
        <div className="space-y-4" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-11 rounded-2xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : (
        <form id="profile-form" onSubmit={handleSave} className="space-y-5">
          <div>
            <label htmlFor="pf-name" className="field-label">Display name</label>
            <input
              id="pf-name"
              value={form.displayName}
              onChange={set('displayName')}
              maxLength={60}
              className="input-dark"
              placeholder="How your name appears"
            />
          </div>

          <div>
            <label htmlFor="pf-username" className="field-label">Username</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true">
                @
              </span>
              <input
                id="pf-username"
                value={form.username}
                onChange={(e) => {
                  setForm((f) => ({ ...f, username: cleanUsername(e.target.value) }));
                  setSaved(false);
                  setError('');
                }}
                maxLength={20}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-describedby="pf-username-hint"
                className="input-dark pl-8"
                placeholder="yourname"
              />
            </div>
            <p id="pf-username-hint" className="mt-1.5 text-[13px] text-text-muted" aria-live="polite">
              {usernameIssue ? (
                <span className="text-red">{usernameIssue}</span>
              ) : usernameChanged && form.username && checkName === form.username && !checkingName && usernameFree === false ? (
                <span className="text-red">That username is taken.</span>
              ) : usernameChanged && form.username && checkName === form.username && !checkingName && usernameFree ? (
                <span className="text-green">Available.</span>
              ) : (
                'Unique to you, so people can tell you apart. Letters, numbers, _ and dots.'
              )}
            </p>
          </div>

          <div>
            <label htmlFor="pf-headline" className="field-label">What you do</label>
            <input
              id="pf-headline"
              value={form.headline}
              onChange={set('headline')}
              maxLength={80}
              className="input-dark"
              placeholder="Product designer, DJ, student…"
            />
          </div>

          <div>
            <label htmlFor="pf-looking" className="field-label">Looking to connect with</label>
            <input
              id="pf-looking"
              value={form.lookingFor}
              onChange={set('lookingFor')}
              maxLength={120}
              className="input-dark"
              placeholder="Co-founders, photographers, good vibes…"
            />
          </div>

          <div className="grid grid-cols-[auto_1fr] gap-3">
            <div>
              <label htmlFor="pf-platform" className="field-label">Social</label>
              <select id="pf-platform" value={form.socialPlatform} onChange={set('socialPlatform')} className="input-dark">
                <option value="">None</option>
                {PLATFORMS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="pf-handle" className="field-label">Handle</label>
              <input
                id="pf-handle"
                value={form.socialHandle}
                onChange={set('socialHandle')}
                maxLength={40}
                className="input-dark"
                placeholder={form.socialPlatform === 'whatsapp' ? '260971234567' : 'yourname'}
              />
            </div>
          </div>

          <p className="text-[13px] text-text-muted">
            Your social handle is only shown to people at the same event, and publicly
            only if you opt in and the host features you.
          </p>

          {error && <p role="alert" className="text-sm text-red">{error}</p>}
          {saved && !error && <p role="status" className="text-sm text-green">Saved.</p>}

          {isAdmin && (
            <button
              type="button"
              onClick={() => { onNavigate?.('admin'); onClose(); }}
              className="btn-secondary w-full"
            >
              <BarChart3 className="w-4 h-4" />
              Platform admin
            </button>
          )}
        </form>
      )}
    </Sheet>
  );
}
