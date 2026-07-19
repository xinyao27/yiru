import { realpath } from 'node:fs/promises'

import { isRuntimePathAbsolute } from '../../shared/cross-platform-path'
import type { ExecutionHostId } from '../../shared/execution-host'
import { parseWslUncPath } from '../../shared/wsl-paths'
import type { IFilesystemProvider } from '../providers/types'
import type { RemoteHostPlatform } from '../ssh/ssh-remote-platform'
import {
  isAbsoluteForCurrentPlatform,
  isDefinitiveSpoolFilesystemFailure,
  isMissingSpoolFilesystemError,
  resolveSpoolCanonicalHostPath,
  toSpoolLocalAccessPath,
  withSpoolActualHostSubscope,
  type SpoolInternalHostPathResult
} from './spool-canonical-host-path'
import { resolveSpoolWslCanonicalDirectory } from './spool-wsl-canonical-directory'

export async function canonicalizeSpoolLocalHostPath(
  context: { wslDistro: string | null },
  executionHostId: ExecutionHostId,
  candidatePath: string
): Promise<SpoolInternalHostPathResult> {
  const accessPath = toSpoolLocalAccessPath(candidatePath, context.wslDistro)
  if (!accessPath || !isAbsoluteForCurrentPlatform(accessPath)) {
    return { status: 'invalid' }
  }
  try {
    return scopeLocalRuntimePath(
      resolveSpoolCanonicalHostPath(executionHostId, await realpath(accessPath)),
      context.wslDistro
    )
  } catch (error) {
    if (isMissingSpoolFilesystemError(error) && parseWslUncPath(accessPath)) {
      const resolved = await resolveSpoolWslCanonicalDirectory(accessPath)
      return resolved.status === 'resolved'
        ? scopeLocalRuntimePath(
            resolveSpoolCanonicalHostPath(executionHostId, resolved.path),
            context.wslDistro
          )
        : resolved
    }
    return classifyCanonicalizationFailure(error)
  }
}

function scopeLocalRuntimePath(
  result: Extract<SpoolInternalHostPathResult, { status: 'resolved' }>,
  wslDistro: string | null
): SpoolInternalHostPathResult {
  const runtimeScope = wslDistro ? `wsl:${wslDistro.trim().toLowerCase()}` : 'native'
  return { ...result, path: withSpoolActualHostSubscope(result.path, runtimeScope) }
}

export async function canonicalizeSpoolSshHostPath(
  context: { platform: RemoteHostPlatform; filesystem: IFilesystemProvider },
  executionHostId: ExecutionHostId,
  candidatePath: string
): Promise<SpoolInternalHostPathResult> {
  if (!isRuntimePathAbsolute(candidatePath, context.platform.pathFlavor)) {
    return { status: 'invalid' }
  }
  try {
    const canonicalPath = await context.filesystem.realpath(candidatePath)
    return isRuntimePathAbsolute(canonicalPath, context.platform.pathFlavor)
      ? resolveSpoolCanonicalHostPath(executionHostId, canonicalPath)
      : { status: 'invalid' }
  } catch (error) {
    return classifyCanonicalizationFailure(error)
  }
}

function classifyCanonicalizationFailure(error: unknown): SpoolInternalHostPathResult {
  if (isMissingSpoolFilesystemError(error)) {
    return { status: 'missing' }
  }
  // Why: explicit path/permission failures disprove shareability; opaque I/O
  // failures only prove that the execution host cannot answer right now.
  return isDefinitiveSpoolFilesystemFailure(error)
    ? { status: 'invalid' }
    : { status: 'unavailable' }
}
