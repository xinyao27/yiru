import { posix, win32 } from 'node:path'

import { isWindowsAbsolutePathLike } from '@yiru/workbench-model/platform'

export function areWorktreePathsEqual(
  leftPath: string,
  rightPath: string,
  platform = process.platform
): boolean {
  if (looksLikePosixAbsolutePath(leftPath) || looksLikePosixAbsolutePath(rightPath)) {
    // Why: local WSL projects run POSIX paths on a Windows desktop; comparing
    // them with win32 rules can delete or dedupe the wrong runtime-owned path.
    if (!looksLikePosixAbsolutePath(leftPath) || !looksLikePosixAbsolutePath(rightPath)) {
      return false
    }
    const left = normalizePosixWorktreePathForComparison(leftPath, platform)
    const right = normalizePosixWorktreePathForComparison(rightPath, platform)
    return left === right
  }

  if (
    platform === 'win32' ||
    isWindowsAbsolutePathLike(leftPath) ||
    isWindowsAbsolutePathLike(rightPath)
  ) {
    const left = normalizeWindowsWorktreePathForComparison(leftPath)
    const right = normalizeWindowsWorktreePathForComparison(rightPath)
    // Why: Git can report the same Windows path with different slash styles or
    // drive-letter casing; treating them as distinct creates duplicate worktrees.
    return left === right
  }
  const left = normalizePosixWorktreePathForComparison(leftPath, platform)
  const right = normalizePosixWorktreePathForComparison(rightPath, platform)
  return left === right
}

export function worktreePathComparisonKey(pathValue: string, platform = process.platform): string {
  if (looksLikePosixAbsolutePath(pathValue)) {
    return `posix:${normalizePosixWorktreePathForComparison(pathValue, platform)}`
  }
  if (platform === 'win32' || isWindowsAbsolutePathLike(pathValue)) {
    return `windows:${normalizeWindowsWorktreePathForComparison(pathValue)}`
  }
  return `posix:${normalizePosixWorktreePathForComparison(pathValue, platform)}`
}

function looksLikePosixAbsolutePath(pathValue: string): boolean {
  return pathValue.startsWith('/') && !pathValue.startsWith('//')
}

function normalizeWindowsWorktreePathForComparison(pathValue: string): string {
  return win32.normalize(win32.resolve(pathValue)).toLowerCase()
}

function normalizePosixWorktreePathForComparison(
  pathValue: string,
  platform: NodeJS.Platform
): string {
  const normalized = posix.normalize(posix.resolve(pathValue))
  if (platform !== 'darwin') {
    return normalized
  }
  if (normalized === '/private/tmp') {
    return '/tmp'
  }
  return normalized.startsWith('/private/tmp/') ? normalized.slice('/private'.length) : normalized
}
