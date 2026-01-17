import chokidar from 'chokidar';
import { useEffect, useState } from 'react';
import { getSessions, getStorePath } from '../store/file-store.js';
import type { Session } from '../types/index.js';

const REFRESH_INTERVAL_MS = 60_000; // タイムアウト検出のための定期リフレッシュ（chokidarが主で、これはバックアップ）

export function useSessions(): {
  sessions: Session[];
  loading: boolean;
  error: Error | null;
} {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const loadSessions = () => {
      try {
        const data = getSessions();
        setSessions(data);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e : new Error('Failed to load sessions'));
      } finally {
        setLoading(false);
      }
    };

    // Initial load
    loadSessions();

    // Watch file changes
    const storePath = getStorePath();
    const watcher = chokidar.watch(storePath, {
      persistent: true,
      ignoreInitial: true,
    });

    watcher.on('change', loadSessions);
    watcher.on('add', loadSessions);

    // Periodic refresh (for timeout detection)
    const interval = setInterval(loadSessions, REFRESH_INTERVAL_MS);

    return () => {
      watcher.close();
      clearInterval(interval);
    };
  }, []);

  return { sessions, loading, error };
}
