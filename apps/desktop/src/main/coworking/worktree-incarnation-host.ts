import { parseExecutionHostId } from '@yiru/workbench-model/workspace'

import {
  CoworkingActualHostPathResolver,
  type CoworkingCanonicalHostPathResult,
  type CoworkingPairedRuntimeWorktreeHostAdapter
} from './actual-host-path-resolver'
import {
  isValidCoworkingCanonicalPath,
  withCoworkingActualHostScope,
  withCoworkingOuterActualHostScope
} from './canonical-host-path'
import { CoworkingFolderWorkspaceIncarnation } from './folder-workspace-incarnation'
import { CoworkingIncarnationMarkerStore } from './incarnation-marker-store'
import type {
  CoworkingHostWorktreeInspection,
  CoworkingHostWorktreeInspectionMode,
  CoworkingOwnerWorktree,
  CoworkingWorktreeIncarnationHost
} from './worktree-incarnation'
import { CoworkingWorktreeIncarnationHostError } from './worktree-incarnation'

export type { CoworkingCanonicalHostPathResult, CoworkingPairedRuntimeWorktreeHostAdapter }

export type CoworkingActualHostWorktreeIncarnationOptions = {
  /** Needed when a Windows-native path is deliberately executed by a WSL project runtime. */
  resolveLocalWslDistro?: (
    target: CoworkingOwnerWorktree
  ) => string | null | undefined | Promise<string | null | undefined>
  pairedRuntimeAdapter?: CoworkingPairedRuntimeWorktreeHostAdapter
}

/** Resolves identity and paths on the machine that actually owns each worktree. */
export class CoworkingActualHostWorktreeIncarnationHost implements CoworkingWorktreeIncarnationHost {
  private readonly paths: CoworkingActualHostPathResolver
  private readonly markers = new CoworkingIncarnationMarkerStore()
  private readonly folders: CoworkingFolderWorkspaceIncarnation

  constructor(private readonly options: CoworkingActualHostWorktreeIncarnationOptions = {}) {
    this.paths = new CoworkingActualHostPathResolver(options)
    this.folders = new CoworkingFolderWorkspaceIncarnation(this.paths, options)
  }

  async inspect(
    target: CoworkingOwnerWorktree,
    mode: CoworkingHostWorktreeInspectionMode
  ): Promise<CoworkingHostWorktreeInspection> {
    let actualHostScope: string | undefined
    try {
      const parsed = parseExecutionHostId(target.executionHostId)
      if (!parsed || !target.worktreePath.trim()) {
        throw new CoworkingWorktreeIncarnationHostError('invalid-host-response')
      }
      if (parsed.kind === 'runtime') {
        return await this.inspectPairedRuntime(target, mode)
      }
      actualHostScope = await this.paths.resolveActualHostScope(target)
      if (target.kind === 'folder') {
        return await this.folders.inspect(target, mode, actualHostScope)
      }
      const resolved = await this.paths.resolveGitWorktree(target)
      if (mode === 'resolve-root') {
        return { status: 'resolved', root: resolved.root, markerId: null, actualHostScope }
      }
      const markerId = await this.markers.readOrCreate(resolved.markerLocation)
      return { status: 'resolved', root: resolved.root, markerId, actualHostScope }
    } catch (error) {
      return {
        status: 'unavailable',
        reason:
          error instanceof CoworkingWorktreeIncarnationHostError
            ? error.reason
            : 'host-unavailable',
        ...(actualHostScope ? { actualHostScope } : {})
      }
    }
  }

  canonicalizePath(
    target: CoworkingOwnerWorktree,
    candidatePath: string
  ): Promise<CoworkingCanonicalHostPathResult> {
    return this.paths.canonicalizePath(target, candidatePath)
  }

  private async inspectPairedRuntime(
    target: CoworkingOwnerWorktree,
    mode: CoworkingHostWorktreeInspectionMode
  ): Promise<CoworkingHostWorktreeInspection> {
    const adapter = this.options.pairedRuntimeAdapter
    if (!adapter) {
      throw new CoworkingWorktreeIncarnationHostError('host-unavailable')
    }
    const result = await adapter.inspectWorktree(target, mode)
    if (result.status !== 'resolved') {
      const actualHostScope = result.actualHostScope
        ? withCoworkingOuterActualHostScope(target.executionHostId, result.actualHostScope)
        : undefined
      return { ...result, ...(actualHostScope ? { actualHostScope } : {}) }
    }
    if (!isValidCoworkingCanonicalPath(result.root)) {
      throw new CoworkingWorktreeIncarnationHostError('invalid-host-response')
    }
    return {
      ...result,
      root: withCoworkingActualHostScope(target.executionHostId, result.root),
      actualHostScope: withCoworkingOuterActualHostScope(
        target.executionHostId,
        result.actualHostScope
      )
    }
  }
}
