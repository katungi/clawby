import { useRef, useState, useCallback, useMemo } from 'react';
import { streamText, tool, stepCountIs, type ModelMessage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { CLAWBY_SYSTEM_PROMPT } from '../lib/clawbyPrompt';

// ── Types ──

export interface ConductorConfig {
  conductorBaseUrl: string;   // OpenAI-compatible API base URL
  conductorModel: string;     // e.g. 'gpt-4o-mini'
  conductorApiKey: string;    // API key for the conductor provider
  openClawUrl: string;        // OpenClaw gateway URL (e.g. http://localhost:3001)
  openClawToken: string;      // OpenClaw auth token
  openClawModel: string;      // Model for OpenClaw tool execution (e.g. 'gpt-4o')
}

export interface ConductorCallbacks {
  /** First text delta arrived — Clawby is speaking */
  onTextDelta: (delta: string, accumulated: string) => void;
  /** A clause boundary was detected — good time to trigger TTS */
  onClause: (clause: string) => void;
  /** Conductor is calling the openclaw tool */
  onToolCallStart: (toolName: string, args: Record<string, unknown>) => void;
  /** Tool call completed */
  onToolCallComplete: (toolName: string, result: string) => void;
  /** Stream finished */
  onComplete: (fullResponse: string) => void;
  /** Error occurred */
  onError: (error: Error) => void;
}

export interface UseConductorReturn {
  /** Send user transcript to conductor */
  sendMessage: (text: string) => Promise<void>;
  /** Abort current generation */
  abort: () => void;
  /** Clear conversation history */
  clearHistory: () => void;
  /** Whether the conductor is currently generating */
  isProcessing: boolean;
}

// ── Clause Detection ──

/**
 * Detects clause boundaries in streaming text for TTS chunking.
 * Matches the existing clause detection logic from useOpenClaw.
 */
class ClauseDetector {
  private buffer = '';

  private static readonly CLAUSE_END_REGEX = /[.!?;,:\u2014]\s|[.!?]$/;
  private static readonly MIN_CLAUSE_CHARS = 8;
  private static readonly MIN_CLAUSE_WORDS = 2;
  private static readonly MAX_WORDS_WITHOUT_PUNCTUATION = 4;

  /** Feed a text delta, get back any complete clauses */
  feed(delta: string): string[] {
    this.buffer += delta;
    const clauses: string[] = [];

    let flushed = true;
    while (flushed) {
      flushed = false;
      const match = this.buffer.match(ClauseDetector.CLAUSE_END_REGEX);

      if (match) {
        const endIndex = match.index! + match[0].trimEnd().length;
        const clause = this.buffer.slice(0, endIndex).trim();
        const words = clause.split(/\s+/).length;

        if (clause.length >= ClauseDetector.MIN_CLAUSE_CHARS || words >= ClauseDetector.MIN_CLAUSE_WORDS) {
          clauses.push(clause);
          this.buffer = this.buffer.slice(endIndex).trim();
          flushed = true;
        }
      }

      // Word-count fallback: flush if we have several words with no punctuation match
      if (!flushed) {
        const words = this.buffer.trim().split(/\s+/).length;
        if (words >= ClauseDetector.MAX_WORDS_WITHOUT_PUNCTUATION && this.buffer.trim().length > 0) {
          clauses.push(this.buffer.trim());
          this.buffer = '';
          flushed = true;
        }
      }
    }

    return clauses;
  }

  /** Flush any remaining text */
  flush(): string | null {
    const remaining = this.buffer.trim();
    this.buffer = '';
    return remaining.length > 0 ? remaining : null;
  }
}

// ── OpenClaw Tool Implementation ──

/**
 * Calls OpenClaw gateway to execute actions on the user's computer.
 * This is the "hands" — the conductor decides when to use it.
 */
async function callOpenClaw(
  message: string,
  config: { url: string; token: string; model: string },
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(`${config.url}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.token}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: 'system',
          content:
            'You are an AI assistant with full access to the user\'s computer via OpenClaw tools. Execute the requested action. Be concise in your response — just confirm what you did.',
        },
        { role: 'user', content: message },
      ],
      stream: false,
      user: 'clawassist-conductor',
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`OpenClaw error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? 'Action completed but no response.';
}

// ── The Hook ──

export function useConductor(
  config: ConductorConfig,
  callbacks: ConductorCallbacks,
): UseConductorReturn {
  const MAX_HISTORY_MESSAGES = 12;
  const [isProcessing, setIsProcessing] = useState(false);
  const historyRef = useRef<ModelMessage[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const provider = useMemo(
    () => createOpenAI({
      apiKey: config.conductorApiKey,
      baseURL: config.conductorBaseUrl,
      fetch: async (input, init) => {
        const headers = new Headers(init?.headers ?? {});
        headers.delete('user-agent');

        let body = init?.body;
        if (typeof body === 'string') {
          try {
            const parsed = JSON.parse(body) as Record<string, unknown>;
            delete parsed.stream_options;
            body = JSON.stringify(parsed);
          } catch {
            // Keep original body when it is not JSON.
          }
        }

        return fetch(input, {
          ...init,
          headers,
          body,
        });
      },
    }),
    [config.conductorApiKey, config.conductorBaseUrl],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (isProcessing) return;
      setIsProcessing(true);

      // Add user message to history
      historyRef.current.push({ role: 'user', content: text });
      if (historyRef.current.length > MAX_HISTORY_MESSAGES) {
        historyRef.current = historyRef.current.slice(-MAX_HISTORY_MESSAGES);
      }

      const abortController = new AbortController();
      abortRef.current = abortController;

      const clauseDetector = new ClauseDetector();
      let accumulatedText = '';

      try {
        const result = streamText({
          model: provider.chat(config.conductorModel),
          system: CLAWBY_SYSTEM_PROMPT,
          messages: historyRef.current,
          abortSignal: abortController.signal,
          stopWhen: stepCountIs(2),

          // ── The OpenClaw Tool ──
          tools: {
            openclaw: tool({
              description:
                'Execute an action on the user\'s computer. Can open apps, run shell commands, browse the web, manage files, search the filesystem, and more. Pass a natural language instruction describing what to do.',
              inputSchema: z.object({
                instruction: z
                  .string()
                  .describe(
                    'Natural language instruction for what to do on the computer. Be specific. Examples: "open Safari and navigate to twitter.com", "find all .png files in ~/Downloads", "run `ls -la` in the terminal"'
                  ),
              }),
              execute: async ({ instruction }) => {
                callbacksRef.current.onToolCallStart('openclaw', { instruction });

                try {
                  const result = await callOpenClaw(
                    instruction,
                    {
                      url: config.openClawUrl,
                      token: config.openClawToken,
                      model: config.openClawModel,
                    },
                    abortController.signal,
                  );

                  callbacksRef.current.onToolCallComplete('openclaw', result);
                  return result;
                } catch (error) {
                  const errMsg =
                    error instanceof Error ? error.message : 'Unknown error';
                  callbacksRef.current.onToolCallComplete('openclaw', `Error: ${errMsg}`);
                  return `Error executing action: ${errMsg}`;
                }
              },
            }),
          },

          // ── Stream Processing ──
          onChunk({ chunk }) {
            if (chunk.type === 'text-delta') {
              accumulatedText += chunk.text;
              callbacksRef.current.onTextDelta(chunk.text, accumulatedText);

              // Check for clause boundaries → trigger TTS
              const clauses = clauseDetector.feed(chunk.text);
              for (const clause of clauses) {
                callbacksRef.current.onClause(clause);
              }
            }
          },

          onError({ error }) {
            callbacksRef.current.onError(
              error instanceof Error ? error : new Error(String(error)),
            );
          },
        });

        // Wait for the full response
        const finalText = await result.text;

        // Flush any remaining text in the clause detector
        const remaining = clauseDetector.flush();
        if (remaining) {
          callbacksRef.current.onClause(remaining);
        }

        // Add assistant response to history
        historyRef.current.push({ role: 'assistant', content: finalText });
        if (historyRef.current.length > MAX_HISTORY_MESSAGES) {
          historyRef.current = historyRef.current.slice(-MAX_HISTORY_MESSAGES);
        }

        callbacksRef.current.onComplete(finalText);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          callbacksRef.current.onError(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      } finally {
        setIsProcessing(false);
        abortRef.current = null;
      }
    },
    [isProcessing, config, provider],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setIsProcessing(false);
  }, []);

  const clearHistory = useCallback(() => {
    historyRef.current = [];
  }, []);

  return {
    sendMessage,
    abort,
    clearHistory,
    isProcessing,
  };
}
