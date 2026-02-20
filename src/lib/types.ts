export type AppState = 'sleeping' | 'waking' | 'listening' | 'thinking' | 'speaking' | 'waiting';

export type ClawbyExpression = 'sleeping' | 'waking' | 'listening' | 'thinking' | 'speaking' | 'waiting';

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
