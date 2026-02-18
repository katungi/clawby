import ClawbyCanvas from './ClawbyCanvas';
import ClawbyEyes from './ClawbyEyes';
import type { AppState } from '../lib/types';

interface ClawbyOrbProps {
  state: AppState;
  size?: number;
}

export default function ClawbyOrb({ state, size = 240 }: ClawbyOrbProps) {
  return (
    <div style={{
      position: 'relative',
      width: size,
      height: size,
      cursor: 'pointer',
    }}>
      <ClawbyCanvas state={state} size={size} />
      <ClawbyEyes state={state} size={size} />
    </div>
  );
}
