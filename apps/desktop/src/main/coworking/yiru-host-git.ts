import { parseExecutionHostId } from '@yiru/workbench-model/workspace'

import { gitExecFileAsync } from '../git/runner'
import type { Store } from '../persistence'
import { getLocalProjectWorktreeGitOptions } from '../project-runtime-git-options'
import { getSshGitProvider } from '../providers/ssh-git-dispatch'
import type { RuntimeGitCommands } from '../runtime/yiru-runtime-git'
import { CoworkingExecutionError } from './execution-error'
import type {
  CoworkingGitMutationHost,
  CoworkingPreparedGitMutation
} from './git-operation-executor'
import type {
  CoworkingGitReadCommand,
  CoworkingGitReadCommandHost,
  CoworkingGitReadCommandResult
} from './git-read-profile'
import type { CoworkingPublicWorktreeInstance } from './worktree-publication-state'

type CoworkingGitCommands = Pick<
  RuntimeGitCommands,
  'bulkStageRuntimeGitPaths' | 'bulkUnstageRuntimeGitPaths' | 'commitRuntimeGit'
>

/** Runs the audited read profile and granted mutations on the existing owner route. */
export class YiruCoworkingHostGit implements CoworkingGitReadCommandHost, CoworkingGitMutationHost {
  constructor(
    private readonly store: Store,
    private readonly gitCommands: CoworkingGitCommands
  ) {}

  async runReadCommand(
    target: CoworkingPublicWorktreeInstance,
    command: CoworkingGitReadCommand
  ): Promise<CoworkingGitReadCommandResult> {
    requireSupportedRoute(target)
    if (target.ownerWorktree.connectionId) {
      const provider = getSshGitProvider(target.ownerWorktree.connectionId)
      if (!provider) {
        throw new CoworkingExecutionError('resource_unavailable')
      }
      const result = await provider.exec([...command.args], target.ownerWorktree.worktreePath, {
        signal: command.signal,
        timeoutMs: command.timeoutMs,
        disableOptionalLocks: true,
        nonInteractive: true,
        maxBuffer: command.maxOutputBytes
      })
      requireOutputBound(result.stdout, command.maxOutputBytes)
      return { stdout: result.stdout }
    }
    const repo = this.store.getRepo(target.ownerWorktree.repoId)
    if (!repo || repo.connectionId) {
      throw new CoworkingExecutionError('resource_not_found')
    }
    try {
      const result = await gitExecFileAsync([...command.args], {
        cwd: target.ownerWorktree.worktreePath,
        ...getLocalProjectWorktreeGitOptions(this.store, repo),
        env: { ...process.env, ...command.env },
        timeout: command.timeoutMs,
        maxBuffer: command.maxOutputBytes,
        signal: command.signal
      })
      requireOutputBound(result.stdout, command.maxOutputBytes)
      return { stdout: result.stdout }
    } catch (error) {
      if (
        /maxBuffer|stdout exceeded/i.test(error instanceof Error ? error.message : String(error))
      ) {
        throw new CoworkingExecutionError('result_too_large')
      }
      throw error
    }
  }

  prepareStage(
    target: CoworkingPublicWorktreeInstance,
    relativePaths: readonly string[],
    _signal: AbortSignal
  ): Promise<CoworkingPreparedGitMutation> {
    return Promise.resolve({
      start: async (signal, beforeSideEffect) => {
        signal.throwIfAborted()
        requireSupportedRoute(target)
        await this.gitCommands.bulkStageRuntimeGitPaths(
          `id:${target.worktreeId}`,
          [...relativePaths],
          {
            signal,
            beforeSideEffect
          }
        )
      }
    })
  }

  prepareUnstage(
    target: CoworkingPublicWorktreeInstance,
    relativePaths: readonly string[],
    _signal: AbortSignal
  ): Promise<CoworkingPreparedGitMutation> {
    return Promise.resolve({
      start: async (signal, beforeSideEffect) => {
        signal.throwIfAborted()
        requireSupportedRoute(target)
        await this.gitCommands.bulkUnstageRuntimeGitPaths(
          `id:${target.worktreeId}`,
          [...relativePaths],
          { signal, beforeSideEffect }
        )
      }
    })
  }

  prepareCommit(
    target: CoworkingPublicWorktreeInstance,
    message: string,
    _signal: AbortSignal
  ): Promise<CoworkingPreparedGitMutation> {
    return Promise.resolve({
      start: async (signal, beforeSideEffect) => {
        signal.throwIfAborted()
        requireSupportedRoute(target)
        const result = await this.gitCommands.commitRuntimeGit(`id:${target.worktreeId}`, message, {
          signal,
          beforeSideEffect
        })
        if (!result.success) {
          throw new CoworkingExecutionError('resource_unavailable')
        }
      }
    })
  }
}

function requireSupportedRoute(target: CoworkingPublicWorktreeInstance): void {
  const host = parseExecutionHostId(target.ownerWorktree.executionHostId)
  if (!host || host.kind === 'runtime') {
    // Why: requester traffic cannot create or pair a missing downstream runtime route.
    throw new CoworkingExecutionError('resource_unavailable')
  }
}

function requireOutputBound(stdout: string, maxBytes: number): void {
  if (Buffer.byteLength(stdout, 'utf8') > maxBytes) {
    throw new CoworkingExecutionError('result_too_large')
  }
}
