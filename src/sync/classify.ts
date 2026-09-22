import type { SendOutcome } from './queue';

export function classify(status: number, error: { message: string; code?: string } | null): SendOutcome {
  if (!error) return { result: 'ok' };
  if (status === 401 || error.code === 'PGRST301' || error.code === 'PGRST303') return { result: 'auth' };
  if (status === 0 || status === 408 || status === 429 || status >= 500) return { result: 'retry', message: error.message };
  return { result: 'reject', message: error.message };
}
