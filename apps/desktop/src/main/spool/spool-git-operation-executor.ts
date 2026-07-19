import type {
  SpoolExecutionOperation,
  SpoolFileDiffResult,
  SpoolGitDiffResult,
  SpoolGitHistoryResult,
  SpoolGitStatusResult,
  SpoolMutationResult
} from '../../shared/spool/spool-operation-contract'
import { asSpoolExecutionError, SpoolExecutionError } from './spool-execution-error'
import type { ExecutionAdmissionGuard } from './spool-execution-gateway'
import type { SpoolGitReadProfile } from './spool-git-read-profile'
import { normalizeSpoolRelativePath } from './spool-worktree-containment'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-publication-state'

type SpoolGitOperation = Extract<
  SpoolExecutionOperation,
  {
    kind:
      | 'files.diff'
      | 'git.status'
      | 'git.diff'
      | 'git.history'
      | 'git.stage'
      | 'git.unstage'
      | 'git.commit'
  }
>

const MAX_MUTATION_PATHS = 500
const MAX_COMMIT_MESSAGE_BYTES = 128 * 1_024

export type SpoolGitMutationHost = {
  prepareStage(
    target: SpoolPublicWorktreeInstance,
    relativePaths: readonly string[],
    signal: AbortSignal
  ): Promise<SpoolPreparedGitMutation>
  prepareUnstage(
    target: SpoolPublicWorktreeInstance,
    relativePaths: readonly string[],
    signal: AbortSignal
  ): Promise<SpoolPreparedGitMutation>
  prepareCommit(
    target: SpoolPublicWorktreeInstance,
    message: string,
    signal: AbortSignal
  ): Promise<SpoolPreparedGitMutation>
}

export type SpoolPreparedGitMutation = {
  /** No side effect may occur before this starts the subprocess or runtime transmission. */
  start(signal: AbortSignal, beforeSideEffect: () => Promise<void>): Promise<void>
}

export class SpoolGitOperationExecutor {
  constructor(
    private readonly reads: SpoolGitReadProfile,
    private readonly mutations: SpoolGitMutationHost
  ) {}

  supports(operation: SpoolExecutionOperation): operation is SpoolGitOperation {
    return operation.kind.startsWith('git.') || operation.kind === 'files.diff'
  }

  async invoke(
    connectionId: string,
    target: SpoolPublicWorktreeInstance,
    operation: SpoolGitOperation,
    signal: AbortSignal,
    admissionGuard?: ExecutionAdmissionGuard
  ): Promise<
    | SpoolFileDiffResult
    | SpoolGitStatusResult
    | SpoolGitDiffResult
    | SpoolGitHistoryResult
    | SpoolMutationResult
  > {
    try {
      switch (operation.kind) {
        case 'files.diff': {
          const result = await this.reads.diff(
            connectionId,
            target,
            {
              kind: 'git.diff',
              source: operation.staged ? 'index' : 'working-tree',
              relativePath: operation.relativePath
            },
            signal
          )
          return {
            relativePath: result.relativePath ?? operation.relativePath,
            staged: operation.staged,
            patch: result.patch,
            truncated: result.truncated
          }
        }
        case 'git.status':
          return await this.reads.status(target, signal)
        case 'git.diff':
          return await this.reads.diff(connectionId, target, operation, signal)
        case 'git.history':
          return await this.reads.history(connectionId, target, operation, signal)
        case 'git.stage':
          return await this.stage(
            target,
            operation.relativePaths,
            requireGuard(admissionGuard),
            signal
          )
        case 'git.unstage':
          return await this.unstage(
            target,
            operation.relativePaths,
            requireGuard(admissionGuard),
            signal
          )
        case 'git.commit':
          return await this.commit(target, operation.message, requireGuard(admissionGuard), signal)
      }
    } catch (error) {
      throw asSpoolExecutionError(error)
    }
  }

  closeConnection(connectionId: string): void {
    this.reads.closeConnection(connectionId)
  }

  private async stage(
    target: SpoolPublicWorktreeInstance,
    relativePaths: readonly string[],
    guard: ExecutionAdmissionGuard,
    signal: AbortSignal
  ): Promise<SpoolMutationResult> {
    const normalized = normalizeMutationPaths(relativePaths)
    const prepared = await this.mutations.prepareStage(target, normalized, signal)
    await prepared.start(signal, () => guard.beforeSideEffect())
    return { ok: true }
  }

  private async unstage(
    target: SpoolPublicWorktreeInstance,
    relativePaths: readonly string[],
    guard: ExecutionAdmissionGuard,
    signal: AbortSignal
  ): Promise<SpoolMutationResult> {
    const normalized = normalizeMutationPaths(relativePaths)
    const prepared = await this.mutations.prepareUnstage(target, normalized, signal)
    await prepared.start(signal, () => guard.beforeSideEffect())
    return { ok: true }
  }

  private async commit(
    target: SpoolPublicWorktreeInstance,
    message: string,
    guard: ExecutionAdmissionGuard,
    signal: AbortSignal
  ): Promise<SpoolMutationResult> {
    if (
      !message.trim() ||
      message.includes('\0') ||
      Buffer.byteLength(message, 'utf8') > MAX_COMMIT_MESSAGE_BYTES
    ) {
      throw new SpoolExecutionError('invalid_argument')
    }
    const prepared = await this.mutations.prepareCommit(target, message, signal)
    await prepared.start(signal, () => guard.beforeSideEffect())
    return { ok: true }
  }
}

function normalizeMutationPaths(relativePaths: readonly string[]): readonly string[] {
  if (
    !Array.isArray(relativePaths) ||
    relativePaths.length === 0 ||
    relativePaths.length > MAX_MUTATION_PATHS
  ) {
    throw new SpoolExecutionError('invalid_argument')
  }
  if (relativePaths.some((path) => typeof path !== 'string')) {
    throw new SpoolExecutionError('invalid_argument')
  }
  const paths = relativePaths.map((path) => normalizeSpoolRelativePath(path))
  if (new Set(paths).size !== paths.length) {
    throw new SpoolExecutionError('invalid_argument')
  }
  return paths
}

function requireGuard(guard: ExecutionAdmissionGuard | undefined): ExecutionAdmissionGuard {
  if (!guard) {
    throw new SpoolExecutionError('unauthorized')
  }
  return guard
}
