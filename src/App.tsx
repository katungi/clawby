import { useState, useEffect } from 'react';
import { AppConfig, loadConfig } from './lib/config';
import { SetupScreen } from './components/SetupScreen';
import { VoiceScreen } from './components/VoiceScreen';

export function App() {
  const [config, setConfig] = useState<AppConfig | null>(loadConfig);
  const [configured, setConfigured] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const saved = loadConfig();
    if (saved && saved.openclawToken && saved.deepgramKey && saved.openaiKey) {
      setConfigured(true);
      setConfig(saved);
      // Switch to orb mode immediately
      import('./lib/tauriWindow').then(({ setOrbMode }) => setOrbMode());
    }
    // If not configured, window stays in settings mode (default size)
  }, []);

  async function handleConnected(cfg: AppConfig) {
    setConfig(cfg);
    setConfigured(true);
    setShowSettings(false);

    const { setOrbMode } = await import('./lib/tauriWindow');
    await setOrbMode();
  }

  async function handleOpenSettings() {
    setShowSettings(true);

    const { setSettingsMode } = await import('./lib/tauriWindow');
    await setSettingsMode();
  }

  async function handleCloseSettings() {
    setShowSettings(false);

    const { setOrbMode } = await import('./lib/tauriWindow');
    await setOrbMode();
  }

  // Show settings if not configured OR if user opened settings
  if (!configured || showSettings) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        background: '#0a0a0a',
        borderRadius: '12px',
        overflow: 'hidden',
      }}>
        <SetupScreen
          onConnect={handleConnected}
          onCancel={configured ? handleCloseSettings : undefined}
        />
      </div>
    );
  }

  // Show floating orb
  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: 'transparent',
    }}>
      <VoiceScreen config={config!} onSettings={handleOpenSettings} />
    </div>
  );
}
