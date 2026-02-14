#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Command } from 'commander';
import { render } from 'ink';
import { Dashboard } from '../components/Dashboard.js';
import { handleHookEvent } from '../hook/handler.js';
import { buildMenubarApp, getPidFilePath } from '../menubar/build.js';
import { startServer } from '../server/index.js';
import { isHooksConfigured, promptGhosttySettingIfNeeded, setupHooks } from '../setup/index.js';
import { clearSessions, getSessions } from '../store/file-store.js';
import { focusSession } from '../utils/focus.js';
import { getStatusDisplay } from '../utils/status.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };

// Alternate screen buffer escape sequences
const ENTER_ALT_SCREEN = '\x1b[?1049h\x1b[H';
const EXIT_ALT_SCREEN = '\x1b[?1049l';

/**
 * Get TTY from ancestor processes
 */
const MAX_ANCESTOR_DEPTH = 5;

function getTtyFromAncestors(): string | undefined {
  try {
    let currentPid = process.ppid;
    for (let i = 0; i < MAX_ANCESTOR_DEPTH; i++) {
      const ttyName = execFileSync('ps', ['-o', 'tty=', '-p', String(currentPid)], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();
      const isValidTty = ttyName && ttyName !== '??' && ttyName !== '';
      if (isValidTty) {
        return `/dev/${ttyName}`;
      }
      const ppid = execFileSync('ps', ['-o', 'ppid=', '-p', String(currentPid)], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();
      if (!ppid) break;
      currentPid = parseInt(ppid, 10);
    }
  } catch {
    // TTY取得失敗は正常（バックグラウンド実行時など）
  }
  return undefined;
}

interface DashboardOptions {
  qr?: boolean;
  preferTailscale?: boolean;
}

/**
 * Run TUI with alternate screen buffer
 */
async function runWithAltScreen(options: DashboardOptions = {}) {
  process.stdout.write(ENTER_ALT_SCREEN);
  // カーソルを非表示にして、より安定したレンダリングを行う
  process.stdout.write('\x1b[?25l');

  const instance = render(
    <Dashboard initialShowQr={options.qr} preferTailscale={options.preferTailscale} />,
    { patchConsole: false }
  );

  // リサイズ時にInkの描画をクリアして再描画
  const handleResize = () => {
    instance.clear();
    instance.rerender(
      <Dashboard initialShowQr={options.qr} preferTailscale={options.preferTailscale} />
    );
  };
  process.stdout.on('resize', handleResize);

  try {
    await instance.waitUntilExit();
  } finally {
    process.stdout.off('resize', handleResize);
    // カーソルを再表示
    process.stdout.write('\x1b[?25h');
    process.stdout.write(EXIT_ALT_SCREEN);
  }
}

const program = new Command();

program
  .name('ccm')
  .description('Claude Code Monitor - CLI-based session monitoring')
  .version(pkg.version)
  .option('--qr', 'Show QR code for mobile access')
  .option('-t, --tailscale', 'Prefer Tailscale IP for mobile access');

program
  .command('watch')
  .alias('w')
  .description('Start the monitoring TUI')
  .option('--qr', 'Show QR code for mobile access')
  .option('-t, --tailscale', 'Prefer Tailscale IP for mobile access')
  .action(async (options: { qr?: boolean; tailscale?: boolean }) => {
    await runWithAltScreen({ qr: options.qr, preferTailscale: options.tailscale });
  });

program
  .command('hook <event>')
  .description('Handle a hook event from Claude Code (internal use)')
  .action(async (event: string) => {
    try {
      const tty = getTtyFromAncestors();
      await handleHookEvent(event, tty);
    } catch (e) {
      console.error('Hook error:', e);
      process.exit(1);
    }
  });

program
  .command('list')
  .alias('ls')
  .description('List all sessions')
  .action(() => {
    const sessions = getSessions();
    if (sessions.length === 0) {
      console.log('No active sessions');
      return;
    }
    for (const session of sessions) {
      const cwd = session.cwd.replace(/^\/Users\/[^/]+/, '~');
      const { symbol } = getStatusDisplay(session.status);
      console.log(`${symbol} ${cwd}`);
    }
  });

program
  .command('clear')
  .description('Clear all sessions')
  .action(() => {
    clearSessions();
    console.log('Sessions cleared');
  });

program
  .command('setup')
  .description('Setup Claude Code hooks for monitoring')
  .action(async () => {
    await setupHooks();
  });

program
  .command('serve')
  .alias('s')
  .description('Start web server for mobile monitoring')
  .option('-p, --port <port>', 'Port number', '3456')
  .option('-t, --tailscale', 'Prefer Tailscale IP for mobile access')
  .action(async (options: { port: string; tailscale?: boolean }) => {
    const port = parseInt(options.port, 10);
    await startServer({ port, preferTailscale: options.tailscale });
  });

program
  .command('focus <tty>')
  .description('Focus the terminal window for a given TTY')
  .action((tty: string) => {
    const success = focusSession(tty);
    if (!success) {
      console.error(`Failed to focus TTY: ${tty}`);
      process.exit(1);
    }
  });

program
  .command('menubar')
  .alias('m')
  .description('Launch the macOS menu bar monitor')
  .action(() => {
    const pidFile = getPidFilePath();

    // Check for existing instance
    if (existsSync(pidFile)) {
      try {
        const pid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
        // Check if process is still running
        process.kill(pid, 0);
        console.log(`Menu bar app is already running (PID: ${pid})`);
        return;
      } catch {
        // Process not running, clean up stale PID file
        unlinkSync(pidFile);
      }
    }

    // Build the Swift binary
    console.log('Building menu bar app...');
    const result = buildMenubarApp();
    if (!result.success || !result.binaryPath) {
      console.error(result.error ?? 'Build failed');
      process.exit(1);
    }
    console.log('Build successful.');

    // Launch detached
    const child = spawn(result.binaryPath, [], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    if (child.pid) {
      writeFileSync(pidFile, String(child.pid), { encoding: 'utf-8', mode: 0o600 });
      console.log(`Menu bar app launched (PID: ${child.pid})`);
    }
  });

program
  .command('menubar-stop')
  .description('Stop the macOS menu bar monitor')
  .action(() => {
    const pidFile = getPidFilePath();

    if (!existsSync(pidFile)) {
      console.log('Menu bar app is not running');
      return;
    }

    try {
      const pid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
      process.kill(pid, 'SIGTERM');
      console.log(`Menu bar app stopped (PID: ${pid})`);
    } catch {
      console.log('Menu bar app was not running');
    }

    try {
      unlinkSync(pidFile);
    } catch {
      // Ignore cleanup errors
    }
  });

/**
 * Default action (when launched without arguments or with --qr only)
 * - Run setup if not configured
 * - Launch monitor if already configured
 */
async function defaultAction(options: DashboardOptions = {}) {
  if (!isHooksConfigured()) {
    console.log('Initial setup required.\n');
    await setupHooks();

    // Verify setup was completed
    if (!isHooksConfigured()) {
      // Setup was cancelled
      return;
    }
    console.log('');
  } else {
    // Hooks are configured, but check if Ghostty setting is needed
    await promptGhosttySettingIfNeeded();
  }

  // Launch monitor
  await runWithAltScreen(options);
}

// Handle default action (no subcommand)
program.action(async () => {
  const options = program.opts<{ qr?: boolean; tailscale?: boolean }>();
  await defaultAction({ qr: options.qr, preferTailscale: options.tailscale });
});

program.parse();
