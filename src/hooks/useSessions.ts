import chokidar from 'chokidar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SESSION_REFRESH_INTERVAL_MS, SESSION_UPDATE_DEBOUNCE_MS } from '../constants.js';
import { getSessions, getStorePath } from '../store/file-store.js';
import type { Session } from '../types/index.js';

export function useSessions(): {
  sessions: Session[];
  loading: boolean;
  error: Error | null;
} {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSessions = useCallback(() => {
    try {
      const data = getSessions();
      setSessions(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Failed to load sessions'));
    } finally {
      setLoading(false);
    }
  }, []);

  const debouncedLoadSessions = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      loadSessions();
      debounceTimerRef.current = null;
    }, SESSION_UPDATE_DEBOUNCE_MS);
  }, [loadSessions]);

  useEffect(() => {
    // Initial load (immediate, no debounce)
    loadSessions();

    // Watch file changes (debounced)
    const storePath = getStorePath();
    const watcher = chokidar.watch(storePath, {
      persistent: true,
      ignoreInitial: true,
    });

    watcher.on('change', debouncedLoadSessions);
    watcher.on('add', debouncedLoadSessions);

    // Periodic refresh for timeout detection (chokidar is primary, this is backup)
    const interval = setInterval(loadSessions, SESSION_REFRESH_INTERVAL_MS);

    return () => {
      watcher.close();
      clearInterval(interval);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [loadSessions, debouncedLoadSessions]);

  return { sessions, loading, error };
}
