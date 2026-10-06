import { useEffect, useId, useRef, useState } from 'react';
import { Camera, Image as ImageIcon } from 'lucide-react';

const ACCEPT = 'image/jpeg,image/png,image/webp';

// A photo you tap to change. The tap opens a small menu: take a new photo with
// the camera, or choose one already on the phone. `capture` makes phones open
// the camera straight away, so only the camera input has it.
//
// `children` is what shows on the button, usually the current picture. `align`
// centres the menu under a picture in the middle of the screen.
export default function PhotoPicker({ onFile, disabled = false, label, children, className = '', align = 'start' }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapRef = useRef(null);
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  // Closes on a tap anywhere else, or Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (e) => {
    const file = e.target.files?.[0];
    // Cleared so picking the same photo again still fires a change.
    e.target.value = '';
    if (file) onFile(file);
  };

  const choose = (ref) => {
    setOpen(false);
    ref.current?.click();
  };

  return (
    <div ref={wrapRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-full disabled:opacity-60"
      >
        {children}
        <span className="absolute -bottom-0.5 -right-0.5 flex w-7 h-7 items-center justify-center rounded-full bg-accent text-white">
          <Camera className="w-4 h-4" />
        </span>
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          className={`absolute top-full z-20 mt-2 w-52 ${align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0'} overflow-hidden rounded-2xl border border-white/10 bg-surface-light py-1 shadow-xl`}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => choose(cameraRef)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-white hover:bg-white/8"
          >
            <Camera className="w-4 h-4 text-accent" />
            Take a photo
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => choose(galleryRef)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-white hover:bg-white/8"
          >
            <ImageIcon className="w-4 h-4 text-accent" />
            Choose from phone
          </button>
        </div>
      )}

      <input ref={cameraRef} type="file" accept={ACCEPT} capture="user" className="sr-only" tabIndex={-1} onChange={pick} />
      <input ref={galleryRef} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} onChange={pick} />
    </div>
  );
}
