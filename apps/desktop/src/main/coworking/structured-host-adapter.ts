import type {
  CoworkingExecutionOperation,
  CoworkingSubscriptionOperation
} from '../../shared/coworking/operation-contract'
import { CoworkingExecutionError } from './execution-error'
import type {
  CoworkingHostAdapter,
  CoworkingHostOperationContext,
  CoworkingHostSubscription
} from './execution-gateway'
import type { CoworkingFileOperationExecutor } from './file-operation-executor'
import type { CoworkingGitOperationExecutor } from './git-operation-executor'
import type { CoworkingPublicWorktreeInstance } from './worktree-publication-state'

export type CoworkingTerminalHost = {
  invoke(
    target: CoworkingPublicWorktreeInstance,
    operation: Extract<
      CoworkingExecutionOperation,
      {
        kind: 'terminal.input' | 'terminal.resize' | 'terminal.launchOptions' | 'terminal.create'
      }
    >,
    context: CoworkingHostOperationContext
  ): Promise<unknown>
  subscribe(
    target: CoworkingPublicWorktreeInstance,
    operation: Extract<CoworkingSubscriptionOperation, { kind: 'terminal.subscribe' }>,
    context: CoworkingHostOperationContext,
    emit: (event: unknown) => void
  ): CoworkingHostSubscription
  closeConnection?(connectionId: string): void
  revokeWorktree?(connectionId: string, instanceId: string): void
}

export type CoworkingHistoricalSessionHost = {
  invoke(
    target: CoworkingPublicWorktreeInstance,
    operation: Extract<CoworkingExecutionOperation, { kind: 'session.continue' }>,
    context: CoworkingHostOperationContext
  ): Promise<unknown>
}

export type CoworkingChecksHost = {
  invoke(
    target: CoworkingPublicWorktreeInstance,
    operation: Extract<CoworkingExecutionOperation, { kind: 'checks.read' }>,
    signal: AbortSignal
  ): Promise<unknown>
}

/** Composes narrow domain executors without exposing the broad runtime registry. */
export class CoworkingStructuredHostAdapter implements CoworkingHostAdapter {
  constructor(
    private readonly files: CoworkingFileOperationExecutor,
    private readonly git: CoworkingGitOperationExecutor,
    private readonly checks: CoworkingChecksHost,
    private readonly terminals: CoworkingTerminalHost,
    private readonly sessions: CoworkingHistoricalSessionHost
  ) {}

  async invoke(
    target: CoworkingPublicWorktreeInstance,
    operation: CoworkingExecutionOperation,
    context: CoworkingHostOperationContext
  ): Promise<unknown> {
    if (
      target.ownerWorktree.kind === 'folder' &&
      (operation.kind === 'files.diff' ||
        operation.kind.startsWith('git.') ||
        operation.kind === 'checks.read')
    ) {
      // Why: a folder workspace has no repository boundary on which Git operations can be proven.
      throw new CoworkingExecutionError('method_not_found')
    }
    if (this.files.supports(operation)) {
      return await this.files.invoke(target, operation, context.signal, context.admissionGuard)
    }
    if (this.git.supports(operation)) {
      return await this.git.invoke(
        context.connectionId,
        target,
        operation,
        context.signal,
        context.admissionGuard
      )
    }
    if (operation.kind === 'checks.read') {
      return await this.checks.invoke(target, operation, context.signal)
    }
    if (
      operation.kind === 'terminal.input' ||
      operation.kind === 'terminal.resize' ||
      operation.kind === 'terminal.launchOptions' ||
      operation.kind === 'terminal.create'
    ) {
      return await this.terminals.invoke(target, operation, context)
    }
    if (operation.kind === 'session.continue') {
      return await this.sessions.invoke(target, operation, context)
    }
    throw new CoworkingExecutionError('method_not_found')
  }

  subscribe(
    target: CoworkingPublicWorktreeInstance,
    operation: CoworkingSubscriptionOperation,
    context: CoworkingHostOperationContext,
    emit: (event: unknown) => void
  ): CoworkingHostSubscription {
    if (operation.kind !== 'terminal.subscribe') {
      throw new CoworkingExecutionError('method_not_found')
    }
    return this.terminals.subscribe(target, operation, context, emit)
  }

  closeConnection(connectionId: string): void {
    this.git.closeConnection(connectionId)
    this.terminals.closeConnection?.(connectionId)
  }

  revokeWorktree(connectionId: string, instanceId: string): void {
    this.terminals.revokeWorktree?.(connectionId, instanceId)
  }
}
