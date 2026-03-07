import { useState, useCallback, useRef, useEffect } from 'react';
import { useDeepgramFlux, type FluxCallbacks } from './useDeepgramFlux';
import { useConductor, type ConductorCallbacks } from './useConductor';
import { useTTS } from './useTTS';
import { usePorcupineWake } from './usePorcupineWake';
import type { AppState } from '../lib/types';
import type { AppConfig } from '../lib/config';

const WAITING_TIMEOUT_MS = 4000; // 4 seconds before returning to sleep

function normalizeTranscript(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s']/g, '')
    .replace(/\s+/g, ' ');
}

export function useVoiceSession(config: AppConfig) {
  const [state, setState] = useState<AppState>('sleeping');
  const [userTranscript, setUserTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');

  const picovoiceKey = config.picovoiceKey || import.meta.env.VITE_PICOVOICE_KEY || '';
  const wakeWordEnabled = Boolean(picovoiceKey);

  // Refs to break circular dependency
  const stopMicRef = useRef<() => void>(() => {});
  const startMicRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const stateRef = useRef<AppState>(state);
  stateRef.current = state;
  const stateRefAlert = useRef(state);
  stateRefAlert.current = state;
  const processingRef = useRef(false);
  const streamDoneRef = useRef(false);
  const speculativeInputRef = useRef<string | null>(null);
  const showedMicAlertRef = useRef(false);

  // ── TTS (OpenAI only) ──

  const tts = useTTS({
    apiKey: config.openaiKey,
    voice: config.voice,
  });

  const isSpeakingRef = useRef(false);
  isSpeakingRef.current = tts.isSpeaking;

  // ── Porcupine refs for use in callbacks (avoids stale closures) ──
  const startPorcupineRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const stopPorcupineRef = useRef<() => void>(() => {});

  // ── Enter waiting state ──
  const enterWaiting = useCallback(() => {
    processingRef.current = false;
    streamDoneRef.current = false;
    speculativeInputRef.current = null;
    setState('waiting');
  }, []);

  const showMicHelpOnce = useCallback((message: string) => {
    setAiResponse(message);
    if (stateRefAlert.current !== 'sleeping') {
      setState('sleeping');
    }
    if (!showedMicAlertRef.current) {
      showedMicAlertRef.current = true;
      window.alert(message);
    }
  }, []);

  // ── Conductor ──
  const conductorCallbacks: ConductorCallbacks = {
    onTextDelta(_delta, accumulated) {
      setAiResponse(accumulated);
    },

    onClause(clause) {
      setState('speaking');
      tts.enqueueSentence(clause);
    },

    onToolCallStart() {},
    onToolCallComplete() {},

    onComplete(fullResponse) {
      setAiResponse(fullResponse);
      streamDoneRef.current = true;
      if (!isSpeakingRef.current && stateRef.current !== 'sleeping') {
        enterWaiting();
      }
    },

    onError(error) {
      setAiResponse(`Error: ${error.message}`);
      setState('sleeping');
      processingRef.current = false;
      streamDoneRef.current = false;
      speculativeInputRef.current = null;
      if (wakeWordEnabled) startPorcupineRef.current();
    },
  };

  const conductor = useConductor(
    {
      conductorBaseUrl: config.conductorBaseUrl || `${config.openclawUrl}/v1`,
      conductorModel: config.conductorModel || 'openai/gpt-4o-mini',
      conductorApiKey: config.openclawToken || config.openaiKey,
      openClawUrl: '/openclaw',
      openClawToken: config.openclawToken,
      openClawModel: config.model,
    },
    conductorCallbacks,
  );

  const processInput = useCallback(
    (
      text: string,
      options?: {
        stopMic?: boolean;
        speculative?: boolean;
      },
    ) => {
      const transcript = text.trim();
      if (!transcript) return;
      if (processingRef.current) return;
      processingRef.current = true;
      streamDoneRef.current = false;
      speculativeInputRef.current = options?.speculative ? transcript : null;
      if (options?.stopMic !== false) {
        stopMicRef.current();
      }
      setState('thinking');
      setAiResponse('');
      void conductor.sendMessage(transcript);
    },
    [conductor],
  );

  // ── Flux Event Callbacks ──
  const fluxCallbacks: FluxCallbacks = {
    onStartOfTurn: () => {
      if (stateRef.current === 'speaking' || stateRef.current === 'thinking') {
        conductor.abort();
        tts.stop();
        processingRef.current = false;
        streamDoneRef.current = false;
        speculativeInputRef.current = null;
      }
      setState('listening');
      setUserTranscript('');
      setAiResponse('');
    },

    onUpdate: (transcript) => {
      setUserTranscript(transcript);
    },

    onEagerEndOfTurn: (transcript) => {
      if (stateRef.current !== 'listening' || processingRef.current) return;
      setUserTranscript(transcript);
      processInput(transcript, { stopMic: false, speculative: true });
    },

    onTurnResumed: () => {
      if (!processingRef.current || !speculativeInputRef.current) return;
      conductor.abort();
      processingRef.current = false;
      streamDoneRef.current = false;
      speculativeInputRef.current = null;
      setAiResponse('');
      setState('listening');
    },

    onEndOfTurn: (transcript) => {
      if (
        stateRef.current !== 'listening'
        && stateRef.current !== 'waiting'
        && stateRef.current !== 'thinking'
      ) return;

      const finalTranscript = transcript.trim();
      if (!finalTranscript) return;
      setUserTranscript(finalTranscript);

      if (processingRef.current) {
        const speculativeInput = speculativeInputRef.current;
        if (
          speculativeInput
          && normalizeTranscript(speculativeInput) === normalizeTranscript(finalTranscript)
        ) {
          speculativeInputRef.current = null;
          stopMicRef.current();
          return;
        }

        conductor.abort();
        processingRef.current = false;
        streamDoneRef.current = false;
        speculativeInputRef.current = null;
      }

      processInput(finalTranscript, { stopMic: true });
    },

    onError: (error) => {
      console.error('[Flux] Error:', error);
      if (/microphone|getusermedia|notallowed|denied|unavailable/i.test(error)) {
        showMicHelpOnce(
          'Microphone access failed. Enable access in System Settings > Privacy & Security > Microphone, then restart ClawAssist.',
        );
      }
    },
  };

  const { startListening: startMic, stopListening: stopMic } = useDeepgramFlux({
    apiKey: config.deepgramKey,
    callbacks: fluxCallbacks,
    eotThreshold: 0.7,
    eagerEotThreshold: 0.45,
    eotTimeoutMs: 900,
    keyterms: ['ClawAssist', 'Clawby', 'OpenClaw'],
  });

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
    onError: (error) => {
      console.error('[Porcupine] Error:', error);
      if (/microphone|getusermedia|notallowed|denied|unavailable/i.test(error)) {
        showMicHelpOnce(
          'Microphone access failed. Enable access in System Settings > Privacy & Security > Microphone, then restart ClawAssist.',
        );
      }
    },
  });

  startPorcupineRef.current = startPorcupine;
  stopPorcupineRef.current = stopPorcupine;

  // ── Waking transition: stop Porcupine → start Flux ──
  useEffect(() => {
    if (state !== 'waking') return;

    let cancelled = false;

    (async () => {
      stopPorcupine();

      await startMic();
      if (cancelled) return;

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
      stopMic();
      setState('sleeping');
      if (wakeWordEnabled) startPorcupine();
    }, WAITING_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [state, stopMic, wakeWordEnabled, startPorcupine]);

  // When TTS finishes and LLM stream is done, enter waiting
  const prevSpeakingRef = useRef(false);
  useEffect(() => {
    if (prevSpeakingRef.current && !tts.isSpeaking && streamDoneRef.current && stateRef.current !== 'sleeping') {
      enterWaiting();
    }
    prevSpeakingRef.current = tts.isSpeaking;
  }, [tts.isSpeaking, enterWaiting]);

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
    tts.stop();
    if (wakeWordEnabled) stopPorcupine();
    processingRef.current = false;
    streamDoneRef.current = false;
    speculativeInputRef.current = null;
    setUserTranscript('');
    setAiResponse('');
    setState('listening');
    void startMic();
  }, [startMic, tts, wakeWordEnabled, stopPorcupine]);

  const interrupt = useCallback(() => {
    tts.stop();
    startConversation();
  }, [tts, startConversation]);

  const cancel = useCallback(() => {
    conductor.abort();
    stopMic();
    tts.stop();
    processingRef.current = false;
    streamDoneRef.current = false;
    speculativeInputRef.current = null;
    setUserTranscript('');
    setState('sleeping');
    if (wakeWordEnabled) startPorcupine();
  }, [stopMic, tts, wakeWordEnabled, startPorcupine]);

  return {
    state: tts.isSpeaking ? ('speaking' as AppState) : state,
    userTranscript,
    aiResponse,
    startConversation,
    interrupt,
    cancel,
    clearHistory: conductor.clearHistory,
    processInput,
    isSpeaking: tts.isSpeaking,
    ttsReady: true,
  };
}
