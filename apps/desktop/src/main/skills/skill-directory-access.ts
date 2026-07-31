import type { Dirent } from 'node:fs'
import { open, readdir, realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

import type {
  SkillDirectoryEntry,
  SkillDirectoryListing,
  SkillFileReadResult
} from '~shared/skills'

// Why: discovery only recognizes a file named exactly SKILL.md, so both
// channels here anchor on the same name.
const SKILL_FILE_NAME = 'SKILL.md'
const MAX_LISTING_DEPTH = 6
const MAX_LISTING_FILES = 500
// Why: previews render into a React tree; a pathological file must not be able
// to stall the renderer, so oversized documents are cut short instead.
const MAX_TEXT_BYTES = 512 * 1024
const BINARY_SNIFF_BYTES = 8 * 1024

function isWithin(rootPath: string, candidate: string): boolean {
  const rel = relative(rootPath, candidate)
  // Why: `..cache` is a legitimate child name; only a real parent traversal or
  // an absolute result escapes the skill directory.
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

function toPosixRelativePath(rootPath: string, filePath: string): string {
  return relative(rootPath, filePath).split(sep).join('/')
}

/**
 * The real path of a directory the renderer may read, or null.
 *
 * Why: requiring an absolute path that actually holds a SKILL.md keeps these
 * channels scoped to skill packages instead of becoming a general-purpose
 * directory reader for the renderer.
 */
async function resolveSkillRoot(directoryPath: unknown): Promise<string | null> {
  if (typeof directoryPath !== 'string' || !isAbsolute(directoryPath)) {
    return null
  }
  try {
    const rootPath = await realpath(directoryPath)
    return (await stat(join(rootPath, SKILL_FILE_NAME))).isFile() ? rootPath : null
  } catch {
    return null
  }
}

function compareSkillFiles(a: SkillDirectoryEntry, b: SkillDirectoryEntry): number {
  if (a.relativePath === SKILL_FILE_NAME) {
    return b.relativePath === SKILL_FILE_NAME ? 0 : -1
  }
  if (b.relativePath === SKILL_FILE_NAME) {
    return 1
  }
  return a.relativePath.localeCompare(b.relativePath, undefined, { sensitivity: 'base' })
}

export async function listSkillFiles(directoryPath: unknown): Promise<SkillDirectoryListing> {
  const rootPath = await resolveSkillRoot(directoryPath)
  if (!rootPath) {
    return { ok: false, reason: 'invalid-path' }
  }

  const files: SkillDirectoryEntry[] = []
  let truncated = false

  const visit = async (currentPath: string, depth: number): Promise<void> => {
    if (depth > MAX_LISTING_DEPTH) {
      truncated = true
      return
    }
    let entries: Dirent[]
    try {
      entries = await readdir(currentPath, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (files.length >= MAX_LISTING_FILES) {
        truncated = true
        return
      }
      const entryPath = join(currentPath, entry.name)
      if (entry.isDirectory()) {
        await visit(entryPath, depth + 1)
        continue
      }
      // Why: a symlink can point anywhere, and the read channel refuses targets
      // outside the skill directory, so listing one would only dead-end.
      if (!entry.isFile()) {
        continue
      }
      const size = await stat(entryPath).then(
        (entryStat) => entryStat.size,
        () => 0
      )
      files.push({ relativePath: toPosixRelativePath(rootPath, entryPath), size })
    }
  }

  await visit(rootPath, 1)
  files.sort(compareSkillFiles)
  return { ok: true, files, truncated }
}

export async function readSkillDirectoryFile(request: unknown): Promise<SkillFileReadResult> {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return { ok: false, reason: 'invalid-path' }
  }
  const { directoryPath, relativePath } = request as Record<string, unknown>
  if (typeof relativePath !== 'string' || relativePath.length === 0 || isAbsolute(relativePath)) {
    return { ok: false, reason: 'invalid-path' }
  }
  const rootPath = await resolveSkillRoot(directoryPath)
  if (!rootPath) {
    return { ok: false, reason: 'invalid-path' }
  }
  const targetPath = resolve(rootPath, relativePath)
  if (!isWithin(rootPath, targetPath)) {
    return { ok: false, reason: 'invalid-path' }
  }

  try {
    // Why: `..` segments are already rejected, but a symlink inside the skill
    // can still resolve outside it — re-check against the real path.
    const realTargetPath = await realpath(targetPath)
    if (!isWithin(rootPath, realTargetPath)) {
      return { ok: false, reason: 'invalid-path' }
    }
    const fileStat = await stat(realTargetPath)
    if (!fileStat.isFile()) {
      return { ok: false, reason: 'invalid-path' }
    }
    const file = await open(realTargetPath, 'r')
    try {
      const buffer = Buffer.alloc(Math.min(fileStat.size, MAX_TEXT_BYTES))
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0)
      // Why: a NUL byte in the leading block is the cheap, conventional signal
      // that this is not text worth handing to a markdown or <pre> renderer.
      if (buffer.subarray(0, Math.min(bytesRead, BINARY_SNIFF_BYTES)).includes(0)) {
        return { ok: false, reason: 'binary' }
      }
      return {
        ok: true,
        content: buffer.toString('utf8', 0, bytesRead),
        truncated: fileStat.size > MAX_TEXT_BYTES
      }
    } finally {
      await file.close()
    }
  } catch {
    return { ok: false, reason: 'unreadable' }
  }
}
