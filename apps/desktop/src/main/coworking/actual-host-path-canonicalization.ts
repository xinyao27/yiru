import { realpath } from 'node:fs/promises'

import { parseWslUncPath } from '@yiru/workbench-model/platform'
import type { ExecutionHostId } from '@yiru/workbench-model/workspace'

import {
  isAbsoluteForCurrentPlatform,
  isDefinitiveCoworkingFilesystemFailure,
  isMissingCoworkingFilesystemError,
  resolveCoworkingCanonicalHostPath,
  toCoworkingLocalAccessPath,
  withCoworkingActualHostSubscope,
  type CoworkingInternalHostPathResult
} from './canonical-host-path'
import { resolveCoworkingWslCanonicalDirectory } from './wsl-canonical-directory'

export async function canonicalizeCoworkingLocalHostPath(
  context: { wslDistro: string | null },
  executionHostId: ExecutionHostId,
  candidatePath: string
): Promise<CoworkingInternalHostPathResult> {
  const accessPath = toCoworkingLocalAccessPath(candidatePath, context.wslDistro)
  if (!accessPath || !isAbsoluteForCurrentPlatform(accessPath)) {
    return { status: 'invalid' }
  }
  try {
    return scopeLocalRuntimePath(
      resolveCoworkingCanonicalHostPath(executionHostId, await realpath(accessPath)),
      context.wslDistro
    )
  } catch (error) {
    if (isMissingCoworkingFilesystemError(error) && parseWslUncPath(accessPath)) {
      const resolved = await resolveCoworkingWslCanonicalDirectory(accessPath)
      return resolved.status === 'resolved'
        ? scopeLocalRuntimePath(
            resolveCoworkingCanonicalHostPath(executionHostId, resolved.path),
            context.wslDistro
          )
        : resolved
    }
    return classifyCanonicalizationFailure(error)
  }
}

function scopeLocalRuntimePath(
  result: Extract<CoworkingInternalHostPathResult, { status: 'resolved' }>,
  wslDistro: string | null
): CoworkingInternalHostPathResult {
  const runtimeScope = wslDistro ? `wsl:${wslDistro.trim().toLowerCase()}` : 'native'
  return { ...result, path: withCoworkingActualHostSubscope(result.path, runtimeScope) }
}

function classifyCanonicalizationFailure(error: unknown): CoworkingInternalHostPathResult {
  if (isMissingCoworkingFilesystemError(error)) {
    return { status: 'missing' }
  }
  // Why: explicit path/permission failures disprove shareability; opaque I/O
  // failures only prove that the execution host cannot answer right now.
  return isDefinitiveCoworkingFilesystemFailure(error)
    ? { status: 'invalid' }
    : { status: 'unavailable' }
}
