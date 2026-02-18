import { useState, useCallback, useRef } from 'react';
import { useDeepgram } from './useDeepgram';
import { useOpenClaw } from './useOpenClaw';
import { useTTS } from './useTTS';
import type { AppState } from '../lib/types';
import type { AppConfig } from '../lib/config';

export function useVoiceSession(config: AppConfig) {
  const [state, setState] = useState<AppState>('idle');
  const [userTranscript, setUserTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const finalTranscriptRef = useRef('');
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
    (text: string, isFinal: boolean) => {
      if (isFinal) {
        finalTranscriptRef.current += (finalTranscriptRef.current ? ' ' : '') + text;
        setUserTranscript(finalTranscriptRef.current);

        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = window.setTimeout(() => {
          if (finalTranscriptRef.current.trim()) {
            processInput(finalTranscriptRef.current.trim());
          }
        }, 1200);
      } else {
        setUserTranscript(
          finalTranscriptRef.current + (finalTranscriptRef.current ? ' ' : '') + text,
        );
      }
    },
    [processInput],
  );

  const handleError = useCallback((err: string) => {
    setAiResponse(`Mic error: ${err}`);
    setState('idle');
  }, []);

  const { startListening: startMic, stopListening: stopMic } = useDeepgram({
    apiKey: config.deepgramKey,
    onTranscript: handleTranscript,
    onUtteranceEnd: handleUtteranceEnd,
    onError: handleError,
  });

  // Keep ref in sync so processInput can call stopMic
  stopMicRef.current = stopMic;

  const startConversation = useCallback(() => {
    stopTTS();
    finalTranscriptRef.current = '';
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
    isSpeaking,
  };
}
