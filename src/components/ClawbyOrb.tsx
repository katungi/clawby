import ClawbyCanvas from './ClawbyCanvas';
import ClawbyEyes from './ClawbyEyes';
import type { AppState } from '../lib/types';

interface ClawbyOrbProps {
  state: AppState;
  size?: number;
}

const GLOW_COLORS: Record<string, string> = {
  idle: 'rgba(200, 170, 160, 0.15)',
  listening: 'rgba(139, 92, 246, 0.6)',
  thinking: 'rgba(99, 102, 241, 0.5)',
  speaking: 'rgba(16, 185, 129, 0.6)',
  sleeping: 'transparent',
};

export default function ClawbyOrb({ state, size = 240 }: ClawbyOrbProps) {
  const glowColor = GLOW_COLORS[state] || 'transparent';
  const isActive = state === 'listening' || state === 'thinking' || state === 'speaking';

  return (
    <div style={{
      position: 'relative',
      width: size,
      height: size,
      borderRadius: '50%',
      boxShadow: isActive
        ? `0 0 40px 10px ${glowColor}, 0 0 80px 40px ${glowColor}`
        : `0 0 20px 5px ${glowColor}`,
      transition: 'box-shadow 0.6s ease',
    }}>
      <ClawbyCanvas state={state} size={size} />
      <ClawbyEyes state={state} size={size} />
    </div>
  );
}
