import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Database, Download, Monitor, Moon, MoreVertical, Plus, Search, Sun, Trash2, Upload, X } from 'lucide-react';
import type { Exercise, ThemePref, WorkoutSet } from './types';
import { emptyData, parseData } from './store';
import { useSyncedStore } from './sync/useSyncedStore';
import type { AuthUser } from './auth/AuthProvider';
import { SyncStatus } from './components/SyncStatus';
import { AccountMenu } from './components/AccountMenu';
import { sampleData } from './lib/sample';
import { buildStats, overview, type ExerciseStats } from './lib/stats';
import { today } from './lib/dates';
import { newId } from './lib/id';
import { fmtCompact, fmtSet, fromKg } from './lib/units';
import { DEFAULT_CATEGORIES, normalizeName, similarity } from './lib/similarity';
import { ExerciseRow, ROW_GRID, type RowActions } from './components/ExerciseRow';
import { AddExercise } from './components/AddExercise';
import { Menu } from './components/Menu';
import { Toasts, useToasts } from './components/Toasts';
import { useTheme } from './theme';
import { Logo } from './components/Logo';

const EMPTY_STATS: ExerciseStats = buildStats([]);
const restrictToVertical: Modifier = ({ transform }) => ({ ...transform, x: 0 });
const THEME_NEXT: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' };

function Kpi({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="min-w-0 px-3 py-2">
      <dt className="truncate text-[11px] font-medium tracking-wide text-muted uppercase">{label}</dt>
      <dd className="mt-0.5 flex items-baseline gap-1">
        <span className="text-lg leading-6 font-semibold text-fg">{value}</span>
        {unit && <span className="text-xs text-muted">{unit}</span>}
      </dd>
    </div>
  );
}

export default function App({ user }: { user: AuthUser }) {
  const { toasts, push, dismiss } = useToasts();
  const { data, dispatch, sync, signOut } = useSyncedStore(user.id, push);
  const { exercises, sets, settings } = data;
  const { unit } = settings;

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [logging, setLogging] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<{ id: string; n: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  const [theme, setTheme] = useTheme();

  const statsById = useMemo(() => {
    const groups = new Map<string, WorkoutSet[]>();
    for (const s of sets) {
      const g = groups.get(s.exerciseId);
      if (g) g.push(s);
      else groups.set(s.exerciseId, [s]);
    }
    const out = new Map<string, ExerciseStats>();
    for (const e of exercises) out.set(e.id, groups.has(e.id) ? buildStats(groups.get(e.id)!) : EMPTY_STATS);
    return out;
  }, [sets, exercises]);

  const summary = useMemo(() => overview(sets, statsById.values(), today()), [sets, statsById]);

  const categories = useMemo(() => {
    const used = exercises.map((e) => e.category).filter((c): c is string => !!c);
    return Array.from(new Set([...used, ...DEFAULT_CATEGORIES]));
  }, [exercises]);
  const usedCategories = useMemo(
    () => Array.from(new Set(exercises.map((e) => e.category).filter((c): c is string => !!c))),
    [exercises],
  );
  const allNames = useMemo(() => exercises.map((e) => e.name), [exercises]);

  const filtering = query.trim() !== '' || category !== null;
  const visible = useMemo(() => {
    const q = normalizeName(query);
    return exercises.filter((e) => {
      if (category && e.category !== category) return false;
      if (!q) return true;
      return normalizeName(e.name).includes(q) || similarity(query, e.name) >= 0.6;
    });
  }, [exercises, query, category]);
  const pinned = visible.filter((e) => e.pinned);
  const others = visible.filter((e) => !e.pinned);

  const goTo = useCallback((id: string, openLog = true) => {
    setQuery('');
    setCategory(null);
    if (openLog) setLogging(id);
    setHighlight((h) => ({ id, n: (h?.n ?? 0) + 1 }));
  }, []);

  useEffect(() => {
    if (!highlight) return;
    const el = document.querySelector(`[data-exercise-id="${highlight.id}"]`);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  }, [highlight]);

  const actions: RowActions = useMemo(
    () => ({
      toggleExpand: (id) =>
        setExpanded((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }),
      toggleLog: (id) => setLogging((cur) => (cur === id ? null : id)),
      toggleEdit: (id) => setEditing((cur) => (cur === id ? null : id)),
      logSet: (id, s) =>
        dispatch({
          type: 'addSet',
          set: { id: newId(), exerciseId: id, createdAt: Date.now(), ...s },
        }),
      deleteSet: (set) => {
        dispatch({ type: 'deleteSet', id: set.id });
        push(`Deleted ${fmtSet(set.weight, set.reps, dataRef.current.settings.unit)}`, () =>
          dispatch({ type: 'restoreSet', set }),
        );
      },
      togglePin: (id) => dispatch({ type: 'togglePin', id }),
      move: (id, dir) => dispatch({ type: 'move', id, dir }),
      rename: (id, patch) => {
        dispatch({ type: 'updateExercise', id, patch: { name: patch.name, category: patch.category } });
        setEditing(null);
      },
      remove: (id) => {
        const { exercises: list, sets: all } = dataRef.current;
        const index = list.findIndex((e) => e.id === id);
        const exercise = list[index];
        if (!exercise) return;
        const removed = all.filter((s) => s.exerciseId === id);
        dispatch({ type: 'deleteExercise', id });
        setLogging((c) => (c === id ? null : c));
        push(`Deleted ${exercise.name}${removed.length ? ` and ${removed.length} sets` : ''}`, () =>
          dispatch({ type: 'restoreExercise', exercise, index, sets: removed }),
        );
      },
    }),
    [dispatch, push],
  );

  function addExercise(input: { name: string; category?: string; pinned: boolean }) {
    const exercise: Exercise = { id: newId(), createdAt: Date.now(), ...input };
    dispatch({ type: 'addExercise', exercise });
    goTo(exercise.id);
  }

  function loadSample() {
    if (exercises.length && !window.confirm('Replace everything on your board with sample data?')) return;
    const previous = dataRef.current;
    dispatch({ type: 'replace', data: sampleData(settings) });
    setExpanded(new Set());
    setLogging(null);
    push('Loaded sample data', () => dispatch({ type: 'replace', data: previous }));
  }

  function clearAll() {
    if (!window.confirm('Delete every lift and set in your account? You can undo right after.')) return;
    const prev = dataRef.current;
    dispatch({ type: 'replace', data: emptyData(settings) });
    setExpanded(new Set());
    setLogging(null);
    push('Cleared all data', () => dispatch({ type: 'replace', data: prev }));
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(dataRef.current, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `strengthboard-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importData(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = parseData(JSON.parse(await file.text()));
      if (!parsed) throw new Error('bad file');
      if (exercises.length && !window.confirm(`Replace your board with ${parsed.exercises.length} lifts from “${file.name}”?`)) return;
      const prev = dataRef.current;
      dispatch({ type: 'replace', data: parsed });
      push(`Imported ${parsed.exercises.length} lifts, ${parsed.sets.length} sets`, () => dispatch({ type: 'replace', data: prev }));
    } catch {
      push('That file isn’t a StrengthBoard backup');
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      if (e.metaKey || e.ctrlKey || e.altKey || t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setAdding(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function onDragEnd({ active, over }: DragEndEvent) {
    if (over && active.id !== over.id) dispatch({ type: 'reorder', activeId: String(active.id), overId: String(over.id) });
  }

  function groupBounds(e: Exercise) {
    const group = exercises.filter((x) => x.pinned === e.pinned);
    const i = group.findIndex((x) => x.id === e.id);
    return { canMoveUp: i > 0, canMoveDown: i < group.length - 1 };
  }

  const renderRows = (list: Exercise[]) => (
    <SortableContext items={list.map((e) => e.id)} strategy={verticalListSortingStrategy}>
      <ul>
        {list.map((e) => (
          <ExerciseRow
            key={e.id}
            exercise={e}
            stats={statsById.get(e.id) ?? EMPTY_STATS}
            unit={unit}
            expanded={expanded.has(e.id)}
            logging={logging === e.id}
            editing={editing === e.id}
            highlight={highlight?.id === e.id ? highlight.n : 0}
            dragDisabled={filtering}
            categories={categories}
            otherNames={allNames}
            actions={actions}
            {...groupBounds(e)}
          />
        ))}
      </ul>
    </SortableContext>
  );

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  const isEmpty = exercises.length === 0;

  return (
    <div className="min-h-dvh pb-24">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur supports-[backdrop-filter]:bg-bg/75">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-2 px-3 sm:px-4">
          <Logo />
          <h1 className="text-[15px] font-semibold tracking-tight text-fg">StrengthBoard</h1>
          <div className="ml-auto flex items-center gap-1">
            <SyncStatus sync={sync} />
            <div role="group" aria-label="Weight unit" className="flex rounded-md border border-line-strong p-0.5">
              {(['lb', 'kg'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  aria-pressed={unit === u}
                  onClick={() => dispatch({ type: 'settings', patch: { unit: u } })}
                  className={`h-9 rounded px-2.5 font-mono text-xs font-medium transition-colors sm:h-6 sm:px-2 ${
                    unit === u ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setTheme(THEME_NEXT[theme])}
              aria-label={`Theme: ${theme}. Switch to ${THEME_NEXT[theme]}`}
              title={`Theme: ${theme}`}
            >
              <ThemeIcon size={16} aria-hidden="true" />
            </button>
            <Menu
              label="Data options"
              trigger={<MoreVertical size={16} aria-hidden="true" />}
              items={[
                { label: 'Load sample data', icon: <Database size={14} />, onSelect: loadSample },
                { label: 'Export backup (.json)', icon: <Download size={14} />, onSelect: exportData, disabled: isEmpty, separator: true },
                { label: 'Import backup…', icon: <Upload size={14} />, onSelect: () => fileRef.current?.click() },
                { label: 'Clear all data', icon: <Trash2 size={14} />, onSelect: clearAll, danger: true, disabled: isEmpty, separator: true },
              ]}
            />
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={importData} />
            <AccountMenu email={user.email} pending={sync.pending} onSignOut={() => void signOut()} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] px-3 sm:px-4">
        {!isEmpty && (
        <section aria-label="Training summary" className="mt-3 overflow-hidden rounded-lg border border-line bg-line">
          <dl className="grid grid-cols-3 gap-px sm:grid-cols-5 [&>*]:bg-surface [&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1">
            <Kpi label="Trained · 7d" value={String(summary.trainingDays7)} unit={summary.trainingDays7 === 1 ? 'day' : 'days'} />
            <Kpi label="Sets · 7d" value={String(summary.sets7)} />
            <Kpi label="Volume · 7d" value={fmtCompact(fromKg(summary.volume7, unit))} unit={unit} />
            <Kpi label="PRs · 30d" value={String(summary.prs30)} />
            <Kpi label="Idle >14d" value={String(summary.stale)} unit={summary.stale === 1 ? 'lift' : 'lifts'} />
          </dl>
        </section>
        )}

        {!isEmpty && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setQuery('');
                    e.currentTarget.blur();
                  }
                }}
                placeholder="Filter lifts"
                aria-label="Filter lifts by name"
                className="field pr-8 pl-8 [&::-webkit-search-cancel-button]:hidden"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute top-1/2 right-1 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded text-muted hover:text-fg sm:size-6"
                  aria-label="Clear filter"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              ) : (
                <span className="kbd pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 sm:inline-flex">/</span>
              )}
            </div>
            {usedCategories.length > 1 && (
              <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-1">
                {[null, ...usedCategories].map((c) => (
                  <button
                    key={c ?? 'all'}
                    type="button"
                    aria-pressed={category === c}
                    onClick={() => setCategory(c)}
                    className={`h-9 rounded-full border px-3 text-xs font-medium transition-colors sm:h-7 ${
                      category === c
                        ? 'border-accent bg-accent-soft text-accent-text'
                        : 'border-line-strong text-muted hover:border-muted hover:text-fg'
                    }`}
                  >
                    {c ?? 'All'}
                  </button>
                ))}
              </div>
            )}
            <span className="ml-auto text-xs text-muted" aria-live="polite">
              {filtering ? `${visible.length} of ${exercises.length} lifts` : `${exercises.length} lifts`}
            </span>
          </div>
        )}

        <div className="mt-3 overflow-visible rounded-lg border border-line bg-surface">
          {!isEmpty && (
            <div
              className={`${ROW_GRID} sticky top-14 z-20 h-8 items-center rounded-t-lg border-b border-line bg-surface px-3 text-[10px] font-semibold tracking-wider text-muted uppercase`}
              aria-hidden="true"
            >
              <span className="hidden sm:block" />
              <span>Exercise</span>
              <span>Trend · 10</span>
              <span className="hidden md:block">Last 3 sessions</span>
              <span className="text-right">Δ Top</span>
              <span className="hidden text-right md:block">Best</span>
              <span className="hidden text-right md:block">Last</span>
              <span />
            </div>
          )}

          {isEmpty && !sync.loaded ? (
            <div className="px-6 py-14 text-center text-sm text-muted" aria-busy="true">
              Loading your board…
            </div>
          ) : isEmpty ? (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <Logo />
              <h2 className="mt-3 text-base font-semibold text-fg">Your board is empty</h2>
              <p className="mt-1 max-w-sm text-sm text-muted">
                Add the lifts you train and StrengthBoard lines them up like a watchlist: trend, last three sessions, and PRs for every
                lift on one screen.
              </p>
              {!adding && (
                <button type="button" onClick={() => setAdding(true)} className="btn btn-primary mt-5">
                  <Plus size={16} aria-hidden="true" /> Add lift
                </button>
              )}
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} modifiers={[restrictToVertical]}>
              {pinned.length > 0 && others.length > 0 && (
                <div className="border-b border-line bg-surface-2 px-3 py-1 text-[10px] font-semibold tracking-wider text-muted uppercase">
                  Pinned
                </div>
              )}
              {renderRows(pinned)}
              {pinned.length > 0 && others.length > 0 && (
                <div className="border-b border-line bg-surface-2 px-3 py-1 text-[10px] font-semibold tracking-wider text-muted uppercase">
                  Everything else
                </div>
              )}
              {renderRows(others)}
              {visible.length === 0 && (
                <div className="px-3 py-8 text-center text-sm text-muted">
                  No lifts match{query ? ` “${query}”` : ''}.{' '}
                  <button
                    type="button"
                    className="font-medium text-accent-text hover:underline"
                    onClick={() => {
                      setQuery('');
                      setCategory(null);
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </DndContext>
          )}

          {(!isEmpty || adding) && (
            <AddExercise
              open={adding}
              setOpen={setAdding}
              exercises={exercises}
              stats={statsById}
              categories={categories}
              onAdd={addExercise}
              onGoTo={(id) => goTo(id)}
            />
          )}
        </div>

        {!isEmpty && (
          <p className="mt-3 hidden text-xs text-muted sm:block">
            Click a row for full history · <span className="kbd">N</span> new lift · <span className="kbd">/</span> filter · drag{' '}
            the grip to reorder · a PR is your heaviest top set yet · saved to your account
          </p>
        )}
      </main>

      <Toasts toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
