interface EdgeGlowProps {
  active: boolean;
  color: string;
}

export function EdgeGlow({ active, color }: EdgeGlowProps) {
  const style = {
    '--glow-c': color,
    opacity: active ? 1 : 0,
  } as React.CSSProperties;

  return (
    <>
      <div className="glow glow-t" style={style} />
      <div className="glow glow-b" style={style} />
      <div className="glow glow-l" style={style} />
      <div className="glow glow-r" style={style} />
    </>
  );
}
