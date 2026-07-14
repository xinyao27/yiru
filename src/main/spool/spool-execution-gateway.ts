import type {
  SpoolExecutionOperation,
  SpoolExecutionResult,
  SpoolSubscriptionEvent,
  SpoolSubscriptionOperation
} from '../../shared/spool/spool-operation-contract'
import { isSpoolMutationOperation } from '../../shared/spool/spool-operation-contract'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-publication-state'
import { asSpoolExecutionError, SpoolExecutionError } from './spool-execution-error'

export type BoundWorktreeTarget = {
  connectionId: string
  worktree: SpoolPublicWorktreeInstance
  isCurrent(): boolean
  subscribeInvalidation?: (listener: () => void) => () => void
}

export type ExecutionAdmissionGuard = {
  beforeSideEffect(): Promise<void>
}

export type SpoolHostSubscription = {
  close(): void
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
  private readonly connectionSubscriptions = new Map<string, Set<SpoolHostSubscription>>()
  private readonly connectionAdapters = new Map<string, Set<SpoolHostAdapter>>()

  constructor(private readonly options: SpoolExecutionGatewayOptions) {}

  async invoke<TOperation extends SpoolExecutionOperation>(
    target: BoundWorktreeTarget,
    operation: TOperation
  ): Promise<SpoolExecutionResult<TOperation>> {
    this.requireCurrent(target)
    const admissionGuard = isSpoolMutationOperation(operation)
      ? this.createAdmissionGuard(target)
      : undefined
    const adapter = this.requireAdapter(target)
    const controller = new AbortController()
    this.trackOperation(target.connectionId, target.worktree.instanceId, controller)
    const unsubscribeInvalidation = target.subscribeInvalidation?.(() => controller.abort())
    try {
      const result = await adapter.invoke(target.worktree, operation, {
        connectionId: target.connectionId,
        signal: controller.signal,
        ...(admissionGuard ? { admissionGuard } : {}),
        origin: 'spool-owner'
      })
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
        this.untrackOperation(target.connectionId, controller)
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
            this.connectionSubscriptions.get(target.connectionId)?.delete(subscription)
          }
        }
      }
    }
    try {
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
            emit(event as SpoolSubscriptionEvent<TOperation>)
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
    this.addSubscription(target.connectionId, subscription)
    return subscription
  }

  closeConnection(connectionId: string): void {
    const subscriptions = this.connectionSubscriptions.get(connectionId)
    this.connectionSubscriptions.delete(connectionId)
    for (const subscription of subscriptions ?? []) {
      try {
        subscription.close()
      } catch {
        // The connection has already lost authority; continue releasing siblings.
      }
    }
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

  private addSubscription(connectionId: string, subscription: SpoolHostSubscription): void {
    let subscriptions = this.connectionSubscriptions.get(connectionId)
    if (!subscriptions) {
      subscriptions = new Set()
      this.connectionSubscriptions.set(connectionId, subscriptions)
    }
    subscriptions.add(subscription)
  }
}
