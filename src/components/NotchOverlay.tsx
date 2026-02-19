import { useEffect, useCallback, useRef } from 'react';
import { AppConfig } from '../lib/config';
import { useVoiceSession } from '../hooks/useVoiceSession';
import { useTauriIntegration } from '../hooks/useTauriIntegration';
import { useNotch } from '../hooks/useNotch';
import ClawbyOrb from './ClawbyOrb';
import './NotchOverlay.css';

interface NotchOverlayProps {
  config: AppConfig;
}

const GREETINGS = [
  "Hey!",
  "What's up?",
  "I'm here.",
  "Hey, what do you need?",
  "Yo!",
  "I'm listening.",
];

export function NotchOverlay({ config }: NotchOverlayProps) {
  const {
    state,
    userTranscript,
    aiResponse,
    startConversation,
    interrupt,
    cancel,
    enqueueSentence,
  } = useVoiceSession(config);

  const { isExpanded } = useNotch(state);
  const isFirstActivation = useRef(true);

  // Activation handler
  const handleActivate = useCallback(async () => {
    if (state === 'listening') {
      cancel();
      return;
    }

    if (state === 'speaking') {
      interrupt();
      return;
    }

    if (isFirstActivation.current) {
      isFirstActivation.current = false;
      const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
      enqueueSentence(greeting);
      setTimeout(() => {
        startConversation();
      }, 800);
    } else {
      startConversation();
    }
  }, [state, cancel, interrupt, startConversation, enqueueSentence]);

  useTauriIntegration(handleActivate);

  // Keyboard controls
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.code === 'Space') {
        e.preventDefault();
        if (state === 'idle') startConversation();
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

  // Display text based on state
  const displayText = (() => {
    switch (state) {
      case 'listening': return userTranscript || 'Listening...';
      case 'thinking': return '···';
      case 'speaking': return aiResponse;
      default: return '';
    }
  })();

  // Orb sizes: 28px idle (fits in 36px notch), 40px expanded (fits in 48px notch)
  const orbSize = isExpanded ? 40 : 28;

  return (
    <div className="notch-wrapper">
      <div className={`notch ${isExpanded ? 'expanded' : 'idle'} state-${state}`}>
        {/* Clawby orb — LEFT side */}
        <div className="notch-orb" onClick={handleActivate} style={{ cursor: 'pointer' }}>
          <ClawbyOrb state={state} size={orbSize} />
        </div>

        {/* Transcript — RIGHT side */}
        {isExpanded && (
          <div className={`notch-text ${state}`}>
            {displayText}
          </div>
        )}
      </div>
    </div>
  );
}
