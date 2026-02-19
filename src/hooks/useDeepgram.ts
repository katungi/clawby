import { useRef, useState, useCallback } from 'react';

interface UseDeepgramOptions {
  apiKey: string;
  onTranscript: (text: string, isFinal: boolean, start: number) => void;
  onUtteranceEnd: () => void;
  onSpeechStart: () => void;
  onError: (error: string) => void;
}

interface UseDeepgramReturn {
  startListening: () => Promise<void>;
  stopListening: () => void;
  isListening: boolean;
}

export function useDeepgram({ apiKey, onTranscript, onUtteranceEnd, onSpeechStart, onError }: UseDeepgramOptions): UseDeepgramReturn {
  const [isListening, setIsListening] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const cleanup = useCallback(() => {
    try { recorderRef.current?.stop(); } catch {}
    try { wsRef.current?.close(); } catch {}
    streamRef.current?.getTracks().forEach(t => t.stop());
    recorderRef.current = null;
    wsRef.current = null;
    streamRef.current = null;
    setIsListening(false);
  }, []);

  const startListening = useCallback(async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError('Mic access denied. Please allow microphone.');
      return;
    }
    streamRef.current = stream;

    const dgUrl = new URL('wss://api.deepgram.com/v1/listen');
    dgUrl.searchParams.set('model', 'nova-2');
    dgUrl.searchParams.set('smart_format', 'true');
    dgUrl.searchParams.set('interim_results', 'true');
    dgUrl.searchParams.set('endpointing', '250');
    dgUrl.searchParams.set('utterance_end_ms', '1000');
    dgUrl.searchParams.set('vad_events', 'true');
    dgUrl.searchParams.set('filler_words', 'true');

    const ws = new WebSocket(dgUrl.toString(), ['token', apiKey]);
    wsRef.current = ws;

    ws.onopen = () => {
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (ws.readyState === WebSocket.OPEN && e.data.size > 0) {
          ws.send(e.data);
        }
      };

      recorder.start(150);
      setIsListening(true);
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);

        // Deepgram utterance end — speech is definitively done
        if (data.type === 'UtteranceEnd') {
          onUtteranceEnd?.();
          return;
        }

        if (data.type === 'SpeechStarted') {
          onSpeechStart();
          return;
        }

        const transcript = data.channel?.alternatives?.[0]?.transcript;
        if (!transcript) return;

        onTranscript(transcript, !!data.is_final, data.start ?? 0);
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = () => {
      onError('Deepgram connection error. Check your API key.');
      cleanup();
    };

    ws.onclose = () => {
      // normal close
    };
  }, [apiKey, onTranscript, onUtteranceEnd, onSpeechStart, onError, cleanup]);

  const stopListening = useCallback(() => {
    cleanup();
  }, [cleanup]);

  return { startListening, stopListening, isListening };
}
