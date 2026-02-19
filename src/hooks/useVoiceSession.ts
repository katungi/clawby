import { useState, useCallback, useRef, useEffect } from 'react';
import { useDeepgram } from './useDeepgram';
import { useOpenClaw } from './useOpenClaw';
import { useTTS } from './useTTS';
import type { AppState } from '../lib/types';
import type { AppConfig } from '../lib/config';

function getSilenceThreshold(transcript: string): number {
  const words = transcript.trim().split(/\s+/);
  const lastWord = words[words.length - 1]?.toLowerCase() || '';
  const fillers = ['um', 'uh', 'like', 'so', 'and', 'but', 'or', 'well', 'hmm'];

  if (fillers.includes(lastWord)) return 1800;
  if (words.length <= 5) return 800;
  return 1200;
}

export function useVoiceSession(config: AppConfig) {
  const [state, setState] = useState<AppState>('idle');
  const [userTranscript, setUserTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const finalTranscriptRef = useRef('');
  const segmentsRef = useRef<Map<number, string>>(new Map());
  const silenceTimerRef = useRef<number | null>(null);
  // Ref to break circular dependency: processInput needs stopMic, useDeepgram needs processInput
  const stopMicRef = useRef<() => void>(() => {});

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
      // Clear immediately so no other trigger can re-send the same transcript
      finalTranscriptRef.current = '';
      segmentsRef.current.clear();
      stopMicRef.current();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
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

  const handleUtteranceEnd = useCallback(() => {
    if (finalTranscriptRef.current.trim()) {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      processInput(finalTranscriptRef.current.trim());
    }
  }, [processInput]);

  const handleTranscript = useCallback(
    (text: string, isFinal: boolean, start: number) => {
      if (isFinal) {
        // Use segment start position as key — overwrites rather than appends
        // if Deepgram sends multiple finals for the same audio range
        segmentsRef.current.set(start, text);
        finalTranscriptRef.current = [...segmentsRef.current.entries()]
          .sort(([a], [b]) => a - b)
          .map(([, t]) => t)
          .join(' ');
        setUserTranscript(finalTranscriptRef.current);

        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        const threshold = getSilenceThreshold(finalTranscriptRef.current);
        silenceTimerRef.current = window.setTimeout(() => {
          if (finalTranscriptRef.current.trim()) {
            processInput(finalTranscriptRef.current.trim());
          }
        }, threshold);
      } else {
        const finalized = [...segmentsRef.current.entries()]
          .sort(([a], [b]) => a - b)
          .map(([, t]) => t)
          .join(' ');
        setUserTranscript(
          finalized + (finalized ? ' ' : '') + text,
        );
      }
    },
    [processInput],
  );

  const handleSpeechStart = useCallback(() => {
    // Cancel pending timer — user is still talking
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

    // INTERRUPTION: if Clawby is speaking, stop and listen
    if (state === 'speaking') {
      stopTTS();
      setState('listening');
    }
  }, [state, stopTTS]);

  const handleError = useCallback((err: string) => {
    setAiResponse(`Mic error: ${err}`);
    setState('idle');
  }, []);

  const { startListening: startMic, stopListening: stopMic } = useDeepgram({
    apiKey: config.deepgramKey,
    onTranscript: handleTranscript,
    onUtteranceEnd: handleUtteranceEnd,
    onSpeechStart: handleSpeechStart,
    onError: handleError,
  });

  // Keep ref in sync so processInput can call stopMic
  stopMicRef.current = stopMic;

  // Ensure mic is always off when idle — no passive listening
  useEffect(() => {
    if (state === 'idle') stopMic();
  }, [state, stopMic]);

  const startConversation = useCallback(() => {
    stopTTS();
    finalTranscriptRef.current = '';
    segmentsRef.current.clear();
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
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    finalTranscriptRef.current = '';
    segmentsRef.current.clear();
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
