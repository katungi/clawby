import { useState, useEffect } from 'react';
import { AppConfig, loadConfig } from './lib/config';
import { SetupScreen } from './components/SetupScreen';
import { NotchOverlay } from './components/NotchOverlay';

export function App() {
  const [config, setConfig] = useState<AppConfig | null>(loadConfig);
  const [configured, setConfigured] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const saved = loadConfig();
    if (saved && saved.openclawToken && saved.deepgramKey && saved.openaiKey) {
      setConfigured(true);
      setConfig(saved);
    }
  }, []);

  // Listen for "Settings" from the system tray menu
  useEffect(() => {
    if (!('__TAURI__' in window)) return;

    let cleanup: (() => void) | undefined;
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen('tray-settings', () => {
        setShowSettings(true);
      }).then(unlisten => { cleanup = unlisten; });
    });

    return () => { cleanup?.(); };
  }, []);

  function handleConnected(cfg: AppConfig) {
    setConfig(cfg);
    setConfigured(true);
    setShowSettings(false);
  }

  function handleCloseSettings() {
    setShowSettings(false);
  }

  // Show settings if not configured OR if user opened settings
  // Settings panel floats in the center of the fullscreen transparent window
  if (!configured || showSettings) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          width: 500,
          maxHeight: 650,
          background: '#0a0a0a',
          borderRadius: '12px',
          overflow: 'hidden',
        }}>
          <SetupScreen
            onConnect={handleConnected}
            onCancel={configured ? handleCloseSettings : undefined}
          />
        </div>
      </div>
    );
  }

  // Notch overlay — transparent fullscreen, pill at top center via CSS
  return <NotchOverlay config={config!} />;
}
