import { useState } from 'react';
import CheckInSheet from './CheckInSheet';
import { useAuth } from '../lib/authContext';
import { uploadEventImage } from '../lib/storage';
import { ImagePlus, QrCode } from 'lucide-react';

const TABS = [
  { id: 'facecards', label: 'Requests' },
  { id: 'events', label: 'Events' },
  { id: 'create', label: 'New event' },
];

export default function HostDashboard({
  events,
  facecards,
  onApproveFacecard,
  onDeclineFacecard,
  onCreateEvent
}) {
  const [activeTab, setActiveTab] = useState('facecards'); // 'facecards' | 'events' | 'create'
  const { user } = useAuth();
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [formError, setFormError] = useState('');

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
  // Requests come in two shapes (seed data vs. the Facecard form), so read either.
  const requests = facecards.map((r) => ({
    ...r,
    userName: r.userName || r.name || 'Guest',
    userRole: r.userRole || '',
    userInstagram: r.userInstagram || '',
    reason: r.reason || r.message || '',
    eventTitle: r.eventTitle || events.find((e) => e.id === (r.eventId ?? r.partyId))?.name || 'an event',
  }));
  const pendingFacecards = requests.filter(f => f.status === 'pending');

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFormError('');
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!newEvent.name || !newEvent.date || !newEvent.area) {
      setFormError('Add a title, date and area to publish.');
      return;
    }
    if (isPublishing) return;

    setFormError('');
    setIsPublishing(true);
    try {
      // Artwork goes to the public event-images bucket; the row stores its URL.
      let image = newEvent.image;
      if (imageFile && user?.id) {
        image = await uploadEventImage(imageFile, user.id);
      }
      onCreateEvent({ ...newEvent, image });
      setImageFile(null);
      setImagePreview(null);
    } catch (err) {
      setFormError(err.message ?? 'Could not upload that image. Try another one.');
    } finally {
      setIsPublishing(false);
    }
  };


  const stats = [
    { label: 'Events', value: events.length },
    { label: 'RSVPs', value: totalRSVPs.toLocaleString() },
    { label: 'Est. revenue', value: `ZMW ${totalRevenue.toLocaleString()}` },
  ];

  const update = (field) => (e) => setNewEvent({ ...newEvent, [field]: e.target.value });

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
        <div>
          <p className="eyebrow mb-2">Host</p>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-[-0.03em] text-white">Your events</h1>
          <p className="mt-3 text-base sm:text-lg text-text-secondary">Guest list approvals, events and door check-in.</p>
        </div>
        <button type="button" onClick={() => setCheckInOpen(true)} className="btn-secondary self-start sm:self-auto">
          <QrCode className="w-4 h-4" />
          Scan pass
        </button>
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-8">
        {stats.map(({ label, value }, i) => (
          <div
            key={label}
            className={`card px-4 py-4 sm:px-6 sm:py-5 ${i === stats.length - 1 ? 'col-span-2 sm:col-span-1' : ''}`}
          >
            <dt className="text-[13px] text-text-muted">{label}</dt>
            <dd className="mt-1 text-xl sm:text-3xl font-bold tracking-tight text-white truncate">{value}</dd>
          </div>
        ))}
      </dl>

      <CheckInSheet open={checkInOpen} onClose={() => setCheckInOpen(false)} />

      <div role="tablist" aria-label="Host sections" className="segmented max-w-md mb-8">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => setActiveTab(id)}
          >
            {label}
            {id === 'facecards' && pendingFacecards.length > 0 && (
              <span className="ml-1.5 text-accent">{pendingFacecards.length}</span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'facecards' && (
        <div className="animate-fade-in">
          {requests.length > 0 ? (
            <ul className="card divide-y divide-white/5">
              {requests.map((req) => (
                <li key={req.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 sm:p-6">
                  <div className="min-w-0">
                    <p className="font-semibold text-white">
                      {req.userName}
                      {req.userInstagram && (
                        <span className="ml-2 text-sm font-normal text-text-muted">{req.userInstagram}</span>
                      )}
                    </p>
                    {req.userRole && <p className="text-sm text-text-secondary">{req.userRole}</p>}
                    <p className="mt-2 text-[15px] leading-relaxed text-text-primary/90">“{req.reason}”</p>
                    <p className="mt-2 text-[13px] text-text-muted">For {req.eventTitle}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {req.status === 'pending' ? (
                      <>
                        <button type="button" onClick={() => onDeclineFacecard(req.id)} className="btn-secondary flex-1 sm:flex-none">
                          Decline
                        </button>
                        <button type="button" onClick={() => onApproveFacecard(req.id)} className="btn-accent flex-1 sm:flex-none">
                          Approve
                        </button>
                      </>
                    ) : (
                      <span
                        className={`rounded-full px-3 py-1 text-[13px] font-semibold ${
                          req.status === 'approved' ? 'bg-green/15 text-green' : 'bg-white/6 text-text-muted'
                        }`}
                      >
                        {req.status === 'approved' ? 'Approved' : 'Declined'}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="card py-12 text-center text-text-secondary">No guest list requests yet.</p>
          )}
        </div>
      )}

      {activeTab === 'events' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
          {events.map((evt) => (
            <div key={evt.id} className="card flex items-center gap-4 p-3 pr-5">
              <img src={evt.image} alt="" className="w-20 h-20 rounded-2xl object-cover shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="eyebrow truncate">{evt.vibe}</p>
                <p className="font-semibold text-white truncate">{evt.name}</p>
                <p className="text-sm text-text-secondary truncate">{evt.area}</p>
                <p className="mt-1 text-[13px] text-text-muted">
                  {evt.rsvpCount} going · {evt.ticketPrice === 0 ? 'Free' : `${evt.currency || 'ZMW'} ${evt.ticketPrice}`}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'create' && (
        <form onSubmit={handleCreateSubmit} className="card max-w-2xl p-5 sm:p-8 space-y-5 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="sm:col-span-2">
              <label htmlFor="new-event-name" className="field-label">Title</label>
              <input
                id="new-event-name"
                type="text"
                required
                placeholder="Founders & Coffee Morning"
                value={newEvent.name}
                onChange={update('name')}
                className="input-dark"
              />
            </div>

            <div className="sm:col-span-2">
              <span className="field-label">Event artwork</span>
              <div className="flex items-center gap-4">
                <label className="relative cursor-pointer group shrink-0" aria-label="Upload event artwork">
                  <span className={`flex w-28 h-20 items-center justify-center overflow-hidden rounded-2xl transition-colors duration-200 ${
                    imagePreview
                      ? 'shadow-[0_0_0_2px_#E040FB]'
                      : 'bg-white/5 border border-dashed border-white/20 group-hover:border-accent/60'
                  }`}>
                    {imagePreview ? (
                      <img src={imagePreview} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <ImagePlus className="w-6 h-6 text-text-secondary" />
                    )}
                  </span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handleImageChange} />
                </label>
                <div className="min-w-0">
                  <p className="text-sm text-text-secondary">
                    {imageFile ? imageFile.name : 'JPEG, PNG or WebP, up to 5MB.'}
                  </p>
                  {imagePreview && (
                    <button
                      type="button"
                      onClick={() => { setImageFile(null); setImagePreview(null); }}
                      className="mt-1 text-sm font-medium text-text-secondary hover:text-white"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="new-event-category" className="field-label">Category</label>
              <select id="new-event-category" value={newEvent.category} onChange={update('category')} className="input-dark">
                <option value="tech_business">Tech & business</option>
                <option value="party">Party & nightlife</option>
                <option value="creative_arts">Creative & arts</option>
                <option value="vip_lounge">VIP lounge</option>
              </select>
            </div>

            <div>
              <label htmlFor="new-event-area" className="field-label">Area</label>
              <input
                id="new-event-area"
                type="text"
                required
                placeholder="Kabulonga, Lusaka"
                value={newEvent.area}
                onChange={update('area')}
                className="input-dark"
              />
            </div>

            <div>
              <label htmlFor="new-event-date" className="field-label">Date</label>
              <input id="new-event-date" type="date" required value={newEvent.date} onChange={update('date')} className="input-dark" />
            </div>

            <div>
              <label htmlFor="new-event-time" className="field-label">Start time</label>
              <input id="new-event-time" type="time" value={newEvent.time} onChange={update('time')} className="input-dark" />
            </div>

            <div>
              <label htmlFor="new-event-price" className="field-label">Ticket price (ZMW)</label>
              <input
                id="new-event-price"
                type="number"
                min="0"
                inputMode="numeric"
                placeholder="0 for free"
                value={newEvent.ticketPrice}
                onChange={(e) => setNewEvent({ ...newEvent, ticketPrice: Number(e.target.value) })}
                className="input-dark"
              />
            </div>
          </div>

          <div>
            <label htmlFor="new-event-description" className="field-label">Description</label>
            <textarea
              id="new-event-description"
              rows="4"
              placeholder="The vibe, who's coming, and what to expect."
              value={newEvent.description}
              onChange={update('description')}
              className="input-dark resize-none"
            />
          </div>

          {formError && (
            <p role="alert" className="text-sm text-red">
              {formError}
            </p>
          )}

          <button type="submit" className="btn-accent w-full sm:w-auto sm:px-8">
            Publish event
          </button>
        </form>
      )}
    </div>
  );
}
