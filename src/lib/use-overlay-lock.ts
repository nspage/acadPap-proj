import { useEffect, useRef } from 'react';

/**
 * Phone back / Escape dismisses the overlay. Body scroll stays locked
 * while it is open. Close via the button must not leave a stray history entry.
 */
export function useOverlayLock(onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const token = Math.random().toString(36).slice(2);
    history.pushState({ overlay: token }, '');
    let closed = false;

    const finish = () => {
      if (closed) return;
      closed = true;
      onCloseRef.current();
    };

    const onPop = () => finish();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (history.state && history.state.overlay === token) {
        history.back();
        return;
      }
      finish();
    };

    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
      if (!closed && history.state && history.state.overlay === token) {
        closed = true;
        history.back();
      }
    };
  }, []);
}
