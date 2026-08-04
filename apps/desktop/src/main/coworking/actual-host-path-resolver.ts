import { parseWslUncPath } from '@yiru/workbench-model/platform'
import { parseExecutionHostId } from '@yiru/workbench-model/workspace'

import { gitExecFileAsync } from '../git/runner'
import { canonicalizeCoworkingLocalHostPath } from './actual-host-path-canonicalization'
import {
  classifyCoworkingGitInspectionError,
  isCoworkingLocalDirectory,
  isValidCoworkingCanonicalPath,
  requireMatchingCoworkingGitRoot,
  requireSingleCoworkingGitPath,
  coworkingLocalActualHostScopeKey,
  toCoworkingLocalAccessPath,
  withCoworkingActualHostScope
} from './canonical-host-path'
import type { CoworkingIncarnationMarkerLocation } from './incarnation-marker-store'
import type {
  CoworkingHostWorktreeInspection,
  CoworkingHostWorktreeInspectionMode,
  CoworkingOwnerWorktree,
  CoworkingWorktreeRootComparison
} from './worktree-incarnation'
import { CoworkingWorktreeIncarnationHostError } from './worktree-incarnation'

export type CoworkingCanonicalHostPathResult =
  | { status: 'resolved'; path: CoworkingWorktreeRootComparison }
  | { status: 'missing' }
  | { status: 'invalid' }
  | { status: 'unavailable' }

export type CoworkingPairedRuntimeWorktreeHostAdapter = {
  inspectWorktree(
    target: CoworkingOwnerWorktree,
    mode: CoworkingHostWorktreeInspectionMode
  ): Promise<CoworkingHostWorktreeInspection>
  canonicalizePath(args: {
    target: CoworkingOwnerWorktree
    path: string
  }): Promise<CoworkingCanonicalHostPathResult>
}

export type CoworkingActualHostPathResolverOptions = {
  resolveLocalWslDistro?: (
    target: CoworkingOwnerWorktree
  ) => string | null | undefined | Promise<string | null | undefined>
  pairedRuntimeAdapter?: CoworkingPairedRuntimeWorktreeHostAdapter
}

type LocalHostContext = { kind: 'local'; wslDistro: string | null }

export type CoworkingResolvedActualHostGitWorktree = {
  root: CoworkingWorktreeRootComparison
  markerLocation: CoworkingIncarnationMarkerLocation
}

export class CoworkingActualHostPathResolver {
  constructor(private readonly options: CoworkingActualHostPathResolverOptions = {}) {}

  async resolveGitWorktree(
    target: CoworkingOwnerWorktree
  ): Promise<CoworkingResolvedActualHostGitWorktree> {
    const parsed = parseExecutionHostId(target.executionHostId)
    if (!parsed || parsed.kind === 'runtime') {
      throw new CoworkingWorktreeIncarnationHostError('invalid-host-response')
    }
    return await this.resolveLocalGitWorktree(target)
  }

  async resolveActualHostScope(target: CoworkingOwnerWorktree): Promise<string> {
    const parsed = parseExecutionHostId(target.executionHostId)
    if (!parsed || parsed.kind === 'runtime') {
      throw new CoworkingWorktreeIncarnationHostError('invalid-host-response')
    }
    return coworkingLocalActualHostScopeKey(
      target.executionHostId,
      (await this.resolveLocalContext(target)).wslDistro
    )
  }

  async canonicalizePath(
    target: CoworkingOwnerWorktree,
    candidatePath: string
  ): Promise<CoworkingCanonicalHostPathResult> {
    if (!candidatePath.trim()) {
      return { status: 'missing' }
    }
    const parsed = parseExecutionHostId(target.executionHostId)
    if (!parsed) {
      return { status: 'invalid' }
    }
    try {
      if (parsed.kind === 'runtime') {
        return await this.canonicalizeRuntime(target, candidatePath)
      }
      const resolved = await canonicalizeCoworkingLocalHostPath(
        await this.resolveLocalContext(target),
        target.executionHostId,
        candidatePath
      )
      return resolved.status === 'resolved'
        ? { status: 'resolved', path: resolved.path }
        : resolved.status === 'missing'
          ? resolved
          : resolved.status === 'invalid'
            ? resolved
            : { status: 'unavailable' }
    } catch (error) {
      return error instanceof CoworkingWorktreeIncarnationHostError &&
        error.reason !== 'host-unavailable'
        ? { status: 'invalid' }
        : { status: 'unavailable' }
    }
  }

  private async resolveLocalGitWorktree(
    target: CoworkingOwnerWorktree
  ): Promise<CoworkingResolvedActualHostGitWorktree> {
    if (target.connectionId?.trim()) {
      throw new CoworkingWorktreeIncarnationHostError('invalid-host-response')
    }
    const context = await this.resolveLocalContext(target)
    const gitPaths = await this.readLocalGitPaths(target, context)
    const root = await canonicalizeCoworkingLocalHostPath(
      context,
      target.executionHostId,
      gitPaths.root
    )
    const registered = await canonicalizeCoworkingLocalHostPath(
      context,
      target.executionHostId,
      target.worktreePath
    )
    requireMatchingCoworkingGitRoot(root, registered)
    const gitDirectory = await canonicalizeCoworkingLocalHostPath(
      context,
      target.executionHostId,
      gitPaths.gitDirectory
    )
    if (gitDirectory.status === 'unavailable') {
      throw new CoworkingWorktreeIncarnationHostError('host-unavailable')
    }
    if (
      gitDirectory.status !== 'resolved' ||
      (!parseWslUncPath(gitDirectory.accessPath) &&
        !(await isCoworkingLocalDirectory(gitDirectory.accessPath)))
    ) {
      throw new CoworkingWorktreeIncarnationHostError('marker-unavailable')
    }
    return {
      root: root.path,
      markerLocation: { kind: 'local', directory: gitDirectory.accessPath }
    }
  }

  private async resolveLocalContext(target: CoworkingOwnerWorktree): Promise<LocalHostContext> {
    const pathWsl = parseWslUncPath(target.worktreePath)?.distro ?? null
    const configuredWsl = (await this.options.resolveLocalWslDistro?.(target))?.trim() || null
    if (pathWsl && configuredWsl && pathWsl.toLowerCase() !== configuredWsl.toLowerCase()) {
      throw new CoworkingWorktreeIncarnationHostError('invalid-host-response')
    }
    return { kind: 'local', wslDistro: pathWsl ?? configuredWsl }
  }

  private async readLocalGitPaths(
    target: CoworkingOwnerWorktree,
    context: LocalHostContext
  ): Promise<{ root: string; gitDirectory: string }> {
    const execute = async (arg: '--show-toplevel' | '--absolute-git-dir'): Promise<string> => {
      try {
        const result = await gitExecFileAsync(['rev-parse', arg], {
          cwd: target.worktreePath,
          ...(context.wslDistro ? { wslDistro: context.wslDistro } : {})
        })
        return requireSingleCoworkingGitPath(result.stdout)
      } catch (error) {
        throw classifyCoworkingGitInspectionError(error)
      }
    }
    const [root, gitDirectory] = await Promise.all([
      execute('--show-toplevel'),
      execute('--absolute-git-dir')
    ])
    return {
      root: toCoworkingLocalAccessPath(root, context.wslDistro),
      gitDirectory: toCoworkingLocalAccessPath(gitDirectory, context.wslDistro)
    }
  }

  private async canonicalizeRuntime(
    target: CoworkingOwnerWorktree,
    candidatePath: string
  ): Promise<CoworkingCanonicalHostPathResult> {
    const adapter = this.options.pairedRuntimeAdapter
    if (!adapter) {
      return { status: 'unavailable' }
    }
    const result = await adapter.canonicalizePath({ target, path: candidatePath })
    if (result.status !== 'resolved' || !isValidCoworkingCanonicalPath(result.path)) {
      return result.status === 'resolved' ? { status: 'invalid' } : result
    }
    return {
      status: 'resolved',
      path: withCoworkingActualHostScope(target.executionHostId, result.path)
    }
  }
}
