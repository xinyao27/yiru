import type {
  SpoolExecutionOperation,
  SpoolSubscriptionOperation
} from '../../shared/spool/spool-operation-contract'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-publication-state'
import type { SpoolHostSubscription } from './spool-terminal-subscription-capacity'

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
