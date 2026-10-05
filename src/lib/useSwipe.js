import { useCallback, useRef, useState } from 'react';

// Pointer-event drag hook for swipe cards.
// Returns { offsetX, rotation, isDragging, bind } where `bind` is spread onto
// the draggable element. Calls onLike (drag right) or onPass (drag left) once
// the card crosses `threshold` pixels.
export function useSwipe({ onLike, onPass, threshold = 90 } = {}) {
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(null);
  const pointerId = useRef(null);

  const onPointerDown = useCallback((e) => {
    // Only the first touch, or the left mouse button.
    if (!e.isPrimary || e.button !== 0) return;
    pointerId.current = e.pointerId;
    startX.current = e.clientX;
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e) => {
    if (e.pointerId !== pointerId.current) return;
    setOffsetX(e.clientX - startX.current);
  }, []);

  const onPointerUp = useCallback((e) => {
    if (e.pointerId !== pointerId.current) return;
    const dx = e.clientX - startX.current;
    setIsDragging(false);
    setOffsetX(0);
    startX.current = null;
    pointerId.current = null;
    if (dx > threshold) onLike?.();
    else if (dx < -threshold) onPass?.();
  }, [threshold, onLike, onPass]);

  const onPointerCancel = useCallback(() => {
    setIsDragging(false);
    setOffsetX(0);
    startX.current = null;
    pointerId.current = null;
  }, []);

  return {
    offsetX,
    rotation: offsetX * 0.08,
    isDragging,
    bind: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
  };
}
