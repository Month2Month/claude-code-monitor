import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getFirstUserMessage, getLastAssistantMessage } from '../src/utils/transcript.js';

const TEST_DIR = join(tmpdir(), `transcript-test-${process.pid}`);

function writeTranscript(filename: string, lines: object[]): string {
  const path = join(TEST_DIR, filename);
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join('\n'), 'utf-8');
  return path;
}

describe('transcript', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('getFirstUserMessage', () => {
    it('should return the first user text message', () => {
      const path = writeTranscript('test.jsonl', [
        { type: 'human', message: { content: [{ type: 'text', text: 'Fix the login bug' }] } },
        {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'I will fix it.' }] },
        },
        { type: 'human', message: { content: [{ type: 'text', text: 'Second message' }] } },
      ]);

      expect(getFirstUserMessage(path)).toBe('Fix the login bug');
    });

    it('should truncate long messages to 50 characters', () => {
      const longMessage = 'A'.repeat(60);
      const path = writeTranscript('test.jsonl', [
        { type: 'human', message: { content: [{ type: 'text', text: longMessage }] } },
      ]);

      const result = getFirstUserMessage(path);
      expect(result).toHaveLength(50);
      expect(result).toBe(`${'A'.repeat(49)}…`);
    });

    it('should return undefined for non-existent file', () => {
      expect(getFirstUserMessage('/nonexistent/path.jsonl')).toBeUndefined();
    });

    it('should return undefined for empty transcript', () => {
      const path = writeTranscript('empty.jsonl', []);
      expect(getFirstUserMessage(path)).toBeUndefined();
    });

    it('should skip empty text blocks', () => {
      const path = writeTranscript('test.jsonl', [
        { type: 'human', message: { content: [{ type: 'text', text: '  ' }] } },
        { type: 'human', message: { content: [{ type: 'text', text: 'Real task' }] } },
      ]);

      expect(getFirstUserMessage(path)).toBe('Real task');
    });

    it('should return undefined for empty path', () => {
      expect(getFirstUserMessage('')).toBeUndefined();
    });
  });

  describe('getLastAssistantMessage', () => {
    it('should return the last assistant text message', () => {
      const path = writeTranscript('test.jsonl', [
        { type: 'assistant', message: { content: [{ type: 'text', text: 'First response' }] } },
        { type: 'assistant', message: { content: [{ type: 'text', text: 'Last response' }] } },
      ]);

      expect(getLastAssistantMessage(path)).toBe('Last response');
    });

    it('should return undefined for non-existent file', () => {
      expect(getLastAssistantMessage('/nonexistent/path.jsonl')).toBeUndefined();
    });
  });
});
