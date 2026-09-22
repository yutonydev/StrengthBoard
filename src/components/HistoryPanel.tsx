import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartLine, Plus, Trash2 } from 'lucide-react';
import type { Exercise, Unit, WorkoutSet } from '../types';
import type { ExerciseStats } from '../lib/stats';
import { e1rm, newestFirst } from '../lib/stats';
import { fmtShortDate, fmtWeekday } from '../lib/dates';
import { fmtCompact, fmtNum, fmtSet, fmtWeight, fromKg } from '../lib/units';
import { PrBadge } from './PrBadge';

interface Props {
  exercise: Exercise;
  stats: ExerciseStats;
  unit: Unit;
  onLogFirst: () => void;
  onDeleteSet: (set: WorkoutSet) => void;
}

interface Point {
  date: string;
  top: number;
  topReps: number;
  e1rm: number;
  pr: boolean;
}

function ChartTooltip({ active, payload, unit }: { active?: boolean; payload?: { payload: Point }[]; unit: Unit }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-line-strong bg-surface-3 px-2.5 py-2 text-xs shadow-pop">
      <div className="mb-1 flex items-center gap-2 text-muted">
        {fmtWeekday(p.date)} {fmtShortDate(p.date)}
        {p.pr && <PrBadge />}
      </div>
      <div className="flex items-center gap-2">
        <span className="h-0.5 w-3 rounded bg-series-1" aria-hidden="true" />
        <span className="font-mono font-semibold text-fg">
          {fmtNum(p.top)}×{p.topReps}
        </span>
        <span className="text-muted">top set</span>
      </div>
      <div className="mt-0.5 flex items-center gap-2">
        <span className="w-3 border-t-2 border-dashed border-series-2" aria-hidden="true" />
        <span className="font-mono font-semibold text-fg">{Math.round(p.e1rm)}</span>
        <span className="text-muted">est. 1RM ({unit})</span>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium tracking-wide text-muted uppercase">{label}</dt>
      <dd className="mt-0.5 truncate">
        <span className="font-mono text-[15px] font-semibold text-fg">{value}</span>
        {sub && <span className="ml-1.5 text-xs text-muted">{sub}</span>}
      </dd>
    </div>
  );
}

export function HistoryPanel({ exercise, stats, unit, onLogFirst, onDeleteSet }: Props) {
  const data: Point[] = useMemo(
    () =>
      stats.sessions.map((s) => ({
        date: s.date,
        top: fromKg(s.top.weight, unit),
        topReps: s.top.reps,
        e1rm: fromKg(s.bestE1rm, unit),
        pr: s.isPR,
      })),
    [stats.sessions, unit],
  );

  const rows = useMemo(() => {
    const setIndex = new Map<string, number>();
    for (const sess of stats.sessions) sess.sets.forEach((s, i) => setIndex.set(s.id, i + 1));
    return newestFirst(stats.sessions.flatMap((s) => s.sets)).map((s, i, all) => ({
      set: s,
      n: setIndex.get(s.id) ?? 1,
      firstOfDay: i === 0 || all[i - 1].date !== s.date,
    }));
  }, [stats.sessions]);

  if (stats.sessions.length === 0) {
    return (
      <section
        aria-label={`${exercise.name} history`}
        className="animate-in flex flex-col items-center gap-2 border-t border-line bg-surface-2 px-4 py-8 text-center"
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-surface-3 text-muted">
          <ChartLine size={20} aria-hidden="true" />
        </span>
        <p className="font-medium text-fg">No sets logged yet</p>
        <p className="max-w-xs text-sm text-muted">
          Log your first set of {exercise.name} to start its trend line and history.
        </p>
        <button type="button" onClick={onLogFirst} className="btn btn-primary mt-1">
          <Plus size={16} aria-hidden="true" /> Log first set
        </button>
      </section>
    );
  }

  const best = stats.bestE1rmSession!;
  const heaviest = stats.heaviest!;
  const first = stats.sessions[0];

  return (
    <section aria-label={`${exercise.name} history`} className="animate-in border-t border-line bg-surface-2 px-3 py-3 sm:pl-10">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Best est. 1RM" value={String(Math.round(fromKg(best.bestE1rm, unit)))} sub={fmtShortDate(best.date)} />
        <Stat label="Heaviest set" value={fmtSet(heaviest.weight, heaviest.reps, unit)} sub={fmtShortDate(heaviest.date)} />
        <Stat label="Sessions" value={String(stats.sessions.length)} sub={`${stats.prSetIds.size} PRs`} />
        <Stat label="Sets" value={String(stats.totalSets)} />
        <Stat label="Volume" value={fmtCompact(fromKg(stats.totalVolume, unit))} sub={unit} />
        <Stat label="Tracking since" value={fmtShortDate(first.date)} />
      </dl>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <figure className="rounded-lg border border-line bg-surface p-3">
          <figcaption className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span className="font-medium text-fg">By session</span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded bg-series-1" aria-hidden="true" /> Top set ({unit})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 border-t-2 border-dashed border-series-2" aria-hidden="true" /> Est. 1RM
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-pr" aria-hidden="true" /> PR
            </span>
          </figcaption>
          <div className="h-52" role="img" aria-label={`Chart of ${exercise.name} top set and estimated 1RM across ${data.length} sessions. Every value is listed in the table.`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                <CartesianGrid vertical={false} stroke="var(--lb-line)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => fmtShortDate(d)}
                  tick={{ fill: 'var(--lb-fg-muted)', fontSize: 11 }}
                  axisLine={{ stroke: 'var(--lb-line-strong)' }}
                  tickLine={false}
                  minTickGap={28}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tickCount={5}
                  tick={{ fill: 'var(--lb-fg-muted)', fontSize: 11, fontFamily: 'Fira Code' }}
                  tickFormatter={(v: number) => fmtNum(v)}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                  allowDecimals={false}
                />
                <Tooltip
                  content={<ChartTooltip unit={unit} />}
                  cursor={{ stroke: 'var(--lb-line-strong)', strokeWidth: 1 }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="e1rm"
                  stroke="var(--lb-series-2)"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  isAnimationActive={false}
                  dot={(props: { cx?: number; cy?: number; payload?: Point; index?: number }) =>
                    props.payload?.pr ? (
                      <circle
                        key={props.index}
                        cx={props.cx}
                        cy={props.cy}
                        r={4}
                        fill="var(--lb-pr)"
                        stroke="var(--lb-surface)"
                        strokeWidth={2}
                      />
                    ) : (
                      <g key={props.index} />
                    )
                  }
                  activeDot={{ r: 4, fill: 'var(--lb-series-2)', stroke: 'var(--lb-surface)', strokeWidth: 2 }}
                />
                <Line
                  type="monotone"
                  dataKey="top"
                  stroke="var(--lb-series-1)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  activeDot={{ r: 4, fill: 'var(--lb-series-1)', stroke: 'var(--lb-surface)', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </figure>

        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          <div className="max-h-[264px] overflow-auto">
            <table className="w-full border-collapse text-left text-[13px]">
              <caption className="sr-only">Every set of {exercise.name}, newest first</caption>
              <thead className="sticky top-0 z-10 bg-surface text-[11px] font-medium tracking-wide text-muted uppercase">
                <tr className="border-b border-line">
                  <th scope="col" className="py-1.5 pr-2 pl-3 font-medium">Date</th>
                  <th scope="col" className="px-2 py-1.5 text-right font-medium">#</th>
                  <th scope="col" className="px-2 py-1.5 text-right font-medium">Set</th>
                  <th scope="col" className="px-2 py-1.5 text-right font-medium">e1RM</th>
                  <th scope="col" className="hidden px-2 py-1.5 text-right font-medium sm:table-cell">RPE</th>
                  <th scope="col" className="hidden px-2 py-1.5 font-medium md:table-cell">Notes</th>
                  <th scope="col" className="w-10 py-1.5 pr-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {rows.map(({ set, n, firstOfDay }) => {
                  const isPR = stats.prSetIds.has(set.id);
                  return (
                    <tr key={set.id} className={`group hover:bg-surface-3 ${firstOfDay ? 'border-t border-line first:border-t-0' : ''}`}>
                      <td className="py-1 pr-2 pl-3 font-sans whitespace-nowrap">
                        {firstOfDay ? (
                          <>
                            <span className="text-fg">{fmtShortDate(set.date)}</span>
                            <span className="ml-1.5 text-xs text-muted">{fmtWeekday(set.date)}</span>
                          </>
                        ) : (
                          <span className="sr-only">{fmtShortDate(set.date)}</span>
                        )}
                      </td>
                      <td className="px-2 py-1 text-right text-muted">{n}</td>
                      <td className="px-2 py-1 text-right whitespace-nowrap text-fg">
                        {set.weight === 0 ? 'BW' : fmtWeight(set.weight, unit)}
                        <span className="text-muted">×</span>
                        {set.reps}
                      </td>
                      <td className="px-2 py-1 text-right whitespace-nowrap">
                        {isPR && <PrBadge className="mr-1.5" />}
                        <span className={isPR ? 'font-semibold text-fg' : 'text-muted'}>
                          {fmtNum(Math.round(fromKg(e1rm(set.weight, set.reps), unit)))}
                        </span>
                      </td>
                      <td className="hidden px-2 py-1 text-right text-muted sm:table-cell">{set.rpe ? fmtNum(set.rpe) : '–'}</td>
                      <td className="hidden max-w-48 truncate px-2 py-1 font-sans text-xs text-muted md:table-cell" title={set.notes}>
                        {set.notes ?? ''}
                      </td>
                      <td className="py-0 pr-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => onDeleteSet(set)}
                          className="inline-flex size-7 items-center justify-center rounded text-muted opacity-0 group-hover:opacity-100 hover:bg-surface-3 hover:text-danger focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                          aria-label={`Delete set ${fmtSet(set.weight, set.reps, unit)} on ${fmtShortDate(set.date)}`}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
