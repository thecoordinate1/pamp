import { useState } from 'react';
import { MailCheck } from 'lucide-react';
import Sheet from './Sheet';
import { useAuth } from '../lib/authContext';

const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Supabase's built-in mailer allows very few messages per hour, and that error
// reads like a bug unless it is named plainly.
const friendlyError = (message = '') => {
  const m = message.toLowerCase();
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Too many emails sent in the last hour. Wait a little and try again.';
  }
  if (m.includes('email not confirmed')) {
    return 'Confirm your email first, then sign in. Check your inbox and spam.';
  }
  if (m.includes('invalid login credentials')) {
    return 'That email and password do not match an account.';
  }
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'That email already has an account. Sign in instead.';
  }
  return message || 'Something went wrong. Try again.';
};

// Browsing PAMP needs no account. This appears only when someone tries to do
// something that writes: RSVP, buy a pass, request a facecard or host.
export default function SignInSheet({ open, onClose, action = 'continue' }) {
  const { signUpWithEmail, signInWithEmail, resendConfirmation, resetPassword, configured } = useAuth();

  const [mode, setMode] = useState('signin'); // 'signin' | 'signup' | 'forgot' | 'sent'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const clearMessages = () => {
    setError('');
    setNotice('');
  };

  const close = () => {
    setMode('signin');
    setEmail('');
    setPassword('');
    clearMessages();
    onClose();
  };

  const submit = async (e) => {
    e.preventDefault();
    clearMessages();

    if (!EMAIL_RE.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    if (mode !== 'forgot' && password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters for your password.`);
      return;
    }

    setBusy(true);
    try {
      if (mode === 'forgot') {
        const { error: err } = await resetPassword(email.trim());
        if (err) throw err;
        // Deliberately not revealing whether the address has an account.
        setNotice('If that email has an account, a reset link is on its way.');
        return;
      }

      if (mode === 'signup') {
        const { data, error: err } = await signUpWithEmail(email.trim(), password);
        if (err) throw err;
        // Confirmation is required, so a new account has no session yet.
        if (!data.session) {
          setMode('sent');
          return;
        }
        close();
        return;
      }

      const { error: err } = await signInWithEmail(email.trim(), password);
      if (err) throw err;
      close();
    } catch (err) {
      setError(friendlyError(err.message));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    clearMessages();
    setBusy(true);
    try {
      const { error: err } = await resendConfirmation(email.trim());
      if (err) throw err;
      setNotice('Sent again. Check your inbox and spam folder.');
    } catch (err) {
      setError(friendlyError(err.message));
    } finally {
      setBusy(false);
    }
  };

  const title = {
    signin: 'Sign in to PAMP',
    signup: 'Create your account',
    forgot: 'Reset your password',
    sent: 'Check your email',
  }[mode];

  if (!configured) {
    return (
      <Sheet open={open} onClose={close} title="Sign in to PAMP">
        <p className="rounded-2xl bg-red/10 px-4 py-3 text-sm text-red">
          Sign-in is not configured yet. Add your Supabase keys to .env.local.
        </p>
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title={title}
      subtitle={mode === 'signin' ? `You need an account to ${action}.` : undefined}
    >
      {mode === 'sent' ? (
        <div className="py-2 text-center">
          <span className="mx-auto flex w-14 h-14 items-center justify-center rounded-full bg-accent/15 text-accent">
            <MailCheck className="w-7 h-7" />
          </span>
          <p className="mt-4 text-text-secondary">
            We sent a confirmation link to <span className="font-semibold text-white">{email}</span>.
            Click it, then come back and sign in.
          </p>
          {notice && <p role="status" className="mt-4 text-sm text-green">{notice}</p>}
          {error && <p role="alert" className="mt-4 text-sm text-red">{error}</p>}
          <button type="button" onClick={resend} disabled={busy} className="btn-secondary w-full mt-6">
            {busy ? 'Sending...' : 'Send it again'}
          </button>
          <button
            type="button"
            onClick={() => { setMode('signin'); clearMessages(); }}
            className="mt-3 text-sm font-medium text-text-secondary hover:text-white"
          >
            Back to sign in
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="auth-email" className="field-label">Email</label>
            <input
              id="auth-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); clearMessages(); }}
              placeholder="you@example.com"
              className="input-dark"
            />
          </div>

          {mode !== 'forgot' && (
            <div>
              <label htmlFor="auth-password" className="field-label">Password</label>
              <input
                id="auth-password"
                type="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); clearMessages(); }}
                placeholder={`At least ${MIN_PASSWORD} characters`}
                className="input-dark"
              />
            </div>
          )}

          {error && <p role="alert" className="text-sm text-red">{error}</p>}
          {notice && <p role="status" className="text-sm text-green">{notice}</p>}

          <button type="submit" disabled={busy} className="btn-accent w-full">
            {busy
              ? 'Just a moment...'
              : mode === 'signup'
                ? 'Create account'
                : mode === 'forgot'
                  ? 'Send reset link'
                  : 'Sign in'}
          </button>

          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); clearMessages(); }}
              className="text-sm font-medium text-accent hover:text-accent-hover"
            >
              {mode === 'signup' ? 'I already have an account' : 'Create an account'}
            </button>
            {mode !== 'forgot' && (
              <button
                type="button"
                onClick={() => { setMode('forgot'); clearMessages(); }}
                className="text-sm font-medium text-text-secondary hover:text-white"
              >
                Forgot password?
              </button>
            )}
          </div>

          <p className="text-center text-[13px] text-text-muted">
            We only ever show your name and the social handle you choose.
          </p>
        </form>
      )}
    </Sheet>
  );
}
