import type { Dirent } from 'node:fs'
import { readdir, realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'

export const SKILL_FILE_NAME = 'SKILL.md'
const MAX_SKILL_FILES = 200

export async function pathExists(pathValue: string): Promise<boolean> {
  try {
    await stat(pathValue)
    return true
  } catch {
    return false
  }
}

function isWithinDepth(rootPath: string, childPath: string, maxDepth: number): boolean {
  const rel = relative(rootPath, childPath)
  if (!rel) {
    return true
  }
  // Why: `..cache` is a valid child name; only a real parent traversal escapes.
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    return false
  }
  return rel.split(sep).length <= maxDepth
}

/** Every SKILL.md under one root, following links but never looping. */
export async function findSkillFiles(rootPath: string, maxDepth: number): Promise<string[]> {
  const out: string[] = []
  const visitedDirectoryPaths = new Set<string>()
  async function visit(dirPath: string): Promise<void> {
    if (!isWithinDepth(rootPath, dirPath, maxDepth)) {
      return
    }
    let resolvedDirPath: string
    try {
      resolvedDirPath = await realpath(dirPath)
    } catch {
      return
    }
    if (visitedDirectoryPaths.has(resolvedDirPath)) {
      return
    }
    visitedDirectoryPaths.add(resolvedDirPath)

    let entries: Dirent[]
    try {
      entries = await readdir(dirPath, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const entryPath = join(dirPath, entry.name)
      if (entry.name === SKILL_FILE_NAME) {
        if (entry.isFile()) {
          out.push(entryPath)
          continue
        }
        if (entry.isSymbolicLink()) {
          try {
            if ((await stat(entryPath)).isFile()) {
              out.push(entryPath)
            }
          } catch {
            // Broken links are not valid skill files.
          }
        }
        continue
      }
      if (entry.isDirectory()) {
        await visit(entryPath)
        continue
      }
      if (entry.isSymbolicLink()) {
        // Why: users commonly symlink agent skill dirs across providers; follow
        // directory links but guard by realpath so recursive links cannot loop.
        try {
          if ((await stat(entryPath)).isDirectory()) {
            await visit(entryPath)
          }
        } catch {
          // Broken links are not valid skill directories.
        }
      }
    }
  }
  await visit(rootPath)
  return out
}

/** How many files ship with one skill, capped so a huge package cannot stall a scan. */
export async function countFiles(dirPath: string): Promise<number> {
  let count = 0
  const visitedDirectoryPaths = new Set<string>()
  async function visit(currentPath: string): Promise<void> {
    if (count >= MAX_SKILL_FILES) {
      return
    }
    let resolvedPath: string
    try {
      resolvedPath = await realpath(currentPath)
    } catch {
      return
    }
    if (visitedDirectoryPaths.has(resolvedPath)) {
      return
    }
    visitedDirectoryPaths.add(resolvedPath)

    let entries: Dirent[]
    try {
      entries = await readdir(currentPath, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (count >= MAX_SKILL_FILES) {
        return
      }
      const entryPath = join(currentPath, entry.name)
      if (entry.isFile()) {
        count += 1
      } else if (entry.isDirectory()) {
        await visit(entryPath)
      } else if (entry.isSymbolicLink()) {
        try {
          if ((await stat(entryPath)).isFile()) {
            count += 1
          }
        } catch {
          // Broken links do not contribute to the skill package file count.
        }
      }
    }
  }
  await visit(dirPath)
  return count
}
