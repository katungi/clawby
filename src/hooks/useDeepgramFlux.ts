import { useRef, useCallback, useState } from 'react';
import { requestUserMedia } from './requestUserMedia';

// ── Flux v2 Message Types ──

type FluxEvent = 'StartOfTurn' | 'Update' | 'EagerEndOfTurn' | 'TurnResumed' | 'EndOfTurn';

interface FluxTurnInfo {
  type: 'TurnInfo';
  request_id: string;
  sequence_id: number;
  event: FluxEvent;
  turn_index: number;
  audio_window_start: number;
  audio_window_end: number;
  transcript: string;
  words?: { word: string; confidence: number }[];
  end_of_turn_confidence?: number;
}

interface FluxConnected {
  type: 'Connected';
  request_id: string;
  sequence_id: number;
}

interface FluxError {
  type: 'Error';
  sequence_id: number;
  code: string;
  description: string;
}

type FluxMessage = FluxTurnInfo | FluxConnected | FluxError;

// ── Callback Interface ──

export interface FluxCallbacks {
  /** User started a new turn (barge-in signal) */
  onStartOfTurn: () => void;
  /** Interim transcript update (for live display) */
  onUpdate: (transcript: string) => void;
  /** Medium confidence the turn is over — start speculative LLM call */
  onEagerEndOfTurn: (transcript: string, confidence: number) => void;
  /** User resumed speaking — cancel speculative LLM call */
  onTurnResumed: () => void;
  /** High confidence turn is complete — send to LLM (or use speculative response) */
  onEndOfTurn: (transcript: string, confidence: number) => void;
  /** Connection or processing error */
  onError: (error: string) => void;
}

// ── Hook Options ──

export interface UseDeepgramFluxOptions {
  apiKey: string;
  callbacks: FluxCallbacks;
  /** End-of-turn confidence threshold (0.5-0.9, default 0.7) */
  eotThreshold?: number;
  /** Eager end-of-turn threshold (0.3-0.9, default: disabled) */
  eagerEotThreshold?: number;
  /** Max silence before forcing end-of-turn (ms, default 3000) */
  eotTimeoutMs?: number;
  /** Keyterms to boost recognition */
  keyterms?: string[];
}

// ── Audio Processing ──

// Flux requires linear16 (signed 16-bit PCM).
// We use AudioWorklet to capture raw PCM from the mic and convert
// Float32 → Int16 in the audio thread (no main thread jank).

const SAMPLE_RATE = 16000;
const CHUNK_SAMPLES = (SAMPLE_RATE * 80) / 1000; // 1280 samples (80ms)

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

    while (this.buffer.length >= ${CHUNK_SAMPLES}) {
      const chunk = this.buffer.slice(0, ${CHUNK_SAMPLES});
      this.buffer = this.buffer.slice(${CHUNK_SAMPLES});

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

registerProcessor('pcm-processor', PcmProcessor);
`;

function createWorkletUrl(): string {
  const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
  return URL.createObjectURL(blob);
}

// ── The Hook ──

export function useDeepgramFlux(options: UseDeepgramFluxOptions) {
  const {
    apiKey,
    callbacks,
    eotThreshold = 0.7,
    eagerEotThreshold,
    eotTimeoutMs = 3000,
    keyterms = [],
  } = options;

  const [isListening, setIsListening] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const workletUrlRef = useRef<string | null>(null);

  // Use a ref so the running WebSocket always calls the latest callbacks
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const cleanup = useCallback(() => {
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'CloseStream' }));
      }
      wsRef.current.close();
      wsRef.current = null;
    }

    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    if (workletUrlRef.current) {
      URL.revokeObjectURL(workletUrlRef.current);
      workletUrlRef.current = null;
    }

    setIsListening(false);
  }, []);

  const startListening = useCallback(async () => {
    if (isListening) return;

    try {
      // ── 1. Build WebSocket URL ──
      const params = new URLSearchParams({
        model: 'flux-general-en',
        encoding: 'linear16',
        sample_rate: String(SAMPLE_RATE),
        eot_threshold: String(eotThreshold),
        eot_timeout_ms: String(eotTimeoutMs),
      });

      if (eagerEotThreshold !== undefined) {
        params.set('eager_eot_threshold', String(eagerEotThreshold));
      }

      for (const term of keyterms) {
        params.append('keyterm', term);
      }

      const url = `wss://api.deepgram.com/v2/listen?${params.toString()}`;

      // ── 2. Open WebSocket ──
      const ws = new WebSocket(url, ['token', apiKey]);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = () => reject(new Error('WebSocket connection failed'));
        setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
      });

      // ── 3. Handle incoming messages ──
      ws.onmessage = (event) => {
        if (typeof event.data !== 'string') return;

        try {
          const msg: FluxMessage = JSON.parse(event.data);
          const cb = callbacksRef.current;

          if (msg.type === 'Connected') {
            console.log('[Flux] Connected:', msg.request_id);
            return;
          }

          if (msg.type === 'Error') {
            console.error('[Flux] Error:', msg.code, msg.description);
            cb.onError(`${msg.code}: ${msg.description}`);
            return;
          }

          if (msg.type === 'TurnInfo') {
            switch (msg.event) {
              case 'StartOfTurn':
                console.log('[Flux] StartOfTurn');
                cb.onStartOfTurn();
                break;

              case 'Update':
                if (msg.transcript) {
                  cb.onUpdate(msg.transcript);
                }
                break;

              case 'EagerEndOfTurn':
                console.log('[Flux] EagerEndOfTurn:', msg.transcript, 'confidence:', msg.end_of_turn_confidence);
                if (msg.transcript) {
                  cb.onEagerEndOfTurn(msg.transcript, msg.end_of_turn_confidence ?? 0);
                }
                break;

              case 'TurnResumed':
                console.log('[Flux] TurnResumed');
                cb.onTurnResumed();
                break;

              case 'EndOfTurn':
                console.log('[Flux] EndOfTurn:', msg.transcript, 'confidence:', msg.end_of_turn_confidence);
                if (msg.transcript) {
                  cb.onEndOfTurn(msg.transcript, msg.end_of_turn_confidence ?? 0);
                }
                break;
            }
          }
        } catch (e) {
          console.error('[Flux] Failed to parse message:', e);
        }
      };

      ws.onclose = (event) => {
        console.log('[Flux] WebSocket closed:', event.code, event.reason);
      };

      ws.onerror = () => {
        console.error('[Flux] WebSocket error');
        callbacksRef.current.onError('WebSocket error');
      };

      // ── 4. Set up mic → AudioWorklet → linear16 PCM ──
      const stream = await requestUserMedia({
        audio: {
          sampleRate: SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
      audioContextRef.current = audioContext;

      const workletUrl = createWorkletUrl();
      workletUrlRef.current = workletUrl;
      await audioContext.audioWorklet.addModule(workletUrl);

      const workletNode = new AudioWorkletNode(audioContext, 'pcm-processor');
      workletNodeRef.current = workletNode;

      workletNode.port.onmessage = (event) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(event.data);
        }
      };

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(workletNode);
      // Don't connect to destination — we don't want to hear ourselves

      setIsListening(true);
      console.log('[Flux] Listening started — sending 80ms linear16 chunks');
    } catch (error) {
      console.error('[Flux] Failed to start:', error);
      callbacksRef.current.onError(error instanceof Error ? error.message : 'Failed to start listening');
      cleanup();
    }
  }, [apiKey, eotThreshold, eagerEotThreshold, eotTimeoutMs, keyterms, isListening, cleanup]);

  const stopListening = useCallback(() => {
    cleanup();
    console.log('[Flux] Listening stopped');
  }, [cleanup]);

  return { startListening, stopListening, isListening };
}
