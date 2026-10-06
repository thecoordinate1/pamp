import { useState } from 'react';
import Sheet from './Sheet';
import PasswordInput from './PasswordInput';
import { useAuth } from '../lib/authContext';

const MIN_PASSWORD = 8;

// Shown after someone follows a password reset link. Supabase signs them in
// with a recovery session; this is where they actually choose the new password.
export default function PasswordResetSheet() {
  const { recovering, updatePassword, finishRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    const { error: err } = await updatePassword(password);
    setBusy(false);
    if (err) {
      setError(err.message ?? 'Could not save that password. Try again.');
      return;
    }
    setPassword('');
    setConfirm('');
  };

  return (
    <Sheet
      open={recovering}
      onClose={finishRecovery}
      title="Set a new password"
      subtitle="You followed a reset link. Choose the password you will sign in with."
      footer={
        <button type="submit" form="password-reset-form" disabled={busy} className="btn-accent w-full">
          {busy ? 'Saving…' : 'Save new password'}
        </button>
      }
    >
      <form id="password-reset-form" onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="new-password" className="field-label">New password</label>
          <PasswordInput
            id="new-password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={`At least ${MIN_PASSWORD} characters`}
            className="input-dark"
          />
        </div>
        <div>
          <label htmlFor="confirm-password" className="field-label">Type it again</label>
          <PasswordInput
            id="confirm-password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="input-dark"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
}
