import { useState } from 'react';
import { AppConfig, loadConfig, saveConfig } from '../lib/config';

interface SetupScreenProps {
  onConnect: (config: AppConfig) => void;
  onCancel?: () => void;
}

const VOICES = [
  { value: 'nova', label: 'Nova (warm, natural)' },
  { value: 'alloy', label: 'Alloy (neutral)' },
  { value: 'echo', label: 'Echo (male)' },
  { value: 'fable', label: 'Fable (expressive)' },
  { value: 'onyx', label: 'Onyx (deep)' },
  { value: 'shimmer', label: 'Shimmer (soft)' },
] as const;

export function SetupScreen({ onConnect, onCancel }: SetupScreenProps) {
  const saved = loadConfig();

  const [url, setUrl] = useState(saved?.openclawUrl ?? 'http://localhost:3001');
  const [token, setToken] = useState(saved?.openclawToken ?? '');
  const [dgKey, setDgKey] = useState(saved?.deepgramKey ?? '');
  const [oaiKey, setOaiKey] = useState(saved?.openaiKey ?? '');
  const [voice, setVoice] = useState<AppConfig['voice']>(saved?.voice ?? 'nova');
  const [model, setModel] = useState(saved?.model ?? 'openai/gpt-4o-mini');
  const [conductorModel, setConductorModel] = useState(saved?.conductorModel ?? 'openai/gpt-4o-mini');
  const [pvKey, setPvKey] = useState(saved?.picovoiceKey ?? '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const trimmedUrl = url.trim().replace(/\/$/, '');
    const trimmedToken = token.trim();
    const trimmedDg = dgKey.trim();
    const trimmedOai = oaiKey.trim();
    const trimmedModel = model.trim();
    const trimmedConductorModel = conductorModel.trim();

    if (!trimmedUrl || !trimmedToken || !trimmedDg || !trimmedOai || !trimmedConductorModel) {
      setError('All fields are required.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${trimmedUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${trimmedToken}`,
        },
        body: JSON.stringify({
          model: trimmedConductorModel,
          messages: [{ role: 'user', content: 'respond with just the word "connected"' }],
          stream: false,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      const data = await res.json();
      if (!data.choices?.[0]?.message?.content) throw new Error('Unexpected response format');
    } catch (err) {
      setError(`Connection failed: ${err instanceof Error ? err.message : String(err)}`);
      setLoading(false);
      return;
    }

    const config: AppConfig = {
      openclawUrl: trimmedUrl,
      openclawToken: trimmedToken,
      deepgramKey: trimmedDg,
      openaiKey: trimmedOai,
      voice,
      model: trimmedModel,
      conductorModel: trimmedConductorModel,
      picovoiceKey: pvKey.trim() || undefined,
    };

    saveConfig(config);
    setLoading(false);
    onConnect(config);
  }

  return (
    <div className="setup">
      <form onSubmit={handleSubmit}>
        <h1>🦞 ClawAssist</h1>
        <p className="sub">Talk to your OpenClaw. Enter your keys below.</p>

        <div className="field">
          <label>OpenClaw Gateway URL</label>
          <input value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <div className="field">
          <label>Gateway Token</label>
          <input type="password" placeholder="your gateway token" value={token} onChange={(e) => setToken(e.target.value)} />
        </div>
        <div className="field">
          <label>Deepgram API Key</label>
          <input type="password" placeholder="your deepgram key" value={dgKey} onChange={(e) => setDgKey(e.target.value)} />
        </div>
        <div className="field">
          <label>OpenAI API Key (for TTS voice)</label>
          <input type="password" placeholder="your openai key" value={oaiKey} onChange={(e) => setOaiKey(e.target.value)} />
        </div>
        <div className="field">
          <label>Voice</label>
          <select value={voice} onChange={(e) => setVoice(e.target.value as AppConfig['voice'])}>
            {VOICES.map((v) => (
              <option key={v.value} value={v.value}>{v.label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Assistant Model (fast chat)</label>
          <input value={conductorModel} onChange={(e) => setConductorModel(e.target.value)} />
          <div className="hint">Used for voice responses. Choose a fast model (for example: openai/gpt-4o-mini).</div>
        </div>
        <div className="field">
          <label>Tool Model (actions)</label>
          <input value={model} onChange={(e) => setModel(e.target.value)} />
          <div className="hint">Used when openclaw executes computer actions. Can be stronger/slower.</div>
        </div>
        <div className="field">
          <label>Picovoice AccessKey (optional)</label>
          <input type="password" placeholder="enables wake word detection" value={pvKey} onChange={(e) => setPvKey(e.target.value)} />
          <div className="hint">Free at picovoice.ai — say "Computer" to activate. Leave blank for hotkey-only.</div>
        </div>

        <button type="submit" className="connect-btn" disabled={loading}>
          {loading ? 'Testing connection...' : 'Connect & Start'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} style={{
            width: '100%',
            padding: '10px',
            marginTop: '8px',
            background: 'transparent',
            border: '1px solid #333',
            borderRadius: '8px',
            color: '#666',
            fontSize: '13px',
            cursor: 'pointer',
          }}>
            Cancel
          </button>
        )}
        {error && <div className="setup-error">{error}</div>}
      </form>
    </div>
  );
}
