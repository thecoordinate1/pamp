import { useEffect, useState } from 'react';
import { Share, X } from 'lucide-react';

const DISMISS_KEY = 'pamp_install_dismissed_at';
const DISMISS_DAYS = 14;

function recentlyDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return Boolean(at) && Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIOS() {
  const ua = window.navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
}

// Invites people to add PAMP to their home screen: the native prompt on Android/Chrome,
// short instructions on iOS Safari (which has no install API).
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [mode, setMode] = useState(null); // 'native' | 'ios' | null

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return undefined;

    const handlePrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setMode('native');
    };
    const handleInstalled = () => setMode(null);

    window.addEventListener('beforeinstallprompt', handlePrompt);
    window.addEventListener('appinstalled', handleInstalled);
    const timer = isIOS() ? setTimeout(() => setMode('ios'), 4000) : null;

    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt);
      window.removeEventListener('appinstalled', handleInstalled);
      clearTimeout(timer);
    };
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Storage unavailable; the prompt simply returns next visit.
    }
    setMode(null);
  };

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (outcome === 'accepted') setMode(null);
    else dismiss();
  };

  if (!mode) return null;

  return (
    <div
      role="dialog"
      aria-label="Install PAMP"
      className="fixed z-40 inset-x-4 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] md:inset-x-auto md:right-8 md:bottom-8 md:w-96 animate-sheet-in"
    >
      <div className="rounded-3xl p-4 flex items-start gap-3 bg-[#1C1C1E]/95 backdrop-blur-xl border border-white/10 shadow-[0_16px_48px_rgba(0,0,0,0.6)]">
        <img src="/icons/icon-192.png" alt="" className="w-12 h-12 rounded-xl shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-white">Add PAMP to your home screen</p>
          {mode === 'ios' ? (
            <p className="mt-0.5 text-sm text-text-secondary">
              Tap <Share className="inline w-4 h-4 -mt-0.5 text-white" aria-label="Share" /> then{' '}
              <span className="text-white">Add to Home Screen</span>.
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-text-secondary">Opens like an app and loads fast on mobile data.</p>
          )}
          {mode === 'native' && (
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={install} className="btn-accent min-h-9 h-9 px-4 text-sm">
                Install
              </button>
              <button type="button" onClick={dismiss} className="btn-secondary min-h-9 h-9 px-4 text-sm">
                Not now
              </button>
            </div>
          )}
        </div>
        <button type="button" onClick={dismiss} className="btn-icon w-8 h-8 bg-transparent" aria-label="Dismiss">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
