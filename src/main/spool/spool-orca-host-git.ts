import { parseExecutionHostId } from '../../shared/execution-host'
import type { Store } from '../persistence'
import { gitExecFileAsync } from '../git/runner'
import { getLocalProjectWorktreeGitOptions } from '../project-runtime-git-options'
import { getSshGitProvider } from '../providers/ssh-git-dispatch'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { SpoolGitMutationHost, SpoolPreparedGitMutation } from './spool-git-operation-executor'
import type {
  SpoolGitReadCommand,
  SpoolGitReadCommandHost,
  SpoolGitReadCommandResult
} from './spool-git-read-profile'
import { SpoolExecutionError } from './spool-execution-error'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-publication-state'

type SpoolGitRuntime = Pick<
  OrcaRuntimeService,
  'bulkStageRuntimeGitPaths' | 'bulkUnstageRuntimeGitPaths' | 'commitRuntimeGit'
>

/** Runs the audited read profile and granted mutations on the existing owner route. */
export class OrcaSpoolHostGit implements SpoolGitReadCommandHost, SpoolGitMutationHost {
  constructor(
    private readonly store: Store,
    private readonly runtime: SpoolGitRuntime
  ) {}

  async runReadCommand(
    target: SpoolPublicWorktreeInstance,
    command: SpoolGitReadCommand
  ): Promise<SpoolGitReadCommandResult> {
    requireSupportedRoute(target)
    if (target.ownerWorktree.connectionId) {
      const provider = getSshGitProvider(target.ownerWorktree.connectionId)
      if (!provider) {
        throw new SpoolExecutionError('resource_unavailable')
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
      throw new SpoolExecutionError('resource_not_found')
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
        throw new SpoolExecutionError('result_too_large')
      }
      throw error
    }
  }

  prepareStage(
    target: SpoolPublicWorktreeInstance,
    relativePaths: readonly string[],
    _signal: AbortSignal
  ): Promise<SpoolPreparedGitMutation> {
    return Promise.resolve({
      start: async (signal, beforeSideEffect) => {
        signal.throwIfAborted()
        requireSupportedRoute(target)
        await this.runtime.bulkStageRuntimeGitPaths(`id:${target.worktreeId}`, [...relativePaths], {
          signal,
          beforeSideEffect
        })
      }
    })
  }

  prepareUnstage(
    target: SpoolPublicWorktreeInstance,
    relativePaths: readonly string[],
    _signal: AbortSignal
  ): Promise<SpoolPreparedGitMutation> {
    return Promise.resolve({
      start: async (signal, beforeSideEffect) => {
        signal.throwIfAborted()
        requireSupportedRoute(target)
        await this.runtime.bulkUnstageRuntimeGitPaths(
          `id:${target.worktreeId}`,
          [...relativePaths],
          { signal, beforeSideEffect }
        )
      }
    })
  }

  prepareCommit(
    target: SpoolPublicWorktreeInstance,
    message: string,
    _signal: AbortSignal
  ): Promise<SpoolPreparedGitMutation> {
    return Promise.resolve({
      start: async (signal, beforeSideEffect) => {
        signal.throwIfAborted()
        requireSupportedRoute(target)
        const result = await this.runtime.commitRuntimeGit(`id:${target.worktreeId}`, message, {
          signal,
          beforeSideEffect
        })
        if (!result.success) {
          throw new SpoolExecutionError('resource_unavailable')
        }
      }
    })
  }
}

function requireSupportedRoute(target: SpoolPublicWorktreeInstance): void {
  const host = parseExecutionHostId(target.ownerWorktree.executionHostId)
  if (!host || host.kind === 'runtime') {
    // Why: requester traffic cannot create or pair a missing downstream runtime route.
    throw new SpoolExecutionError('resource_unavailable')
  }
}

function requireOutputBound(stdout: string, maxBytes: number): void {
  if (Buffer.byteLength(stdout, 'utf8') > maxBytes) {
    throw new SpoolExecutionError('result_too_large')
  }
}
