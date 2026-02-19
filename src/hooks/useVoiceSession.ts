import { useState, useCallback, useRef, useEffect } from 'react';
import { useDeepgramFlux, type FluxCallbacks } from './useDeepgramFlux';
import { useOpenClaw } from './useOpenClaw';
import { useTTS } from './useTTS';
import type { AppState } from '../lib/types';
import type { AppConfig } from '../lib/config';

export function useVoiceSession(config: AppConfig) {
  const [state, setState] = useState<AppState>('idle');
  const [userTranscript, setUserTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  // Ref to break circular dependency: processInput needs stopMic, useDeepgramFlux needs processInput
  const stopMicRef = useRef<() => void>(() => {});
  // Ref so Flux callbacks always see the latest state (avoids stale closures)
  const stateRef = useRef<AppState>(state);
  stateRef.current = state;

  const { sendMessageStreaming, clearHistory } = useOpenClaw({
    url: config.openclawUrl,
    token: config.openclawToken,
    model: config.model,
  });

  const { enqueueSentence, stop: stopTTS, isSpeaking } = useTTS({
    apiKey: config.openaiKey,
    voice: config.voice,
  });

  const processInput = useCallback(
    (text: string) => {
      stopMicRef.current();
      setState('thinking');
      setAiResponse('');

      let responseAccumulator = '';

      sendMessageStreaming(
        text,
        (sentence) => {
          responseAccumulator += (responseAccumulator ? ' ' : '') + sentence;
          setAiResponse(responseAccumulator);
          setState('speaking');
          enqueueSentence(sentence);
        },
        (fullResponse) => {
          setAiResponse(fullResponse);
        },
        (error) => {
          setAiResponse(`Error: ${error}`);
          setState('idle');
        },
      );
    },
    [sendMessageStreaming, enqueueSentence],
  );

  // ── Flux Event Callbacks ──
  const fluxCallbacks: FluxCallbacks = {
    onStartOfTurn: () => {
      // BARGE-IN: if Clawby is speaking, stop TTS and listen
      if (stateRef.current === 'speaking') {
        stopTTS();
      }
      setState('listening');
      setUserTranscript('');
      setAiResponse('');
    },

    onUpdate: (transcript) => {
      // Live interim transcript — just display it
      setUserTranscript(transcript);
    },

    onEagerEndOfTurn: () => {
      // Phase 1: no-op — no speculative responses yet
      // Phase 2: fire speculative LLM call here
    },

    onTurnResumed: () => {
      // Phase 1: no-op
      // Phase 2: cancel speculative LLM call here
    },

    onEndOfTurn: (transcript) => {
      // Definitive end of turn — process for real
      setUserTranscript(transcript);
      processInput(transcript);
    },

    onError: (error) => {
      console.error('[Flux] Error:', error);
    },
  };

  const { startListening: startMic, stopListening: stopMic } = useDeepgramFlux({
    apiKey: config.deepgramKey,
    callbacks: fluxCallbacks,
    eotThreshold: 0.7,
    // Phase 1: no eager end-of-turn
    // eagerEotThreshold: 0.4,
    eotTimeoutMs: 3000,
    keyterms: ['ClawAssist', 'Clawby', 'OpenClaw'],
  });

  // Keep ref in sync so processInput can call stopMic
  stopMicRef.current = stopMic;

  // Ensure mic is always off when idle — no passive listening
  useEffect(() => {
    if (state === 'idle') stopMic();
  }, [state, stopMic]);

  const startConversation = useCallback(() => {
    stopTTS();
    setUserTranscript('');
    setAiResponse('');
    setState('listening');
    startMic();
  }, [startMic, stopTTS]);

  const interrupt = useCallback(() => {
    stopTTS();
    startConversation();
  }, [stopTTS, startConversation]);

  const cancel = useCallback(() => {
    stopMic();
    stopTTS();
    setUserTranscript('');
    setState('idle');
  }, [stopMic, stopTTS]);

  return {
    state: isSpeaking ? ('speaking' as AppState) : state,
    userTranscript,
    aiResponse,
    startConversation,
    interrupt,
    cancel,
    clearHistory,
    processInput,
    enqueueSentence,
    isSpeaking,
  };
}
