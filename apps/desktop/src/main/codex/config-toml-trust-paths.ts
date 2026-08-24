import { realpathSync } from 'node:fs'
import { basename, dirname, join, posix as pathPosix, win32 as pathWin32 } from 'node:path'

import { foldWslUncPathCaseInsensitiveParts } from '@yiru/workbench-model/platform'

export function getCodexExplicitHomeHookSourcePath(sourcePath: string): string {
  if (process.platform !== 'win32' && isUnambiguousWindowsPath(sourcePath)) {
    return normalizeCodexHookSourcePath(sourcePath)
  }
  try {
    // Why: explicit CODEX_HOME resolves the home directory before hooks.json
    // is appended, so a symlinked leaf remains logical in the reported key.
    return normalizeCodexHookSourcePath(
      join(realpathSync.native(dirname(sourcePath)), basename(sourcePath))
    )
  } catch {
    return normalizeCodexHookSourcePath(sourcePath)
  }
}

export function normalizeCodexHookSourcePath(sourcePath: string): string {
  if (isWindowsPathForTrustSource(sourcePath)) {
    const withoutDevicePrefix = stripWindowsDevicePrefix(sourcePath)
    const normalized = pathWin32.isAbsolute(withoutDevicePrefix)
      ? pathWin32.normalize(withoutDevicePrefix)
      : pathWin32.resolve(withoutDevicePrefix)
    return trimNonRootTrailingSeparators(normalized, pathWin32.parse(normalized).root, /[\\/]/)
  }
  const normalized = pathPosix.isAbsolute(sourcePath)
    ? pathPosix.normalize(sourcePath)
    : pathPosix.resolve(sourcePath)
  return trimNonRootTrailingSeparators(normalized, pathPosix.parse(normalized).root, /\//)
}

export function getCodexCanonicalProjectPath(projectPath: string): string {
  try {
    return realpathSync.native(projectPath)
  } catch {
    // Why: remote callers provide an already-canonical path that is not on the
    // local filesystem.
    return projectPath
  }
}

export function normalizeCodexProjectPathForLookup(projectPath: string): string {
  if (!usesWindowsPathSeparators(projectPath)) {
    return projectPath
  }
  // Why: the Linux tail under a WSL share remains case-sensitive.
  const slashedPath = normalizeWindowsPathSeparators(projectPath)
  return foldWslUncPathCaseInsensitiveParts(slashedPath) ?? slashedPath.toLowerCase()
}

export function codexHookSourcePathsEqual(left: string, right: string): boolean {
  const normalizeForLookup = (sourcePath: string): string =>
    normalizeCodexProjectPathForLookup(
      sourcePath.startsWith('//') ? sourcePath : normalizeCodexHookSourcePath(sourcePath)
    )
  return normalizeForLookup(left) === normalizeForLookup(right)
}

export function normalizeCodexProjectPathForRevocationLookup(projectPath: string): string {
  const normalized = normalizeCodexProjectPathForLookup(projectPath)
  return usesWindowsPathSeparators(projectPath) ? normalized.toLowerCase() : normalized
}

export function usesWindowsPathSeparators(sourcePath: string): boolean {
  return isUnambiguousWindowsPath(sourcePath) || sourcePath.startsWith('//')
}

function trimNonRootTrailingSeparators(path: string, root: string, separators: RegExp): string {
  let end = path.length
  while (end > root.length && separators.test(path[end - 1]!)) {
    end -= 1
  }
  return path.slice(0, end)
}

function stripWindowsDevicePrefix(sourcePath: string): string {
  const unc = /^(?:\\\\\?|\\\\\.)\\UNC\\/i.exec(sourcePath)
  if (unc) {
    return `\\\\${sourcePath.slice(unc[0].length)}`
  }
  const drive = /^(?:\\\\\?|\\\\\.)\\(?=[A-Za-z]:[\\/])/i.exec(sourcePath)
  return drive ? sourcePath.slice(drive[0].length) : sourcePath
}

function normalizeWindowsPathSeparators(sourcePath: string): string {
  return usesWindowsPathSeparators(sourcePath) ? sourcePath.replace(/\\/g, '/') : sourcePath
}

function isUnambiguousWindowsPath(sourcePath: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(sourcePath) || sourcePath.startsWith('\\\\')
}

function isWindowsPathForTrustSource(sourcePath: string): boolean {
  return (
    isUnambiguousWindowsPath(sourcePath) ||
    (process.platform === 'win32' &&
      (sourcePath.startsWith('//') || !pathPosix.isAbsolute(sourcePath)))
  )
}
