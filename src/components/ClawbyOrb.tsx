import ClawbyCanvas from './ClawbyCanvas';
import ClawbyEyes from './ClawbyEyes';
import type { AppState } from '../lib/types';

interface ClawbyOrbProps {
  state: AppState;
  size?: number;
}

// Aura glow — commented out, will revisit later
// const GLOW_COLORS: Record<string, string> = {
//   idle: 'rgba(200, 170, 160, 0.15)',
//   listening: 'rgba(139, 92, 246, 0.6)',
//   thinking: 'rgba(99, 102, 241, 0.5)',
//   speaking: 'rgba(16, 185, 129, 0.6)',
//   sleeping: 'transparent',
// };

export default function ClawbyOrb({ state, size = 240 }: ClawbyOrbProps) {
  return (
    <div style={{
      position: 'relative',
      width: size,
      height: size,
    }}>
      <ClawbyCanvas state={state} size={size} />
      <ClawbyEyes state={state} size={size} />
    </div>
  );
}
