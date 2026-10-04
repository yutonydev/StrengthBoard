import { useMemo, useState, type MouseEvent } from 'react';
import { ChevronDown, Flame, TrendingUp } from 'lucide-react';
import type { Exercise, Unit, WorkoutSet } from '../types';
import type { ExerciseStats } from '../lib/stats';
import { liftProgress, trainingCalendar, weekStreaks, type CalendarDay } from '../lib/progress';
import { fmtShortDate, fmtWeekday, today } from '../lib/dates';
import { fmtCompact, fmtNum, fmtWeight, fromKg } from '../lib/units';

const WEEKS = 26;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const OPEN_KEY = 'strengthboard:progress-open';
const LIST_LIMIT = 6;

interface Props {
  exercises: Exercise[];
  sets: WorkoutSet[];
  statsById: Map<string, ExerciseStats>;
  unit: Unit;
}

interface Hover {
  day: CalendarDay;
  left: number;
  top: number;
}

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== 'false';
  } catch {
    return true;
  }
}

function Heatmap({ exercises, sets }: { exercises: Exercise[]; sets: WorkoutSet[] }) {
  const [hover, setHover] = useState<Hover | null>(null);
  const now = today();
  const names = useMemo(() => new Map(exercises.map((e) => [e.id, e.name])), [exercises]);
  const calendar = useMemo(() => trainingCalendar(sets, names, now, WEEKS), [sets, names, now]);
  const streaks = useMemo(() => weekStreaks(sets.map((s) => s.date), now), [sets, now]);

  function show(day: CalendarDay, e: MouseEvent<HTMLSpanElement>) {
    const cell = e.currentTarget;
    setHover({ day, left: cell.offsetLeft + cell.offsetWidth / 2, top: cell.offsetTop });
  }

  const monthAt = (i: number): string | null => {
    const month = Number(calendar.weeks[i].start.slice(5, 7));
    if (i === 0) return MONTHS[month - 1];
    const previous = Number(calendar.weeks[i - 1].start.slice(5, 7));
    return month !== previous ? MONTHS[month - 1] : null;
  };

  const summary = `${calendar.trainingDays} training days and ${calendar.totalSets} sets in the last ${WEEKS} weeks. Current streak ${streaks.current} weeks, longest ${streaks.longest}.`;

  return (
    <div className="flex min-w-0 flex-col rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-sm font-semibold text-fg">Consistency</h3>
        <p className="text-xs text-muted">
          <span className="font-mono text-fg">{calendar.trainingDays}</span> training days ·{' '}
          <span className="font-mono text-fg">{fmtCompact(calendar.totalSets)}</span> sets · last 6 months
        </p>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-text">
          <Flame size={13} aria-hidden="true" />
          {streaks.current > 0 ? `${streaks.current}-week streak` : 'No active streak'}
        </span>
        <span className="text-xs text-muted">
          Best <span className="font-mono text-fg">{streaks.longest}</span> {streaks.longest === 1 ? 'week' : 'weeks'} in a row
        </span>
      </div>

      <div className="relative mt-4" onMouseLeave={() => setHover(null)}>
        <div
          role="img"
          aria-label={summary}
          className="grid gap-[3px]"
          style={{ gridTemplateColumns: `26px repeat(${WEEKS}, minmax(0, 17px))`, gridTemplateRows: 'auto repeat(7, auto)' }}
        >
          {calendar.weeks.map((week, i) => {
            const label = monthAt(i);
            return label ? (
              <span
                key={`m-${week.start}`}
                aria-hidden="true"
                className="text-[10px] leading-4 whitespace-nowrap text-muted"
                style={{ gridColumn: i + 2, gridRow: 1 }}
              >
                {label}
              </span>
            ) : null;
          })}
          {['Mon', 'Wed', 'Fri'].map((d, i) => (
            <span
              key={d}
              aria-hidden="true"
              className="self-center text-[10px] leading-none text-muted"
              style={{ gridColumn: 1, gridRow: 2 + i * 2 }}
            >
              {d}
            </span>
          ))}
          {calendar.weeks.flatMap((week, w) =>
            week.days.map((day, d) =>
              day ? (
                <span
                  key={day.date}
                  aria-hidden="true"
                  onMouseEnter={(e) => show(day, e)}
                  className={`heat heat-${day.level} ${day.date === now ? 'heat-today' : ''}`}
                  style={{ gridColumn: w + 2, gridRow: d + 2 }}
                />
              ) : null,
            ),
          )}
        </div>

        {hover && (
          <div
            className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-md border border-line-strong bg-surface-3 px-2.5 py-1.5 text-xs whitespace-nowrap shadow-pop"
            style={{ left: hover.left, top: hover.top - 6 }}
          >
            <div className="text-muted">
              {fmtWeekday(hover.day.date)} {fmtShortDate(hover.day.date)}
            </div>
            {hover.day.sets > 0 ? (
              <>
                <div className="font-mono font-semibold text-fg">
                  {hover.day.sets} {hover.day.sets === 1 ? 'set' : 'sets'}
                </div>
                <div className="max-w-56 truncate text-muted">
                  {hover.day.lifts.slice(0, 3).join(', ')}
                  {hover.day.lifts.length > 3 ? ` +${hover.day.lifts.length - 3}` : ''}
                </div>
              </>
            ) : (
              <div className="text-fg">Rest day</div>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-end gap-1 text-[10px] text-muted" aria-hidden="true">
        Less
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className={`heat heat-${l} size-[11px]`} />
        ))}
        More
      </div>
    </div>
  );
}

function medianPct(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function barScale(values: number[]): number {
  const sorted = values.filter((v) => v > 0).sort((a, b) => b - a);
  if (sorted.length === 0) return 1;
  if (sorted.length === 1) return sorted[0];
  return sorted[0] > sorted[1] * 2 ? sorted[1] * 1.15 : sorted[0];
}

function Strength({ exercises, statsById, unit }: { exercises: Exercise[]; statsById: Map<string, ExerciseStats>; unit: Unit }) {
  const [all, setAll] = useState(false);
  const progress = useMemo(() => liftProgress(exercises, statsById), [exercises, statsById]);

  if (progress.length === 0) {
    return (
      <div className="flex flex-col justify-center rounded-lg border border-line bg-surface p-4">
        <h3 className="text-sm font-semibold text-fg">Strength</h3>
        <p className="mt-2 text-sm text-muted">Log a second session of any lift and its progress shows up here.</p>
      </div>
    );
  }

  const since = progress.reduce((min, p) => (p.since < min ? p.since : min), progress[0].since);
  const middle = medianPct(progress.map((p) => p.pct));
  const added = progress.reduce((sum, p) => sum + Math.max(0, p.gain), 0);
  const scale = barScale(progress.map((p) => p.pct));
  const shown = all ? progress : progress.slice(0, LIST_LIMIT);

  return (
    <div className="flex min-w-0 flex-col rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-sm font-semibold text-fg">Strength</h3>
        <p className="text-xs text-muted">since {fmtShortDate(since)}</p>
      </div>

      <div className="mt-2 flex items-end gap-3">
        <span className={`text-3xl leading-none font-semibold tracking-tight ${middle > 0 ? 'text-up-text' : 'text-fg'}`}>
          {middle > 0 ? '+' : ''}
          {fmtNum(Math.round(middle))}%
        </span>
        <span className="pb-0.5 text-xs leading-tight text-muted">
          typical top-set gain
          <br />
          <span className="font-mono text-fg">+{fmtCompact(fromKg(added, unit))}</span> {unit} added across {progress.length}{' '}
          {progress.length === 1 ? 'lift' : 'lifts'}
        </span>
      </div>

      <ol className="mt-4 flex flex-col gap-2.5">
        {shown.map((p) => (
          <li key={p.exercise.id} className="grid grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-x-3">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-[13px] font-medium text-fg">{p.exercise.name}</span>
                <span className="shrink-0 font-mono text-[11px] text-muted">
                  {fmtWeight(p.first.weight, unit)} → {fmtWeight(p.best.weight, unit)}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
                <div
                  className="grow-bar h-full rounded-full bg-series-1"
                  style={{ width: `${Math.min(100, Math.max(2, (Math.max(0, p.pct) / scale) * 100))}%` }}
                />
              </div>
            </div>
            <span className={`text-right font-mono text-[13px] font-semibold ${p.pct > 0 ? 'text-up-text' : 'text-muted'}`}>
              {p.pct > 0 ? '+' : p.pct < 0 ? '−' : '±'}
              {fmtNum(Math.abs(Math.round(p.pct)))}%
            </span>
          </li>
        ))}
      </ol>

      {progress.length > LIST_LIMIT && (
        <button type="button" onClick={() => setAll((v) => !v)} className="btn btn-ghost mt-2 self-start px-2 text-xs">
          {all ? 'Show top 6' : `Show all ${progress.length}`}
        </button>
      )}
    </div>
  );
}

export function ProgressPanel({ exercises, sets, statsById, unit }: Props) {
  const [open, setOpen] = useState(readOpen);

  function toggle() {
    setOpen((value) => {
      try {
        localStorage.setItem(OPEN_KEY, String(!value));
      } catch {}
      return !value;
    });
  }

  return (
    <section aria-labelledby="progress-title" className="mt-3">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="group flex items-center gap-2 rounded-md py-1 text-left"
      >
        <TrendingUp size={16} className="text-accent-text" aria-hidden="true" />
        <h2 id="progress-title" className="text-sm font-semibold text-fg">
          How far you’ve come
        </h2>
        <ChevronDown size={14} aria-hidden="true" className={`text-muted transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && (
        <div className="animate-in mt-2 grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <Heatmap exercises={exercises} sets={sets} />
          <Strength exercises={exercises} statsById={statsById} unit={unit} />
        </div>
      )}
    </section>
  );
}
