import { useState, useRef, useCallback, useEffect } from 'react';
import { acquireSharedMicrophone, releaseSharedMicrophone } from './sharedMicrophone';

// ── Types ──

export interface UsePorcupineWakeOptions {
  /** Picovoice AccessKey from console.picovoice.ai */
  accessKey: string;
  /** Called when wake word is detected */
  onWakeWordDetected: () => void;
}

export interface UsePorcupineWakeReturn {
  startListening: () => Promise<void>;
  stopListening: () => void;
  isListening: boolean;
}

// ── Audio Processing ──
// Porcupine needs 512-sample Int16 frames at 16kHz

const SAMPLE_RATE = 16000;
const FRAME_LENGTH = 512; // porcupine.frameLength

const WORKLET_CODE = `
class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(0);
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const samples = input[0];

    const newBuffer = new Float32Array(this.buffer.length + samples.length);
    newBuffer.set(this.buffer);
    newBuffer.set(samples, this.buffer.length);
    this.buffer = newBuffer;

    while (this.buffer.length >= ${FRAME_LENGTH}) {
      const chunk = this.buffer.slice(0, ${FRAME_LENGTH});
      this.buffer = this.buffer.slice(${FRAME_LENGTH});

      const int16 = new Int16Array(chunk.length);
      for (let i = 0; i < chunk.length; i++) {
        const s = Math.max(-1, Math.min(1, chunk[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }

      this.port.postMessage(int16.buffer, [int16.buffer]);
    }

    return true;
  }
}

registerProcessor('porcupine-pcm-processor', PcmProcessor);
`;

function createWorkletUrl(): string {
  const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
  return URL.createObjectURL(blob);
}

// ── Activation chime (programmatic) ──

let chimeBuffer: AudioBuffer | null = null;

async function playActivationChime() {
  try {
    const ctx = new AudioContext();
    if (!chimeBuffer) {
      // Generate a short 100ms chime at A5 (880Hz)
      const duration = 0.1;
      const sampleRate = ctx.sampleRate;
      const length = Math.ceil(sampleRate * duration);
      chimeBuffer = ctx.createBuffer(1, length, sampleRate);
      const channel = chimeBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const envelope = Math.exp(-t * 30); // fast decay
        channel[i] = Math.sin(2 * Math.PI * 880 * t) * 0.3 * envelope;
      }
    }
    const source = ctx.createBufferSource();
    source.buffer = chimeBuffer;
    source.connect(ctx.destination);
    source.start();
    source.onended = () => ctx.close();
  } catch {
    // Ignore audio playback errors
  }
}

// ── The Hook ──

export function usePorcupineWake(options: UsePorcupineWakeOptions): UsePorcupineWakeReturn {
  const { accessKey, onWakeWordDetected } = options;

  const [isListening, setIsListening] = useState(false);

  const porcupineRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const workletUrlRef = useRef<string | null>(null);

  // Always see the latest callback (avoids stale closures)
  const callbackRef = useRef(onWakeWordDetected);
  callbackRef.current = onWakeWordDetected;

  const cleanup = useCallback(() => {
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    if (streamRef.current) {
      releaseSharedMicrophone();
      streamRef.current = null;
    }

    if (workletUrlRef.current) {
      URL.revokeObjectURL(workletUrlRef.current);
      workletUrlRef.current = null;
    }

    // Release Porcupine WASM resources
    if (porcupineRef.current) {
      porcupineRef.current.release().catch(() => {});
      porcupineRef.current = null;
    }

    setIsListening(false);
  }, []);

  const startListening = useCallback(async () => {
    // No-op when accessKey is missing or already listening
    if (!accessKey || isListening) return;

    try {
      // ── 1. Dynamic import (avoids ~2MB in initial bundle) ──
      const { Porcupine } = await import('@picovoice/porcupine-web');

      // ── 2. Create Porcupine instance with custom "Hey Claw" keyword ──
      const porcupine = await Porcupine.create(
        accessKey,
        {
          publicPath: '/models/Hey-claw_en_wasm_v4_0_0.ppn',
          label: 'Hey Claw',
          sensitivity: 0.5,
          forceWrite: true,
        },
        (detection) => {
          console.log('[Porcupine] Wake word detected:', detection.label);
          playActivationChime();
          callbackRef.current();
        },
        { publicPath: '/models/porcupine_params.pv', forceWrite: true },
      );

      porcupineRef.current = porcupine;
      console.log('[Porcupine] Initialized — frameLength:', porcupine.frameLength, 'sampleRate:', porcupine.sampleRate);

      // ── 3. Acquire mic ──
      const stream = await acquireSharedMicrophone();
      streamRef.current = stream;

      // ── 4. AudioWorklet → Int16 PCM → porcupine.process() ──
      const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
      audioContextRef.current = audioContext;

      const workletUrl = createWorkletUrl();
      workletUrlRef.current = workletUrl;
      await audioContext.audioWorklet.addModule(workletUrl);

      const workletNode = new AudioWorkletNode(audioContext, 'porcupine-pcm-processor');
      workletNodeRef.current = workletNode;

      workletNode.port.onmessage = (event) => {
        if (porcupineRef.current) {
          const frame = new Int16Array(event.data);
          porcupineRef.current.process(frame);
        }
      };

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(workletNode);
      // Don't connect to destination — we don't want to hear ourselves

      setIsListening(true);
      console.log('[Porcupine] Listening for wake word...');
    } catch (error) {
      console.error('[Porcupine] Failed to start:', error);
      cleanup();
    }
  }, [accessKey, isListening, cleanup]);

  const stopListening = useCallback(() => {
    cleanup();
    console.log('[Porcupine] Stopped listening');
  }, [cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { cleanup(); };
  }, [cleanup]);

  return { startListening, stopListening, isListening };
}
