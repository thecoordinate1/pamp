import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import Sheet from './Sheet';
import { useAuth } from '../lib/authContext';
import { useMyProfile, useUpdateProfile } from '../lib/queries';

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

export default function ProfileSheet({ open, onClose }) {
  const { user, signOut } = useAuth();
  const { data: profile, isLoading } = useMyProfile(user?.id);
  const updateProfile = useUpdateProfile(user?.id);

  const [form, setForm] = useState({
    displayName: '',
    headline: '',
    lookingFor: '',
    socialPlatform: '',
    socialHandle: '',
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
    });
  }, [profile]);

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

    try {
      await updateProfile.mutateAsync({ ...form, socialHandle: handle });
      setSaved(true);
    } catch (err) {
      setError(err.message ?? 'Could not save your profile. Try again.');
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
        </form>
      )}
    </Sheet>
  );
}
