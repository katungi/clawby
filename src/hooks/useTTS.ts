import { useRef, useCallback, useState } from 'react';

interface UseTTSOptions {
  apiKey: string;
  voice: string;
}

export function useTTS({ apiKey, voice }: UseTTSOptions) {
  const queueRef = useRef<HTMLAudioElement[]>([]);
  const isPlayingRef = useRef(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const abortRef = useRef(false);

  const playNext = useCallback(async () => {
    if (abortRef.current) {
      isPlayingRef.current = false;
      setIsSpeaking(false);
      return;
    }

    if (queueRef.current.length === 0) {
      isPlayingRef.current = false;
      setIsSpeaking(false);
      return;
    }

    isPlayingRef.current = true;
    setIsSpeaking(true);
    const audio = queueRef.current.shift()!;

    try {
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => {
          URL.revokeObjectURL(audio.src);
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(audio.src);
          reject();
        };
        audio.play().catch(reject);
      });
    } catch {
      // continue to next
    }

    playNext();
  }, []);

  const enqueueSentence = useCallback(
    async (sentence: string) => {
      if (abortRef.current) return;

      try {
        const res = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'tts-1',
            input: sentence,
            voice,
            response_format: 'mp3',
            speed: 1.05,
          }),
        });

        if (!res.ok) throw new Error(`TTS ${res.status}`);

        const blob = await res.blob();
        const audio = new Audio(URL.createObjectURL(blob));

        // Drop any pending sentences — only speak the latest one
        queueRef.current.forEach((a) => URL.revokeObjectURL(a.src));
        queueRef.current = [audio];

        if (!isPlayingRef.current) {
          playNext();
        }
      } catch (e) {
        console.error('TTS error:', e);
      }
    },
    [apiKey, voice, playNext],
  );

  const stop = useCallback(() => {
    abortRef.current = true;
    queueRef.current.forEach((a) => {
      a.pause();
      URL.revokeObjectURL(a.src);
    });
    queueRef.current = [];
    isPlayingRef.current = false;
    setIsSpeaking(false);
    setTimeout(() => {
      abortRef.current = false;
    }, 50);
  }, []);

  return { enqueueSentence, stop, isSpeaking };
}
