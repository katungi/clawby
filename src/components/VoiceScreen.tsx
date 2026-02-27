import { useEffect, useCallback } from 'react';
import { AppConfig } from '../lib/config';
import { useVoiceSession } from '../hooks/useVoiceSession';
import { useTauriIntegration } from '../hooks/useTauriIntegration';
import ClawbyOrb from './ClawbyOrb';

interface VoiceScreenProps {
  config: AppConfig;
}

export function VoiceScreen({ config }: VoiceScreenProps) {
  const { state, startConversation, interrupt, cancel } =
    useVoiceSession(config);

  // Activation handler — Siri-like: immediately start listening
  const handleActivate = useCallback(async () => {
    if (state === 'listening') {
      cancel();
      return;
    }

    if (state === 'speaking') {
      interrupt();
      return;
    }

    // Ensure orb mode
    const { setOrbMode } = await import('../lib/tauriWindow');
    await setOrbMode();

    startConversation();
  }, [state, cancel, interrupt, startConversation]);

  useTauriIntegration(handleActivate);

  // Keyboard controls
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.code === 'Space') {
        e.preventDefault();
        if (state === 'sleeping') startConversation();
        else if (state === 'listening') cancel();
        else if (state === 'speaking') interrupt();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        cancel();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state, startConversation, interrupt, cancel]);

  // Auto-hide after 10s idle
  useEffect(() => {
    if (state !== 'sleeping') return;

    const timer = setTimeout(async () => {
      const { hideWindow } = await import('../lib/tauriWindow');
      await hideWindow();
    }, 10000);

    return () => clearTimeout(timer);
  }, [state]);

  function handleOrbClick() {
    if (state === 'sleeping') startConversation();
    else if (state === 'listening') cancel();
    else if (state === 'speaking') interrupt();
  }

  return (
    <div className={`voice-screen st-${state}`}>
      {/* Drag region for Tauri (replaces title bar) */}
      <div
        data-tauri-drag-region
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '40px',
          cursor: 'grab',
          zIndex: 9999,
        }}
      />
      <div onClick={handleOrbClick} style={{ cursor: 'pointer' }}>
        <ClawbyOrb state={state} size={200} />
      </div>
    </div>
  );
}
