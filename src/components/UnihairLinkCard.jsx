import { useState } from 'react';
import { Link2, Scissors } from 'lucide-react';
import { useLinkUnihair, useUnihairLink, useUnlinkUnihair } from '../lib/queries';

// The same alphabet as the code UniHair shows: no 0/O or 1/I.
const formatCode = (typed) => {
  const clean = typed.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 8);
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
};

// Links this PAMP account to the person's UniHair account, so UniHair points
// count towards passes here. Hidden until linking is switched on.
export default function UnihairLinkCard({ userId }) {
  const { data: status } = useUnihairLink(userId);
  const link = useLinkUnihair(userId);
  const unlink = useUnlinkUnihair(userId);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [confirmingUnlink, setConfirmingUnlink] = useState(false);

  if (!status) return null;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (code.replace('-', '').length !== 8) {
      setError('Enter all 8 characters of the code from UniHair.');
      return;
    }
    try {
      await link.mutateAsync(code);
      setCode('');
    } catch (err) {
      setError(err.message);
    }
  };

  const doUnlink = async () => {
    setError('');
    try {
      await unlink.mutateAsync();
      setConfirmingUnlink(false);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section aria-labelledby="unihair-heading" className="card mb-6 p-4">
      <h3 id="unihair-heading" className="flex items-center gap-1.5 text-[13px] font-medium text-text-muted">
        <Link2 className="w-3.5 h-3.5 text-accent" />
        UniHair points
      </h3>

      {status.linked ? (
        <>
          <p className="mt-1 font-semibold text-white">
            {status.unihair == null
              ? 'UniHair is not answering right now'
              : `${status.unihair.toLocaleString()} UniHair points to use here`}
          </p>
          <p className="text-[13px] text-text-muted">Linked to {status.name || 'your UniHair account'}</p>
          <p className="mt-2 text-[13px] text-text-secondary">
            Points you earned on UniHair (bookings and delivered orders) count towards passes here. When you
            use some, they move from UniHair to PAMP as you pay, and stay in PAMP after that. Sign-up and
            referral bonuses stay in UniHair.
          </p>
          {confirmingUnlink ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <p className="text-[13px] text-text-secondary">Unlink? Points already moved stay where they are.</p>
              <button type="button" onClick={doUnlink} disabled={unlink.isPending} className="btn-secondary h-9 min-h-9 px-3 text-sm">
                {unlink.isPending ? 'Unlinking…' : 'Yes, unlink'}
              </button>
              <button type="button" onClick={() => setConfirmingUnlink(false)} className="text-sm text-text-secondary hover:text-white">
                Keep it
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingUnlink(true)}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-white"
            >
              <Scissors className="w-4 h-4" />
              Unlink UniHair
            </button>
          )}
        </>
      ) : (
        <form onSubmit={submit} className="mt-1">
          <p className="text-sm text-text-secondary">
            Use your UniHair points on PAMP passes. In UniHair, open <span className="text-white">Account</span>, then{' '}
            <span className="text-white">Link PAMP</span>, and enter the code it shows here.
          </p>
          <div className="mt-3 flex gap-2">
            <label htmlFor="unihair-code" className="sr-only">
              Code from UniHair
            </label>
            <input
              id="unihair-code"
              value={code}
              onChange={(e) => {
                setCode(formatCode(e.target.value));
                setError('');
              }}
              placeholder="K7QX-4M2P"
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={9}
              className="input-dark flex-1 font-mono tracking-widest"
            />
            <button type="submit" disabled={link.isPending} className="btn-accent px-5">
              {link.isPending ? 'Linking…' : 'Link'}
            </button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-2 text-[13px] text-red">
          {error}
        </p>
      )}
    </section>
  );
}
