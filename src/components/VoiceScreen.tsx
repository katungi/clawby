import { useEffect, useCallback } from 'react';
import { AppConfig } from '../lib/config';
import { useVoiceSession } from '../hooks/useVoiceSession';
import { useTauriIntegration } from '../hooks/useTauriIntegration';
import { Clawby } from './Clawby';
import { EdgeGlow } from './EdgeGlow';
import { MicButton } from './MicButton';
import { Transcript } from './Transcript';

interface VoiceScreenProps {
  config: AppConfig;
  onSettings: () => void;
}

const GLOW_COLORS: Record<string, string> = {
  listening: '#8b5cf6',
  thinking: '#6366f1',
  speaking: '#10b981',
};

const STATE_LABELS: Record<string, string> = {
  idle: 'ready',
  listening: 'listening...',
  thinking: 'thinking...',
  speaking: 'speaking...',
};

const STATE_LABEL_COLORS: Record<string, string> = {
  idle: '#555',
  listening: '#8b5cf6',
  thinking: '#6366f1',
  speaking: '#10b981',
};

export function VoiceScreen({ config, onSettings }: VoiceScreenProps) {
  const { state, userTranscript, aiResponse, startConversation, interrupt, cancel } =
    useVoiceSession(config);

  // Global hotkey toggle via Tauri (Cmd+Shift+Space)
  const handleToggle = useCallback(() => {
    if (state === 'idle') {
      startConversation();
    } else if (state === 'listening') {
      cancel();
    } else if (state === 'speaking') {
      interrupt();
    } else {
      cancel();
    }
  }, [state, startConversation, interrupt, cancel]);

  useTauriIntegration(handleToggle);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.code === 'Space') {
        e.preventDefault();
        if (state === 'idle') startConversation();
        else if (state === 'listening') {
          cancel();
        } else if (state === 'speaking') interrupt();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        cancel();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state, startConversation, interrupt, cancel]);

  function handleMicClick() {
    if (state === 'idle') startConversation();
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
      <EdgeGlow active={state !== 'idle'} color={GLOW_COLORS[state] || '#8b5cf6'} />
      <button className="settings-btn" onClick={onSettings} title="Settings">⚙</button>

      <Clawby expression={state} size={160} />
      <div className="state-label" style={{ color: STATE_LABEL_COLORS[state] }}>
        {STATE_LABELS[state]}
      </div>
      <MicButton state={state} onClick={handleMicClick} />
      <Transcript userText={userTranscript} aiText={aiResponse} />

      <div className="hint">
        press <kbd>Space</kbd> to talk · <kbd>Esc</kbd> to stop
      </div>
    </div>
  );
}
