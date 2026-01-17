/**
 * Shared constants for claude-code-monitor
 */

/** Package name used for npx commands */
export const PACKAGE_NAME = 'claude-code-monitor';

/** Session timeout in milliseconds (30 minutes) */
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

/** TTY cache TTL in milliseconds (30 seconds) */
export const TTY_CACHE_TTL_MS = 30_000;

/** Hook event types supported by Claude Code */
export const HOOK_EVENTS = [
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'Notification',
  'Stop',
] as const;

export type HookEventName = (typeof HOOK_EVENTS)[number];
