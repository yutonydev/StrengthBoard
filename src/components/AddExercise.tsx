import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { AlertTriangle, ArrowRight, Plus, Sparkles } from 'lucide-react';
import type { Exercise } from '../types';
import type { ExerciseStats } from '../lib/stats';
import { CATALOG, rankMatches, similarity } from '../lib/similarity';

interface Props {
  open: boolean;
  setOpen: (open: boolean) => void;
  exercises: Exercise[];
  stats: Map<string, ExerciseStats>;
  categories: string[];
  onAdd: (input: { name: string; category?: string; pinned: boolean }) => void;
  onGoTo: (id: string) => void;
}

type Option =
  | { kind: 'existing'; exercise: Exercise; score: number }
  | { kind: 'catalog'; name: string; category: string };

export function AddExercise({ open, setOpen, exercises, stats, categories, onAdd, onGoTo }: Props) {
  const uid = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [pinned, setPinned] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const existing = useMemo(() => rankMatches(name, exercises, (e) => e.name).slice(0, 4), [name, exercises]);

  const catalog = useMemo(() => {
    if (!name.trim()) return [];
    const untracked = CATALOG.filter((c) => !exercises.some((e) => similarity(c.name, e.name) === 1));
    return rankMatches(name, untracked, (c) => c.name, 0.55)
      .slice(0, 5)
      .map((m) => m.item);
  }, [name, exercises]);

  const options: Option[] = [
    ...existing.map((m) => ({ kind: 'existing' as const, exercise: m.item, score: m.score })),
    ...catalog.map((c) => ({ kind: 'catalog' as const, ...c })),
  ];

  const top = existing[0];
  const duplicate = top && top.score === 1 ? top.item : undefined;
  const similar = !duplicate && top && top.score >= 0.75 ? top.item : undefined;

  function reset() {
    setName('');
    setCategory('');
    setPinned(false);
    setError('');
    setActive(-1);
    setListOpen(false);
  }

  function close() {
    reset();
    setOpen(false);
  }

  function choose(opt: Option) {
    if (opt.kind === 'existing') {
      close();
      onGoTo(opt.exercise.id);
      return;
    }
    setName(opt.name);
    if (!category) setCategory(opt.category);
    setListOpen(false);
    setActive(-1);
    inputRef.current?.focus();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (listOpen && active >= 0 && options[active]) return choose(options[active]);
    const n = name.trim().replace(/\s+/g, ' ');
    if (!n) return setError('Give the lift a name');
    if (duplicate) return setError(`You already track “${duplicate.name}”`);
    onAdd({ name: n, category: category.trim() || undefined, pinned });
    close();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setListOpen(true);
      setActive((a) => (options.length ? (a + 1) % options.length : -1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setListOpen(true);
      setActive((a) => (options.length ? (a - 1 + options.length) % options.length : -1));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (listOpen && options.length) {
        setListOpen(false);
        setActive(-1);
      } else close();
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex h-12 w-full items-center gap-2 border-b border-line px-3 text-sm text-muted transition-colors hover:bg-surface-3 hover:text-fg"
      >
        <span className="flex size-6 items-center justify-center rounded-md border border-dashed border-line-strong group-hover:border-accent group-hover:text-accent-text">
          <Plus size={14} aria-hidden="true" />
        </span>
        Add exercise
        <span className="kbd ml-auto hidden sm:inline-flex">N</span>
      </button>
    );
  }

  const listId = `${uid}-list`;
  const showList = listOpen && options.length > 0;
  let groupShown = { existing: false, catalog: false };

  return (
    <form
      onSubmit={submit}
      aria-label="Add exercise"
      className="animate-in border-b border-line bg-surface-2 px-3 py-3"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          close();
        }
      }}
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="relative w-full sm:w-80">
          <label htmlFor={`${uid}-name`} className="label">
            Exercise name
          </label>
          <input
            ref={inputRef}
            id={`${uid}-name`}
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList && active >= 0 ? `${uid}-opt-${active}` : undefined}
            aria-invalid={!!error || !!duplicate}
            aria-describedby={`${uid}-hint`}
            autoComplete="off"
            value={name}
            maxLength={60}
            placeholder="e.g. Incline Bench Press"
            onChange={(e) => {
              setName(e.target.value);
              setError('');
              setListOpen(true);
              setActive(-1);
            }}
            onFocus={() => setListOpen(true)}
            onBlur={() => setListOpen(false)}
            onKeyDown={onKeyDown}
            className="field"
          />
          {showList && (
            <ul
              id={listId}
              role="listbox"
              aria-label="Matching exercises"
              className="absolute top-full right-0 left-0 z-40 mt-1 max-h-72 overflow-auto rounded-lg border border-line-strong bg-surface-3 p-1 shadow-pop"
            >
              {options.map((opt, i) => {
                const header =
                  opt.kind === 'existing' && !groupShown.existing
                    ? 'Already tracking'
                    : opt.kind === 'catalog' && !groupShown.catalog
                      ? 'Suggestions'
                      : null;
                groupShown = { ...groupShown, [opt.kind]: true };
                const st = opt.kind === 'existing' ? stats.get(opt.exercise.id) : undefined;
                return (
                  <li key={opt.kind === 'existing' ? opt.exercise.id : opt.name} role="presentation">
                    {header && (
                      <div className="px-2 pt-1.5 pb-1 text-[10px] font-semibold tracking-wider text-muted uppercase" role="presentation">
                        {header}
                      </div>
                    )}
                    <div
                      id={`${uid}-opt-${i}`}
                      role="option"
                      aria-selected={i === active}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(opt)}
                      onMouseEnter={() => setActive(i)}
                      className={`flex h-10 cursor-pointer items-center gap-2 rounded-md px-2 text-sm sm:h-8 ${
                        i === active ? 'bg-surface-4 text-fg' : 'text-fg'
                      }`}
                    >
                      <span className="truncate">{opt.kind === 'existing' ? opt.exercise.name : opt.name}</span>
                      <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-muted">
                        {opt.kind === 'existing' ? (
                          <>
                            {st?.sessions.length ?? 0} sessions <ArrowRight size={12} aria-hidden="true" />
                          </>
                        ) : (
                          opt.category
                        )}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="w-[calc(50%-4px)] sm:w-40">
          <label htmlFor={`${uid}-cat`} className="label">
            Category <span className="font-normal normal-case">opt</span>
          </label>
          <input
            id={`${uid}-cat`}
            list={`${uid}-cats`}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="field"
            placeholder="Push / Pull / Legs"
            maxLength={24}
          />
          <datalist id={`${uid}-cats`}>
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        <label className="flex h-11 w-[calc(50%-4px)] items-center gap-2 self-end text-sm text-fg select-none sm:h-8 sm:w-auto sm:px-1">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="size-4 accent-[var(--lb-accent)]" />
          Pin to top
        </label>

        <div className="flex w-full gap-1.5 sm:w-auto sm:pt-[18px]">
          <button type="submit" className="btn btn-primary flex-1 sm:flex-none" disabled={!!duplicate}>
            Add lift
          </button>
          <button type="button" onClick={close} className="btn btn-ghost">
            Cancel
          </button>
        </div>
      </div>

      <div id={`${uid}-hint`} className="mt-2 min-h-5 text-xs" aria-live="polite">
        {error && !duplicate && <span className="text-danger">{error}</span>}
        {duplicate && (
          <span className="inline-flex flex-wrap items-center gap-x-1.5 text-danger">
            <AlertTriangle size={13} aria-hidden="true" />
            You already track “{duplicate.name}”.
            <button type="button" onClick={() => choose({ kind: 'existing', exercise: duplicate, score: 1 })} className="font-medium text-accent-text underline-offset-2 hover:underline">
              Go to it
            </button>
          </span>
        )}
        {similar && (
          <span className="inline-flex flex-wrap items-center gap-x-1.5 text-muted">
            <AlertTriangle size={13} className="text-warn" aria-hidden="true" />
            Looks like <span className="font-medium text-fg">{similar.name}</span>, which you already track.
            <button type="button" onClick={() => choose({ kind: 'existing', exercise: similar, score: top!.score })} className="font-medium text-accent-text underline-offset-2 hover:underline">
              Log that instead
            </button>
          </span>
        )}
        {!error && !duplicate && !similar && (
          <span className="inline-flex items-center gap-1.5 text-muted">
            <Sparkles size={12} aria-hidden="true" />
            Similar names are matched as you type, so “Bench” and “Bench Press” don’t end up as two lifts.
          </span>
        )}
      </div>
    </form>
  );
}
