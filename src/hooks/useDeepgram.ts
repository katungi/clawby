import { useRef, useState, useCallback } from 'react';

interface UseDeepgramOptions {
  apiKey: string;
  onTranscript: (text: string, isFinal: boolean) => void;
  onUtteranceEnd?: () => void;
  onError: (error: string) => void;
}

interface UseDeepgramReturn {
  startListening: () => Promise<void>;
  stopListening: () => void;
  isListening: boolean;
}

export function useDeepgram({ apiKey, onTranscript, onUtteranceEnd, onError }: UseDeepgramOptions): UseDeepgramReturn {
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

    const dgUrl =
      'wss://api.deepgram.com/v1/listen?' +
      'model=nova-2&smart_format=true&interim_results=true&endpointing=300&utterance_end_ms=1000';

    const ws = new WebSocket(dgUrl, ['token', apiKey]);
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

        if (data.type === 'SpeechStarted') return;

        const transcript = data.channel?.alternatives?.[0]?.transcript;
        if (!transcript) return;

        onTranscript(transcript, !!data.is_final);
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
  }, [apiKey, onTranscript, onUtteranceEnd, onError, cleanup]);

  const stopListening = useCallback(() => {
    cleanup();
  }, [cleanup]);

  return { startListening, stopListening, isListening };
}
