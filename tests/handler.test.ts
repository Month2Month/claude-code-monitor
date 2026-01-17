import { describe, expect, it } from 'vitest';
import { isNonEmptyString, isValidHookEventName, VALID_HOOK_EVENTS } from '../src/hook/handler.js';

describe('handler', () => {
  describe('VALID_HOOK_EVENTS', () => {
    it('should contain all expected hook event names', () => {
      expect(VALID_HOOK_EVENTS.has('PreToolUse')).toBe(true);
      expect(VALID_HOOK_EVENTS.has('PostToolUse')).toBe(true);
      expect(VALID_HOOK_EVENTS.has('Notification')).toBe(true);
      expect(VALID_HOOK_EVENTS.has('Stop')).toBe(true);
      expect(VALID_HOOK_EVENTS.has('UserPromptSubmit')).toBe(true);
    });

    it('should have exactly 5 valid events', () => {
      expect(VALID_HOOK_EVENTS.size).toBe(5);
    });
  });

  describe('isValidHookEventName', () => {
    it('should return true for valid event names', () => {
      expect(isValidHookEventName('PreToolUse')).toBe(true);
      expect(isValidHookEventName('PostToolUse')).toBe(true);
      expect(isValidHookEventName('Notification')).toBe(true);
      expect(isValidHookEventName('Stop')).toBe(true);
      expect(isValidHookEventName('UserPromptSubmit')).toBe(true);
    });

    it('should return false for invalid event names', () => {
      expect(isValidHookEventName('Invalid')).toBe(false);
      expect(isValidHookEventName('')).toBe(false);
      expect(isValidHookEventName('pretooluse')).toBe(false);
      expect(isValidHookEventName('PRETOOLUSE')).toBe(false);
      expect(isValidHookEventName('pre_tool_use')).toBe(false);
    });
  });

  describe('isNonEmptyString', () => {
    it('should return true for non-empty strings', () => {
      expect(isNonEmptyString('hello')).toBe(true);
      expect(isNonEmptyString('a')).toBe(true);
      expect(isNonEmptyString(' ')).toBe(true);
      expect(isNonEmptyString('abc123')).toBe(true);
    });

    it('should return false for empty string', () => {
      expect(isNonEmptyString('')).toBe(false);
    });

    it('should return false for non-string values', () => {
      expect(isNonEmptyString(null)).toBe(false);
      expect(isNonEmptyString(undefined)).toBe(false);
      expect(isNonEmptyString(123)).toBe(false);
      expect(isNonEmptyString({})).toBe(false);
      expect(isNonEmptyString([])).toBe(false);
      expect(isNonEmptyString(true)).toBe(false);
    });
  });
});
