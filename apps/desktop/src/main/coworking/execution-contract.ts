import type {
  CoworkingExecutionOperation,
  CoworkingSubscriptionOperation
} from '../../shared/coworking/operation-contract'
import type { CoworkingHostSubscription } from './terminal-subscription-capacity'
import type { CoworkingPublicWorktreeInstance } from './worktree-publication-state'

export type BoundWorktreeTarget = {
  connectionId: string
  worktree: CoworkingPublicWorktreeInstance
  isCurrent(): boolean
  subscribeInvalidation?: (listener: () => void) => () => void
}

export type ExecutionAdmissionGuard = {
  beforeSideEffect(): Promise<void>
}

export type CoworkingHostOperationContext = {
  connectionId: string
  signal: AbortSignal
  admissionGuard?: ExecutionAdmissionGuard
  origin: 'coworking-owner'
}

export type CoworkingHostAdapter = {
  invoke(
    target: CoworkingPublicWorktreeInstance,
    operation: CoworkingExecutionOperation,
    context: CoworkingHostOperationContext
  ): Promise<unknown>
  subscribe(
    target: CoworkingPublicWorktreeInstance,
    operation: CoworkingSubscriptionOperation,
    context: CoworkingHostOperationContext,
    emit: (event: unknown) => void
  ): CoworkingHostSubscription
  closeConnection?(connectionId: string): void
  revokeWorktree?(connectionId: string, instanceId: string): void
}

export type CoworkingExecutionGatewayOptions = {
  resolveAdapter(target: CoworkingPublicWorktreeInstance): CoworkingHostAdapter | null
  captureControlGeneration(target: BoundWorktreeTarget): string
  revalidateTarget(target: BoundWorktreeTarget): Promise<boolean>
}
