import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimeoutError, withTimeout } from './timeout';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('withTimeout', () => {
  it('passes through a result that arrives in time', async () => {
    await expect(withTimeout(Promise.resolve(7), 1000)).resolves.toBe(7);
  });

  it('rejects when the work never finishes', async () => {
    const pending = withTimeout(new Promise(() => {}), 1000);
    vi.advanceTimersByTime(1000);
    await expect(pending).rejects.toBeInstanceOf(TimeoutError);
  });

  it('passes through the work’s own failure', async () => {
    await expect(withTimeout(Promise.reject(new Error('nope')), 1000)).rejects.toThrow('nope');
  });
});
