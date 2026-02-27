import { useEffect, useCallback } from 'react';
import { AppConfig } from '../lib/config';
import { useVoiceSession } from '../hooks/useVoiceSession';
import { useTauriIntegration } from '../hooks/useTauriIntegration';
import { useNotch } from '../hooks/useNotch';
import ClawbyOrb from './ClawbyOrb';
import './NotchOverlay.css';

interface NotchOverlayProps {
  config: AppConfig;
}

export function NotchOverlay({ config }: NotchOverlayProps) {
  const {
    state,
    userTranscript,
    aiResponse,
    startConversation,
    interrupt,
    cancel,
  } = useVoiceSession(config);

  const { isExpanded } = useNotch(state);

  const handleActivate = useCallback(async () => {
    if (state === 'listening') {
      cancel();
      return;
    }

    if (state === 'speaking') {
      interrupt();
      return;
    }

    startConversation();
  }, [state, cancel, interrupt, startConversation]);

  useTauriIntegration(handleActivate);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.code === 'Space') {
        e.preventDefault();
        if (state === 'sleeping' || state === 'waiting') startConversation();
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

  // Content to show in the dropdown area (below the notch bar)
  const contentText = (() => {
    if (state === 'listening' && userTranscript) return userTranscript;
    if (state === 'thinking') return '···';
    if (state === 'speaking') return aiResponse;
    if (state === 'waiting') return aiResponse;
    return '';
  })();

  const hasContent = contentText.length > 0;

  // Determine notch class
  const notchClass = (() => {
    if (!isExpanded) return 'idle';
    if (hasContent) return 'expanded has-content';
    return 'expanded';
  })();

  const orbSize = isExpanded ? 32 : 28;

  return (
    <div className="notch-wrapper">
      <div className={`notch ${notchClass} state-${state}`}>
        {/* Top bar — orb + inline indicator */}
        <div className="notch-bar">
          <div className="notch-orb" onClick={handleActivate} style={{ cursor: 'pointer' }}>
            <ClawbyOrb state={state} size={orbSize} />
          </div>

          {/* Inline listening indicator (dots) when no transcript yet */}
          {isExpanded && !hasContent && state === 'listening' && (
            <div className="notch-indicator">
              <span className="listening-dots">
                <span /><span /><span />
              </span>
            </div>
          )}
        </div>

        {/* Content area — drops below the notch bar */}
        {hasContent && (
          <div className={`notch-content ${state}`}>
            {contentText}
          </div>
        )}
      </div>
    </div>
  );
}
