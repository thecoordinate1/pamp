import { useEffect, useRef, useState } from 'react';

// For a link made on demand (a pass's private link, say). Opens the system
// share sheet where there is one, otherwise copies. Says which happened.
export async function shareOrCopy({ title, text, url }) {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

// Copy and native share for a link. On phones, share opens the system sheet
// (WhatsApp, Instagram, SMS); everywhere else it falls back to copying.
export function useShareLink(url, { title, text } = {}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copy = async () => {
    setError('');
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy. Press and hold the link to copy it instead.');
    }
  };

  const share = async () => {
    setError('');
    try {
      await navigator.share({ title, text, url });
    } catch (err) {
      // Closing the share sheet is not an error worth showing.
      if (err?.name !== 'AbortError') await copy();
    }
  };

  return { copy, share, copied, canShare, error };
}
