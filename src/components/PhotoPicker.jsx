import { forwardRef, useRef } from 'react';
import { Camera, Image as ImageIcon } from 'lucide-react';

const ACCEPT = 'image/jpeg,image/png,image/webp';

// Two ways to add a photo: the camera, or a picture already on the phone.
// `capture` makes phones open the camera straight away, so only the first
// input has it; the second opens the gallery and files.
//
// The forwarded ref is the gallery input, so a caller can open it from
// elsewhere, such as a tap on the current picture.
const PhotoPicker = forwardRef(function PhotoPicker(
  { onFile, disabled = false, className = '', takeLabel = 'Take a photo', chooseLabel = 'Choose from phone' },
  galleryRef
) {
  const cameraRef = useRef(null);

  const pick = (e) => {
    const file = e.target.files?.[0];
    // Cleared so picking the same photo again still fires a change.
    e.target.value = '';
    if (file) onFile(file);
  };

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => cameraRef.current?.click()}
        className="btn-secondary h-9 min-h-9 px-3 text-sm"
      >
        <Camera className="w-4 h-4" />
        {takeLabel}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => galleryRef?.current?.click()}
        className="btn-secondary h-9 min-h-9 px-3 text-sm"
      >
        <ImageIcon className="w-4 h-4" />
        {chooseLabel}
      </button>
      <input ref={cameraRef} type="file" accept={ACCEPT} capture="user" className="sr-only" tabIndex={-1} onChange={pick} />
      <input ref={galleryRef} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} onChange={pick} />
    </div>
  );
});

export default PhotoPicker;
