import { cp, lstat } from 'node:fs/promises'
import { join } from 'node:path'

const FRIDAY_HOME_DIR = 'friday'
const LEGACY_ASSISTANT_HOME_DIR = 'assistant'

/** Friday's own workspace: its PTY cwd and the home of its identity files. */
export function getFridayHomePath(userDataPath: string): string {
  return join(userDataPath, FRIDAY_HOME_DIR)
}

/**
 * Where Friday lived while it was called the Global Assistant.
 *
 * Still needed after migration because agent providers index their session
 * transcripts by cwd, so resuming a pre-rename conversation has to look the
 * old path up as well.
 */
export function getLegacyFridayHomePath(userDataPath: string): string {
  return join(userDataPath, LEGACY_ASSISTANT_HOME_DIR)
}

async function readDirectoryKind(path: string): Promise<'directory' | 'other' | 'missing'> {
  try {
    const stats = await lstat(path)
    return stats.isDirectory() ? 'directory' : 'other'
  } catch {
    return 'missing'
  }
}

/**
 * Carry the pre-rename assistant home forward to Friday's home.
 *
 * Copy rather than move, and never touch an existing target: the directory
 * holds identity files the user may have edited, so a half-finished or
 * repeated run must not be able to destroy them. The legacy directory is left
 * behind on purpose as a fallback for provider session lookups.
 *
 * Remove after 2026-11-01, once installs have had a full upgrade window.
 */
export async function migrateFridayHomeIfNeeded(userDataPath: string): Promise<void> {
  const target = getFridayHomePath(userDataPath)
  const legacy = getLegacyFridayHomePath(userDataPath)
  if (target === legacy) {
    return
  }
  try {
    if ((await readDirectoryKind(target)) !== 'missing') {
      return
    }
    if ((await readDirectoryKind(legacy)) !== 'directory') {
      return
    }
    await cp(legacy, target, { recursive: true, errorOnExist: true, force: false })
  } catch (error) {
    // Best-effort: a failed carry-forward only costs the user their prior
    // Friday customizations, while throwing here would block Friday entirely.
    console.warn('Could not carry the legacy assistant home forward to Friday.', error)
  }
}
