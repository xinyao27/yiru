import { lstat } from 'node:fs/promises'
import path from 'node:path'

import type { FileStat } from '~main/providers/types'

import { CoworkingExecutionError } from '../execution-error'
import type { CoworkingCanonicalHostPath } from '../worktree-containment'

export const COWORKING_LOCAL_SCOPE_PREFIX = 'local:'

export function coworkingHostPath(_root: CoworkingCanonicalHostPath): typeof path.posix {
  return path
}

export function joinCoworkingHostPath(
  root: CoworkingCanonicalHostPath,
  segments: readonly string[]
): string {
  return coworkingHostPath(root).join(root.absolutePath, ...segments)
}

export function canonicalCoworkingHostPath(
  scopeKey: string,
  absolutePath: string,
  identity: string | null
): CoworkingCanonicalHostPath {
  return { scopeKey, absolutePath, identity }
}

export function localCoworkingHostScope(): string {
  return `${COWORKING_LOCAL_SCOPE_PREFIX}${process.platform}`
}

export async function localCoworkingPathIdentity(value: string): Promise<string> {
  return localStatsIdentity(await lstat(value))
}

export async function lstatCoworkingHostPath(
  _root: CoworkingCanonicalHostPath,
  value: string
): Promise<FileStat> {
  const stats = await lstat(value)
  return {
    size: stats.size,
    type: stats.isSymbolicLink() ? 'symlink' : stats.isDirectory() ? 'directory' : 'file',
    mtime: stats.mtimeMs,
    dev: stats.dev,
    ino: stats.ino
  }
}

export function localStatsIdentity(stats: {
  dev: number
  ino: number
  size: number
  mtimeMs: number
}): string {
  return `${stats.dev}:${stats.ino}:${stats.size}:${stats.mtimeMs}`
}

export function requireCoworkingPathIdentity(actual: string, expected: string | null): void {
  if (!expected || actual !== expected) {
    throw new CoworkingExecutionError('resource_not_found')
  }
}

export function equalCoworkingCanonicalPath(
  left: CoworkingCanonicalHostPath,
  right: CoworkingCanonicalHostPath
): boolean {
  return (
    left.scopeKey === right.scopeKey &&
    left.absolutePath === right.absolutePath &&
    left.identity === right.identity
  )
}

export function isMissingCoworkingPath(error: unknown): boolean {
  const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : null
  const message = error instanceof Error ? error.message : String(error)
  return code === 'ENOENT' || /ENOENT|not found|no such file/i.test(message)
}
