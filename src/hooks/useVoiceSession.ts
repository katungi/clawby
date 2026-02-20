import { useState, useCallback, useRef, useEffect } from 'react';
import { useDeepgramFlux, type FluxCallbacks } from './useDeepgramFlux';
import { useOpenClaw } from './useOpenClaw';
import { useTTS } from './useTTS';
import { usePorcupineWake } from './usePorcupineWake';
import type { AppState } from '../lib/types';
import type { AppConfig } from '../lib/config';

const WAITING_TIMEOUT_MS = 4000; // 4 seconds before returning to sleep

export function useVoiceSession(config: AppConfig) {
  const [state, setState] = useState<AppState>('sleeping');
  const [userTranscript, setUserTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');

  const picovoiceKey = config.picovoiceKey || import.meta.env.VITE_PICOVOICE_KEY || '';
  const wakeWordEnabled = Boolean(picovoiceKey);

  // Refs to break circular dependency: processInput needs stopMic/startMic, useDeepgramFlux needs processInput
  const stopMicRef = useRef<() => void>(() => {});
  const startMicRef = useRef<() => Promise<void>>(() => Promise.resolve());
  // Ref so Flux callbacks always see the latest state (avoids stale closures)
  const stateRef = useRef<AppState>(state);
  stateRef.current = state;
  // Guard against duplicate processInput calls (e.g. rapid EndOfTurn events)
  const processingRef = useRef(false);
  // Track LLM stream completion so we know when it's safe to enter waiting
  const streamDoneRef = useRef(false);

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

  // ── Porcupine refs for use in callbacks (avoids stale closures) ──
  const startPorcupineRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const stopPorcupineRef = useRef<() => void>(() => {});

  // ── Enter waiting state (replaces resumeListening) ──
  // Flux stays open so user can speak a follow-up without re-triggering wake word
  const enterWaiting = useCallback(() => {
    processingRef.current = false;
    streamDoneRef.current = false;
    setState('waiting');
    // Mic stays on — Flux is still connected, waiting for follow-up
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
          // Edge case: if TTS already finished (very short response), enter waiting now
          if (!isSpeakingRef.current && stateRef.current !== 'sleeping') {
            enterWaiting();
          }
        },
        (error) => {
          setAiResponse(`Error: ${error}`);
          setState('sleeping');
          processingRef.current = false;
          streamDoneRef.current = false;
          if (wakeWordEnabled) startPorcupineRef.current();
        },
      );
    },
    [sendMessageStreaming, enqueueSentence, enterWaiting, wakeWordEnabled],
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
      // Follow-up during waiting — Flux is already open, just transition
      // (the waiting timeout effect will auto-cancel via cleanup)
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
      // Accept during listening OR waiting (follow-up)
      if (stateRef.current !== 'listening' && stateRef.current !== 'waiting') return;
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

  // ── Porcupine Wake Word ──
  const handleWakeWord = useCallback(() => {
    setState('waking');
  }, []);

  const {
    startListening: startPorcupine,
    stopListening: stopPorcupine,
  } = usePorcupineWake({
    accessKey: picovoiceKey,
    onWakeWordDetected: handleWakeWord,
  });

  // Keep Porcupine refs in sync
  startPorcupineRef.current = startPorcupine;
  stopPorcupineRef.current = stopPorcupine;

  // ── Waking transition: stop Porcupine → start Flux ──
  useEffect(() => {
    if (state !== 'waking') return;

    let cancelled = false;

    (async () => {
      // 1. Stop Porcupine (releases mic)
      stopPorcupine();

      // 2. Brief delay for mic release to complete
      await new Promise(r => setTimeout(r, 100));
      if (cancelled) return;

      // 3. Start Flux (acquires mic)
      await startMic();
      if (cancelled) return;

      // 4. Transition to listening
      setUserTranscript('');
      setAiResponse('');
      setState('listening');
    })();

    return () => { cancelled = true; };
  }, [state, stopPorcupine, startMic]);

  // ── Waiting timeout: go back to sleep after silence ──
  useEffect(() => {
    if (state !== 'waiting') return;

    const timer = setTimeout(() => {
      // No follow-up detected — close Flux, restart Porcupine
      stopMic();
      setState('sleeping');
      if (wakeWordEnabled) startPorcupine();
    }, WAITING_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [state, stopMic, wakeWordEnabled, startPorcupine]);

  // When TTS finishes and LLM stream is done, enter waiting for follow-up
  const prevSpeakingRef = useRef(false);
  useEffect(() => {
    if (prevSpeakingRef.current && !isSpeaking && streamDoneRef.current && stateRef.current !== 'sleeping') {
      enterWaiting();
    }
    prevSpeakingRef.current = isSpeaking;
  }, [isSpeaking, enterWaiting]);

  // Ensure mic is always off when sleeping
  useEffect(() => {
    if (state === 'sleeping') stopMic();
  }, [state, stopMic]);

  // ── Auto-start Porcupine on mount ──
  useEffect(() => {
    if (wakeWordEnabled) {
      startPorcupine();
    }
    return () => {
      stopPorcupine();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Manual activation (hotkey/click) ──
  const startConversation = useCallback(() => {
    stopTTS();
    if (wakeWordEnabled) stopPorcupine();
    processingRef.current = false;
    streamDoneRef.current = false;
    setUserTranscript('');
    setAiResponse('');
    setState('listening');
    startMic();
  }, [startMic, stopTTS, wakeWordEnabled, stopPorcupine]);

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
    setState('sleeping');
    if (wakeWordEnabled) startPorcupine();
  }, [stopMic, stopTTS, wakeWordEnabled, startPorcupine]);

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
