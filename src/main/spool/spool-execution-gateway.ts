import type {
  SpoolExecutionOperation,
  SpoolExecutionResult,
  SpoolSubscriptionEvent,
  SpoolSubscriptionOperation,
  SpoolTerminalCreateHostResult
} from '../../shared/spool/spool-operation-contract'
import { isSpoolMutationOperation } from '../../shared/spool/spool-operation-contract'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-publication-state'
import { asSpoolExecutionError, SpoolExecutionError } from './spool-execution-error'
import { linkSpoolOperationAbort } from './spool-operation-abort-link'
import {
  spoolTerminalCreateFingerprint,
  SpoolTerminalCreateLedger
} from './spool-terminal-create-ledger'
import {
  SpoolTerminalSubscriptionCapacity,
  type SpoolHostSubscription
} from './spool-terminal-subscription-capacity'

export type { SpoolHostSubscription } from './spool-terminal-subscription-capacity'

export type BoundWorktreeTarget = {
  connectionId: string
  worktree: SpoolPublicWorktreeInstance
  isCurrent(): boolean
  subscribeInvalidation?: (listener: () => void) => () => void
}

export type ExecutionAdmissionGuard = {
  beforeSideEffect(): Promise<void>
}

export type SpoolHostOperationContext = {
  connectionId: string
  signal: AbortSignal
  admissionGuard?: ExecutionAdmissionGuard
  origin: 'spool-owner'
}

export type SpoolHostAdapter = {
  invoke(
    target: SpoolPublicWorktreeInstance,
    operation: SpoolExecutionOperation,
    context: SpoolHostOperationContext
  ): Promise<unknown>
  subscribe(
    target: SpoolPublicWorktreeInstance,
    operation: SpoolSubscriptionOperation,
    context: SpoolHostOperationContext,
    emit: (event: unknown) => void
  ): SpoolHostSubscription
  closeConnection?(connectionId: string): void
  revokeWorktree?(connectionId: string, instanceId: string): void
}

export type SpoolExecutionGatewayOptions = {
  resolveAdapter(target: SpoolPublicWorktreeInstance): SpoolHostAdapter | null
  captureControlGeneration(target: BoundWorktreeTarget): string
  revalidateTarget(target: BoundWorktreeTarget): Promise<boolean>
}

export class SpoolExecutionGateway {
  private readonly connectionOperations = new Map<string, Map<AbortController, string>>()
  private readonly subscriptionCapacity = new SpoolTerminalSubscriptionCapacity()
  private readonly connectionAdapters = new Map<string, Set<SpoolHostAdapter>>()
  private readonly terminalCreates = new SpoolTerminalCreateLedger()

  constructor(private readonly options: SpoolExecutionGatewayOptions) {}

  async invoke<TOperation extends SpoolExecutionOperation>(
    target: BoundWorktreeTarget,
    operation: TOperation,
    callerSignal?: AbortSignal
  ): Promise<SpoolExecutionResult<TOperation>> {
    this.requireCurrent(target)
    const admissionGuard = isSpoolMutationOperation(operation)
      ? this.createAdmissionGuard(target)
      : undefined
    const adapter = this.requireAdapter(target)
    const abortLink = linkSpoolOperationAbort(callerSignal)
    const { controller } = abortLink
    this.trackOperation(target.connectionId, target.worktree.instanceId, controller)
    let unsubscribeInvalidation: (() => void) | undefined
    try {
      unsubscribeInvalidation = target.subscribeInvalidation?.(() => controller.abort())
      controller.signal.throwIfAborted()
      const invokeAdapter = async (): Promise<unknown> =>
        await adapter.invoke(target.worktree, operation, {
          connectionId: target.connectionId,
          signal: controller.signal,
          ...(admissionGuard ? { admissionGuard } : {}),
          origin: 'spool-owner'
        })
      const result =
        operation.kind === 'terminal.create'
          ? await this.terminalCreates.run(
              {
                connectionId: target.connectionId,
                instanceId: target.worktree.instanceId,
                shareEpoch: target.worktree.shareEpoch,
                spoolIncarnationId: target.worktree.spoolIncarnationId,
                clientMutationId: operation.clientMutationId,
                fingerprint: spoolTerminalCreateFingerprint(operation.launch)
              },
              async () => (await invokeAdapter()) as SpoolTerminalCreateHostResult
            )
          : await invokeAdapter()
      if (!isSpoolMutationOperation(operation)) {
        // Why: a read that finished after an actual-host replacement must never be enqueued.
        if (!(await this.options.revalidateTarget(target))) {
          throw new SpoolExecutionError('resource_not_found')
        }
        this.requireCurrent(target)
      }
      return result as SpoolExecutionResult<TOperation>
    } catch (error) {
      throw asSpoolExecutionError(error)
    } finally {
      try {
        unsubscribeInvalidation?.()
      } finally {
        try {
          abortLink.unlink()
        } finally {
          this.untrackOperation(target.connectionId, controller)
        }
      }
    }
  }

  async subscribe<TOperation extends SpoolSubscriptionOperation>(
    target: BoundWorktreeTarget,
    operation: TOperation,
    emit: (event: SpoolSubscriptionEvent<TOperation>) => void
  ): Promise<SpoolHostSubscription> {
    this.requireCurrent(target)
    if (!(await this.options.revalidateTarget(target))) {
      throw new SpoolExecutionError('resource_not_found')
    }
    this.requireCurrent(target)
    const adapter = this.requireAdapter(target)
    const controller = new AbortController()
    this.trackOperation(target.connectionId, target.worktree.instanceId, controller)
    let closed = false
    let downstream: SpoolHostSubscription | null = null
    let unsubscribeInvalidation: (() => void) | null = null
    const subscription: SpoolHostSubscription = {
      close: () => {
        if (closed) {
          return
        }
        closed = true
        controller.abort()
        try {
          downstream?.close()
        } finally {
          try {
            unsubscribeInvalidation?.()
          } finally {
            this.untrackOperation(target.connectionId, controller)
            this.subscriptionCapacity.release(target.connectionId, subscription)
          }
        }
      }
    }
    try {
      // Why: reserve before opening the host stream so concurrent requests cannot bypass the cap.
      this.subscriptionCapacity.reserve(
        target.connectionId,
        target.worktree.instanceId,
        subscription
      )
      downstream = adapter.subscribe(
        target.worktree,
        operation,
        {
          connectionId: target.connectionId,
          signal: controller.signal,
          origin: 'spool-owner'
        },
        (event) => {
          if (closed) {
            return
          }
          if (!target.isCurrent()) {
            subscription.close()
            return
          }
          try {
            const projectedEvent = event as SpoolSubscriptionEvent<TOperation>
            emit(projectedEvent)
            if (projectedEvent.kind === 'closed' || projectedEvent.kind === 'unavailable') {
              // Why: downstream completion must release the per-worktree slot even if the client
              // keeps the rendered terminal mounted and never sends an explicit unsubscribe.
              subscription.close()
            }
          } catch {
            subscription.close()
          }
        }
      )
      unsubscribeInvalidation = target.subscribeInvalidation?.(() => subscription.close()) ?? null
      if (closed) {
        downstream.close()
        unsubscribeInvalidation?.()
        throw new SpoolExecutionError('resource_not_found')
      }
      if (!target.isCurrent()) {
        subscription.close()
        throw new SpoolExecutionError('resource_not_found')
      }
    } catch (error) {
      subscription.close()
      throw asSpoolExecutionError(error)
    }
    return subscription
  }

  closeConnection(connectionId: string): void {
    this.subscriptionCapacity.closeConnection(connectionId)
    this.terminalCreates.closeConnection(connectionId)
    const operations = this.connectionOperations.get(connectionId)
    this.connectionOperations.delete(connectionId)
    for (const controller of operations?.keys() ?? []) {
      controller.abort()
    }
    const adapters = this.connectionAdapters.get(connectionId)
    this.connectionAdapters.delete(connectionId)
    for (const adapter of adapters ?? []) {
      try {
        adapter.closeConnection?.(connectionId)
      } catch {
        // One host cleanup must not retain resources on another execution host.
      }
    }
  }

  revokeWorktree(connectionId: string, instanceId: string): void {
    this.subscriptionCapacity.closeWorktree(connectionId, instanceId)
    for (const [controller, operationInstanceId] of this.connectionOperations.get(connectionId) ??
      []) {
      if (operationInstanceId === instanceId) {
        controller.abort()
      }
    }
    for (const adapter of this.connectionAdapters.get(connectionId) ?? []) {
      try {
        adapter.revokeWorktree?.(connectionId, instanceId)
      } catch {
        // Authority is already gone; continue releasing other host resources.
      }
    }
  }

  private createAdmissionGuard(target: BoundWorktreeTarget): ExecutionAdmissionGuard {
    const expectedGeneration = this.captureGeneration(target)
    return {
      beforeSideEffect: async () => {
        if (!(await this.options.revalidateTarget(target))) {
          throw new SpoolExecutionError('resource_not_found')
        }
        this.requireCurrent(target)
        if (this.captureGeneration(target) !== expectedGeneration) {
          // Why: revoke followed by a new approval must not revive an older queued mutation.
          throw new SpoolExecutionError('unauthorized')
        }
      }
    }
  }

  private captureGeneration(target: BoundWorktreeTarget): string {
    try {
      const generation = this.options.captureControlGeneration(target)
      if (!generation) {
        throw new SpoolExecutionError('unauthorized')
      }
      return generation
    } catch (error) {
      throw asSpoolExecutionError(error, 'unauthorized')
    }
  }

  private requireCurrent(target: BoundWorktreeTarget): void {
    if (!target.connectionId || !target.isCurrent()) {
      throw new SpoolExecutionError('resource_not_found')
    }
  }

  private requireAdapter(target: BoundWorktreeTarget): SpoolHostAdapter {
    const adapter = this.options.resolveAdapter(target.worktree)
    if (!adapter) {
      throw new SpoolExecutionError('resource_unavailable')
    }
    let adapters = this.connectionAdapters.get(target.connectionId)
    if (!adapters) {
      adapters = new Set()
      this.connectionAdapters.set(target.connectionId, adapters)
    }
    adapters.add(adapter)
    return adapter
  }

  private trackOperation(
    connectionId: string,
    instanceId: string,
    controller: AbortController
  ): void {
    let operations = this.connectionOperations.get(connectionId)
    if (!operations) {
      operations = new Map()
      this.connectionOperations.set(connectionId, operations)
    }
    operations.set(controller, instanceId)
  }

  private untrackOperation(connectionId: string, controller: AbortController): void {
    const operations = this.connectionOperations.get(connectionId)
    operations?.delete(controller)
    if (operations?.size === 0) {
      this.connectionOperations.delete(connectionId)
    }
  }
}
