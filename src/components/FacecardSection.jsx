import { useState } from 'react';
import { Camera, CheckCircle2, MapPin, MessageCircle } from 'lucide-react';

const CONFETTI_COLORS = ['#E040FB', '#7C4DFF', '#F3B8FC', '#FFFFFF'];

export default function FacecardSection({ parties, facecardRequests, onUpdateRequest, onNewRequest }) {
  const [activeTab, setActiveTab] = useState('request');
  const [selectedParty, setSelectedParty] = useState('');
  const [selfiePreview, setSelfiePreview] = useState(null);
  const [guestName, setGuestName] = useState('');
  const [guestMessage, setGuestMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [hostPartyFilter, setHostPartyFilter] = useState('all');
  const [revealedAddress, setRevealedAddress] = useState(null);
  const [showConfetti, setShowConfetti] = useState(false);

  const handleSelfieChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setSelfiePreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmitRequest = (e) => {
    e.preventDefault();
    if (!selectedParty || !guestName.trim()) return;

    onNewRequest({
      id: Date.now(),
      partyId: parseInt(selectedParty),
      name: guestName,
      selfieUrl: selfiePreview || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&h=200&fit=crop&crop=face',
      status: 'pending',
      message: guestMessage || 'I would love to come! 🙏',
    });

    setSubmitted(true);
    setGuestName('');
    setGuestMessage('');
    setSelfiePreview(null);
    setSelectedParty('');
    setTimeout(() => setSubmitted(false), 4000);
  };

  const handleApprove = (requestId) => {
    onUpdateRequest(requestId, 'approved');
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 3000);
  };

  const handleDecline = (requestId) => {
    onUpdateRequest(requestId, 'declined');
  };

  // Requests come in two shapes (seed data vs. this form), so read either.
  const requests = facecardRequests.map((r) => {
    const name = r.name || r.userName || 'Guest';
    const initial = (name.match(/[A-Za-z0-9]/)?.[0] || '?').toUpperCase();
    return {
      ...r,
      name,
      message: r.message || r.reason || '',
      partyId: r.partyId ?? parties.find((p) => p.name === r.eventTitle)?.id,
      selfieUrl:
        r.selfieUrl ||
        `data:image/svg+xml,${encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E040FB"/><stop offset="1" stop-color="#7C4DFF"/></linearGradient></defs><rect width="48" height="48" fill="url(#g)"/><text x="24" y="31" text-anchor="middle" font-family="Outfit, sans-serif" font-size="20" font-weight="700" fill="#fff">${initial}</text></svg>`
        )}`,
    };
  });

  const filteredRequests = hostPartyFilter === 'all'
    ? requests
    : requests.filter(r => r.partyId === parseInt(hostPartyFilter));

  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const approvedRequests = requests.filter(
    (r) => r.status === 'approved' && parties.some((p) => p.id === r.partyId)
  );

  return (
    <div>
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50" aria-hidden="true">
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="confetti-piece"
              style={{
                left: `${Math.random() * 100}%`,
                backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                animationDelay: `${Math.random() * 1}s`,
                animationDuration: `${2 + Math.random() * 2}s`,
              }}
            />
          ))}
        </div>
      )}

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
                    selfiePreview
                      ? 'shadow-[0_0_0_3px_#E040FB]'
                      : 'bg-white/5 border border-dashed border-white/20 group-hover:border-accent/60'
                  }`}
                >
                  {selfiePreview ? (
                    <img src={selfiePreview} alt="Your selfie" className="w-full h-full object-cover" />
                  ) : (
                    <Camera className="w-7 h-7 text-text-secondary" />
                  )}
                </span>
                <input type="file" accept="image/*" capture="user" className="sr-only" onChange={handleSelfieChange} />
              </label>
              {selfiePreview ? (
                <button
                  type="button"
                  onClick={() => setSelfiePreview(null)}
                  className="mt-3 text-sm font-medium text-text-secondary hover:text-white"
                >
                  Remove photo
                </button>
              ) : (
                <p className="mt-3 text-sm text-text-secondary">Add a selfie so the host knows who's coming.</p>
              )}
            </div>

            <div>
              <label htmlFor="facecard-name" className="field-label">Your name</label>
              <input
                id="facecard-name"
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Mwila K."
                className="input-dark"
                required
              />
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
                <option value="">Choose an event</option>
                {parties.map(p => (
                  <option key={p.id} value={p.id}>{p.name} — {p.area}</option>
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
                className="input-dark resize-none"
              />
            </div>

            <button type="submit" className="btn-accent w-full">
              Send request
            </button>

            {submitted && (
              <p role="status" className="flex items-center justify-center gap-2 text-sm font-medium text-green animate-fade-in">
                <CheckCircle2 className="w-4 h-4" />
                Request sent. The host will review it.
              </p>
            )}
          </form>

          {approvedRequests.length > 0 && (
            <div className="mt-10 pt-8 border-t border-white/5">
              <h3 className="text-lg font-semibold text-white">You're approved</h3>
              <ul className="mt-4 space-y-2">
                {approvedRequests.map(req => {
                  const party = parties.find(p => p.id === req.partyId);
                  if (!party) return null;
                  return (
                    <li key={req.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-medium text-white truncate">{party.name}</p>
                        <p className="text-[13px] text-text-muted">{req.name}</p>
                      </div>
                      <button type="button" onClick={() => setRevealedAddress(party)} className="btn-secondary min-h-9 h-9 px-4 text-sm">
                        <MapPin className="w-4 h-4" />
                        Address
                      </button>
                    </li>
                  );
                })}
              </ul>

              {revealedAddress && (
                <div className="mt-4 rounded-2xl bg-accent/10 px-5 py-4 animate-fade-in">
                  <p className="eyebrow">Address</p>
                  <p className="mt-1 text-white">{revealedAddress.fullAddress}</p>
                  <a
                    href={`https://wa.me/${revealedAddress.whatsapp?.replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent-hover hover:underline"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Message the host on WhatsApp
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'host' && (
        <div className="animate-fade-in">
          <label htmlFor="facecard-filter" className="sr-only">Filter by event</label>
          <select
            id="facecard-filter"
            value={hostPartyFilter}
            onChange={(e) => setHostPartyFilter(e.target.value)}
            className="input-dark max-w-xs mb-6"
          >
            <option value="all">All events</option>
            {parties.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {filteredRequests.length === 0 ? (
            <p className="card py-12 text-center text-text-secondary">No requests yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredRequests.map((req) => {
                const party = parties.find(p => p.id === req.partyId);
                return (
                  <div key={req.id} className={`card p-5 flex flex-col ${req.status === 'declined' ? 'opacity-60' : ''}`}>
                    <div className="flex items-center gap-3">
                      <img src={req.selfieUrl} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" />
                      <div className="min-w-0">
                        <p className="font-semibold text-white truncate">{req.name}</p>
                        <p className="text-[13px] text-text-muted truncate">{party?.name || 'Unknown event'}</p>
                      </div>
                    </div>

                    <p className="mt-3 mb-5 text-[15px] leading-relaxed text-text-secondary">“{req.message}”</p>

                    <div className="mt-auto">
                      {req.status === 'pending' ? (
                        <div className="flex gap-2">
                          <button type="button" onClick={() => handleDecline(req.id)} className="btn-secondary flex-1">
                            Decline
                          </button>
                          <button type="button" onClick={() => handleApprove(req.id)} className="btn-accent flex-1">
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
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
