import type { Unit } from '../types';

const LB_PER_KG = 1 / 0.45359237;

export function toKg(value: number, unit: Unit): number {
  return unit === 'kg' ? value : value * 0.45359237;
}

export function fromKg(kg: number, unit: Unit): number {
  return unit === 'kg' ? kg : kg * LB_PER_KG;
}

export function fmtNum(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export function fmtWeight(kg: number, unit: Unit): string {
  return fmtNum(fromKg(kg, unit));
}

export function fmtSet(kg: number, reps: number, unit: Unit): string {
  return `${kg === 0 ? 'BW' : fmtWeight(kg, unit)}×${reps}`;
}

export function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${fmtNum(n / 1e6)}M`;
  if (abs >= 1e4) return `${fmtNum(n / 1e3)}k`;
  return Math.round(n).toLocaleString('en-US');
}

export function weightStep(unit: Unit): number {
  return unit === 'kg' ? 2.5 : 5;
}
