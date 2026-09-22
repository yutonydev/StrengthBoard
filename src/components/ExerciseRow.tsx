import { lazy, memo, Suspense, useId, useState, type CSSProperties, type FormEvent } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowDown,
  ArrowDownRight,
  ArrowUp,
  ArrowUpRight,
  ChevronDown,
  Clock,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Trash2,
} from 'lucide-react';
import type { Exercise, Unit, WorkoutSet } from '../types';
import { trendOf, type ExerciseStats } from '../lib/stats';
import { daysBetween, fmtAgo, fmtAgoLong, today } from '../lib/dates';
import { fmtNum, fmtSet, fromKg } from '../lib/units';
import { similarity } from '../lib/similarity';
import { Sparkline } from './Sparkline';
import { LogSetForm, type NewSet } from './LogSetForm';
import { PrBadge } from './PrBadge';
import { Menu, type MenuItem } from './Menu';

const HistoryPanel = lazy(() => import('./HistoryPanel').then((m) => ({ default: m.HistoryPanel })));

export const ROW_GRID =
  'grid grid-cols-[minmax(0,1fr)_56px_52px_44px] gap-x-2.5 sm:grid-cols-[16px_minmax(0,1fr)_112px_64px_64px] md:grid-cols-[16px_minmax(140px,1.2fr)_120px_minmax(150px,1fr)_68px_76px_52px_64px] md:gap-x-3';

export interface RowActions {
  toggleExpand: (id: string) => void;
  toggleLog: (id: string) => void;
  toggleEdit: (id: string) => void;
  logSet: (id: string, set: NewSet) => void;
  deleteSet: (set: WorkoutSet) => void;
  togglePin: (id: string) => void;
  move: (id: string, dir: -1 | 1) => void;
  rename: (id: string, patch: { name: string; category?: string }) => void;
  remove: (id: string) => void;
}

interface Props {
  exercise: Exercise;
  stats: ExerciseStats;
  unit: Unit;
  expanded: boolean;
  logging: boolean;
  editing: boolean;
  highlight: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  dragDisabled: boolean;
  categories: string[];
  otherNames: string[];
  actions: RowActions;
}

function Delta({ stats, unit }: { stats: ExerciseStats; unit: Unit }) {
  const { last, prev } = stats;
  if (!last || !prev) {
    return <span className="font-mono text-xs text-muted">{last ? 'new' : '–'}</span>;
  }
  const d = fromKg(last.top.weight, unit) - fromKg(prev.top.weight, unit);
  const pct = prev.top.weight > 0 ? (d / fromKg(prev.top.weight, unit)) * 100 : null;
  const r = Math.round(d * 10) / 10;
  if (r === 0) {
    return (
      <span className="flex flex-col items-end font-mono leading-tight text-muted">
        <span className="text-[13px]">±0</span>
        <span className="sr-only">no change in top set vs previous session</span>
      </span>
    );
  }
  const up = r > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`flex flex-col items-end font-mono leading-tight ${up ? 'text-up-text' : 'text-down-text'}`}>
      <span className="inline-flex items-center gap-0.5 text-[13px] font-medium">
        <Icon size={13} strokeWidth={2.5} aria-hidden="true" />
        {up ? '+' : '−'}
        {fmtNum(Math.abs(r))}
      </span>
      {pct !== null && (
        <span className="text-[11px] opacity-90">
          {up ? '+' : '−'}
          {Math.abs(pct).toFixed(1)}%
        </span>
      )}
      <span className="sr-only">
        {up ? 'up' : 'down'} {fmtNum(Math.abs(r))} {unit} vs previous session
      </span>
    </span>
  );
}

function LastThree({ stats, unit }: { stats: ExerciseStats; unit: Unit }) {
  const recent = stats.sessions.slice(-3);
  if (!recent.length) return <span className="text-muted">No sessions yet</span>;
  return (
    <span className="truncate font-mono tabular-nums">
      {recent.map((s, i) => {
        const newest = i === recent.length - 1;
        return (
          <span key={s.date}>
            {i > 0 && <span className="px-1 text-faint" aria-hidden="true">·</span>}
            <span className={newest ? 'font-medium text-fg' : 'text-muted'}>{fmtSet(s.top.weight, s.top.reps, unit)}</span>
          </span>
        );
      })}
    </span>
  );
}

function EditForm({
  exercise,
  categories,
  otherNames,
  onSave,
  onCancel,
}: {
  exercise: Exercise;
  categories: string[];
  otherNames: string[];
  onSave: (patch: { name: string; category?: string }) => void;
  onCancel: () => void;
}) {
  const uid = useId();
  const [name, setName] = useState(exercise.name);
  const [category, setCategory] = useState(exercise.category ?? '');
  const [error, setError] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return setError('Name is required');
    const dup = otherNames.find((o) => o !== exercise.name && similarity(n, o) === 1);
    if (dup) return setError(`You already track “${dup}”`);
    onSave({ name: n, category: category.trim() || undefined });
  }

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onCancel();
        }
      }}
      aria-label={`Edit ${exercise.name}`}
      className="animate-in flex flex-wrap items-start gap-2 border-t border-line bg-surface-2 px-3 py-3 sm:pl-10"
    >
      <div className="w-full sm:w-64">
        <label htmlFor={`${uid}-n`} className="label">
          Name
        </label>
        <input
          id={`${uid}-n`}
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError('');
          }}
          aria-invalid={!!error}
          aria-describedby={error ? `${uid}-err` : undefined}
          className="field"
          maxLength={60}
        />
        {error && (
          <p id={`${uid}-err`} className="mt-1 text-xs text-danger">
            {error}
          </p>
        )}
      </div>
      <div className="w-full sm:w-40">
        <label htmlFor={`${uid}-c`} className="label">
          Category <span className="font-normal normal-case">opt</span>
        </label>
        <input id={`${uid}-c`} list={`${uid}-cats`} value={category} onChange={(e) => setCategory(e.target.value)} className="field" maxLength={24} />
        <datalist id={`${uid}-cats`}>
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      <div className="flex gap-1.5 sm:pt-[18px]">
        <button type="submit" className="btn btn-primary">
          Save
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  );
}

export const ExerciseRow = memo(function ExerciseRow({
  exercise,
  stats,
  unit,
  expanded,
  logging,
  editing,
  highlight,
  canMoveUp,
  canMoveDown,
  dragDisabled,
  categories,
  otherNames,
  actions,
}: Props) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: exercise.id,
    disabled: dragDisabled,
  });
  const panelId = useId();
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
    position: 'relative',
  };

  const window10 = stats.sessions.slice(-10);
  const trend = trendOf(window10);
  const { last } = stats;
  const age = last ? daysBetween(last.date, today()) : null;
  const id = exercise.id;

  const menuItems: MenuItem[] = [
    {
      label: exercise.pinned ? 'Unpin' : 'Pin to top',
      icon: exercise.pinned ? <PinOff size={14} /> : <Pin size={14} />,
      onSelect: () => actions.togglePin(id),
    },
    { label: 'Move up', icon: <ArrowUp size={14} />, onSelect: () => actions.move(id, -1), disabled: !canMoveUp },
    { label: 'Move down', icon: <ArrowDown size={14} />, onSelect: () => actions.move(id, 1), disabled: !canMoveDown },
    { label: 'Rename / category', icon: <Pencil size={14} />, onSelect: () => actions.toggleEdit(id) },
    { label: 'Delete lift', icon: <Trash2 size={14} />, onSelect: () => actions.remove(id), danger: true, separator: true },
  ];

  return (
    <li
      ref={setNodeRef}
      style={style}
      data-exercise-id={id}
      className={`border-b border-line bg-surface ${isDragging ? 'shadow-pop ring-1 ring-line-strong' : ''}`}
    >
      <div
        key={highlight}
        className={`${ROW_GRID} min-h-14 cursor-pointer items-center px-3 py-1.5 transition-colors hover:bg-surface-3 sm:min-h-12 ${
          expanded ? 'bg-surface-2' : ''
        } ${highlight ? 'animate-flash' : ''}`}
        onClick={() => actions.toggleExpand(id)}
      >
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${exercise.name}`}
          onClick={(e) => e.stopPropagation()}
          className={`-ml-1 hidden h-8 w-5 cursor-grab touch-none items-center justify-center rounded text-faint hover:text-muted active:cursor-grabbing sm:flex ${
            dragDisabled ? 'invisible' : ''
          }`}
        >
          <GripVertical size={14} aria-hidden="true" />
        </button>

        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            {exercise.pinned && (
              <>
                <Pin size={11} className="shrink-0 rotate-45 text-muted" aria-hidden="true" />
                <span className="sr-only">Pinned:</span>
              </>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                actions.toggleExpand(id);
              }}
              aria-expanded={expanded}
              aria-controls={expanded ? panelId : undefined}
              className="truncate text-left text-[14px] font-semibold text-fg"
            >
              {exercise.name}
            </button>
            {exercise.category && (
              <span className="hidden shrink-0 rounded border border-line-strong px-1 text-[10px] leading-4 font-medium tracking-wide text-muted uppercase md:inline">
                {exercise.category}
              </span>
            )}
            <ChevronDown
              size={14}
              aria-hidden="true"
              className={`hidden shrink-0 text-muted transition-transform md:block ${expanded ? 'rotate-180' : ''}`}
            />
          </div>
          <div className="mt-0.5 truncate text-xs text-muted md:hidden">
            <LastThree stats={stats} unit={unit} />
          </div>
          <div className="mt-0.5 hidden text-xs text-muted md:block">
            {stats.sessions.length
              ? `${stats.sessions.length} session${stats.sessions.length === 1 ? '' : 's'} · ${stats.totalSets} sets`
              : 'New · no history'}
          </div>
        </div>

        <div className="min-w-0" title={window10.length ? `Top set, last ${window10.length} sessions` : undefined}>
          <Sparkline sessions={window10} trend={trend} unit={unit} />
        </div>

        <div className="hidden min-w-0 text-[13px] md:block">
          <LastThree stats={stats} unit={unit} />
        </div>

        <div className="flex justify-end">
          <Delta stats={stats} unit={unit} />
        </div>

        <div className="hidden flex-col items-end leading-tight md:flex">
          {last ? (
            <>
              <span className="font-mono text-[13px] font-semibold text-fg">{fmtNum(Math.round(fromKg(last.bestE1rm, unit)))}</span>
              {last.isPR ? (
                <PrBadge className="mt-0.5" />
              ) : (
                <span className="font-mono text-[11px] text-muted">best {fmtNum(Math.round(fromKg(stats.bestE1rm, unit)))}</span>
              )}
            </>
          ) : (
            <span className="font-mono text-xs text-muted">–</span>
          )}
        </div>

        <div
          className="hidden text-right text-xs md:block"
          title={last ? `Last trained ${fmtAgoLong(last.date)}` : 'Never trained'}
        >
          {last ? (
            <span className={`inline-flex items-center gap-1 ${age === 0 ? 'font-medium text-fg' : 'text-muted'}`}>
              {age !== null && age > 14 && <Clock size={11} aria-hidden="true" />}
              {fmtAgo(last.date)}
            </span>
          ) : (
            <span className="text-muted">–</span>
          )}
        </div>

        <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => actions.toggleLog(id)}
            aria-label={`Log a set of ${exercise.name}`}
            aria-expanded={logging}
            title="Log a set"
            className={`inline-flex size-11 items-center justify-center rounded-md border transition-colors sm:size-8 ${
              logging
                ? 'border-accent bg-accent text-on-accent'
                : 'border-line-strong text-fg hover:border-accent hover:bg-accent hover:text-on-accent'
            }`}
          >
            <Plus size={16} strokeWidth={2.25} aria-hidden="true" />
          </button>
          <div className="hidden sm:block">
            <Menu
              label={`More actions for ${exercise.name}`}
              trigger={<MoreHorizontal size={16} aria-hidden="true" />}
              triggerClassName="icon-btn sm:w-7"
              items={menuItems}
            />
          </div>
        </div>
      </div>

      {editing && (
        <EditForm
          exercise={exercise}
          categories={categories}
          otherNames={otherNames}
          onSave={(patch) => actions.rename(id, patch)}
          onCancel={() => actions.toggleEdit(id)}
        />
      )}
      {logging && (
        <LogSetForm
          exerciseName={exercise.name}
          unit={unit}
          lastSet={last?.top}
          sessions={stats.sessions}
          onLog={(s) => actions.logSet(id, s)}
          onDeleteSet={actions.deleteSet}
          onClose={() => actions.toggleLog(id)}
        />
      )}
      {expanded && (
        <div id={panelId}>
          <div className="flex items-center justify-between border-t border-line bg-surface-2 px-3 pt-2 sm:hidden">
            <span className="text-xs text-muted">
              {exercise.category ? `${exercise.category} · ` : ''}
              {stats.sessions.length} sessions
            </span>
            <Menu
              label={`More actions for ${exercise.name}`}
              trigger={
                <span className="inline-flex items-center gap-1 text-xs font-medium">
                  <MoreHorizontal size={16} aria-hidden="true" /> Actions
                </span>
              }
              triggerClassName="btn btn-ghost h-9 px-2"
              items={menuItems}
            />
          </div>
          <Suspense
            fallback={<div className="h-72 border-t border-line bg-surface-2" aria-busy="true" aria-label="Loading history" />}
          >
            <HistoryPanel
              exercise={exercise}
              stats={stats}
              unit={unit}
              onLogFirst={() => actions.toggleLog(id)}
              onDeleteSet={actions.deleteSet}
            />
          </Suspense>
        </div>
      )}
    </li>
  );
});

