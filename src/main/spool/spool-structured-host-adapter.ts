import type {
  SpoolExecutionOperation,
  SpoolSubscriptionOperation
} from '../../shared/spool/spool-operation-contract'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-publication-state'
import type {
  SpoolHostAdapter,
  SpoolHostOperationContext,
  SpoolHostSubscription
} from './spool-execution-gateway'
import { SpoolExecutionError } from './spool-execution-error'
import type { SpoolFileOperationExecutor } from './spool-file-operation-executor'
import type { SpoolGitOperationExecutor } from './spool-git-operation-executor'

export type SpoolTerminalSubscriptionHost = {
  invoke(
    target: SpoolPublicWorktreeInstance,
    operation: Extract<SpoolExecutionOperation, { kind: 'terminal.input' | 'terminal.resize' }>,
    context: SpoolHostOperationContext
  ): Promise<unknown>
  subscribe(
    target: SpoolPublicWorktreeInstance,
    operation: Extract<SpoolSubscriptionOperation, { kind: 'terminal.subscribe' }>,
    context: SpoolHostOperationContext,
    emit: (event: unknown) => void
  ): SpoolHostSubscription
  closeConnection?(connectionId: string): void
  revokeWorktree?(connectionId: string, instanceId: string): void
}

export type SpoolHistoricalSessionHost = {
  invoke(
    target: SpoolPublicWorktreeInstance,
    operation: Extract<SpoolExecutionOperation, { kind: 'session.read' | 'session.continue' }>,
    context: SpoolHostOperationContext
  ): Promise<unknown>
}

/** Composes narrow domain executors without exposing the broad runtime registry. */
export class SpoolStructuredHostAdapter implements SpoolHostAdapter {
  constructor(
    private readonly files: SpoolFileOperationExecutor,
    private readonly git: SpoolGitOperationExecutor,
    private readonly terminals: SpoolTerminalSubscriptionHost,
    private readonly sessions: SpoolHistoricalSessionHost
  ) {}

  async invoke(
    target: SpoolPublicWorktreeInstance,
    operation: SpoolExecutionOperation,
    context: SpoolHostOperationContext
  ): Promise<unknown> {
    if (
      target.ownerWorktree.kind === 'folder' &&
      (operation.kind === 'files.diff' || operation.kind.startsWith('git.'))
    ) {
      // Why: a folder workspace has no repository boundary on which Git operations can be proven.
      throw new SpoolExecutionError('method_not_found')
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
    if (operation.kind === 'terminal.input' || operation.kind === 'terminal.resize') {
      return await this.terminals.invoke(target, operation, context)
    }
    if (operation.kind === 'session.read' || operation.kind === 'session.continue') {
      return await this.sessions.invoke(target, operation, context)
    }
    throw new SpoolExecutionError('method_not_found')
  }

  subscribe(
    target: SpoolPublicWorktreeInstance,
    operation: SpoolSubscriptionOperation,
    context: SpoolHostOperationContext,
    emit: (event: unknown) => void
  ): SpoolHostSubscription {
    if (operation.kind !== 'terminal.subscribe') {
      throw new SpoolExecutionError('method_not_found')
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
