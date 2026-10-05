import { useState } from 'react';
import { Camera, CheckCircle2, Clock, ExternalLink, MessageCircle, XCircle } from 'lucide-react';
import LocationCard from './LocationCard';
import { PersonName } from './Avatar';
import { useAuth } from '../lib/authContext';
import { formatEventDate } from '../lib/format';
import { useEventPrivate, useMyProfile, usePhotoUrls, useSetAvatar, useSetDisplayName } from '../lib/queries';

const STATUS = {
  pending: { label: 'Waiting for the host', Icon: Clock, className: 'bg-amber/15 text-amber' },
  approved: { label: 'Approved', Icon: CheckCircle2, className: 'bg-green/15 text-green' },
  declined: { label: 'Not this time', Icon: XCircle, className: 'bg-white/6 text-text-muted' },
  withdrawn: { label: 'Withdrawn', Icon: XCircle, className: 'bg-white/6 text-text-muted' },
};

// A letter on the brand gradient, for anyone without a photo.
const initialAvatar = (name) => {
  const initial = ((name || '').match(/[A-Za-z0-9]/)?.[0] || '?').toUpperCase();
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E040FB"/><stop offset="1" stop-color="#7C4DFF"/></linearGradient></defs><rect width="48" height="48" fill="url(#g)"/><text x="24" y="31" text-anchor="middle" font-family="Outfit, sans-serif" font-size="20" font-weight="700" fill="#fff">${initial}</text></svg>`
  )}`;
};

// Once a host approves, the database shows this person the exact location and
// the host's WhatsApp, if the host gave one.
function ApprovedDetails({ eventId }) {
  const { data: details, isLoading } = useEventPrivate(eventId);
  if (isLoading) return <div className="mt-3 h-16 rounded-2xl bg-white/5 animate-pulse" aria-hidden="true" />;
  const whatsapp = details?.whatsapp?.replace(/[^0-9]/g, '');
  if (!details?.fullAddress && !details?.coordinates && !whatsapp) {
    return <p className="mt-3 text-[13px] text-text-muted">The host has not added the exact location yet.</p>;
  }
  return (
    <>
      <LocationCard location={details} className="mt-3 border-0 bg-white/5" />
      {whatsapp && (
        <a
          href={`https://wa.me/${whatsapp}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent-hover hover:underline"
        >
          <MessageCircle className="w-4 h-4" />
          Message the host on WhatsApp
        </a>
      )}
    </>
  );
}

export default function FacecardSection({ parties, hostEvents, myRequests, hostRequests, onUpdateRequest, onNewRequest }) {
  const { user } = useAuth();
  const { data: profile } = useMyProfile(user?.id);
  const setDisplayName = useSetDisplayName(user?.id);
  const setAvatar = useSetAvatar(user?.id);
  const [activeTab, setActiveTab] = useState('request');
  const [selectedParty, setSelectedParty] = useState('');
  const [selfiePreview, setSelfiePreview] = useState(null);
  const [selfieFile, setSelfieFile] = useState(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // null until edited: the field shows the profile name, which hosts see.
  const [guestName, setGuestName] = useState(null);
  const [guestMessage, setGuestMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [hostPartyFilter, setHostPartyFilter] = useState('all');

  const profileName = profile?.display_name ?? '';
  const name = guestName ?? profileName;
  // One request per event: the database refuses a second, so do not offer it.
  const requestedIds = new Set(myRequests.map((r) => r.eventId));
  const openParties = parties.filter((p) => !requestedIds.has(p.id));
  // The requester's selfie or profile picture for the host view, and this
  // person's own picture for the form.
  const { data: photoUrls } = usePhotoUrls([
    profile?.avatar_path,
    ...hostRequests.flatMap((r) => [r.selfiePath, r.userAvatarPath]),
  ]);
  const currentPhoto = photoUrls?.get(profile?.avatar_path) ?? null;
  const shownPhoto = selfiePreview ?? currentPhoto;

  const handleSelfieChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError('');
    // Keep the File itself: the preview is only for display, the upload needs this.
    setSelfieFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setSelfiePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSubmitRequest = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    // Signed out: this opens sign-in and sends nothing.
    if (!user) {
      onNewRequest(null);
      return;
    }
    if (!selectedParty || !name.trim()) return;

    setError('');
    setIsSubmitting(true);
    try {
      // Hosts see the profile name, so the name typed here becomes it.
      if (name.trim() !== profileName) await setDisplayName.mutateAsync(name.trim());

      // A new selfie becomes the profile picture, and goes with the request.
      // Without one, the current profile picture goes instead. Both live in the
      // private selfies bucket; only the path is stored.
      const selfiePath = selfieFile ? await setAvatar.mutateAsync(selfieFile) : profile?.avatar_path ?? null;

      await onNewRequest({
        eventId: selectedParty,
        reason: guestMessage.trim() || 'I would love to come!',
        selfiePath,
      });

      setSubmitted(true);
      setGuestName(null);
      setGuestMessage('');
      setSelfiePreview(null);
      setSelfieFile(null);
      setSelectedParty('');
      setTimeout(() => setSubmitted(false), 4000);
    } catch (err) {
      setError(
        err?.code === '23505'
          ? 'You have already asked to join that event. Its status is below.'
          : err?.message ?? 'Could not send your request. Try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const hostEventName = (eventId) => hostEvents.find((e) => e.id === eventId)?.name ?? 'Your event';
  const filteredRequests =
    hostPartyFilter === 'all' ? hostRequests : hostRequests.filter((r) => r.eventId === hostPartyFilter);
  const pendingCount = hostRequests.filter((r) => r.status === 'pending').length;

  return (
    <div>
      <div role="tablist" aria-label="Facecard" className="segmented max-w-sm mb-8">
        <button type="button" role="tab" aria-selected={activeTab === 'request'} onClick={() => setActiveTab('request')}>
          Request an invite
        </button>
        <button type="button" role="tab" aria-selected={activeTab === 'host'} onClick={() => setActiveTab('host')}>
          Host view
          {pendingCount > 0 && <span className="ml-1.5 text-accent">{pendingCount}</span>}
        </button>
      </div>

      {activeTab === 'request' && (
        <div className="card max-w-2xl p-6 sm:p-10 animate-fade-in">
          <form onSubmit={handleSubmitRequest} className="space-y-6">
            <div className="flex flex-col items-center text-center">
              <label className="relative cursor-pointer group" aria-label="Add a selfie">
                <span
                  className={`flex w-28 h-28 items-center justify-center overflow-hidden rounded-full transition-colors duration-200 ${
                    shownPhoto
                      ? 'shadow-[0_0_0_3px_#E040FB]'
                      : 'bg-white/5 border border-dashed border-white/20 group-hover:border-accent/60'
                  }`}
                >
                  {shownPhoto ? (
                    <img src={shownPhoto} alt="Your profile picture" className="w-full h-full object-cover" />
                  ) : (
                    <Camera className="w-7 h-7 text-text-secondary" />
                  )}
                </span>
                <input type="file" accept="image/jpeg,image/png,image/webp" capture="user" className="sr-only" onChange={handleSelfieChange} />
              </label>
              {selfiePreview ? (
                <>
                  <p className="mt-3 text-sm text-text-secondary">This becomes your profile picture when you send.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelfiePreview(null);
                      setSelfieFile(null);
                    }}
                    className="mt-1 text-sm font-medium text-text-secondary hover:text-white"
                  >
                    {currentPhoto ? 'Keep my current picture' : 'Remove photo'}
                  </button>
                </>
              ) : currentPhoto ? (
                <p className="mt-3 text-sm text-text-secondary">
                  Your profile picture goes with the request. Tap it to take a new one.
                </p>
              ) : (
                <p className="mt-3 text-sm text-text-secondary">
                  Add a selfie. It becomes your profile picture: hosts see it, and other guests
                  only at events where you choose to be listed.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="facecard-name" className="field-label">Your name</label>
              <input
                id="facecard-name"
                type="text"
                value={name}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Mwila K."
                maxLength={60}
                className="input-dark"
                required
              />
              <p className="mt-1.5 text-[13px] text-text-muted">This is your profile name, which hosts see.</p>
            </div>

            <div>
              <label htmlFor="facecard-event" className="field-label">Event</label>
              <select
                id="facecard-event"
                value={selectedParty}
                onChange={(e) => setSelectedParty(e.target.value)}
                className="input-dark"
                required
              >
                <option value="">{openParties.length ? 'Choose an event' : 'You have asked to join every event'}</option>
                {openParties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.area}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="facecard-message" className="field-label">Note to the host</label>
              <textarea
                id="facecard-message"
                value={guestMessage}
                onChange={(e) => setGuestMessage(e.target.value)}
                placeholder="Why should they let you in?"
                rows={3}
                maxLength={500}
                className="input-dark resize-none"
              />
            </div>

            <button type="submit" disabled={isSubmitting} className="btn-accent w-full">
              {isSubmitting ? 'Sending...' : 'Send request'}
            </button>

            {error && (
              <p role="alert" className="text-center text-sm text-red">
                {error}
              </p>
            )}

            {submitted && (
              <p role="status" className="flex items-center justify-center gap-2 text-sm font-medium text-green animate-fade-in">
                <CheckCircle2 className="w-4 h-4" />
                Request sent. You will see the host&apos;s answer below.
              </p>
            )}
          </form>

          {myRequests.length > 0 && (
            <div className="mt-10 pt-8 border-t border-white/5">
              <h3 className="text-lg font-semibold text-white">Your requests</h3>
              <ul className="mt-4 space-y-3">
                {myRequests.map((req) => {
                  const { label, Icon, className } = STATUS[req.status] ?? STATUS.pending;
                  return (
                    <li key={req.id} className="rounded-2xl bg-white/5 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-white truncate">{req.event?.name ?? 'An event that is no longer listed'}</p>
                          {req.event && (
                            <p className="text-[13px] text-text-muted">{formatEventDate(req.event.date, req.event.time)}</p>
                          )}
                        </div>
                        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-[13px] font-semibold ${className}`}>
                          <Icon className="w-3.5 h-3.5" />
                          {label}
                        </span>
                      </div>
                      {req.status === 'approved' && <ApprovedDetails eventId={req.eventId} />}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {activeTab === 'host' && (
        <div className="animate-fade-in">
          {hostEvents.length > 0 && (
            <>
              <label htmlFor="facecard-filter" className="sr-only">Filter by event</label>
              <select
                id="facecard-filter"
                value={hostPartyFilter}
                onChange={(e) => setHostPartyFilter(e.target.value)}
                className="input-dark max-w-xs mb-6"
              >
                <option value="all">All your events</option>
                {hostEvents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </>
          )}

          {filteredRequests.length === 0 ? (
            <p className="card py-12 text-center text-text-secondary">
              {hostEvents.length ? 'No requests yet.' : 'Requests to join events you host show here.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredRequests.map((req) => (
                <div key={req.id} className={`card p-5 flex flex-col ${req.status === 'declined' ? 'opacity-60' : ''}`}>
                  <div className="flex items-center gap-3">
                    <img
                      src={photoUrls?.get(req.selfiePath) ?? photoUrls?.get(req.userAvatarPath) ?? initialAvatar(req.userName)}
                      alt={req.selfiePath || req.userAvatarPath ? `Photo of ${req.userName}` : ''}
                      className="w-14 h-14 rounded-full object-cover shrink-0"
                    />
                    <div className="min-w-0">
                      <PersonName name={req.userName} username={req.username} verified={req.verified} className="block" />
                      <p className="text-[13px] text-text-muted truncate">{hostEventName(req.eventId)}</p>
                      {req.userSocial && (
                        <a
                          href={req.userSocial}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-hover hover:underline"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Profile
                        </a>
                      )}
                    </div>
                  </div>

                  <p className="mt-3 mb-5 text-[15px] leading-relaxed text-text-secondary">&ldquo;{req.reason}&rdquo;</p>

                  <div className="mt-auto">
                    {req.status === 'pending' ? (
                      <div className="flex gap-2">
                        <button type="button" onClick={() => onUpdateRequest(req.id, 'declined')} className="btn-secondary flex-1">
                          Decline
                        </button>
                        <button type="button" onClick={() => onUpdateRequest(req.id, 'approved')} className="btn-accent flex-1">
                          Approve
                        </button>
                      </div>
                    ) : (
                      <p
                        className={`rounded-full py-2 text-center text-sm font-semibold ${
                          req.status === 'approved' ? 'bg-green/15 text-green' : 'bg-white/6 text-text-muted'
                        }`}
                      >
                        {req.status === 'approved' ? 'Approved' : 'Declined'}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
