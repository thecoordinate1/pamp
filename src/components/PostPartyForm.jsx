import { useState } from 'react';

const vibeOptions = [
  'Afrobeats & Amapiano', 'Throwback / Retro', 'Pool Party', 'EDM / Rave',
  'Elegant / Chic', 'Day Party / Brunch', 'Masquerade / Mystery', 'Zambian Music Only',
  'House Party', 'Kickback', 'Cookout', 'Other'
];

const areaOptions = [
  'Kabulonga, Lusaka', 'Roma, Lusaka', 'Ibex Hill, Lusaka', 'Woodlands, Lusaka',
  'Sunningdale, Lusaka', 'Chelstone, Lusaka', 'Longacres, Lusaka', 'PHI, Lusaka',
  'Meanwood, Lusaka', 'Olympia, Lusaka', 'Ndola, Copperbelt', 'Kitwe, Copperbelt',
  'Livingstone', 'Other'
];

const initialForm = {
  name: '', date: '', time: '', area: '', vibe: '', dressCode: '', whatsapp: '', description: ''
};

export default function PostPartyForm({ onSubmit }) {
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);

  const updateField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Party name is required';
    if (!form.date) errs.date = 'Date is required';
    if (!form.time) errs.time = 'Time is required';
    if (!form.area) errs.area = 'Area is required';
    if (!form.vibe) errs.vibe = 'Pick a vibe';
    if (!form.dressCode.trim()) errs.dressCode = 'Dress code is required';
    if (!form.whatsapp.trim()) errs.whatsapp = 'WhatsApp contact is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    onSubmit({
      id: Date.now(),
      ...form,
      host: 'You',
      image: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=600&h=400&fit=crop',
      rsvpCount: 0,
      fullAddress: 'Address will be revealed to approved guests',
      description: form.description || `A ${form.vibe} party at ${form.area}. Come through! 🎉`,
    });

    setSubmitted(true);
    setForm(initialForm);
    setTimeout(() => setSubmitted(false), 4000);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <form onSubmit={handleSubmit} className="glass-card p-6 md:p-8 space-y-5">
        {/* Party Name */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">Party Name *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="e.g. Neon Nights 2.0"
            className="input-dark"
          />
          {errors.name && <p className="text-red text-xs mt-1">{errors.name}</p>}
        </div>

        {/* Date & Time */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Date *</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => updateField('date', e.target.value)}
              className="input-dark"
            />
            {errors.date && <p className="text-red text-xs mt-1">{errors.date}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Time *</label>
            <input
              type="time"
              value={form.time}
              onChange={(e) => updateField('time', e.target.value)}
              className="input-dark"
            />
            {errors.time && <p className="text-red text-xs mt-1">{errors.time}</p>}
          </div>
        </div>

        {/* Area & Vibe */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Area / Neighborhood *</label>
            <select
              value={form.area}
              onChange={(e) => updateField('area', e.target.value)}
              className="input-dark"
            >
              <option value="">Select area</option>
              {areaOptions.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            {errors.area && <p className="text-red text-xs mt-1">{errors.area}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Vibe / Theme *</label>
            <select
              value={form.vibe}
              onChange={(e) => updateField('vibe', e.target.value)}
              className="input-dark"
            >
              <option value="">Select vibe</option>
              {vibeOptions.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            {errors.vibe && <p className="text-red text-xs mt-1">{errors.vibe}</p>}
          </div>
        </div>

        {/* Dress Code */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">Dress Code *</label>
          <input
            type="text"
            value={form.dressCode}
            onChange={(e) => updateField('dressCode', e.target.value)}
            placeholder="e.g. All Black, Swimwear, Chitenge Drip"
            className="input-dark"
          />
          {errors.dressCode && <p className="text-red text-xs mt-1">{errors.dressCode}</p>}
        </div>

        {/* WhatsApp */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">Host WhatsApp Contact *</label>
          <input
            type="text"
            value={form.whatsapp}
            onChange={(e) => updateField('whatsapp', e.target.value)}
            placeholder="+260 97..."
            className="input-dark"
          />
          {errors.whatsapp && <p className="text-red text-xs mt-1">{errors.whatsapp}</p>}
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">Description (optional)</label>
          <textarea
            value={form.description}
            onChange={(e) => updateField('description', e.target.value)}
            placeholder="Tell people what to expect..."
            rows={3}
            className="input-dark resize-none"
          />
        </div>

        {/* Submit */}
        <button type="submit" className="btn-accent w-full text-base py-3">
          🎉 Post Your Party
        </button>

        {/* Success message */}
        {submitted && (
          <div className="bg-green-dim border border-green/30 rounded-xl p-4 text-green text-sm text-center fade-in-up">
            ✅ Your party has been posted! Check the Browse section to see it live.
          </div>
        )}
      </form>
    </div>
  );
}
