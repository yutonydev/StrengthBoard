import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { emptyData, reducer, type Action } from '../store';
import { supabase } from '../supabase';
import type { AppData } from '../types';
import { browserStore, clearUser, queueKey, readCache, replay, writeCache } from './local';
import { toRemoteOps } from './ops';
import { SyncQueue, type QueueEntry, type QueuePhase } from './queue';
import { fetchBoard, sendOp } from './remote';

export interface SyncState {
  pending: number;
  phase: QueuePhase;
  online: boolean;
  error: string | null;
  loaded: boolean;
}

export function useSyncedStore(userId: string, notify: (message: string) => void) {
  const store = useMemo(() => browserStore(), []);
  const [server, setServer] = useState<AppData | null>(() => readCache(store, userId));
  const [entries, setEntries] = useState<readonly QueueEntry[]>([]);
  const [phase, setPhase] = useState<QueuePhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [fetched, setFetched] = useState(false);
  const queueRef = useRef<SyncQueue | null>(null);
  const stateRef = useRef<AppData>(server ?? emptyData());
  const sentVersion = useRef(0);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const refresh = useCallback(async () => {
    const queue = queueRef.current;
    if (!queue) return;
    if (queue.pending === 0) {
      const version = sentVersion.current;
      try {
        const board = await fetchBoard();
        if (queueRef.current === queue && sentVersion.current === version && queue.pending === 0) setServer(board);
      } catch {}
    }
    setFetched(true);
  }, []);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (server) writeCache(store, userId, server);
  }, [server, store, userId]);

  useEffect(() => {
    const queue = new SyncQueue({
      store,
      key: queueKey(userId),
      send: (op) => sendOp(op, userId),
      onChange: () => {
        setEntries([...queue.entries]);
        setPhase(queue.phase);
        setError(queue.lastError);
      },
      onSent: (entry) => {
        sentVersion.current += 1;
        setServer((prev) => reducer(prev ?? emptyData(), entry.action));
      },
      onReject: (_entry, message) => notifyRef.current(`Couldn’t save a change: ${message}`),
      onDrained: (hadRejects) => {
        if (hadRejects) void refreshRef.current();
      },
    });
    queueRef.current = queue;
    setEntries([...queue.entries]);
    queue.kick();
    void refreshRef.current();

    const onOnline = () => {
      setOnline(true);
      queue.kick();
      void refreshRef.current();
    };
    const onOffline = () => setOnline(false);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      queue.kick();
      void refreshRef.current();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    const { data: auth } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') queue.resume();
    });

    return () => {
      queue.dispose();
      if (queueRef.current === queue) queueRef.current = null;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
      auth.subscription.unsubscribe();
    };
  }, [store, userId]);

  const data = useMemo(() => replay(server ?? emptyData(), entries.map((e) => e.action)), [server, entries]);
  stateRef.current = data;

  const dispatch = useCallback((action: Action) => {
    const queue = queueRef.current;
    if (!queue) return;
    const after = reducer(stateRef.current, action);
    stateRef.current = after;
    queue.enqueue(action, toRemoteOps(action, after));
  }, []);

  const signOut = useCallback(async () => {
    queueRef.current?.dispose();
    queueRef.current = null;
    clearUser(store, userId);
    await supabase.auth.signOut({ scope: 'local' });
  }, [store, userId]);

  const sync: SyncState = { pending: entries.length, phase, online, error, loaded: server !== null || fetched };
  return { data, dispatch, sync, signOut };
}
