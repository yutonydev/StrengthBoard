export type Unit = 'lb' | 'kg';
export type ThemePref = 'system' | 'light' | 'dark';

export interface Exercise {
  id: string;
  name: string;
  category?: string;
  pinned: boolean;
  createdAt: number;
}

export interface WorkoutSet {
  id: string;
  exerciseId: string;
  date: string;
  weight: number;
  reps: number;
  rpe?: number;
  notes?: string;
  createdAt: number;
}

export interface Settings {
  unit: Unit;
}

export interface AppData {
  version: 1;
  exercises: Exercise[];
  sets: WorkoutSet[];
  settings: Settings;
}
