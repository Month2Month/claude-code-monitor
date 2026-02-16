import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Build transcript file path from cwd and session_id.
 * Claude Code stores transcripts at ~/.claude/projects/{encoded-cwd}/{session_id}.jsonl
 */
export function buildTranscriptPath(cwd: string, sessionId: string): string {
  // Encode cwd: replace / and . with - (including leading /)
  const encodedCwd = cwd.replace(/[/.]/g, '-');
  return join(homedir(), '.claude', 'projects', encodedCwd, `${sessionId}.jsonl`);
}

interface ContentBlock {
  type: string;
  text?: string;
}

const MAX_TASK_TITLE_LENGTH = 50;

/**
 * Extract plain user text from message content, skipping system/command XML tags.
 * Returns undefined if the content is not a real user message.
 */
function extractUserText(content: unknown): string | undefined {
  let text: string | undefined;

  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    // Content block array format
    for (const block of content as ContentBlock[]) {
      if (block.type === 'text' && block.text) {
        text = block.text;
        break;
      }
    }
  }

  if (!text) return undefined;

  // Strip XML tags (system reminders, command wrappers, etc.)
  const stripped = text.replace(/<[^>]+>[^<]*<\/[^>]+>/gs, '').trim();
  if (stripped.length === 0 || stripped.startsWith('<')) return undefined;

  return stripped;
}

/**
 * Get the first user text message from a transcript file (used as task title).
 * Truncated to MAX_TASK_TITLE_LENGTH characters.
 */
export function getFirstUserMessage(transcriptPath: string): string | undefined {
  if (!transcriptPath || !existsSync(transcriptPath)) {
    return undefined;
  }

  try {
    const content = readFileSync(transcriptPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'user' && entry.message?.content) {
          const text = extractUserText(entry.message.content);
          if (!text) continue;
          if (text.length <= MAX_TASK_TITLE_LENGTH) return text;
          return `${text.slice(0, MAX_TASK_TITLE_LENGTH - 1)}…`;
        }
      } catch {
        // Skip invalid JSON lines
      }
    }
  } catch {
    // Ignore file read errors
  }

  return undefined;
}

/**
 * Get the last assistant text message from a transcript file.
 */
export function getLastAssistantMessage(transcriptPath: string): string | undefined {
  if (!transcriptPath || !existsSync(transcriptPath)) {
    return undefined;
  }

  try {
    const content = readFileSync(transcriptPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    // Read from end to find last text message
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.type === 'assistant' && entry.message?.content) {
          const contentBlocks = entry.message.content as ContentBlock[];

          for (const block of contentBlocks) {
            if (block.type === 'text' && block.text) {
              return block.text;
            }
          }
        }
      } catch {
        // Skip invalid JSON lines
      }
    }
  } catch {
    // Ignore file read errors
  }

  return undefined;
}
