import { parseExecutionHostId } from '../../shared/execution-host'
import { parseWslUncPath } from '../../shared/wsl-paths'
import { gitExecFileAsync } from '../git/runner'
import { getSshFilesystemProvider } from '../providers/ssh-filesystem-dispatch'
import { getSshGitProvider } from '../providers/ssh-git-dispatch'
import type { IFilesystemProvider } from '../providers/types'
import type { RemoteHostPlatform } from '../ssh/ssh-remote-platform'
import {
  classifySpoolGitInspectionError,
  isSpoolLocalDirectory,
  isSpoolRemoteDirectory,
  isValidSpoolCanonicalPath,
  requireMatchingSpoolGitRoot,
  requireSingleSpoolGitPath,
  toSpoolLocalAccessPath,
  withSpoolActualHostScope
} from './spool-canonical-host-path'
import {
  canonicalizeSpoolLocalHostPath,
  canonicalizeSpoolSshHostPath
} from './spool-actual-host-path-canonicalization'
import type { SpoolIncarnationMarkerLocation } from './spool-incarnation-marker-store'
import type {
  SpoolHostWorktreeInspection,
  SpoolHostWorktreeInspectionMode,
  SpoolOwnerWorktree,
  SpoolWorktreeRootComparison
} from './spool-worktree-incarnation'
import { SpoolWorktreeIncarnationHostError } from './spool-worktree-incarnation'

export type SpoolCanonicalHostPathResult =
  | { status: 'resolved'; path: SpoolWorktreeRootComparison }
  | { status: 'missing' }
  | { status: 'unavailable' }

export type SpoolPairedRuntimeWorktreeHostAdapter = {
  inspectWorktree(
    target: SpoolOwnerWorktree,
    mode: SpoolHostWorktreeInspectionMode
  ): Promise<SpoolHostWorktreeInspection>
  canonicalizePath(args: {
    target: SpoolOwnerWorktree
    path: string
  }): Promise<SpoolCanonicalHostPathResult>
}

export type SpoolActualHostPathResolverOptions = {
  resolveLocalWslDistro?: (
    target: SpoolOwnerWorktree
  ) => string | null | undefined | Promise<string | null | undefined>
  pairedRuntimeAdapter?: SpoolPairedRuntimeWorktreeHostAdapter
}

type LocalHostContext = { kind: 'local'; wslDistro: string | null }

type SshHostContext = {
  kind: 'ssh'
  platform: RemoteHostPlatform
  filesystem: IFilesystemProvider
  git: NonNullable<ReturnType<typeof getSshGitProvider>>
}

export type SpoolResolvedActualHostGitWorktree = {
  root: SpoolWorktreeRootComparison
  markerLocation: SpoolIncarnationMarkerLocation
}

export class SpoolActualHostPathResolver {
  constructor(private readonly options: SpoolActualHostPathResolverOptions = {}) {}

  async resolveGitWorktree(
    target: SpoolOwnerWorktree
  ): Promise<SpoolResolvedActualHostGitWorktree> {
    const parsed = parseExecutionHostId(target.executionHostId)
    if (!parsed || parsed.kind === 'runtime') {
      throw new SpoolWorktreeIncarnationHostError('invalid-host-response')
    }
    if (parsed.kind === 'local') {
      return await this.resolveLocalGitWorktree(target)
    }
    return await this.resolveSshGitWorktree(target, parsed.targetId)
  }

  async canonicalizePath(
    target: SpoolOwnerWorktree,
    candidatePath: string
  ): Promise<SpoolCanonicalHostPathResult> {
    if (!candidatePath.trim()) {
      return { status: 'missing' }
    }
    try {
      const parsed = parseExecutionHostId(target.executionHostId)
      if (!parsed) {
        return { status: 'unavailable' }
      }
      if (parsed.kind === 'runtime') {
        return await this.canonicalizeRuntime(target, candidatePath)
      }
      if (parsed.kind === 'local' && target.connectionId?.trim()) {
        return { status: 'unavailable' }
      }
      const resolved =
        parsed.kind === 'ssh'
          ? await canonicalizeSpoolSshHostPath(
              this.requireSshContext(target, parsed.targetId),
              target.executionHostId,
              candidatePath
            )
          : await canonicalizeSpoolLocalHostPath(
              await this.resolveLocalContext(target),
              target.executionHostId,
              candidatePath
            )
      return resolved.status === 'resolved'
        ? { status: 'resolved', path: resolved.path }
        : resolved.status === 'missing'
          ? resolved
          : { status: 'unavailable' }
    } catch {
      return { status: 'unavailable' }
    }
  }

  private async resolveLocalGitWorktree(
    target: SpoolOwnerWorktree
  ): Promise<SpoolResolvedActualHostGitWorktree> {
    if (target.connectionId?.trim()) {
      throw new SpoolWorktreeIncarnationHostError('invalid-host-response')
    }
    const context = await this.resolveLocalContext(target)
    const gitPaths = await this.readLocalGitPaths(target, context)
    const root = await canonicalizeSpoolLocalHostPath(
      context,
      target.executionHostId,
      gitPaths.root
    )
    const registered = await canonicalizeSpoolLocalHostPath(
      context,
      target.executionHostId,
      target.worktreePath
    )
    requireMatchingSpoolGitRoot(root, registered)
    const gitDirectory = await canonicalizeSpoolLocalHostPath(
      context,
      target.executionHostId,
      gitPaths.gitDirectory
    )
    if (gitDirectory.status === 'unavailable') {
      throw new SpoolWorktreeIncarnationHostError('host-unavailable')
    }
    if (
      gitDirectory.status !== 'resolved' ||
      (!parseWslUncPath(gitDirectory.accessPath) &&
        !(await isSpoolLocalDirectory(gitDirectory.accessPath)))
    ) {
      throw new SpoolWorktreeIncarnationHostError('marker-unavailable')
    }
    return {
      root: root.path,
      markerLocation: { kind: 'local', gitDirectory: gitDirectory.accessPath }
    }
  }

  private async resolveSshGitWorktree(
    target: SpoolOwnerWorktree,
    targetId: string
  ): Promise<SpoolResolvedActualHostGitWorktree> {
    const context = this.requireSshContext(target, targetId)
    const gitPaths = await this.readSshGitPaths(target, context)
    const root = await canonicalizeSpoolSshHostPath(context, target.executionHostId, gitPaths.root)
    const registered = await canonicalizeSpoolSshHostPath(
      context,
      target.executionHostId,
      target.worktreePath
    )
    requireMatchingSpoolGitRoot(root, registered)
    const gitDirectory = await canonicalizeSpoolSshHostPath(
      context,
      target.executionHostId,
      gitPaths.gitDirectory
    )
    if (gitDirectory.status === 'unavailable') {
      throw new SpoolWorktreeIncarnationHostError('host-unavailable')
    }
    if (
      gitDirectory.status !== 'resolved' ||
      !(await isSpoolRemoteDirectory(context.filesystem, gitDirectory.accessPath))
    ) {
      throw new SpoolWorktreeIncarnationHostError('marker-unavailable')
    }
    return {
      root: root.path,
      markerLocation: {
        kind: 'ssh',
        filesystem: context.filesystem,
        platform: context.platform,
        gitDirectory: gitDirectory.accessPath
      }
    }
  }

  private async resolveLocalContext(target: SpoolOwnerWorktree): Promise<LocalHostContext> {
    const pathWsl = parseWslUncPath(target.worktreePath)?.distro ?? null
    const configuredWsl = (await this.options.resolveLocalWslDistro?.(target))?.trim() || null
    if (pathWsl && configuredWsl && pathWsl.toLowerCase() !== configuredWsl.toLowerCase()) {
      throw new SpoolWorktreeIncarnationHostError('invalid-host-response')
    }
    return { kind: 'local', wslDistro: pathWsl ?? configuredWsl }
  }

  private requireSshContext(target: SpoolOwnerWorktree, targetId: string): SshHostContext {
    if (target.connectionId?.trim() && target.connectionId !== targetId) {
      throw new SpoolWorktreeIncarnationHostError('invalid-host-response')
    }
    const git = getSshGitProvider(targetId)
    const filesystem = getSshFilesystemProvider(targetId)
    const platform = git?.getHostPlatform() ?? null
    if (!git || !filesystem || !platform) {
      throw new SpoolWorktreeIncarnationHostError('host-unavailable')
    }
    return { kind: 'ssh', platform, filesystem, git }
  }

  private async readLocalGitPaths(
    target: SpoolOwnerWorktree,
    context: LocalHostContext
  ): Promise<{ root: string; gitDirectory: string }> {
    const execute = async (arg: '--show-toplevel' | '--absolute-git-dir'): Promise<string> => {
      try {
        const result = await gitExecFileAsync(['rev-parse', arg], {
          cwd: target.worktreePath,
          ...(context.wslDistro ? { wslDistro: context.wslDistro } : {})
        })
        return requireSingleSpoolGitPath(result.stdout)
      } catch (error) {
        throw classifySpoolGitInspectionError(error)
      }
    }
    const [root, gitDirectory] = await Promise.all([
      execute('--show-toplevel'),
      execute('--absolute-git-dir')
    ])
    return {
      root: toSpoolLocalAccessPath(root, context.wslDistro),
      gitDirectory: toSpoolLocalAccessPath(gitDirectory, context.wslDistro)
    }
  }

  private async readSshGitPaths(
    target: SpoolOwnerWorktree,
    context: SshHostContext
  ): Promise<{ root: string; gitDirectory: string }> {
    const execute = async (arg: '--show-toplevel' | '--absolute-git-dir'): Promise<string> => {
      try {
        return requireSingleSpoolGitPath(
          (await context.git.exec(['rev-parse', arg], target.worktreePath)).stdout
        )
      } catch (error) {
        throw classifySpoolGitInspectionError(error)
      }
    }
    const [root, gitDirectory] = await Promise.all([
      execute('--show-toplevel'),
      execute('--absolute-git-dir')
    ])
    return { root, gitDirectory }
  }

  private async canonicalizeRuntime(
    target: SpoolOwnerWorktree,
    candidatePath: string
  ): Promise<SpoolCanonicalHostPathResult> {
    const adapter = this.options.pairedRuntimeAdapter
    if (!adapter) {
      return { status: 'unavailable' }
    }
    const result = await adapter.canonicalizePath({ target, path: candidatePath })
    if (result.status !== 'resolved' || !isValidSpoolCanonicalPath(result.path)) {
      return result.status === 'resolved' ? { status: 'unavailable' } : result
    }
    return {
      status: 'resolved',
      path: withSpoolActualHostScope(target.executionHostId, result.path)
    }
  }
}
