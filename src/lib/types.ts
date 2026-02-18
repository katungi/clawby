export type AppState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'sleeping';

export type ClawbyExpression = 'idle' | 'listening' | 'thinking' | 'speaking' | 'sleeping';

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
