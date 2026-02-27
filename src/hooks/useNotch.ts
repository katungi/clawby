import { useEffect, useRef, useState } from 'react';
import type { AppState } from '../lib/types';

const isTauri = Boolean(typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__);

export function useNotch(state: AppState) {
  const [isExpanded, setIsExpanded] = useState(false);
  const prevStateRef = useRef<AppState>('sleeping');

  // Configure native window properties on mount (level, behavior, transparency)
  useEffect(() => {
    if (!isTauri) return;
    import('@tauri-apps/api/core').then(({ invoke }) =>
      invoke('plugin:notch|setup_notch').catch(console.error)
    );
  }, []);

  // Toggle cursor events: click-through when idle, interactive when expanded
  useEffect(() => {
    const shouldExpand = state !== 'sleeping' && state !== 'waking';

    if (shouldExpand && !isExpanded) {
      setIsExpanded(true);
      if (isTauri) {
        import('@tauri-apps/api/window').then(({ getCurrentWindow }) =>
          getCurrentWindow().setIgnoreCursorEvents(false).catch(console.error)
        );
      }
    } else if (!shouldExpand && isExpanded) {
      setIsExpanded(false);
      if (isTauri) {
        import('@tauri-apps/api/window').then(({ getCurrentWindow }) =>
          getCurrentWindow().setIgnoreCursorEvents(true).catch(console.error)
        );
      }
    }

    prevStateRef.current = state;
  }, [state, isExpanded]);

  return { isExpanded };
}
