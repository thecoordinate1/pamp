import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

// Bottom sheet on phones, centered dialog on larger screens.
export default function Sheet({ open, onClose, title, subtitle, children, footer, size = 'md' }) {
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement;
    const handleKey = (e) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKey);
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKey);
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const width = size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg';

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-6">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-backdrop-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`relative w-full ${width} max-h-[92vh] flex flex-col bg-[#161618] border border-white/10 rounded-t-[28px] sm:rounded-[28px] shadow-[0_32px_80px_rgba(0,0,0,0.6)] animate-sheet-in outline-none`}
      >
        <div className="sm:hidden mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-white/20" aria-hidden="true" />

        <header className="flex items-start justify-between gap-4 px-6 pt-4 sm:pt-6 pb-4">
          <div className="min-w-0">
            {title && (
              <h2 id={titleId} className="text-xl font-bold text-white">
                {title}
              </h2>
            )}
            {subtitle && <p className="text-sm text-text-secondary mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="btn-icon w-9 h-9" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="overflow-y-auto overscroll-contain px-6 pb-6 flex-1">{children}</div>

        {footer && (
          <footer className="px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-white/5">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
