import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const STORE_DIR = join(homedir(), '.claude-monitor');
const BINARY_PATH = join(STORE_DIR, 'menubar-app');
const HASH_PATH = join(STORE_DIR, 'menubar-app.hash');

function getSwiftSourcePath(): string {
  // In compiled dist: dist/menubar/build.js -> need to find src/menubar/menubar.swift
  // The swift file is bundled in the package under src/menubar/menubar.swift
  const currentDir = dirname(fileURLToPath(import.meta.url));

  // Try relative to compiled location (dist/menubar/) -> (src/menubar/)
  const fromDist = join(currentDir, '..', '..', 'src', 'menubar', 'menubar.swift');
  if (existsSync(fromDist)) return fromDist;

  // Try relative to source location (src/menubar/)
  const fromSrc = join(currentDir, 'menubar.swift');
  if (existsSync(fromSrc)) return fromSrc;

  throw new Error(`Cannot find menubar.swift source file`);
}

function computeHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function needsRecompile(sourceHash: string): boolean {
  if (!existsSync(BINARY_PATH)) return true;
  if (!existsSync(HASH_PATH)) return true;

  try {
    const cachedHash = readFileSync(HASH_PATH, 'utf-8').trim();
    return cachedHash !== sourceHash;
  } catch {
    return true;
  }
}

export interface BuildResult {
  success: boolean;
  binaryPath?: string;
  error?: string;
}

export function buildMenubarApp(): BuildResult {
  // Check swiftc availability
  try {
    execFileSync('which', ['swiftc'], { stdio: 'pipe' });
  } catch {
    return {
      success: false,
      error: 'swiftc not found. Install Xcode Command Line Tools:\n  xcode-select --install',
    };
  }

  // Ensure output directory exists
  if (!existsSync(STORE_DIR)) {
    mkdirSync(STORE_DIR, { recursive: true, mode: 0o700 });
  }

  let sourcePath: string;
  try {
    sourcePath = getSwiftSourcePath();
  } catch (e) {
    return {
      success: false,
      error: (e as Error).message,
    };
  }

  const sourceContent = readFileSync(sourcePath, 'utf-8');
  const sourceHash = computeHash(sourceContent);

  if (!needsRecompile(sourceHash)) {
    return { success: true, binaryPath: BINARY_PATH };
  }

  // Compile
  try {
    execFileSync('swiftc', ['-o', BINARY_PATH, '-framework', 'AppKit', '-O', sourcePath], {
      stdio: 'pipe',
      timeout: 120_000,
    });
  } catch (e) {
    const err = e as { stderr?: Buffer };
    const stderr = err.stderr?.toString() ?? 'Unknown compilation error';
    return {
      success: false,
      error: `Swift compilation failed:\n${stderr}`,
    };
  }

  // Save hash
  writeFileSync(HASH_PATH, sourceHash, { encoding: 'utf-8', mode: 0o600 });

  return { success: true, binaryPath: BINARY_PATH };
}

export function getMenubarBinaryPath(): string {
  return BINARY_PATH;
}

export function getPidFilePath(): string {
  return join(STORE_DIR, 'menubar-app.pid');
}
