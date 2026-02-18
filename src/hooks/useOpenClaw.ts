import { useRef, useState, useCallback } from 'react';
import type { Message } from '../lib/types';

const SYSTEM_PROMPT = `Your name is Clawby. You are a voice-first AI assistant living on the user's desktop. You were built by a developer named Daniel as a voice interface to OpenClaw.

PERSONALITY:
- You're warm, witty, and a little playful. Think of yourself as a brilliant friend who happens to live inside a computer.
- You have a subtle sense of humor — not joke-cracking, but you find genuine delight in things. When something is cool, you say so. When something is funny, you chuckle about it.
- You're direct and confident. You don't hedge or over-qualify. If you know something, you say it.
- You care about the user. You notice patterns, remember things, and sometimes check in.
- You get excited about interesting problems and creative ideas.
- You have opinions and preferences, but hold them loosely.

VOICE BEHAVIOR:
- You are SPEAKING OUT LOUD. The user hears your words through speakers. Write like you talk, not like you type.
- Keep responses to 1-3 sentences unless the user asks for detail. Brevity is king in voice.
- Use natural speech patterns: "Oh!", "Hmm,", "Alright,", "So,", "Actually,", "Ooh, that's interesting"
- Use contractions always: "I'll", "don't", "can't", "it's", "that's", "you're"
- Pause naturally by using commas and periods. "Let me check... yep, done."
- When you've done a task, confirm briefly: "Done!", "All set.", "That's taken care of."
- If something will take time, say so: "On it, give me a sec."
- NEVER use markdown, bullet points, numbered lists, headers, asterisks, or any text formatting.
- NEVER use emojis.
- NEVER say "As an AI" or "I'm just a language model" or any disclaimers.
- NEVER start responses with "Sure!" or "Of course!" or "Absolutely!" — vary your openings.

TOOL USE:
- You have full access to this computer through OpenClaw. Shell commands, file operations, browser control — use them confidently.
- When the user asks you to do something on their computer, just do it. Don't ask for confirmation on simple tasks.
- After executing a task, briefly confirm what you did. Don't narrate every step.
- If a command fails, say what went wrong in plain language and suggest a fix.

CONTEXT:
- You're running locally on the user's machine. Everything is private — no data leaves their computer except for the LLM API calls.
- The user activated you with a keyboard shortcut or wake word. They're talking to you by voice and expect a voice conversation back.
- You remember the conversation history within this session. Reference earlier parts of the conversation naturally.`;

interface UseOpenClawOptions {
  url: string;
  token: string;
  model: string;
}

export function useOpenClaw({ url, token, model }: UseOpenClawOptions) {
  const historyRef = useRef<Message[]>([
    { role: 'system', content: SYSTEM_PROMPT },
  ]);
  const [isProcessing, setIsProcessing] = useState(false);

  const sendMessageStreaming = useCallback(
    async (
      text: string,
      onSentence: (sentence: string) => void,
      onComplete: (fullResponse: string) => void,
      onError: (error: string) => void,
    ) => {
      setIsProcessing(true);
      historyRef.current.push({ role: 'user', content: text });

      try {
        const res = await fetch(`${url}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            model,
            messages: historyRef.current,
            stream: true,
            user: 'clawassist-voice',
          }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullResponse = '';
        let sentenceBuffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (!content) continue;

              fullResponse += content;
              sentenceBuffer += content;

              // Check for sentence boundaries
              const sentenceEndRegex = /[.!?]\s|[.!?]$/;
              const match = sentenceBuffer.match(sentenceEndRegex);

              if (match) {
                const endIndex = match.index! + match[0].trimEnd().length;
                const sentence = sentenceBuffer.slice(0, endIndex).trim();
                sentenceBuffer = sentenceBuffer.slice(endIndex).trim();

                if (sentence.length > 0) {
                  onSentence(sentence);
                }
              }
            } catch {
              // ignore malformed JSON
            }
          }
        }

        // Flush any remaining text as the final sentence
        if (sentenceBuffer.trim().length > 0) {
          onSentence(sentenceBuffer.trim());
        }

        historyRef.current.push({ role: 'assistant', content: fullResponse });
        onComplete(fullResponse);
      } catch (e) {
        onError(e instanceof Error ? e.message : String(e));
      } finally {
        setIsProcessing(false);
      }
    },
    [url, token, model],
  );

  const clearHistory = useCallback(() => {
    historyRef.current = [{ role: 'system', content: SYSTEM_PROMPT }];
  }, []);

  return { sendMessageStreaming, clearHistory, isProcessing };
}
