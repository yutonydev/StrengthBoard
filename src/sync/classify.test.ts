import { describe, expect, it } from 'vitest';
import { classify } from './classify';

const err = (message: string, code = '') => ({ message, code });

describe('classify', () => {
  it('treats no error as success', () => {
    expect(classify(201, null)).toEqual({ result: 'ok' });
  });

  it('pauses on expired or missing auth', () => {
    expect(classify(401, err('JWT expired'))).toEqual({ result: 'auth' });
    expect(classify(400, err('JWT expired', 'PGRST301'))).toEqual({ result: 'auth' });
    expect(classify(400, err('no auth', 'PGRST303'))).toEqual({ result: 'auth' });
  });

  it('retries network failures, timeouts, rate limits and server errors', () => {
    expect(classify(0, err('TypeError: Failed to fetch'))).toEqual({ result: 'retry', message: 'TypeError: Failed to fetch' });
    expect(classify(408, err('timeout')).result).toBe('retry');
    expect(classify(429, err('slow down')).result).toBe('retry');
    expect(classify(503, err('unavailable')).result).toBe('retry');
  });

  it('rejects other client errors so the queue can move on', () => {
    expect(classify(400, err('violates check constraint', '23514'))).toEqual({ result: 'reject', message: 'violates check constraint' });
    expect(classify(403, err('row-level security', '42501')).result).toBe('reject');
    expect(classify(409, err('foreign key', '23503')).result).toBe('reject');
  });
});
