import { useEffect, useRef, useState } from 'react';
import { LayerClosingContext, useLayerClosing } from '../hooks/useLayerClosing';

// Keep modal focus/scroll ownership until its short exit has finished.
export default function Presence({ visible, children }) {
  const inheritedClosing = useLayerClosing();
  const [retained, setRetained] = useState(visible);
  const last = useRef(children);
  if (visible) last.current = children;
  useEffect(() => {
    if (visible) {
      setRetained(true);
      return;
    }
    const delay = window.matchMedia?.('(prefers-reduced-motion: reduce)')
      .matches
      ? 0
      : 140;
    const timer = setTimeout(() => setRetained(false), delay);
    return () => clearTimeout(timer);
  }, [visible]);
  if (!visible && !retained) return null;
  const closing = inheritedClosing || !visible;
  const blockInteraction = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  return (
    <LayerClosingContext.Provider value={closing}>
      <div
        className="motion-layer"
        data-state={closing ? 'closing' : 'open'}
        inert={closing ? '' : undefined}
        aria-hidden={closing || undefined}
      >
        {visible ? children : last.current}
      </div>
      {closing && !inheritedClosing && (
        <div
          className="layer-exit-shield"
          aria-hidden="true"
          onPointerDown={blockInteraction}
          onClick={blockInteraction}
        />
      )}
    </LayerClosingContext.Provider>
  );
}
