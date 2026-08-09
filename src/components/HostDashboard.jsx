import { useState } from 'react';
import { Calendar, DollarSign, Users, ShieldAlert, Check, X, PlusCircle, QrCode, Sparkles, MapPin } from 'lucide-react';

export default function HostDashboard({
  events,
  facecards,
  onApproveFacecard,
  onDeclineFacecard,
  onCreateEvent
}) {
  const [activeTab, setActiveTab] = useState('facecards'); // 'facecards' | 'events' | 'create'
  const [scannedResult, setScannedResult] = useState(null);

  // New Event Form state
  const [newEvent, setNewEvent] = useState({
    name: '',
    category: 'tech_business',
    date: '',
    time: '',
    city: 'Lusaka',
    area: '',
    vibe: '',
    dressCode: '',
    host: '',
    whatsapp: '',
    ticketPrice: 0,
    fullAddress: '',
    description: '',
    image: 'https://images.unsplash.com/photo-1511578314322-379afb476865?w=600&h=400&fit=crop'
  });

  const totalRSVPs = events.reduce((sum, e) => sum + (e.rsvpCount || 0), 0);
  const totalRevenue = events.reduce((sum, e) => sum + ((e.rsvpCount || 0) * (e.ticketPrice || 0)), 0);
  const pendingFacecards = facecards.filter(f => f.status === 'pending');

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    if (!newEvent.name || !newEvent.date || !newEvent.area) {
      alert('Please fill in event name, date, and area.');
      return;
    }

    const created = {
      ...newEvent,
      id: Date.now(),
      coordinates: [-15.416, 28.322],
      rsvpCount: 0,
      vibeScore: 100,
      attendees: []
    };

    onCreateEvent(created);
    alert('🎉 Event created successfully and published!');
    setActiveTab('events');
  };

  const simulateScan = () => {
    const fakePasses = [
      { name: 'Kambole C.', ticketId: 'PAMP-TIX-924182', status: 'VALID PASS', type: 'VIP Entry' },
      { name: 'Chileshe K.', ticketId: 'PAMP-TIX-104928', status: 'VALID PASS', type: 'Standard Pass' },
    ];
    const pass = fakePasses[Math.floor(Math.random() * fakePasses.length)];
    setScannedResult(pass);
  };

  return (
    <div className="bg-surface/90 border border-white/10 rounded-3xl p-6 md:p-8 backdrop-blur-xl shadow-2xl">
      {/* Header & Stats Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8 pb-8 border-b border-white/10">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/20 border border-accent/30 text-accent text-xs font-bold mb-2">
            <Sparkles className="w-3.5 h-3.5" /> Host & Organizer Portal
          </div>
          <h2 className="text-2xl md:text-3xl font-black text-white">Event Dashboard</h2>
          <p className="text-xs text-text-secondary">Manage your events, guestlist approvals, and digital pass verifications</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="bg-slate-900 border border-white/5 p-4 rounded-2xl">
            <div className="text-[10px] text-text-secondary uppercase tracking-wider font-semibold flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-accent" /> Hosted Events
            </div>
            <div className="text-xl font-black text-white mt-1">{events.length}</div>
          </div>

          <div className="bg-slate-900 border border-white/5 p-4 rounded-2xl">
            <div className="text-[10px] text-text-secondary uppercase tracking-wider font-semibold flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-cyan-400" /> Total RSVPs
            </div>
            <div className="text-xl font-black text-white mt-1">{totalRSVPs}</div>
          </div>

          <div className="bg-slate-900 border border-white/5 p-4 rounded-2xl col-span-2 sm:col-span-1">
            <div className="text-[10px] text-text-secondary uppercase tracking-wider font-semibold flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" /> Revenue
            </div>
            <div className="text-xl font-black text-emerald-400 mt-1">ZMW {totalRevenue.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Dashboard Nav Tabs */}
      <div className="flex items-center gap-3 mb-6 overflow-x-auto pb-2">
        <button
          onClick={() => setActiveTab('facecards')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
            activeTab === 'facecards'
              ? 'bg-accent text-white shadow-lg shadow-accent/30'
              : 'bg-slate-900 text-text-secondary hover:text-white'
          }`}
        >
          <ShieldAlert className="w-4 h-4" /> Facecard Approvals ({pendingFacecards.length})
        </button>

        <button
          onClick={() => setActiveTab('events')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
            activeTab === 'events'
              ? 'bg-accent text-white shadow-lg shadow-accent/30'
              : 'bg-slate-900 text-text-secondary hover:text-white'
          }`}
        >
          <Calendar className="w-4 h-4" /> Manage Events ({events.length})
        </button>

        <button
          onClick={() => setActiveTab('create')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
            activeTab === 'create'
              ? 'bg-accent text-white shadow-lg shadow-accent/30'
              : 'bg-slate-900 text-text-secondary hover:text-white'
          }`}
        >
          <PlusCircle className="w-4 h-4" /> Post New Event
        </button>

        <button
          onClick={simulateScan}
          className="px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:opacity-90 transition-all ml-auto"
        >
          <QrCode className="w-4 h-4" /> Scan QR Pass
        </button>
      </div>

      {/* QR Scanner Result Alert */}
      {scannedResult && (
        <div className="mb-6 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-3">
            <Check className="w-6 h-6 p-1 rounded-full bg-emerald-500 text-black font-bold" />
            <div>
              <h4 className="font-bold text-sm text-white">{scannedResult.status} — {scannedResult.type}</h4>
              <p className="text-xs">Holder: {scannedResult.name} | Pass ID: {scannedResult.ticketId}</p>
            </div>
          </div>
          <button
            onClick={() => setScannedResult(null)}
            className="text-xs text-text-secondary hover:text-white underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* TAB 1: FACECARD APPROVALS */}
      {activeTab === 'facecards' && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-white mb-2">Guestlist & VIP Facecard Requests</h3>

          {facecards.length > 0 ? (
            facecards.map((req) => (
              <div
                key={req.id}
                className="bg-slate-900 border border-white/10 rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-bold text-sm text-white">{req.userName}</h4>
                    <span className="text-xs text-accent font-semibold">{req.userRole}</span>
                    <span className="text-[10px] text-text-secondary">({req.userInstagram})</span>
                  </div>
                  <p className="text-xs text-text-secondary mb-2">Event: <strong className="text-white">{req.eventTitle}</strong></p>
                  <div className="text-xs bg-white/5 border border-white/5 p-3 rounded-xl text-gray-300 italic">
                    "{req.reason}"
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
                  {req.status === 'pending' ? (
                    <>
                      <button
                        onClick={() => onApproveFacecard(req.id)}
                        className="flex-1 md:flex-none px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-1 shadow-md"
                      >
                        <Check className="w-4 h-4" /> Approve
                      </button>
                      <button
                        onClick={() => onDeclineFacecard(req.id)}
                        className="flex-1 md:flex-none px-4 py-2 rounded-xl text-xs font-bold bg-red-600/30 hover:bg-red-600/50 text-red-300 border border-red-500/30 flex items-center justify-center gap-1"
                      >
                        <X className="w-4 h-4" /> Decline
                      </button>
                    </>
                  ) : (
                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                      req.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {req.status}
                    </span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12 text-text-secondary text-sm">
              No pending facecard requests.
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MANAGE EVENTS */}
      {activeTab === 'events' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {events.map((evt) => (
            <div key={evt.id} className="bg-slate-900 border border-white/10 rounded-2xl p-4 flex gap-4 items-center">
              <img src={evt.image} alt={evt.name} className="w-20 h-20 rounded-xl object-cover shrink-0" />
              <div className="flex-1 overflow-hidden">
                <span className="text-[10px] font-bold text-accent uppercase tracking-wider">{evt.vibe}</span>
                <h4 className="font-bold text-sm text-white truncate">{evt.name}</h4>
                <p className="text-xs text-text-secondary truncate">📍 {evt.area}</p>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-cyan-400 font-semibold">{evt.rsvpCount} RSVPs</span>
                  <span className="font-bold text-emerald-400">
                    {evt.ticketPrice === 0 ? 'FREE' : `${evt.currency || 'ZMW'} ${evt.ticketPrice}`}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: CREATE EVENT */}
      {activeTab === 'create' && (
        <form onSubmit={handleCreateSubmit} className="space-y-4 max-w-2xl">
          <h3 className="text-sm font-bold text-white mb-2">Post a New Social Event or Party</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">Event Title</label>
              <input
                type="text"
                required
                placeholder="e.g. Founders & Coffee Morning"
                value={newEvent.name}
                onChange={(e) => setNewEvent({ ...newEvent, name: e.target.value })}
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">Event Category</label>
              <select
                value={newEvent.category}
                onChange={(e) => setNewEvent({ ...newEvent, category: e.target.value })}
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
              >
                <option value="tech_business">Tech & Business Mixer</option>
                <option value="party">Party & Nightlife</option>
                <option value="creative_arts">Creative & Arts</option>
                <option value="vip_lounge">VIP Lounge</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">Date</label>
              <input
                type="date"
                required
                value={newEvent.date}
                onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">Time</label>
              <input
                type="text"
                placeholder="e.g. 18:00"
                value={newEvent.time}
                onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })}
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">Area / Neighborhood</label>
              <input
                type="text"
                required
                placeholder="e.g. Kabulonga, Lusaka"
                value={newEvent.area}
                onChange={(e) => setNewEvent({ ...newEvent, area: e.target.value })}
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">Ticket Price (ZMW)</label>
              <input
                type="number"
                min="0"
                placeholder="0 for Free"
                value={newEvent.ticketPrice}
                onChange={(e) => setNewEvent({ ...newEvent, ticketPrice: Number(e.target.value) })}
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1">Description & Networking Details</label>
            <textarea
              rows="3"
              placeholder="Describe the event vibe, expected crowd, and networking highlights..."
              value={newEvent.description}
              onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
              className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
            ></textarea>
          </div>

          <button type="submit" className="btn-accent w-full py-3 text-sm font-bold">
            Publish Event
          </button>
        </form>
      )}
    </div>
  );
}
