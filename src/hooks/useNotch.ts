import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect, useRef, useState } from 'react';
import type { AppState } from '../lib/types';

export function useNotch(state: AppState) {
  const [isExpanded, setIsExpanded] = useState(false);
  const prevStateRef = useRef<AppState>('sleeping');

  // Configure native window properties on mount (level, behavior, transparency)
  useEffect(() => {
    invoke('plugin:notch|setup_notch').catch(console.error);
  }, []);

  // Toggle cursor events: click-through when idle, interactive when expanded
  useEffect(() => {
    const shouldExpand = state !== 'sleeping' && state !== 'waking';

    if (shouldExpand && !isExpanded) {
      setIsExpanded(true);
      getCurrentWindow().setIgnoreCursorEvents(false).catch(console.error);
    } else if (!shouldExpand && isExpanded) {
      setIsExpanded(false);
      getCurrentWindow().setIgnoreCursorEvents(true).catch(console.error);
    }

    prevStateRef.current = state;
  }, [state, isExpanded]);

  return { isExpanded };
}
