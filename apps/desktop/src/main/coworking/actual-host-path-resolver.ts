import { parseWslUncPath } from '@yiru/workbench-model/platform'
import { parseExecutionHostId } from '@yiru/workbench-model/workspace'
import type { RemoteHostPlatform } from '~main/remote-host/platform'

import { gitExecFileAsync } from '../git/runner'
import { getSshFilesystemProvider } from '../providers/ssh-filesystem-dispatch'
import { getSshGitProvider } from '../providers/ssh-git-dispatch'
import type { IFilesystemProvider } from '../providers/types'
import {
  canonicalizeCoworkingLocalHostPath,
  canonicalizeCoworkingSshHostPath
} from './actual-host-path-canonicalization'
import {
  classifyCoworkingGitInspectionError,
  isCoworkingLocalDirectory,
  isCoworkingRemoteDirectory,
  isValidCoworkingCanonicalPath,
  requireMatchingCoworkingGitRoot,
  requireSingleCoworkingGitPath,
  coworkingActualHostScopeKey,
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

type SshHostContext = {
  kind: 'ssh'
  platform: RemoteHostPlatform
  filesystem: IFilesystemProvider
  git: NonNullable<ReturnType<typeof getSshGitProvider>>
}

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
    if (parsed.kind === 'local') {
      return await this.resolveLocalGitWorktree(target)
    }
    return await this.resolveSshGitWorktree(target, parsed.targetId)
  }

  async resolveActualHostScope(target: CoworkingOwnerWorktree): Promise<string> {
    const parsed = parseExecutionHostId(target.executionHostId)
    if (!parsed || parsed.kind === 'runtime') {
      throw new CoworkingWorktreeIncarnationHostError('invalid-host-response')
    }
    return parsed.kind === 'local'
      ? coworkingLocalActualHostScopeKey(
          target.executionHostId,
          (await this.resolveLocalContext(target)).wslDistro
        )
      : coworkingActualHostScopeKey(target.executionHostId)
  }

  async canonicalizePath(
    target: CoworkingOwnerWorktree,
    candidatePath: string
  ): Promise<CoworkingCanonicalHostPathResult> {
    if (!candidatePath.trim()) {
      return { status: 'missing' }
    }
    const parsed = parseExecutionHostId(target.executionHostId)
    if (!parsed || (parsed.kind === 'local' && target.connectionId?.trim())) {
      return { status: 'invalid' }
    }
    try {
      if (parsed.kind === 'runtime') {
        return await this.canonicalizeRuntime(target, candidatePath)
      }
      const resolved =
        parsed.kind === 'ssh'
          ? await canonicalizeCoworkingSshHostPath(
              this.requireSshContext(target, parsed.targetId),
              target.executionHostId,
              candidatePath
            )
          : await canonicalizeCoworkingLocalHostPath(
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

  private async resolveSshGitWorktree(
    target: CoworkingOwnerWorktree,
    targetId: string
  ): Promise<CoworkingResolvedActualHostGitWorktree> {
    const context = this.requireSshContext(target, targetId)
    const gitPaths = await this.readSshGitPaths(target, context)
    const root = await canonicalizeCoworkingSshHostPath(
      context,
      target.executionHostId,
      gitPaths.root
    )
    const registered = await canonicalizeCoworkingSshHostPath(
      context,
      target.executionHostId,
      target.worktreePath
    )
    requireMatchingCoworkingGitRoot(root, registered)
    const gitDirectory = await canonicalizeCoworkingSshHostPath(
      context,
      target.executionHostId,
      gitPaths.gitDirectory
    )
    if (gitDirectory.status === 'unavailable') {
      throw new CoworkingWorktreeIncarnationHostError('host-unavailable')
    }
    if (
      gitDirectory.status !== 'resolved' ||
      !(await isCoworkingRemoteDirectory(context.filesystem, gitDirectory.accessPath))
    ) {
      throw new CoworkingWorktreeIncarnationHostError('marker-unavailable')
    }
    return {
      root: root.path,
      markerLocation: {
        kind: 'ssh',
        filesystem: context.filesystem,
        directory: gitDirectory.accessPath
      }
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

  private requireSshContext(target: CoworkingOwnerWorktree, targetId: string): SshHostContext {
    if (target.connectionId?.trim() && target.connectionId !== targetId) {
      throw new CoworkingWorktreeIncarnationHostError('invalid-host-response')
    }
    const git = getSshGitProvider(targetId)
    const filesystem = getSshFilesystemProvider(targetId)
    const platform = git?.getHostPlatform() ?? null
    if (!git || !filesystem || !platform) {
      throw new CoworkingWorktreeIncarnationHostError('host-unavailable')
    }
    return { kind: 'ssh', platform, filesystem, git }
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

  private async readSshGitPaths(
    target: CoworkingOwnerWorktree,
    context: SshHostContext
  ): Promise<{ root: string; gitDirectory: string }> {
    const execute = async (arg: '--show-toplevel' | '--absolute-git-dir'): Promise<string> => {
      try {
        return requireSingleCoworkingGitPath(
          (await context.git.exec(['rev-parse', arg], target.worktreePath)).stdout
        )
      } catch (error) {
        throw classifyCoworkingGitInspectionError(error)
      }
    }
    const [root, gitDirectory] = await Promise.all([
      execute('--show-toplevel'),
      execute('--absolute-git-dir')
    ])
    return { root, gitDirectory }
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
