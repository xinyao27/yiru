import { lstat } from 'node:fs/promises'
import { posix, win32 } from 'node:path'
import {
  isRuntimePathAbsolute,
  isWindowsAbsolutePathLike,
  normalizeRuntimePathForComparison
} from '../../shared/cross-platform-path'
import type { ExecutionHostId } from '../../shared/execution-host'
import { parseWslUncPath } from '../../shared/wsl-paths'
import type { IFilesystemProvider } from '../providers/types'
import { toWindowsWslPath } from '../wsl'
import { resolveSpoolWslCanonicalDirectory } from './spool-wsl-canonical-directory'
import type { SpoolWorktreeRootComparison } from './spool-worktree-incarnation'
import { SpoolWorktreeIncarnationHostError } from './spool-worktree-incarnation'

export type SpoolResolvedHostPath = {
  status: 'resolved'
  accessPath: string
  path: SpoolWorktreeRootComparison
}

export type SpoolInternalHostPathResult =
  | SpoolResolvedHostPath
  | { status: 'missing' }
  | { status: 'invalid' }
  | { status: 'unavailable' }

export function spoolActualHostScopeKey(executionHostId: ExecutionHostId): string {
  return `spool-actual-host:${executionHostId}`
}

export function spoolLocalActualHostScopeKey(
  executionHostId: ExecutionHostId,
  wslDistro: string | null
): string {
  const runtimeScope = wslDistro ? `wsl:${wslDistro.trim().toLowerCase()}` : 'native'
  return JSON.stringify([spoolActualHostScopeKey(executionHostId), runtimeScope])
}

export function withSpoolOuterActualHostScope(
  executionHostId: ExecutionHostId,
  innerScopeKey: string
): string {
  return JSON.stringify([spoolActualHostScopeKey(executionHostId), innerScopeKey])
}

export function withSpoolActualHostScope(
  executionHostId: ExecutionHostId,
  path: SpoolWorktreeRootComparison
): SpoolWorktreeRootComparison {
  // Why: one paired runtime can route worktrees to several inner local/WSL/SSH filesystems.
  return {
    ...path,
    scopeKey: withSpoolOuterActualHostScope(executionHostId, path.scopeKey)
  }
}

export function withSpoolActualHostSubscope(
  path: SpoolWorktreeRootComparison,
  subscope: string
): SpoolWorktreeRootComparison {
  return { ...path, scopeKey: JSON.stringify([path.scopeKey, subscope]) }
}

export function resolveSpoolCanonicalHostPath(
  executionHostId: ExecutionHostId,
  accessPath: string
): SpoolResolvedHostPath {
  const rootKey = normalizeRuntimePathForComparison(accessPath)
  if (!rootKey || !isCanonicalAbsolutePath(rootKey)) {
    return {
      status: 'resolved',
      accessPath,
      path: { scopeKey: spoolActualHostScopeKey(executionHostId), rootKey: '', ancestorKeys: [] }
    }
  }
  const pathApi = isWindowsAbsolutePathLike(rootKey) ? win32 : posix
  const parsedRoot = normalizeRuntimePathForComparison(pathApi.parse(rootKey).root)
  const ancestorKeys: string[] = []
  let cursor = rootKey
  while (cursor !== parsedRoot) {
    const parent = normalizeRuntimePathForComparison(pathApi.dirname(cursor))
    if (!parent || parent === cursor) {
      break
    }
    ancestorKeys.push(parent)
    cursor = parent
  }
  return {
    status: 'resolved',
    accessPath,
    path: { scopeKey: spoolActualHostScopeKey(executionHostId), rootKey, ancestorKeys }
  }
}

export function requireMatchingSpoolGitRoot(
  root: SpoolInternalHostPathResult,
  registeredRoot: SpoolInternalHostPathResult
): asserts root is SpoolResolvedHostPath {
  if (root.status === 'unavailable' || registeredRoot.status === 'unavailable') {
    // Why: an indeterminate host path is an availability failure, not evidence
    // that the validated worktree root changed or disappeared.
    throw new SpoolWorktreeIncarnationHostError('host-unavailable')
  }
  if (
    root.status !== 'resolved' ||
    registeredRoot.status !== 'resolved' ||
    !isValidSpoolCanonicalPath(root.path) ||
    root.path.scopeKey !== registeredRoot.path.scopeKey ||
    root.path.rootKey !== registeredRoot.path.rootKey
  ) {
    throw new SpoolWorktreeIncarnationHostError('not-git-worktree')
  }
}

export function isValidSpoolCanonicalPath(path: SpoolWorktreeRootComparison): boolean {
  return Boolean(
    path.scopeKey.trim() &&
    path.rootKey.trim() &&
    Array.isArray(path.ancestorKeys) &&
    path.ancestorKeys.every((key) => typeof key === 'string' && key.trim())
  )
}

export function toSpoolLocalAccessPath(candidatePath: string, wslDistro: string | null): string {
  const candidateWsl = parseWslUncPath(candidatePath)
  if (candidateWsl) {
    if (wslDistro && candidateWsl.distro.toLowerCase() !== wslDistro.toLowerCase()) {
      return ''
    }
    return candidatePath
  }
  if (wslDistro && candidatePath.startsWith('/')) {
    return toWindowsWslPath(candidatePath, wslDistro)
  }
  return candidatePath
}

export function isAbsoluteForCurrentPlatform(candidatePath: string): boolean {
  return process.platform === 'win32'
    ? isRuntimePathAbsolute(candidatePath, 'windows')
    : isRuntimePathAbsolute(candidatePath, 'posix')
}

function isCanonicalAbsolutePath(candidatePath: string): boolean {
  return isRuntimePathAbsolute(
    candidatePath,
    isWindowsAbsolutePathLike(candidatePath) ? 'windows' : 'posix'
  )
}

export function joinSpoolLocalPath(directory: string, filename: string): string {
  return isWindowsAbsolutePathLike(directory)
    ? win32.join(directory, filename)
    : posix.join(directory, filename)
}

export function isMissingSpoolFilesystemError(error: unknown): boolean {
  const code = getErrorCode(error)
  if (code === 'ENOENT' || code === 'ENOTDIR') {
    return true
  }
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return message.includes('enoent') || message.includes('no such file')
}

export function isExistingSpoolFilesystemError(error: unknown): boolean {
  if (getErrorCode(error) === 'EEXIST') {
    return true
  }
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return message.includes('eexist') || message.includes('already exists')
}

export async function isSpoolLocalDirectory(directory: string): Promise<boolean> {
  try {
    return (await lstat(directory)).isDirectory()
  } catch (error) {
    if (isMissingSpoolFilesystemError(error)) {
      if (!parseWslUncPath(directory)) {
        return false
      }
      const evidence = await resolveSpoolWslCanonicalDirectory(directory)
      if (evidence.status === 'resolved') {
        return true
      }
      if (evidence.status === 'unavailable') {
        throw new SpoolWorktreeIncarnationHostError('host-unavailable', { cause: error })
      }
      return false
    }
    if (!isDefinitiveSpoolFilesystemFailure(error)) {
      throw new SpoolWorktreeIncarnationHostError('host-unavailable', { cause: error })
    }
    return false
  }
}

export async function isSpoolRemoteDirectory(
  filesystem: IFilesystemProvider,
  directory: string
): Promise<boolean> {
  try {
    return (await filesystem.stat(directory)).type === 'directory'
  } catch (error) {
    if (!isMissingSpoolFilesystemError(error) && !isDefinitiveSpoolFilesystemFailure(error)) {
      throw new SpoolWorktreeIncarnationHostError('host-unavailable', { cause: error })
    }
    return false
  }
}

export function isDefinitiveSpoolFilesystemFailure(error: unknown): boolean {
  const code = getErrorCode(error)?.toUpperCase()
  if (
    code &&
    ['EACCES', 'EISDIR', 'ELOOP', 'ENAMETOOLONG', 'ENOTDIR', 'EPERM', 'EROFS'].includes(code)
  ) {
    return true
  }
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return (
    message.includes('permission denied') ||
    message.includes('operation not permitted') ||
    message.includes('read-only file system')
  )
}

export function requireSingleSpoolGitPath(stdout: string): string {
  const value = stdout.endsWith('\r\n')
    ? stdout.slice(0, -2)
    : stdout.endsWith('\n')
      ? stdout.slice(0, -1)
      : stdout
  if (!value || value.includes('\0') || value.includes('\n') || value.includes('\r')) {
    throw new SpoolWorktreeIncarnationHostError('invalid-host-response')
  }
  return value
}

export function classifySpoolGitInspectionError(error: unknown): SpoolWorktreeIncarnationHostError {
  if (error instanceof SpoolWorktreeIncarnationHostError) {
    return error
  }
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  const reason =
    message.includes('not a git repository') ||
    message.includes('must be run in a work tree') ||
    message.includes('must be run in a worktree')
      ? 'not-git-worktree'
      : 'host-unavailable'
  return new SpoolWorktreeIncarnationHostError(reason, { cause: error })
}

function getErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return null
  }
  return typeof error.code === 'string' ? error.code : null
}
