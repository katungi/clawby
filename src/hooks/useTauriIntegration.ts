import { useEffect } from 'react';

// Check if running inside Tauri
const isTauri = () => '__TAURI__' in window;

export function useTauriIntegration(onToggle: () => void) {
  useEffect(() => {
    if (!isTauri()) return;

    // Listen for global shortcut event emitted from Rust
    const listen = async () => {
      const { listen } = await import('@tauri-apps/api/event');
      const unlisten = await listen('global-shortcut', () => {
        onToggle();
      });
      return unlisten;
    };

    let cleanup: (() => void) | undefined;
    listen().then(unlisten => { cleanup = unlisten; });

    return () => { cleanup?.(); };
  }, [onToggle]);
}
