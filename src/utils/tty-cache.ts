import { statSync } from 'node:fs';
import { TTY_CACHE_TTL_MS } from '../constants.js';

// TTY check cache to avoid repeated statSync calls
const ttyCache = new Map<string, { alive: boolean; checkedAt: number }>();

/**
 * Check if a TTY device is still alive (exists in filesystem)
 * Results are cached for TTY_CACHE_TTL_MS to avoid repeated stat calls
 * @internal
 */
export function isTtyAlive(tty: string | undefined): boolean {
  if (!tty) return true; // Treat unknown TTY as alive

  const now = Date.now();
  const cached = ttyCache.get(tty);

  // Return cached result if still valid
  if (cached && now - cached.checkedAt < TTY_CACHE_TTL_MS) {
    return cached.alive;
  }

  // Check TTY and cache result
  try {
    statSync(tty);
    ttyCache.set(tty, { alive: true, checkedAt: now });
    return true;
  } catch {
    ttyCache.set(tty, { alive: false, checkedAt: now });
    return false;
  }
}

/**
 * Clear the TTY cache (useful for testing)
 * @internal
 */
export function clearTtyCache(): void {
  ttyCache.clear();
}
