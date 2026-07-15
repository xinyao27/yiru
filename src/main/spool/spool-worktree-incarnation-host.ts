import { parseExecutionHostId } from '../../shared/execution-host'
import {
  SpoolActualHostPathResolver,
  type SpoolCanonicalHostPathResult,
  type SpoolPairedRuntimeWorktreeHostAdapter
} from './spool-actual-host-path-resolver'
import {
  isValidSpoolCanonicalPath,
  withSpoolActualHostScope,
  withSpoolOuterActualHostScope
} from './spool-canonical-host-path'
import { SpoolIncarnationMarkerStore } from './spool-incarnation-marker-store'
import type {
  SpoolHostWorktreeInspection,
  SpoolHostWorktreeInspectionMode,
  SpoolOwnerWorktree,
  SpoolWorktreeIncarnationHost
} from './spool-worktree-incarnation'
import { SpoolWorktreeIncarnationHostError } from './spool-worktree-incarnation'

export type { SpoolCanonicalHostPathResult, SpoolPairedRuntimeWorktreeHostAdapter }

export type SpoolActualHostWorktreeIncarnationOptions = {
  /** Needed when a Windows-native path is deliberately executed by a WSL project runtime. */
  resolveLocalWslDistro?: (
    target: SpoolOwnerWorktree
  ) => string | null | undefined | Promise<string | null | undefined>
  pairedRuntimeAdapter?: SpoolPairedRuntimeWorktreeHostAdapter
}

/** Resolves identity and paths on the machine that actually owns each worktree. */
export class SpoolActualHostWorktreeIncarnationHost implements SpoolWorktreeIncarnationHost {
  private readonly paths: SpoolActualHostPathResolver
  private readonly markers = new SpoolIncarnationMarkerStore()

  constructor(private readonly options: SpoolActualHostWorktreeIncarnationOptions = {}) {
    this.paths = new SpoolActualHostPathResolver(options)
  }

  async inspect(
    target: SpoolOwnerWorktree,
    mode: SpoolHostWorktreeInspectionMode
  ): Promise<SpoolHostWorktreeInspection> {
    let actualHostScope: string | undefined
    try {
      const parsed = parseExecutionHostId(target.executionHostId)
      if (!parsed || !target.worktreePath.trim()) {
        throw new SpoolWorktreeIncarnationHostError('invalid-host-response')
      }
      if (parsed.kind === 'runtime') {
        return await this.inspectPairedRuntime(target, mode)
      }
      actualHostScope = await this.paths.resolveActualHostScope(target)
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
          error instanceof SpoolWorktreeIncarnationHostError ? error.reason : 'host-unavailable',
        ...(actualHostScope ? { actualHostScope } : {})
      }
    }
  }

  canonicalizePath(
    target: SpoolOwnerWorktree,
    candidatePath: string
  ): Promise<SpoolCanonicalHostPathResult> {
    return this.paths.canonicalizePath(target, candidatePath)
  }

  private async inspectPairedRuntime(
    target: SpoolOwnerWorktree,
    mode: SpoolHostWorktreeInspectionMode
  ): Promise<SpoolHostWorktreeInspection> {
    const adapter = this.options.pairedRuntimeAdapter
    if (!adapter) {
      throw new SpoolWorktreeIncarnationHostError('host-unavailable')
    }
    const result = await adapter.inspectWorktree(target, mode)
    if (result.status !== 'resolved') {
      const actualHostScope = result.actualHostScope
        ? withSpoolOuterActualHostScope(target.executionHostId, result.actualHostScope)
        : undefined
      return { ...result, ...(actualHostScope ? { actualHostScope } : {}) }
    }
    if (!isValidSpoolCanonicalPath(result.root)) {
      throw new SpoolWorktreeIncarnationHostError('invalid-host-response')
    }
    return {
      ...result,
      root: withSpoolActualHostScope(target.executionHostId, result.root),
      actualHostScope: withSpoolOuterActualHostScope(target.executionHostId, result.actualHostScope)
    }
  }
}
