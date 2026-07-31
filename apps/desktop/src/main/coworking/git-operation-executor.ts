import type {
  CoworkingExecutionOperation,
  CoworkingFileDiffResult,
  CoworkingGitDiffResult,
  CoworkingGitHistoryResult,
  CoworkingGitStatusResult,
  CoworkingMutationResult
} from '~shared/coworking/operation-contract'

import { asCoworkingExecutionError, CoworkingExecutionError } from './execution-error'
import type { ExecutionAdmissionGuard } from './execution-gateway'
import type { CoworkingGitReadProfile } from './git-read-profile'
import { normalizeCoworkingRelativePath } from './worktree-containment'
import type { CoworkingPublicWorktreeInstance } from './worktree-publication-state'

type CoworkingGitOperation = Extract<
  CoworkingExecutionOperation,
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

export type CoworkingGitMutationHost = {
  prepareStage(
    target: CoworkingPublicWorktreeInstance,
    relativePaths: readonly string[],
    signal: AbortSignal
  ): Promise<CoworkingPreparedGitMutation>
  prepareUnstage(
    target: CoworkingPublicWorktreeInstance,
    relativePaths: readonly string[],
    signal: AbortSignal
  ): Promise<CoworkingPreparedGitMutation>
  prepareCommit(
    target: CoworkingPublicWorktreeInstance,
    message: string,
    signal: AbortSignal
  ): Promise<CoworkingPreparedGitMutation>
}

export type CoworkingPreparedGitMutation = {
  /** No side effect may occur before this starts the subprocess or runtime transmission. */
  start(signal: AbortSignal, beforeSideEffect: () => Promise<void>): Promise<void>
}

export class CoworkingGitOperationExecutor {
  constructor(
    private readonly reads: CoworkingGitReadProfile,
    private readonly mutations: CoworkingGitMutationHost
  ) {}

  supports(operation: CoworkingExecutionOperation): operation is CoworkingGitOperation {
    return operation.kind.startsWith('git.') || operation.kind === 'files.diff'
  }

  async invoke(
    connectionId: string,
    target: CoworkingPublicWorktreeInstance,
    operation: CoworkingGitOperation,
    signal: AbortSignal,
    admissionGuard?: ExecutionAdmissionGuard
  ): Promise<
    | CoworkingFileDiffResult
    | CoworkingGitStatusResult
    | CoworkingGitDiffResult
    | CoworkingGitHistoryResult
    | CoworkingMutationResult
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
      throw asCoworkingExecutionError(error)
    }
  }

  closeConnection(connectionId: string): void {
    this.reads.closeConnection(connectionId)
  }

  private async stage(
    target: CoworkingPublicWorktreeInstance,
    relativePaths: readonly string[],
    guard: ExecutionAdmissionGuard,
    signal: AbortSignal
  ): Promise<CoworkingMutationResult> {
    const normalized = normalizeMutationPaths(relativePaths)
    const prepared = await this.mutations.prepareStage(target, normalized, signal)
    await prepared.start(signal, () => guard.beforeSideEffect())
    return { ok: true }
  }

  private async unstage(
    target: CoworkingPublicWorktreeInstance,
    relativePaths: readonly string[],
    guard: ExecutionAdmissionGuard,
    signal: AbortSignal
  ): Promise<CoworkingMutationResult> {
    const normalized = normalizeMutationPaths(relativePaths)
    const prepared = await this.mutations.prepareUnstage(target, normalized, signal)
    await prepared.start(signal, () => guard.beforeSideEffect())
    return { ok: true }
  }

  private async commit(
    target: CoworkingPublicWorktreeInstance,
    message: string,
    guard: ExecutionAdmissionGuard,
    signal: AbortSignal
  ): Promise<CoworkingMutationResult> {
    if (
      !message.trim() ||
      message.includes('\0') ||
      Buffer.byteLength(message, 'utf8') > MAX_COMMIT_MESSAGE_BYTES
    ) {
      throw new CoworkingExecutionError('invalid_argument')
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
    throw new CoworkingExecutionError('invalid_argument')
  }
  if (relativePaths.some((path) => typeof path !== 'string')) {
    throw new CoworkingExecutionError('invalid_argument')
  }
  const paths = relativePaths.map((path) => normalizeCoworkingRelativePath(path))
  if (new Set(paths).size !== paths.length) {
    throw new CoworkingExecutionError('invalid_argument')
  }
  return paths
}

function requireGuard(guard: ExecutionAdmissionGuard | undefined): ExecutionAdmissionGuard {
  if (!guard) {
    throw new CoworkingExecutionError('unauthorized')
  }
  return guard
}
