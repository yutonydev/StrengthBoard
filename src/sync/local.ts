import { parseData, reducer, type Action } from '../store';
import type { AppData } from '../types';

export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function memoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

export function browserStore(): KeyValueStore {
  try {
    const store = window.localStorage;
    store.getItem('strengthboard:probe');
    return store;
  } catch {
    return memoryStore();
  }
}

export const cacheKey = (userId: string) => `strengthboard:cache:${userId}`;
export const queueKey = (userId: string) => `strengthboard:queue:${userId}`;

export function readCache(store: KeyValueStore, userId: string): AppData | null {
  try {
    const raw = store.getItem(cacheKey(userId));
    return raw ? parseData(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeCache(store: KeyValueStore, userId: string, data: AppData): void {
  try {
    store.setItem(cacheKey(userId), JSON.stringify(data));
  } catch {}
}

export function clearUser(store: KeyValueStore, userId: string): void {
  try {
    store.removeItem(cacheKey(userId));
    store.removeItem(queueKey(userId));
  } catch {}
}

export function replay(base: AppData, actions: Action[]): AppData {
  return actions.reduce(reducer, base);
}
