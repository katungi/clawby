import { ClawbyExpression } from '../lib/types';

interface ClawbyProps {
  expression: ClawbyExpression;
  size?: number;
}

export function Clawby({ expression, size = 160 }: ClawbyProps) {
  const show = (expr: string) => (expression === expr ? undefined : 'none');

  return (
    <svg
      className="clawby"
      width={size}
      height={size * 1.125}
      viewBox="0 0 200 200"
      fill="none"
    >
      {/* Antennae */}
      <path d="M82 58 Q76 38 68 28" stroke="#e0e0e0" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <circle cx="67" cy="26" r="4" fill="#e0e0e0" />
      <path d="M118 58 Q124 38 132 28" stroke="#e0e0e0" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <circle cx="133" cy="26" r="4" fill="#e0e0e0" />

      {/* Left claw */}
      <path d="M62 90 Q42 82 32 72" stroke="#e0e0e0" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M32 72 Q24 62 20 56" stroke="#e0e0e0" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M32 72 Q28 78 22 74" stroke="#e0e0e0" strokeWidth="3" strokeLinecap="round" fill="none" />

      {/* Right claw */}
      <path d="M138 90 Q158 82 168 72" stroke="#e0e0e0" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M168 72 Q176 62 180 56" stroke="#e0e0e0" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M168 72 Q172 78 178 74" stroke="#e0e0e0" strokeWidth="3" strokeLinecap="round" fill="none" />

      {/* Body */}
      <path
        d="M66 68 Q60 76 60 92 Q60 120 72 136 Q84 150 100 152 Q116 150 128 136 Q140 120 140 92 Q140 76 134 68 Q126 56 100 54 Q74 56 66 68 Z"
        stroke="#e0e0e0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"
      />

      {/* Legs */}
      <path d="M78 142 Q72 154 66 160" stroke="#e0e0e0" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M86 148 Q82 160 78 166" stroke="#e0e0e0" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M122 142 Q128 154 134 160" stroke="#e0e0e0" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M114 148 Q118 160 122 166" stroke="#e0e0e0" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M100 152 L100 164" stroke="#e0e0e0" strokeWidth="2.5" strokeLinecap="round" fill="none" />

      {/* Eyes — idle */}
      <g style={{ display: show('idle') }}>
        <circle cx="78" cy="82" r="8" fill="#e0e0e0" />
        <circle cx="122" cy="82" r="8" fill="#e0e0e0" />
        <circle cx="75" cy="79" r="2.5" fill="#0a0a0a" />
        <circle cx="119" cy="79" r="2.5" fill="#0a0a0a" />
      </g>

      {/* Eyes — listening */}
      <g style={{ display: show('listening') }}>
        <circle cx="78" cy="82" r="10" fill="#e0e0e0" />
        <circle cx="122" cy="82" r="10" fill="#e0e0e0" />
        <circle cx="74" cy="78" r="3" fill="#0a0a0a" />
        <circle cx="118" cy="78" r="3" fill="#0a0a0a" />
      </g>

      {/* Eyes — thinking */}
      <g style={{ display: show('thinking') }}>
        <path d="M68 82 Q78 78 88 82" stroke="#e0e0e0" strokeWidth="3.5" strokeLinecap="round" fill="none" />
        <path d="M112 82 Q122 78 132 82" stroke="#e0e0e0" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      </g>

      {/* Eyes — speaking */}
      <g style={{ display: show('speaking') }}>
        <path d="M68 84 Q78 76 88 84" stroke="#e0e0e0" strokeWidth="3.5" strokeLinecap="round" fill="none" />
        <path d="M112 84 Q122 76 132 84" stroke="#e0e0e0" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      </g>

      {/* Mouth — idle */}
      <path d="M90 100 Q100 106 110 100" stroke="#e0e0e0" strokeWidth="2.5" strokeLinecap="round" fill="none"
        style={{ display: show('idle') }} />

      {/* Mouth — listening */}
      <ellipse cx="100" cy="104" rx="6" ry="8" fill="#e0e0e0"
        style={{ display: show('listening') }} />

      {/* Mouth — thinking */}
      <circle cx="106" cy="102" r="4" fill="#e0e0e0"
        style={{ display: show('thinking') }} />

      {/* Mouth — speaking */}
      <path d="M88 98 Q100 112 112 98" stroke="#e0e0e0" strokeWidth="2.5" strokeLinecap="round" fill="none"
        style={{ display: show('speaking') }} />

      {/* Thinking bubbles */}
      <g style={{ display: show('thinking') }}>
        <circle cx="148" cy="62" r="3" fill="#e0e0e0" opacity="0.4" />
        <circle cx="156" cy="50" r="5" fill="#e0e0e0" opacity="0.3" />
        <circle cx="166" cy="36" r="7" fill="#e0e0e0" opacity="0.2" />
      </g>

      {/* Sound waves for listening */}
      <g style={{ display: show('listening') }}>
        <path d="M44 84 Q38 76 44 68" stroke="#e0e0e0" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.3" />
        <path d="M36 88 Q28 76 36 64" stroke="#e0e0e0" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.2" />
        <path d="M156 84 Q162 76 156 68" stroke="#e0e0e0" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.3" />
        <path d="M164 88 Q172 76 164 64" stroke="#e0e0e0" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.2" />
      </g>
    </svg>
  );
}
