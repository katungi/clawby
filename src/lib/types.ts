export type AppState = 'idle' | 'listening' | 'thinking' | 'speaking';

export type ClawbyExpression = 'idle' | 'listening' | 'thinking' | 'speaking' | 'sleeping';

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
