export interface AppConfig {
  openclawUrl: string;
  openclawToken: string;
  deepgramKey: string;
  openaiKey: string;
  voice: 'nova' | 'alloy' | 'echo' | 'fable' | 'onyx' | 'shimmer';
  model: string;
}

const STORAGE_KEY = 'clawassist-config';

export function saveConfig(config: AppConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function loadConfig(): AppConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AppConfig;
  } catch {
    return null;
  }
}
