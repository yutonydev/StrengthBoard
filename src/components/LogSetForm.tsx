import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Check, Minus, Plus, X } from 'lucide-react';
import type { Unit, WorkoutSet } from '../types';
import type { Session } from '../lib/stats';
import { fmtShortDate, today } from '../lib/dates';
import { fmtNum, fmtSet, fromKg, toKg, weightStep } from '../lib/units';

export interface NewSet {
  date: string;
  weight: number;
  reps: number;
  rpe?: number;
  notes?: string;
}

interface Props {
  exerciseName: string;
  unit: Unit;
  lastSet?: WorkoutSet;
  sessions: Session[];
  onLog: (set: NewSet) => void;
  onDeleteSet: (set: WorkoutSet) => void;
  onClose: () => void;
}

type Errors = Partial<Record<'weight' | 'reps' | 'rpe' | 'date', string>>;

function Stepper({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      onClick={onClick}
      className="inline-flex w-11 shrink-0 items-center justify-center text-muted hover:bg-surface-3 hover:text-fg sm:w-7"
    >
      {children}
    </button>
  );
}

export function LogSetForm({ exerciseName, unit, lastSet, sessions, onLog, onDeleteSet, onClose }: Props) {
  const uid = useId();
  const weightRef = useRef<HTMLInputElement>(null);
  const [weight, setWeight] = useState(lastSet ? fmtNum(fromKg(lastSet.weight, unit)) : '');
  const [reps, setReps] = useState(lastSet ? String(lastSet.reps) : '');
  const [rpe, setRpe] = useState('');
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    weightRef.current?.focus();
    weightRef.current?.select();
  }, []);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1800);
    return () => clearTimeout(t);
  }, [flash]);

  const step = weightStep(unit);
  const bump = (delta: number) => {
    const n = parseFloat(weight);
    setWeight(fmtNum(Math.max(0, (Number.isFinite(n) ? n : 0) + delta)));
  };
  const bumpReps = (delta: number) => {
    const n = parseInt(reps, 10);
    setReps(String(Math.max(1, (Number.isFinite(n) ? n : 0) + delta)));
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    const w = parseFloat(weight);
    const r = Number(reps);
    const p = rpe.trim() === '' ? undefined : Number(rpe);
    const next: Errors = {};
    if (!Number.isFinite(w) || w < 0 || w > 2000) next.weight = 'Enter a weight (0 for bodyweight)';
    if (!Number.isInteger(r) || r < 1 || r > 100) next.reps = 'Reps must be 1–100';
    if (p !== undefined && (!Number.isFinite(p) || p < 1 || p > 10)) next.rpe = 'RPE is 1–10';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today()) next.date = 'Pick today or earlier';
    setErrors(next);
    if (Object.keys(next).length) return;

    onLog({ date, weight: toKg(w, unit), reps: r, rpe: p, notes: notes.trim() || undefined });
    setFlash(`${fmtSet(toKg(w, unit), r, unit)} logged`);
    setNotes('');
    weightRef.current?.focus();
    weightRef.current?.select();
  }

  function onKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    } else if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
      e.preventDefault();
      e.currentTarget.requestSubmit();
    }
  }

  const session = sessions.find((s) => s.date === date);
  const err = (k: keyof Errors) =>
    errors[k] ? (
      <p id={`${uid}-${k}-err`} className="mt-1 text-xs text-danger">
        {errors[k]}
      </p>
    ) : null;

  return (
    <form
      onSubmit={submit}
      onKeyDown={onKeyDown}
      aria-label={`Log a set of ${exerciseName}`}
      className="animate-in border-t border-line bg-surface-2 px-3 py-3 sm:pl-10"
      noValidate
    >
      <div className="grid grid-cols-2 gap-x-2 gap-y-2.5 sm:flex sm:flex-wrap sm:items-start">
        <div className="sm:w-36">
          <label htmlFor={`${uid}-w`} className="label">
            Weight <span className="normal-case">({unit})</span>
          </label>
          <div className="field flex overflow-hidden p-0" aria-invalid={!!errors.weight}>
            <Stepper label={`Decrease weight by ${step} ${unit}`} onClick={() => bump(-step)}>
              <Minus size={14} />
            </Stepper>
            <input
              ref={weightRef}
              id={`${uid}-w`}
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              aria-invalid={!!errors.weight}
              aria-describedby={errors.weight ? `${uid}-weight-err` : undefined}
              className="w-full min-w-0 bg-transparent text-center font-mono tabular-nums outline-none"
              placeholder="0"
            />
            <Stepper label={`Increase weight by ${step} ${unit}`} onClick={() => bump(step)}>
              <Plus size={14} />
            </Stepper>
          </div>
          {err('weight')}
        </div>

        <div className="sm:w-28">
          <label htmlFor={`${uid}-r`} className="label">
            Reps
          </label>
          <div className="field flex overflow-hidden p-0" aria-invalid={!!errors.reps}>
            <Stepper label="Decrease reps" onClick={() => bumpReps(-1)}>
              <Minus size={14} />
            </Stepper>
            <input
              id={`${uid}-r`}
              type="number"
              inputMode="numeric"
              step={1}
              min={1}
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              aria-invalid={!!errors.reps}
              aria-describedby={errors.reps ? `${uid}-reps-err` : undefined}
              className="w-full min-w-0 bg-transparent text-center font-mono tabular-nums outline-none"
              placeholder="5"
            />
            <Stepper label="Increase reps" onClick={() => bumpReps(1)}>
              <Plus size={14} />
            </Stepper>
          </div>
          {err('reps')}
        </div>

        <div className="sm:w-16">
          <label htmlFor={`${uid}-p`} className="label">
            RPE <span className="font-normal normal-case">opt</span>
          </label>
          <input
            id={`${uid}-p`}
            type="number"
            inputMode="decimal"
            step={0.5}
            min={1}
            max={10}
            value={rpe}
            onChange={(e) => setRpe(e.target.value)}
            aria-invalid={!!errors.rpe}
            aria-describedby={errors.rpe ? `${uid}-rpe-err` : undefined}
            className="field text-center font-mono tabular-nums"
            placeholder="–"
          />
          {err('rpe')}
        </div>

        <div className="sm:w-36">
          <label htmlFor={`${uid}-d`} className="label">
            Date
          </label>
          <input
            id={`${uid}-d`}
            type="date"
            value={date}
            max={today()}
            onChange={(e) => setDate(e.target.value)}
            aria-invalid={!!errors.date}
            aria-describedby={errors.date ? `${uid}-date-err` : undefined}
            className="field font-mono text-[13px] tabular-nums"
          />
          {err('date')}
        </div>

        <div className="col-span-2 sm:min-w-40 sm:flex-1">
          <label htmlFor={`${uid}-n`} className="label">
            Notes <span className="font-normal normal-case">opt</span>
          </label>
          <input
            id={`${uid}-n`}
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="field"
            placeholder="Belt, paused, felt fast…"
            maxLength={200}
          />
        </div>

        <div className="col-span-2 flex items-end gap-1.5 sm:col-span-1 sm:pt-[18px]">
          <button type="submit" className="btn btn-primary flex-1 sm:flex-none">
            Log set <span className="kbd hidden border-on-accent/30 text-on-accent/70 sm:inline-flex">↵</span>
          </button>
          <button type="button" onClick={onClose} className="icon-btn" aria-label="Close log form">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="mt-2.5 flex min-h-6 flex-wrap items-center gap-1.5 text-xs" aria-live="polite">
        <span className="text-muted">
          {date === today() ? 'Today' : fmtShortDate(date)}
          {session ? ` · ${session.sets.length} set${session.sets.length === 1 ? '' : 's'}` : ' · no sets yet'}
        </span>
        {session?.sets.map((s) => (
          <span
            key={s.id}
            className="inline-flex h-6 items-center gap-1 rounded border border-line bg-surface pl-1.5 font-mono text-xs text-fg"
          >
            {fmtSet(s.weight, s.reps, unit)}
            {s.rpe ? <span className="text-muted">@{fmtNum(s.rpe)}</span> : null}
            <button
              type="button"
              onClick={() => onDeleteSet(s)}
              className="inline-flex size-6 items-center justify-center rounded text-muted hover:text-danger"
              aria-label={`Remove set ${fmtSet(s.weight, s.reps, unit)}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        {flash && (
          <span className="inline-flex items-center gap-1 text-up-text">
            <Check size={14} aria-hidden="true" /> {flash}
          </span>
        )}
      </div>
    </form>
  );
}
