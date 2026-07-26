import { lstat } from 'node:fs/promises'
import path from 'node:path'

import { getSshFilesystemProvider } from '../providers/ssh-filesystem-dispatch'
import type { FileStat, IFilesystemProvider } from '../providers/types'
import type { RemotePathFlavor } from '../ssh/remote-platform'
import { CoworkingExecutionError } from './execution-error'
import type { CoworkingCanonicalHostPath } from './worktree-containment'

export const COWORKING_SSH_SCOPE_PREFIX = 'ssh:'
export const COWORKING_LOCAL_SCOPE_PREFIX = 'local:'

export function coworkingSshHostScope(connectionId: string, pathFlavor: RemotePathFlavor): string {
  return `${COWORKING_SSH_SCOPE_PREFIX}${pathFlavor}:${connectionId}`
}

export function coworkingFilesystemProvider(
  pathValue: CoworkingCanonicalHostPath
): IFilesystemProvider | null {
  const connectionId = coworkingSshConnectionIdFromScope(pathValue.scopeKey)
  return connectionId ? (getSshFilesystemProvider(connectionId) ?? null) : null
}

export function requireCoworkingSshFilesystem(connectionId: string): IFilesystemProvider {
  const provider = getSshFilesystemProvider(connectionId)
  if (!provider) {
    throw new CoworkingExecutionError('resource_unavailable')
  }
  return provider
}

export function coworkingHostPath(root: CoworkingCanonicalHostPath): typeof path.posix {
  if (root.scopeKey.startsWith(`${COWORKING_SSH_SCOPE_PREFIX}windows:`)) {
    return path.win32
  }
  return root.scopeKey.startsWith(`${COWORKING_SSH_SCOPE_PREFIX}posix:`) ? path.posix : path
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

export async function remoteCoworkingPathIdentity(
  provider: IFilesystemProvider,
  value: string
): Promise<string> {
  return remoteStatsIdentity(await (provider.lstat?.(value) ?? provider.stat(value)))
}

export async function lstatCoworkingHostPath(
  root: CoworkingCanonicalHostPath,
  value: string
): Promise<FileStat> {
  const provider = coworkingFilesystemProvider(root)
  if (provider) {
    if (!provider.lstat) {
      throw new CoworkingExecutionError('resource_unavailable')
    }
    return await provider.lstat(value)
  }
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

function remoteStatsIdentity(stats: FileStat): string {
  return `${stats.dev ?? ''}:${stats.ino ?? ''}:${stats.size}:${stats.mtimeMs ?? stats.mtime}:${stats.type}`
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

export function coworkingSshConnectionIdFromScope(scopeKey: string): string | null {
  const match = /^ssh:(?:posix|windows):(.+)$/.exec(scopeKey)
  return match?.[1] ?? null
}
