import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { buildMenubarApp, getPidFilePath } from './build.js';

/**
 * Launch the menu bar app if not already running.
 * Returns true if launched or already running.
 */
export function ensureMenubar(): boolean {
  const pidFile = getPidFilePath();

  // Check for existing instance
  if (existsSync(pidFile)) {
    try {
      const pid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
      process.kill(pid, 0);
      // Already running
      return true;
    } catch {
      unlinkSync(pidFile);
    }
  }

  const result = buildMenubarApp();
  if (!result.success || !result.binaryPath) {
    console.error(`Menu bar: ${result.error ?? 'Build failed'}`);
    return false;
  }

  // Pass the ccm binary path so the Swift app can use it for "Open Dashboard"
  const ccmBin = process.argv[1] ?? 'ccm';
  const child = spawn(result.binaryPath, [ccmBin], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  if (child.pid) {
    writeFileSync(pidFile, String(child.pid), { encoding: 'utf-8', mode: 0o600 });
  }
  return true;
}

/**
 * Check if the menubar app is already running (PID file check only, no launch).
 */
export function isMenubarRunning(): boolean {
  const pidFile = getPidFilePath();
  if (!existsSync(pidFile)) return false;

  try {
    const pid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
    process.kill(pid, 0);
    return true;
  } catch {
    try {
      unlinkSync(pidFile);
    } catch {
      // ignore cleanup errors
    }
    return false;
  }
}
