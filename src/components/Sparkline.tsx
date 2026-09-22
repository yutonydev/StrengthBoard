import { useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import type { Session, Trend } from '../lib/stats';
import type { Unit } from '../types';
import { fmtShortDate } from '../lib/dates';
import { fmtSet } from '../lib/units';

const TONE: Record<Trend, string> = {
  up: 'var(--lb-up)',
  down: 'var(--lb-down)',
  flat: 'var(--lb-fg-faint)',
};

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

interface Props {
  sessions: Session[];
  trend: Trend;
  unit: Unit;
  height?: number;
}

export function Sparkline({ sessions, trend, unit, height = 32 }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const color = TONE[trend];
  const padX = 5;
  const padY = 6;

  if (sessions.length === 0) {
    return (
      <div ref={ref} className="relative flex h-8 w-full items-center" aria-hidden="true">
        <div className="w-full border-t border-dashed border-line-strong" />
      </div>
    );
  }

  const values = sessions.map((s) => s.top.weight);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const floor = hi * 0.08;
  const pad = Math.max(0, (floor - (hi - lo)) / 2);
  const min = lo - pad;
  const max = hi + pad;
  const span = max - min;
  const w = Math.max(width, 1);
  const x = (i: number) => (sessions.length === 1 ? w / 2 : padX + (i * (w - padX * 2)) / (sessions.length - 1));
  const y = (v: number) => (span === 0 ? height / 2 : padY + (1 - (v - min) / span) * (height - padY * 2));

  const pts = values.map((v, i) => [x(i), y(v)] as const);
  const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('');
  const area = `${line}L${pts[pts.length - 1][0].toFixed(1)},${height}L${pts[0][0].toFixed(1)},${height}Z`;
  const last = pts[pts.length - 1];
  const active = hover !== null && hover < sessions.length ? hover : null;

  function onMove(e: PointerEvent<HTMLDivElement>) {
    if (sessions.length < 2) return setHover(0);
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left - padX) / (rect.width - padX * 2);
    setHover(Math.max(0, Math.min(sessions.length - 1, Math.round(rel * (sessions.length - 1)))));
  }

  return (
    <div
      ref={ref}
      className="relative h-8 w-full"
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
      aria-hidden="true"
    >
      {width > 0 && (
        <svg width={w} height={height} className="block overflow-visible">
          {sessions.length > 1 && (
            <>
              <path d={area} fill={color} opacity={0.1} />
              <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            </>
          )}
          {active !== null && (
            <line x1={pts[active][0]} x2={pts[active][0]} y1={0} y2={height} stroke="var(--lb-line-strong)" strokeWidth={1} />
          )}
          <circle
            cx={active !== null ? pts[active][0] : last[0]}
            cy={active !== null ? pts[active][1] : last[1]}
            r={4}
            fill={color}
            stroke="var(--lb-surface)"
            strokeWidth={2}
          />
        </svg>
      )}
      {active !== null && (
        <div
          className="pointer-events-none absolute bottom-full z-30 mb-1.5 -translate-x-1/2 rounded-md border border-line-strong bg-surface-3 px-2 py-1 whitespace-nowrap shadow-pop"
          style={{ left: Math.min(Math.max(pts[active][0], 44), w - 44) }}
        >
          <span className="font-mono text-xs font-medium text-fg">
            {fmtSet(sessions[active].top.weight, sessions[active].top.reps, unit)}
          </span>
          <span className="ml-1.5 text-[11px] text-muted">{fmtShortDate(sessions[active].date)}</span>
        </div>
      )}
    </div>
  );
}
