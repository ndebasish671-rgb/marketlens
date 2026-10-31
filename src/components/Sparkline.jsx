import React, { useId } from 'react';

export default function Sparkline({ values = [], width = 120, height = 40, color = '#10a779', fill = true, strokeWidth = 1.8 }) {
  const id = useId().replace(/:/g, '');
  const pts = values.filter(v => Number.isFinite(v));
  if (pts.length < 2) return <svg width={width} height={height} aria-hidden="true"><line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="#dfe5ea" strokeDasharray="3 3" /></svg>;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const pad = 3;
  const coords = pts.map((v, i) => [pad + i / (pts.length - 1) * (width - pad * 2), height - pad - (v - min) / span * (height - pad * 2)]);
  const line = coords.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
  const area = `${line} L${coords.at(-1)[0].toFixed(2)},${height} L${coords[0][0].toFixed(2)},${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Recent price trend" className="sparkline">
      <defs><linearGradient id={`sp-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.18" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {fill && <path d={area} fill={`url(#sp-${id})`} />}
      <path d={line} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
