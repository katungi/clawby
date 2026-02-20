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
  // Refs to break circular dependency: processInput needs stopMic/startMic, useDeepgramFlux needs processInput
  const stopMicRef = useRef<() => void>(() => {});
  const startMicRef = useRef<() => Promise<void>>(() => Promise.resolve());
  // Ref so Flux callbacks always see the latest state (avoids stale closures)
  const stateRef = useRef<AppState>(state);
  stateRef.current = state;
  // Guard against duplicate processInput calls (e.g. rapid EndOfTurn events)
  const processingRef = useRef(false);
  // Track LLM stream completion so we know when it's safe to resume listening
  const streamDoneRef = useRef(false);
  // Ref so callbacks can read the latest isSpeaking synchronously

  const { sendMessageStreaming, clearHistory } = useOpenClaw({
    url: config.openclawUrl,
    token: config.openclawToken,
    model: config.model,
  });

  const { enqueueSentence, stop: stopTTS, isSpeaking } = useTTS({
    apiKey: config.openaiKey,
    voice: config.voice,
  });

  const isSpeakingRef = useRef(false);
  isSpeakingRef.current = isSpeaking;

  const resumeListening = useCallback(() => {
    processingRef.current = false;
    streamDoneRef.current = false;
    setState('listening');
    startMicRef.current();
  }, []);

  const processInput = useCallback(
    (text: string) => {
      if (processingRef.current) return;
      processingRef.current = true;
      streamDoneRef.current = false;
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
          streamDoneRef.current = true;
          // Edge case: if TTS already finished (very short response), resume now
          if (!isSpeakingRef.current && stateRef.current !== 'idle') {
            resumeListening();
          }
        },
        (error) => {
          setAiResponse(`Error: ${error}`);
          setState('idle');
          processingRef.current = false;
          streamDoneRef.current = false;
        },
      );
    },
    [sendMessageStreaming, enqueueSentence, resumeListening],
  );

  // ── Flux Event Callbacks ──
  const fluxCallbacks: FluxCallbacks = {
    onStartOfTurn: () => {
      // BARGE-IN: if Clawby is speaking, stop TTS and listen
      if (stateRef.current === 'speaking') {
        stopTTS();
        processingRef.current = false;
        streamDoneRef.current = false;
      }
      setState('listening');
      setUserTranscript('');
      setAiResponse('');
    },

    onUpdate: (transcript) => {
      setUserTranscript(transcript);
    },

    onEagerEndOfTurn: () => {},

    onTurnResumed: () => {},

    onEndOfTurn: (transcript) => {
      // Only process when actually listening — ignore stale events during thinking/speaking
      if (stateRef.current !== 'listening') return;
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

  // Keep refs in sync
  stopMicRef.current = stopMic;
  startMicRef.current = startMic;

  // When TTS finishes and LLM stream is done, resume listening for next turn
  const prevSpeakingRef = useRef(false);
  useEffect(() => {
    if (prevSpeakingRef.current && !isSpeaking && streamDoneRef.current && stateRef.current !== 'idle') {
      resumeListening();
    }
    prevSpeakingRef.current = isSpeaking;
  }, [isSpeaking, resumeListening]);

  // Ensure mic is always off when idle
  useEffect(() => {
    if (state === 'idle') stopMic();
  }, [state, stopMic]);

  const startConversation = useCallback(() => {
    stopTTS();
    processingRef.current = false;
    streamDoneRef.current = false;
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
    processingRef.current = false;
    streamDoneRef.current = false;
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
