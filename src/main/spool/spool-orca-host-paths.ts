import { lstat } from 'node:fs/promises'
import path from 'node:path'
import { getSshFilesystemProvider } from '../providers/ssh-filesystem-dispatch'
import type { FileStat, IFilesystemProvider } from '../providers/types'
import type { RemotePathFlavor } from '../ssh/ssh-remote-platform'
import { SpoolExecutionError } from './spool-execution-error'
import type { SpoolCanonicalHostPath } from './spool-worktree-containment'

export const SPOOL_SSH_SCOPE_PREFIX = 'ssh:'
export const SPOOL_LOCAL_SCOPE_PREFIX = 'local:'

export function spoolSshHostScope(connectionId: string, pathFlavor: RemotePathFlavor): string {
  return `${SPOOL_SSH_SCOPE_PREFIX}${pathFlavor}:${connectionId}`
}

export function spoolFilesystemProvider(
  pathValue: SpoolCanonicalHostPath
): IFilesystemProvider | null {
  const connectionId = spoolSshConnectionIdFromScope(pathValue.scopeKey)
  return connectionId ? (getSshFilesystemProvider(connectionId) ?? null) : null
}

export function requireSpoolSshFilesystem(connectionId: string): IFilesystemProvider {
  const provider = getSshFilesystemProvider(connectionId)
  if (!provider) {
    throw new SpoolExecutionError('resource_unavailable')
  }
  return provider
}

export function spoolHostPath(root: SpoolCanonicalHostPath): typeof path.posix {
  if (root.scopeKey.startsWith(`${SPOOL_SSH_SCOPE_PREFIX}windows:`)) {
    return path.win32
  }
  return root.scopeKey.startsWith(`${SPOOL_SSH_SCOPE_PREFIX}posix:`) ? path.posix : path
}

export function joinSpoolHostPath(
  root: SpoolCanonicalHostPath,
  segments: readonly string[]
): string {
  return spoolHostPath(root).join(root.absolutePath, ...segments)
}

export function canonicalSpoolHostPath(
  scopeKey: string,
  absolutePath: string,
  identity: string | null
): SpoolCanonicalHostPath {
  return { scopeKey, absolutePath, identity }
}

export function localSpoolHostScope(): string {
  return `${SPOOL_LOCAL_SCOPE_PREFIX}${process.platform}`
}

export async function localSpoolPathIdentity(value: string): Promise<string> {
  return localStatsIdentity(await lstat(value))
}

export async function remoteSpoolPathIdentity(
  provider: IFilesystemProvider,
  value: string
): Promise<string> {
  return remoteStatsIdentity(await (provider.lstat?.(value) ?? provider.stat(value)))
}

export async function lstatSpoolHostPath(
  root: SpoolCanonicalHostPath,
  value: string
): Promise<FileStat> {
  const provider = spoolFilesystemProvider(root)
  if (provider) {
    if (!provider.lstat) {
      throw new SpoolExecutionError('resource_unavailable')
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

export function requireSpoolPathIdentity(actual: string, expected: string | null): void {
  if (!expected || actual !== expected) {
    throw new SpoolExecutionError('resource_not_found')
  }
}

export function equalSpoolCanonicalPath(
  left: SpoolCanonicalHostPath,
  right: SpoolCanonicalHostPath
): boolean {
  return (
    left.scopeKey === right.scopeKey &&
    left.absolutePath === right.absolutePath &&
    left.identity === right.identity
  )
}

export function isMissingSpoolPath(error: unknown): boolean {
  const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : null
  const message = error instanceof Error ? error.message : String(error)
  return code === 'ENOENT' || /ENOENT|not found|no such file/i.test(message)
}

export function spoolSshConnectionIdFromScope(scopeKey: string): string | null {
  const match = /^ssh:(?:posix|windows):(.+)$/.exec(scopeKey)
  return match?.[1] ?? null
}
