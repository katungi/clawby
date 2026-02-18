import { useState, useEffect } from 'react';
import type { AppState } from '../lib/types';

interface ClawbyEyesProps {
  state: AppState;
  size?: number;
}

export default function ClawbyEyes({ state }: ClawbyEyesProps) {
  const [blink, setBlink] = useState(false);
  const [look, setLook] = useState({ x: 0, y: 0 });

  // Blinking
  useEffect(() => {
    if (state === 'sleeping') return;
    let tid: ReturnType<typeof setTimeout>;
    const doBlink = () => {
      const delay = 2500 + Math.random() * 3500;
      tid = setTimeout(() => {
        setBlink(true);
        setTimeout(() => {
          setBlink(false);
          // Occasional double-blink
          if (Math.random() < 0.25) {
            setTimeout(() => {
              setBlink(true);
              setTimeout(() => setBlink(false), 90);
            }, 180);
          }
        }, 100);
        doBlink();
      }, delay);
    };
    doBlink();
    return () => clearTimeout(tid);
  }, [state]);

  // Look direction
  useEffect(() => {
    if (state === 'sleeping') { setLook({ x: 0, y: 0 }); return; }
    const patterns: Record<string, { x: number; y: number }[]> = {
      idle: [
        { x: 0, y: 0 }, { x: 8, y: -2 }, { x: 0, y: 0 }, { x: -7, y: 1 }, { x: 0, y: 0 },
        { x: 4, y: -5 }, { x: 0, y: 0 }, { x: -5, y: -4 }, { x: 0, y: 0 }, { x: 2, y: 4 }, { x: 0, y: 0 },
      ],
      listening: [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: 0 }, { x: 1, y: -1 }],
      thinking: [{ x: 5, y: -7 }, { x: -4, y: -8 }, { x: 6, y: -5 }, { x: -2, y: -9 }, { x: 0, y: -8 }],
      speaking: [{ x: 0, y: 0 }, { x: 2, y: -1 }, { x: -1, y: 0 }, { x: 0, y: -2 }, { x: 1, y: 1 }],
    };
    const speeds: Record<string, number> = { idle: 1800, listening: 900, thinking: 1100, speaking: 1400 };
    const p = patterns[state] || patterns.idle;
    let i = 0;
    setLook(p[0]);
    const t = setInterval(() => { i = (i + 1) % p.length; setLook(p[i]); }, speeds[state] || 1800);
    return () => clearInterval(t);
  }, [state]);

  const eyeScale = state === 'listening' ? 1.25 : 1;
  const eyeW = 18 * eyeScale;
  const eyeH = 24 * eyeScale;

  return (
    <div style={{
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: `translate(calc(-50% + ${look.x}px), calc(-50% + ${look.y}px))`,
      display: 'flex',
      gap: state === 'speaking' ? '22px' : '20px',
      alignItems: 'center',
      transition: 'transform 0.4s cubic-bezier(0.25,0.46,0.45,0.94), gap 0.3s',
      zIndex: 10,
      pointerEvents: 'none',
    }}>
      {state === 'sleeping' ? (
        <>
          <div style={{ width: 18, height: 2.5, background: 'rgba(255,255,255,0.35)', borderRadius: 2 }} />
          <div style={{ width: 18, height: 2.5, background: 'rgba(255,255,255,0.35)', borderRadius: 2 }} />
        </>
      ) : state === 'speaking' ? (
        <>
          <div style={{ width: 20, height: 12, borderTop: '4px solid white', borderRadius: '50% 50% 0 0', filter: 'drop-shadow(0 -2px 8px rgba(255,255,255,0.3))' }} />
          <div style={{ width: 20, height: 12, borderTop: '4px solid white', borderRadius: '50% 50% 0 0', filter: 'drop-shadow(0 -2px 8px rgba(255,255,255,0.3))' }} />
        </>
      ) : (
        <>
          <div style={{
            width: eyeW, height: blink ? 3 : eyeH,
            borderRadius: '50%', background: 'white',
            boxShadow: `0 0 ${12 * eyeScale}px rgba(255,255,255,0.5), 0 0 ${24 * eyeScale}px rgba(255,255,255,0.2)`,
            transition: 'height 0.08s ease, width 0.25s ease',
          }} />
          <div style={{
            width: eyeW, height: blink ? 3 : eyeH,
            borderRadius: '50%', background: 'white',
            boxShadow: `0 0 ${12 * eyeScale}px rgba(255,255,255,0.5), 0 0 ${24 * eyeScale}px rgba(255,255,255,0.2)`,
            transition: 'height 0.08s ease, width 0.25s ease',
          }} />
        </>
      )}
    </div>
  );
}
