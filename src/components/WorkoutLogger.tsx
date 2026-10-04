import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, Dumbbell, Plus, Search, Trash2, X } from 'lucide-react';
import type { Exercise, Unit, WorkoutSet } from '../types';
import type { ExerciseStats } from '../lib/stats';
import { fmtAgo, today } from '../lib/dates';
import { fmtCompact, fmtSet, fromKg } from '../lib/units';
import { normalizeName } from '../lib/similarity';
import {
  blankSet,
  checkSet,
  draftProblems,
  draftToSets,
  draftTotals,
  repeatSet,
  type DraftSet,
  type WorkoutDraft,
} from '../lib/workout';

interface Props {
  userId: string;
  exercises: Exercise[];
  statsById: Map<string, ExerciseStats>;
  unit: Unit;
  onSave: (sets: WorkoutSet[]) => void;
  onClose: () => void;
}

const draftKey = (userId: string) => `strengthboard:workout-draft:${userId}`;

function loadDraft(userId: string): WorkoutDraft {
  try {
    const raw = localStorage.getItem(draftKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw) as WorkoutDraft;
      if (parsed && typeof parsed.date === 'string' && Array.isArray(parsed.lifts)) return parsed;
    }
  } catch {}
  return { date: today(), lifts: [] };
}

function saveDraft(userId: string, draft: WorkoutDraft) {
  try {
    if (draft.lifts.length === 0) localStorage.removeItem(draftKey(userId));
    else localStorage.setItem(draftKey(userId), JSON.stringify(draft));
  } catch {}
}

export function WorkoutLogger({ userId, exercises, statsById, unit, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<WorkoutDraft>(() => loadDraft(userId));
  const [filter, setFilter] = useState('');
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);

  const known = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const lifts = draft.lifts.filter((l) => known.has(l.exerciseId));
  const view: WorkoutDraft = { ...draft, lifts };
  const totals = draftTotals(view, unit);
  const problems = draftProblems(view);
  const chosen = new Set(lifts.map((l) => l.exerciseId));

  const listed = useMemo(() => {
    const q = normalizeName(filter);
    return q ? exercises.filter((e) => normalizeName(e.name).includes(q)) : exercises;
  }, [exercises, filter]);

  useEffect(() => saveDraft(userId, draft), [userId, draft]);

  useEffect(() => {
    if (lifts.length === 0) filterRef.current?.focus();
    else dialogRef.current?.querySelector<HTMLInputElement>('input[data-field="weight"]')?.focus();
  }, []);

  useEffect(() => {
    if (!focusKey) return;
    const input = dialogRef.current?.querySelector<HTMLInputElement>(`[data-set-key="${focusKey}"] input[data-field="weight"]`);
    input?.focus();
    input?.select();
    setFocusKey(null);
  }, [focusKey]);

  useEffect(() => {
    if (!confirmDiscard) return;
    const timer = setTimeout(() => setConfirmDiscard(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmDiscard]);

  function update(fn: (d: WorkoutDraft) => WorkoutDraft) {
    setDraft((d) => fn(d));
  }

  function addLift(id: string) {
    if (chosen.has(id)) {
      const first = lifts.find((l) => l.exerciseId === id)?.sets[0];
      if (first) setFocusKey(first.key);
      return;
    }
    const set = blankSet(statsById.get(id), unit);
    update((d) => ({ ...d, lifts: [...d.lifts, { exerciseId: id, sets: [set] }] }));
    setFocusKey(set.key);
  }

  function addSet(exerciseId: string, after?: DraftSet) {
    const lift = lifts.find((l) => l.exerciseId === exerciseId);
    const base = after ?? lift?.sets[lift.sets.length - 1];
    const set = base ? repeatSet(base) : blankSet(statsById.get(exerciseId), unit);
    update((d) => ({
      ...d,
      lifts: d.lifts.map((l) => {
        if (l.exerciseId !== exerciseId) return l;
        const index = after ? l.sets.findIndex((s) => s.key === after.key) + 1 : l.sets.length;
        const sets = [...l.sets];
        sets.splice(index, 0, set);
        return { ...l, sets };
      }),
    }));
    setFocusKey(set.key);
  }

  function changeSet(exerciseId: string, key: string, field: 'weight' | 'reps' | 'rir', value: string) {
    update((d) => ({
      ...d,
      lifts: d.lifts.map((l) =>
        l.exerciseId === exerciseId ? { ...l, sets: l.sets.map((s) => (s.key === key ? { ...s, [field]: value } : s)) } : l,
      ),
    }));
  }

  function removeSet(exerciseId: string, key: string) {
    update((d) => ({
      ...d,
      lifts: d.lifts
        .map((l) => (l.exerciseId === exerciseId ? { ...l, sets: l.sets.filter((s) => s.key !== key) } : l))
        .filter((l) => l.sets.length > 0),
    }));
  }

  function removeLift(exerciseId: string) {
    update((d) => ({ ...d, lifts: d.lifts.filter((l) => l.exerciseId !== exerciseId) }));
  }

  function save() {
    if (problems > 0 || totals.sets === 0) return;
    const sets = draftToSets(view, unit, Date.now());
    setDraft({ date: today(), lifts: [] });
    onSave(sets);
  }

  function discard() {
    if (!confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    setDraft({ date: today(), lifts: [] });
    setConfirmDiscard(false);
    filterRef.current?.focus();
  }

  function onDialogKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      save();
      return;
    }
    if (e.key === 'Tab' && dialogRef.current) {
      const nodes = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input, [tabindex]:not([tabindex="-1"])'),
      );
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function onSetKey(e: KeyboardEvent<HTMLInputElement>, exerciseId: string, set: DraftSet) {
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      addSet(exerciseId, set);
    }
  }

  const saveLabel =
    problems > 0 ? `Fix ${problems} ${problems === 1 ? 'set' : 'sets'}` : `Save workout${totals.sets ? ` · ${totals.sets} sets` : ''}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 p-3 backdrop-blur-[2px] sm:p-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="workout-title"
        onKeyDown={onDialogKey}
        className="animate-in flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-line-strong bg-surface shadow-pop"
      >
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3 sm:px-5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent-soft text-accent-text">
            <Dumbbell size={16} aria-hidden="true" />
          </span>
          <h2 id="workout-title" className="text-base font-semibold text-fg">
            Log workout
          </h2>
          <label className="flex items-center gap-2 text-xs text-muted">
            Date
            <input
              type="date"
              value={draft.date}
              max={today()}
              onChange={(e) => e.target.value && update((d) => ({ ...d, date: e.target.value }))}
              className="field h-9 w-40 font-mono text-[13px] sm:h-8"
            />
          </label>
          <span className="ml-auto text-xs text-muted" aria-live="polite">
            <span className="font-mono text-fg">{totals.lifts}</span> {totals.lifts === 1 ? 'lift' : 'lifts'} ·{' '}
            <span className="font-mono text-fg">{totals.sets}</span> sets ·{' '}
            <span className="font-mono text-fg">{fmtCompact(fromKg(totals.volume, unit))}</span> {unit}
          </span>
          <button type="button" onClick={onClose} className="icon-btn" aria-label="Close workout logger">
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 md:grid-cols-[17rem_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col border-b border-line md:border-r md:border-b-0">
            <div className="relative p-3">
              <Search size={14} className="pointer-events-none absolute top-1/2 left-5.5 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input
                ref={filterRef}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && listed[0]) {
                    e.preventDefault();
                    addLift(listed[0].id);
                    setFilter('');
                  }
                }}
                placeholder="Find a lift"
                aria-label="Find a lift to add"
                className="field pl-8"
              />
            </div>
            <ul className="max-h-48 min-h-0 flex-1 overflow-y-auto px-2 pb-2 md:max-h-none">
              {listed.map((e) => {
                const last = statsById.get(e.id)?.last;
                const added = chosen.has(e.id);
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => addLift(e.id)}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-3 ${
                        added ? 'bg-accent-soft' : ''
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-fg">{e.name}</span>
                        <span className="block truncate font-mono text-[11px] text-muted">
                          {last ? `${fmtSet(last.top.weight, last.top.reps, unit)} · ${fmtAgo(last.date)}` : 'No history yet'}
                        </span>
                      </span>
                      {added ? (
                        <Check size={14} className="shrink-0 text-accent-text" aria-label="In this workout" />
                      ) : (
                        <Plus size={14} className="shrink-0 text-muted" aria-hidden="true" />
                      )}
                    </button>
                  </li>
                );
              })}
              {listed.length === 0 && <li className="px-2 py-3 text-xs text-muted">No lifts match “{filter}”.</li>}
            </ul>
          </aside>

          <section aria-label="Lifts in this workout" className="min-h-0 overflow-y-auto p-3 sm:p-4">
            {lifts.length === 0 ? (
              <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 text-center">
                <span className="flex size-10 items-center justify-center rounded-full bg-surface-3 text-muted">
                  <Dumbbell size={18} aria-hidden="true" />
                </span>
                <p className="font-medium text-fg">Pick the lifts you trained</p>
                <p className="max-w-xs text-sm text-muted">
                  Each one starts with your last top set filled in. Press Enter in a set to add another just like it.
                </p>
              </div>
            ) : (
              <ol className="flex flex-col gap-3">
                {lifts.map((lift) => {
                  const exercise = known.get(lift.exerciseId)!;
                  const last = statsById.get(lift.exerciseId)?.last;
                  return (
                    <li key={lift.exerciseId} className="animate-in rounded-lg border border-line bg-surface-2">
                      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{exercise.name}</span>
                        {last && (
                          <span className="hidden font-mono text-[11px] text-muted sm:inline">
                            last {fmtSet(last.top.weight, last.top.reps, unit)}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => removeLift(lift.exerciseId)}
                          className="icon-btn size-8 hover:text-danger sm:size-7"
                          aria-label={`Remove ${exercise.name} from this workout`}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </div>
                      <div className="px-3 py-2">
                        <div className="grid grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_2rem] items-center gap-x-2 pb-1 text-[10px] font-semibold tracking-wider text-muted uppercase">
                          <span>#</span>
                          <span>Weight ({unit})</span>
                          <span>Reps</span>
                          <span>RIR</span>
                          <span />
                        </div>
                        {lift.sets.map((s, i) => {
                          const errors = checkSet(s);
                          return (
                            <div
                              key={s.key}
                              data-set-key={s.key}
                              className="grid grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_2rem] items-center gap-x-2 py-1"
                            >
                              <span className="font-mono text-xs text-muted">{i + 1}</span>
                              <input
                                data-field="weight"
                                inputMode="decimal"
                                value={s.weight}
                                onChange={(e) => changeSet(lift.exerciseId, s.key, 'weight', e.target.value)}
                                onKeyDown={(e) => onSetKey(e, lift.exerciseId, s)}
                                aria-label={`${exercise.name} set ${i + 1} weight`}
                                aria-invalid={!!errors.weight}
                                className="field text-center font-mono tabular-nums"
                                placeholder="0"
                              />
                              <input
                                data-field="reps"
                                inputMode="numeric"
                                value={s.reps}
                                onChange={(e) => changeSet(lift.exerciseId, s.key, 'reps', e.target.value)}
                                onKeyDown={(e) => onSetKey(e, lift.exerciseId, s)}
                                aria-label={`${exercise.name} set ${i + 1} reps`}
                                aria-invalid={!!errors.reps}
                                className="field text-center font-mono tabular-nums"
                                placeholder="5"
                              />
                              <input
                                data-field="rir"
                                inputMode="decimal"
                                value={s.rir}
                                onChange={(e) => changeSet(lift.exerciseId, s.key, 'rir', e.target.value)}
                                onKeyDown={(e) => onSetKey(e, lift.exerciseId, s)}
                                aria-label={`${exercise.name} set ${i + 1} reps in reserve`}
                                aria-invalid={!!errors.rir}
                                className="field text-center font-mono tabular-nums"
                                placeholder="–"
                              />
                              <button
                                type="button"
                                onClick={() => removeSet(lift.exerciseId, s.key)}
                                className="icon-btn size-8 hover:text-danger sm:size-7"
                                aria-label={`Remove ${exercise.name} set ${i + 1}`}
                              >
                                <X size={13} aria-hidden="true" />
                              </button>
                            </div>
                          );
                        })}
                        <button type="button" onClick={() => addSet(lift.exerciseId)} className="btn btn-ghost mt-1 h-8 px-2 text-xs">
                          <Plus size={13} aria-hidden="true" /> Add set
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 sm:px-5">
          <span className="hidden text-xs text-muted lg:inline">
            <span className="kbd">↵</span> another set · <span className="kbd">Ctrl</span>+<span className="kbd">↵</span> save ·{' '}
            <span className="kbd">Esc</span> close (your draft is kept)
          </span>
          <div className="ml-auto flex gap-2">
            {lifts.length > 0 && (
              <button type="button" onClick={discard} className={`btn ${confirmDiscard ? 'btn-outline text-danger' : 'btn-ghost'}`}>
                {confirmDiscard ? 'Click again to discard' : 'Discard'}
              </button>
            )}
            <button type="button" onClick={save} disabled={problems > 0 || totals.sets === 0} className="btn btn-primary">
              {saveLabel}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
