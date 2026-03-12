import { useState } from 'react';

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
    triggerConfetti();
  };

  const handleDecline = (requestId) => {
    onUpdateRequest(requestId, 'declined');
  };

  const triggerConfetti = () => {
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 3000);
  };

  const handleRevealAddress = (party) => {
    setRevealedAddress(party);
    triggerConfetti();
  };

  const filteredRequests = hostPartyFilter === 'all'
    ? facecardRequests
    : facecardRequests.filter(r => r.partyId === parseInt(hostPartyFilter));

  const pendingCount = facecardRequests.filter(r => r.status === 'pending').length;
  const approvedRequests = facecardRequests.filter(r => r.status === 'approved');

  return (
    <div className="max-w-4xl mx-auto">
      {/* Confetti */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50">
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="confetti-piece"
              style={{
                left: `${Math.random() * 100}%`,
                backgroundColor: ['#E040FB', '#00E5FF', '#FFD740', '#69F0AE', '#7C4DFF'][Math.floor(Math.random() * 5)],
                animationDelay: `${Math.random() * 1}s`,
                animationDuration: `${2 + Math.random() * 2}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-8 bg-surface rounded-2xl p-1.5">
        <button
          onClick={() => setActiveTab('request')}
          className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all duration-300 cursor-pointer
            ${activeTab === 'request'
              ? 'bg-accent text-white shadow-lg shadow-accent/20'
              : 'text-text-secondary hover:text-text-primary'
            }`}
        >
          📸 Request an Invite
        </button>
        <button
          onClick={() => setActiveTab('host')}
          className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all duration-300 relative cursor-pointer
            ${activeTab === 'host'
              ? 'bg-accent text-white shadow-lg shadow-accent/20'
              : 'text-text-secondary hover:text-text-primary'
            }`}
        >
          👑 Host View
          {pendingCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red rounded-full text-xs flex items-center justify-center text-white font-bold pulse-glow">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* Request Tab */}
      {activeTab === 'request' && (
        <div className="glass-card p-6 md:p-8 fade-in-up">
          <div className="text-center mb-6">
            <h3 className="text-xl font-bold text-text-primary mb-2">Show Your Face, Get In</h3>
            <p className="text-text-secondary text-sm">Upload a selfie to request an exclusive invite. The host decides!</p>
          </div>

          <form onSubmit={handleSubmitRequest} className="space-y-5">
            {/* Selfie Upload */}
            <div className="flex flex-col items-center">
              <label className="relative cursor-pointer group">
                <div className={`w-32 h-32 rounded-2xl border-2 border-dashed flex items-center justify-center overflow-hidden
                  ${selfiePreview ? 'border-accent' : 'border-border-light hover:border-accent'} transition`}>
                  {selfiePreview ? (
                    <img src={selfiePreview} alt="selfie" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center">
                      <div className="text-3xl mb-1">📸</div>
                      <div className="text-xs text-text-muted">Tap to upload</div>
                    </div>
                  )}
                </div>
                <input type="file" accept="image/*" capture="user" className="hidden" onChange={handleSelfieChange} />
              </label>
              {selfiePreview && (
                <button type="button" onClick={() => setSelfiePreview(null)} className="text-xs text-text-muted mt-2 hover:text-red transition cursor-pointer">
                  Remove photo
                </button>
              )}
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Your Name *</label>
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="e.g. Mwila K."
                className="input-dark"
                required
              />
            </div>

            {/* Party */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Which Party? *</label>
              <select
                value={selectedParty}
                onChange={(e) => setSelectedParty(e.target.value)}
                className="input-dark"
                required
              >
                <option value="">Select a party</option>
                {parties.map(p => (
                  <option key={p.id} value={p.id}>{p.name} — {p.area}</option>
                ))}
              </select>
            </div>

            {/* Message */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Say something to the host</label>
              <textarea
                value={guestMessage}
                onChange={(e) => setGuestMessage(e.target.value)}
                placeholder="Why should they let you in? 😏"
                rows={2}
                className="input-dark resize-none"
              />
            </div>

            <button type="submit" className="btn-accent w-full py-3">
              📲 Submit Facecard
            </button>

            {submitted && (
              <div className="bg-green-dim border border-green/30 rounded-xl p-4 text-green text-sm text-center fade-in-up">
                ✅ Facecard submitted! The host will review your request.
              </div>
            )}
          </form>

          {/* Approved — reveal address */}
          {approvedRequests.length > 0 && (
            <div className="mt-8 pt-6 border-t border-border">
              <h4 className="text-lg font-bold text-green mb-4">🎉 You're Approved!</h4>
              <div className="space-y-3">
                {approvedRequests.map(req => {
                  const party = parties.find(p => p.id === req.partyId);
                  if (!party) return null;
                  return (
                    <div key={req.id} className="bg-green-dim/50 rounded-xl p-4 flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-text-primary">{party.name}</span>
                        <span className="text-text-muted text-sm ml-2">({req.name})</span>
                      </div>
                      <button
                        onClick={() => handleRevealAddress(party)}
                        className="text-sm font-semibold text-green hover:underline cursor-pointer"
                      >
                        📍 Reveal Address
                      </button>
                    </div>
                  );
                })}
              </div>

              {revealedAddress && (
                <div className="mt-4 bg-accent-dim border border-accent/30 rounded-xl p-4 fade-in-up">
                  <p className="text-accent font-semibold mb-1">📍 Full Address:</p>
                  <p className="text-text-primary">{revealedAddress.fullAddress}</p>
                  <a
                    href={`https://wa.me/${revealedAddress.whatsapp?.replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-2 text-sm text-green hover:underline"
                  >
                    💬 Message the host on WhatsApp
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Host Tab */}
      {activeTab === 'host' && (
        <div className="fade-in-up">
          {/* Filter */}
          <div className="mb-6">
            <select
              value={hostPartyFilter}
              onChange={(e) => setHostPartyFilter(e.target.value)}
              className="input-dark max-w-xs"
            >
              <option value="all">All Parties</option>
              {parties.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Request cards */}
          {filteredRequests.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <p className="text-4xl mb-3">📭</p>
              <p className="text-text-secondary">No facecard requests yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredRequests.map((req) => {
                const party = parties.find(p => p.id === req.partyId);
                return (
                  <div
                    key={req.id}
                    className={`glass-card p-5 fade-in-up
                      ${req.status === 'approved' ? 'border-green/30' : ''}
                      ${req.status === 'declined' ? 'border-red/30 opacity-60' : ''}
                    `}
                  >
                    {/* Selfie */}
                    <div className="flex items-center gap-3 mb-3">
                      <img
                        src={req.selfieUrl}
                        alt={req.name}
                        className="w-14 h-14 rounded-xl object-cover border-2 border-border"
                      />
                      <div>
                        <h4 className="font-bold text-text-primary">{req.name}</h4>
                        <p className="text-xs text-text-muted">{party?.name || 'Unknown Party'}</p>
                      </div>
                    </div>

                    {/* Message */}
                    <p className="text-sm text-text-secondary mb-4 italic">"{req.message}"</p>

                    {/* Status / Actions */}
                    {req.status === 'pending' ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApprove(req.id)}
                          className="flex-1 py-2 rounded-xl font-semibold text-sm bg-green-dim text-green hover:bg-green/20 transition cursor-pointer"
                        >
                          ✓ Approve
                        </button>
                        <button
                          onClick={() => handleDecline(req.id)}
                          className="flex-1 py-2 rounded-xl font-semibold text-sm bg-red-dim text-red hover:bg-red/20 transition cursor-pointer"
                        >
                          ✗ Decline
                        </button>
                      </div>
                    ) : (
                      <div className={`text-center py-2 rounded-xl text-sm font-semibold
                        ${req.status === 'approved' ? 'bg-green-dim text-green' : 'bg-red-dim text-red'}`}>
                        {req.status === 'approved' ? '✓ Approved' : '✗ Declined'}
                      </div>
                    )}
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
