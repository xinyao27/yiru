import { lstat } from 'node:fs/promises'
import { posix, win32 } from 'node:path'

import {
  isRuntimePathAbsolute,
  isWindowsAbsolutePathLike,
  normalizeRuntimePathForComparison
} from '@yiru/workbench-model/platform'
import { parseWslUncPath } from '@yiru/workbench-model/platform'
import type { ExecutionHostId } from '@yiru/workbench-model/workspace'

import type { IFilesystemProvider } from '../providers/types'
import { toWindowsWslPath } from '../wsl'
import type { CoworkingWorktreeRootComparison } from './worktree-incarnation'
import { CoworkingWorktreeIncarnationHostError } from './worktree-incarnation'
import { resolveCoworkingWslCanonicalDirectory } from './wsl-canonical-directory'

export type CoworkingResolvedHostPath = {
  status: 'resolved'
  accessPath: string
  path: CoworkingWorktreeRootComparison
}

export type CoworkingInternalHostPathResult =
  | CoworkingResolvedHostPath
  | { status: 'missing' }
  | { status: 'invalid' }
  | { status: 'unavailable' }

export function coworkingActualHostScopeKey(executionHostId: ExecutionHostId): string {
  return `coworking-actual-host:${executionHostId}`
}

export function coworkingLocalActualHostScopeKey(
  executionHostId: ExecutionHostId,
  wslDistro: string | null
): string {
  const runtimeScope = wslDistro ? `wsl:${wslDistro.trim().toLowerCase()}` : 'native'
  return JSON.stringify([coworkingActualHostScopeKey(executionHostId), runtimeScope])
}

export function withCoworkingOuterActualHostScope(
  executionHostId: ExecutionHostId,
  innerScopeKey: string
): string {
  return JSON.stringify([coworkingActualHostScopeKey(executionHostId), innerScopeKey])
}

export function withCoworkingActualHostScope(
  executionHostId: ExecutionHostId,
  path: CoworkingWorktreeRootComparison
): CoworkingWorktreeRootComparison {
  // Why: one paired runtime can route worktrees to several inner local/WSL/SSH filesystems.
  return {
    ...path,
    scopeKey: withCoworkingOuterActualHostScope(executionHostId, path.scopeKey)
  }
}

export function withCoworkingActualHostSubscope(
  path: CoworkingWorktreeRootComparison,
  subscope: string
): CoworkingWorktreeRootComparison {
  return { ...path, scopeKey: JSON.stringify([path.scopeKey, subscope]) }
}

export function resolveCoworkingCanonicalHostPath(
  executionHostId: ExecutionHostId,
  accessPath: string
): CoworkingResolvedHostPath {
  const rootKey = normalizeRuntimePathForComparison(accessPath)
  if (!rootKey || !isCanonicalAbsolutePath(rootKey)) {
    return {
      status: 'resolved',
      accessPath,
      path: {
        scopeKey: coworkingActualHostScopeKey(executionHostId),
        rootKey: '',
        ancestorKeys: []
      }
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
    path: { scopeKey: coworkingActualHostScopeKey(executionHostId), rootKey, ancestorKeys }
  }
}

export function requireMatchingCoworkingGitRoot(
  root: CoworkingInternalHostPathResult,
  registeredRoot: CoworkingInternalHostPathResult
): asserts root is CoworkingResolvedHostPath {
  if (root.status === 'unavailable' || registeredRoot.status === 'unavailable') {
    // Why: an indeterminate host path is an availability failure, not evidence
    // that the validated worktree root changed or disappeared.
    throw new CoworkingWorktreeIncarnationHostError('host-unavailable')
  }
  if (
    root.status !== 'resolved' ||
    registeredRoot.status !== 'resolved' ||
    !isValidCoworkingCanonicalPath(root.path) ||
    root.path.scopeKey !== registeredRoot.path.scopeKey ||
    root.path.rootKey !== registeredRoot.path.rootKey
  ) {
    throw new CoworkingWorktreeIncarnationHostError('not-git-worktree')
  }
}

export function isValidCoworkingCanonicalPath(path: CoworkingWorktreeRootComparison): boolean {
  return Boolean(
    path.scopeKey.trim() &&
    path.rootKey.trim() &&
    Array.isArray(path.ancestorKeys) &&
    path.ancestorKeys.every((key) => typeof key === 'string' && key.trim())
  )
}

export function toCoworkingLocalAccessPath(
  candidatePath: string,
  wslDistro: string | null
): string {
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

export function joinCoworkingLocalPath(directory: string, filename: string): string {
  return isWindowsAbsolutePathLike(directory)
    ? win32.join(directory, filename)
    : posix.join(directory, filename)
}

export function isMissingCoworkingFilesystemError(error: unknown): boolean {
  const code = getErrorCode(error)
  if (code === 'ENOENT' || code === 'ENOTDIR') {
    return true
  }
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return message.includes('enoent') || message.includes('no such file')
}

export function isExistingCoworkingFilesystemError(error: unknown): boolean {
  if (getErrorCode(error) === 'EEXIST') {
    return true
  }
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return message.includes('eexist') || message.includes('already exists')
}

export async function isCoworkingLocalDirectory(directory: string): Promise<boolean> {
  try {
    return (await lstat(directory)).isDirectory()
  } catch (error) {
    if (isMissingCoworkingFilesystemError(error)) {
      if (!parseWslUncPath(directory)) {
        return false
      }
      const evidence = await resolveCoworkingWslCanonicalDirectory(directory)
      if (evidence.status === 'resolved') {
        return true
      }
      if (evidence.status === 'unavailable') {
        throw new CoworkingWorktreeIncarnationHostError('host-unavailable', { cause: error })
      }
      return false
    }
    if (!isDefinitiveCoworkingFilesystemFailure(error)) {
      throw new CoworkingWorktreeIncarnationHostError('host-unavailable', { cause: error })
    }
    return false
  }
}

export async function isCoworkingRemoteDirectory(
  filesystem: IFilesystemProvider,
  directory: string
): Promise<boolean> {
  try {
    return (await filesystem.stat(directory)).type === 'directory'
  } catch (error) {
    if (
      !isMissingCoworkingFilesystemError(error) &&
      !isDefinitiveCoworkingFilesystemFailure(error)
    ) {
      throw new CoworkingWorktreeIncarnationHostError('host-unavailable', { cause: error })
    }
    return false
  }
}

export function isDefinitiveCoworkingFilesystemFailure(error: unknown): boolean {
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

export function requireSingleCoworkingGitPath(stdout: string): string {
  const value = stdout.endsWith('\r\n')
    ? stdout.slice(0, -2)
    : stdout.endsWith('\n')
      ? stdout.slice(0, -1)
      : stdout
  if (!value || value.includes('\0') || value.includes('\n') || value.includes('\r')) {
    throw new CoworkingWorktreeIncarnationHostError('invalid-host-response')
  }
  return value
}

export function classifyCoworkingGitInspectionError(
  error: unknown
): CoworkingWorktreeIncarnationHostError {
  if (error instanceof CoworkingWorktreeIncarnationHostError) {
    return error
  }
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  const reason =
    message.includes('not a git repository') ||
    message.includes('must be run in a work tree') ||
    message.includes('must be run in a worktree')
      ? 'not-git-worktree'
      : 'host-unavailable'
  return new CoworkingWorktreeIncarnationHostError(reason, { cause: error })
}

function getErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return null
  }
  return typeof error.code === 'string' ? error.code : null
}
