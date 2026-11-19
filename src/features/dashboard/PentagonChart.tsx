import { useEffect, useMemo, useRef, useState } from 'react';
import { pct, plural } from '../../lib/utils';

export interface PentagonDatum {
  id: string;
  name: string;
  color: string;
  icon: string;
  percent: number;
  done: number;
  total: number;
}

const CX = 210;
const CY = 208;
const R = 132;
const LABEL_R = 165;
const RINGS = [0.2, 0.4, 0.6, 0.8, 1];

function useAnimated(target: number[]) {
  const key = target.join(',');
  const [values, setValues] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    const from = [...current.current];
    const start = performance.now();
    const duration = 700;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      const next = target.map((v, i) => (from[i] ?? 0) + (v - (from[i] ?? 0)) * e);
      setValues(next);
      if (p < 1) raf = requestAnimationFrame(step);
      else current.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return values;
}

const angle = (i: number) => ((-90 + i * 72) * Math.PI) / 180;
const pointAt = (i: number, ratio: number) => ({
  x: CX + Math.cos(angle(i)) * R * ratio,
  y: CY + Math.sin(angle(i)) * R * ratio,
});
const polygon = (ratios: number[]) => ratios.map((r, i) => { const p = pointAt(i, r); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' ');

export function PentagonChart({ data, onPick, activeIndex, onActiveChange }: {
  data: PentagonDatum[];
  onPick?: (id: string) => void;
  activeIndex?: number | null;
  onActiveChange?: (i: number | null) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const slots = useMemo(() => Array.from({ length: 5 }, (_, i) => data[i] || null), [data]);
  const raw = slots.map((d) => (d ? d.percent / 100 : 0));
  const animated = useAnimated(raw);
  const active = hover ?? activeIndex ?? null;
  const overall = data.length ? Math.round(data.reduce((a, d) => a + d.percent, 0) / 5) : 0;
  const done = data.reduce((a, d) => a + d.done, 0);
  const total = data.reduce((a, d) => a + d.total, 0);

  const setActive = (i: number | null) => { setHover(i); onActiveChange?.(i); };
  const activeDatum = active !== null ? slots[active] : null;
  const activePoint = active !== null ? pointAt(active, Math.max(0.12, animated[active] || 0)) : null;

  return (
    <div className="pentagon" onMouseLeave={() => setActive(null)}>
      <svg viewBox="0 0 420 420" className="pentagon__svg" role="img" aria-label="Gráfico pentagonal de avance por materia">
        <defs>
          <linearGradient id="pentFill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6ee7ff" stopOpacity=".55" />
            <stop offset="55%" stopColor="#a78bfa" stopOpacity=".42" />
            <stop offset="100%" stopColor="#5b9cff" stopOpacity=".22" />
          </linearGradient>
          <linearGradient id="pentStroke" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#8ff0ff" /><stop offset="50%" stopColor="#b9a3ff" /><stop offset="100%" stopColor="#79b6ff" />
          </linearGradient>
          <radialGradient id="pentCore"><stop offset="0%" stopColor="#1b2a52" stopOpacity=".9" /><stop offset="100%" stopColor="#0b1122" stopOpacity=".65" /></radialGradient>
          <filter id="pentGlow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <filter id="polyGlow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="8" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>

        {/* Background rings + axes */}
        <g className="pentagon__grid">
          {RINGS.map((r) => <polygon key={r} points={polygon([r, r, r, r, r])} fill="none" stroke={r === 1 ? 'rgba(190,210,255,.28)' : 'rgba(190,210,255,.11)'} strokeWidth={r === 1 ? 1.4 : 1} strokeDasharray={r === 1 ? undefined : '3 6'} />)}
          {[0, 1, 2, 3, 4].map((i) => { const p = pointAt(i, 1); return <line key={i} x1={CX} y1={CY} x2={p.x} y2={p.y} stroke="rgba(190,210,255,.14)" strokeWidth="1" />; })}
          <text x={CX + 5} y={CY - R * 0.2 - 4} className="pentagon__scale">20</text>
          <text x={CX + 5} y={CY - R * 0.6 - 4} className="pentagon__scale">60</text>
          <text x={CX + 5} y={CY - R - 5} className="pentagon__scale">100%</text>
        </g>

        {/* Progress shape */}
        <polygon points={polygon(animated)} fill="url(#pentFill)" stroke="url(#pentStroke)" strokeWidth="2.4" strokeLinejoin="round" filter="url(#polyGlow)" className="pentagon__shape" />

        {/* Center hub */}
        <circle cx={CX} cy={CY} r="47" fill="url(#pentCore)" stroke="rgba(255,255,255,.14)" />
        <circle cx={CX} cy={CY} r="47" fill="none" stroke="url(#pentStroke)" strokeWidth="2.5" strokeDasharray={`${(overall / 100) * 295} 295`} strokeLinecap="round" transform={`rotate(-90 ${CX} ${CY})`} className="pentagon__ring" />
        <text x={CX} y={CY - 3} className="pentagon__overall" textAnchor="middle">{overall}%</text>
        <text x={CX} y={CY + 16} className="pentagon__overall-label" textAnchor="middle">avance general</text>

        {/* Vertices */}
        {slots.map((d, i) => {
          const p = pointAt(i, Math.max(0.02, animated[i] || 0));
          const outer = pointAt(i, 1);
          const label = pointAt(i, LABEL_R / R);
          const isActive = active === i;
          const anchor = 'middle';
          return (
            <g key={d?.id || `empty-${i}`}>
              {d && (
                <>
                  <circle cx={p.x} cy={p.y} r={isActive ? 12 : 9} fill={d.color} opacity={isActive ? 0.35 : 0.2} filter="url(#pentGlow)" />
                  <circle cx={p.x} cy={p.y} r={isActive ? 7.5 : 5.5} fill={d.color} stroke="#eaf6ff" strokeWidth="1.6" className="pentagon__dot" />
                  <circle cx={p.x} cy={p.y} r="22" fill="transparent" className="pentagon__hit" tabIndex={0} role="button"
                    aria-label={`${d.name}: ${d.percent} por ciento, ${plural(d.done, 'tarea completada', 'tareas completadas')} de ${d.total}`}
                    onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onClick={() => onPick?.(d.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick?.(d.id); } }} />
                  <line x1={outer.x} y1={outer.y} x2={label.x} y2={label.y} stroke={d.color} strokeOpacity={isActive ? 0.55 : 0.22} strokeWidth="1" />
                  <text x={label.x} y={label.y - 3} textAnchor={anchor} className="pentagon__label" fill={isActive ? '#ffffff' : '#c3cee8'}>{d.icon} {d.name.length > 15 ? `${d.name.slice(0, 14)}…` : d.name}</text>
                  <text x={label.x} y={label.y + 15} textAnchor={anchor} className="pentagon__value" fill={d.color}>{d.percent}%</text>
                </>
              )}
              {!d && (
                <>
                  <circle cx={outer.x} cy={outer.y} r="8" fill="none" stroke="rgba(190,210,255,.3)" strokeDasharray="3 4" />
                  <text x={label.x} y={label.y} textAnchor={anchor} className="pentagon__label" fill="#7785a6">+ materia</text>
                </>
              )}
            </g>
          );
        })}
      </svg>

      {activeDatum && activePoint && (
        <div className="pentagon__tooltip glass" style={{ left: `${(activePoint.x / 420) * 100}%`, top: `${(activePoint.y / 420) * 100}%` }}>
          <div className="pentagon__tooltip-head"><i style={{ background: activeDatum.color }} />{activeDatum.name}</div>
          <strong style={{ color: activeDatum.color }}>{activeDatum.percent}%</strong>
          <span>{plural(activeDatum.done, 'tarea hecha', 'tareas hechas')} de {activeDatum.total}</span>
        </div>
      )}
      <div className="pentagon__legend">
        <span className="muted">Vértices 0–100% · {pct(done, total)}% de las tareas del pentágono</span>
      </div>
    </div>
  );
}
