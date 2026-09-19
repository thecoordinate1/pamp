import Sheet from './Sheet';
import { useAuth } from '../lib/authContext';

// Browsing PAMP needs no account. This appears only when someone tries to do
// something that writes: RSVP, buy a pass, request a facecard or host.
export default function SignInSheet({ open, onClose, action = 'continue' }) {
  const { signInWithGoogle, configured } = useAuth();

  return (
    <Sheet open={open} onClose={onClose} title="Sign in to PAMP" subtitle={`You need an account to ${action}.`}>
      <div className="py-2">
        <p className="text-text-secondary">
          Keep your passes in one place, RSVP to events and get on guest lists.
        </p>

        {configured ? (
          <button
            type="button"
            onClick={() => signInWithGoogle()}
            className="btn-secondary w-full mt-6 bg-white text-[#1f1f1f] hover:bg-white/90"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z" />
              <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z" />
              <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.8l4-3.1z" />
              <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.7l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
            </svg>
            Continue with Google
          </button>
        ) : (
          <p className="mt-6 rounded-2xl bg-red/10 px-4 py-3 text-sm text-red">
            Sign-in is not configured yet. Add your Supabase keys to .env.local.
          </p>
        )}

        <p className="mt-4 text-center text-[13px] text-text-muted">
          We only ever show your name and the social handle you choose.
        </p>
      </div>
    </Sheet>
  );
}
