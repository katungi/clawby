import { useEffect } from 'react';

const isTauri = () => '__TAURI__' in window;

export function useTauriIntegration(onActivate: () => void) {
  useEffect(() => {
    if (!isTauri()) return;

    let cleanup: (() => void) | undefined;

    const setup = async () => {
      const { listen } = await import('@tauri-apps/api/event');

      // Listen for both hotkey and tray click (unified "activate" event)
      const unlisten = await listen('activate', () => {
        onActivate();
      });
      cleanup = unlisten;
    };

    setup();
    return () => { cleanup?.(); };
  }, [onActivate]);
}
