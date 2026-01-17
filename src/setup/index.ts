import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { HOOK_EVENTS, PACKAGE_NAME } from '../constants.js';
import { askConfirmation } from '../utils/prompt.js';

const CLAUDE_DIR = join(homedir(), '.claude');
const SETTINGS_FILE = join(CLAUDE_DIR, 'settings.json');

/** @internal */
export interface HookConfig {
  type: 'command';
  command: string;
}

/** @internal */
export interface HookEntry {
  matcher?: string;
  hooks: HookConfig[];
}

/** @internal */
export interface Settings {
  hooks?: Record<string, HookEntry[]>;
  [key: string]: unknown;
}

/**
 * Check if a command string is a ccm hook command for the given event
 * @internal
 */
function isCcmHookCommand(command: string, eventName: string): boolean {
  return command === `ccm hook ${eventName}` || command === `npx ${PACKAGE_NAME} hook ${eventName}`;
}

/**
 * Check if the ccm hook is already configured for the given event
 * @internal
 */
export function hasCcmHookForEvent(entries: HookEntry[] | undefined, eventName: string): boolean {
  if (!entries) return false;
  return entries.some((entry) => entry.hooks.some((h) => isCcmHookCommand(h.command, eventName)));
}

/**
 * Check if ccm command is in PATH and return the appropriate command
 */
function getCcmCommand(): string {
  const result = spawnSync('which', ['ccm'], { encoding: 'utf-8' });
  if (result.status === 0) {
    return 'ccm';
  }
  return `npx ${PACKAGE_NAME}`;
}

/**
 * Create a hook entry for the given event
 * @internal
 */
export function createHookEntry(eventName: string, baseCommand: string): HookEntry {
  const entry: HookEntry = {
    hooks: [
      {
        type: 'command',
        command: `${baseCommand} hook ${eventName}`,
      },
    ],
  };
  // Events other than UserPromptSubmit require a matcher
  if (eventName !== 'UserPromptSubmit') {
    entry.matcher = '';
  }
  return entry;
}

/**
 * Load existing settings.json or return empty settings
 */
function loadSettings(): Settings {
  if (!existsSync(SETTINGS_FILE)) {
    return {};
  }
  try {
    const content = readFileSync(SETTINGS_FILE, 'utf-8');
    return JSON.parse(content) as Settings;
  } catch {
    console.error('Warning: Failed to parse existing settings.json, creating new one');
    return {};
  }
}

/**
 * Determine which hooks need to be added or skipped
 * @internal
 */
export function categorizeHooks(settings: Settings): { toAdd: string[]; toSkip: string[] } {
  const toAdd: string[] = [];
  const toSkip: string[] = [];

  for (const eventName of HOOK_EVENTS) {
    if (hasCcmHookForEvent(settings.hooks?.[eventName], eventName)) {
      toSkip.push(eventName);
    } else {
      toAdd.push(eventName);
    }
  }

  return { toAdd, toSkip };
}

/**
 * Display setup preview to the user
 */
function showSetupPreview(
  hooksToAdd: string[],
  hooksToSkip: string[],
  settingsExist: boolean
): void {
  console.log(`Target file: ${SETTINGS_FILE}`);
  console.log(settingsExist ? '(file exists, will be modified)' : '(file will be created)');
  console.log('');
  console.log('The following hooks will be added:');
  for (const eventName of hooksToAdd) {
    console.log(`  [add]  ${eventName}`);
  }
  if (hooksToSkip.length > 0) {
    console.log('');
    console.log('Already configured (will be skipped):');
    for (const eventName of hooksToSkip) {
      console.log(`  [skip] ${eventName}`);
    }
  }
  console.log('');
}

/**
 * Apply hooks to settings and save to file
 */
function applyHooks(settings: Settings, hooksToAdd: string[], baseCommand: string): void {
  if (!settings.hooks) {
    settings.hooks = {};
  }

  for (const eventName of hooksToAdd) {
    const existing = settings.hooks[eventName];
    if (!existing) {
      settings.hooks[eventName] = [createHookEntry(eventName, baseCommand)];
    } else {
      existing.push(createHookEntry(eventName, baseCommand));
    }
  }

  writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
}

/**
 * Check if hooks are already configured
 */
export function isHooksConfigured(): boolean {
  if (!existsSync(SETTINGS_FILE)) {
    return false;
  }

  try {
    const content = readFileSync(SETTINGS_FILE, 'utf-8');
    const settings = JSON.parse(content) as Settings;

    if (!settings.hooks) {
      return false;
    }

    // Check if all hook events are configured
    for (const eventName of HOOK_EVENTS) {
      if (!hasCcmHookForEvent(settings.hooks[eventName], eventName)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

export async function setupHooks(): Promise<void> {
  console.log('Claude Code Monitor Setup');
  console.log('=========================');
  console.log('');

  const baseCommand = getCcmCommand();
  console.log(`Using command: ${baseCommand}`);
  console.log('');

  // Ensure .claude directory exists
  if (!existsSync(CLAUDE_DIR)) {
    mkdirSync(CLAUDE_DIR, { recursive: true });
  }

  const settingsExist = existsSync(SETTINGS_FILE);
  const settings = loadSettings();
  const { toAdd: hooksToAdd, toSkip: hooksToSkip } = categorizeHooks(settings);

  // No changes needed
  if (hooksToAdd.length === 0) {
    console.log('All hooks already configured. No changes needed.');
    console.log('');
    console.log(`Start monitoring with: ${baseCommand} watch`);
    return;
  }

  showSetupPreview(hooksToAdd, hooksToSkip, settingsExist);

  const confirmed = await askConfirmation('Do you want to apply these changes?');
  if (!confirmed) {
    console.log('');
    console.log('Setup cancelled. No changes were made.');
    return;
  }

  applyHooks(settings, hooksToAdd, baseCommand);

  console.log('');
  console.log(`Setup complete! Added ${hooksToAdd.length} hook(s) to ${SETTINGS_FILE}`);
  console.log('');
  console.log(`Start monitoring with: ${baseCommand} watch`);
}
