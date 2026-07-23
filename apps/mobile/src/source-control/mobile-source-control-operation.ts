import {
  resolveSourceControlOperationFollowUp,
  type SourceControlOperationFollowUp,
  type SourceControlRemoteOperationOutcome,
  type SourceControlRemoteOpKind
} from '@yiru/workbench-model/review'

export type MobileSourceControlWorkflowResult = {
  syncPushed?: boolean
}

export type RunMobileSourceControlWorkflow = (
  actionId: string,
  runner: () => Promise<MobileSourceControlWorkflowResult | void>,
  options?: { clearCommitMessage?: boolean }
) => Promise<boolean>

const mobileSyncPushStageErrors = new WeakSet<object>()
// Why: create-review intent can hide a publish/push prerequisite behind one
// action id; tag only the thrown object without mutating provider errors.
const mobileRemoteOperationErrors = new WeakMap<object, SourceControlRemoteOpKind>()

export function getMobileSourceControlRemoteOperation(
  actionId: string | null,
  error?: unknown
): SourceControlRemoteOpKind | null {
  switch (actionId) {
    case 'push':
    case 'commit-push':
    case 'push-create-pr':
      return 'push'
    case 'force-push':
      return 'force_push'
    case 'pull':
      return 'pull'
    case 'sync':
    case 'commit-sync':
      return 'sync'
    case 'fetch':
      return 'fetch'
    case 'publish':
      return 'publish'
    case 'fast-forward':
      return 'fast_forward'
    case 'rebase':
      return 'rebase'
    default:
      return isObjectLike(error) ? (mobileRemoteOperationErrors.get(error) ?? null) : null
  }
}

export function resolveMobileSourceControlOperationFollowUp(
  actionId: string,
  outcome: SourceControlRemoteOperationOutcome,
  result?: MobileSourceControlWorkflowResult | void
): SourceControlOperationFollowUp | null {
  const operation = getMobileSourceControlRemoteOperation(actionId)
  return operation
    ? resolveSourceControlOperationFollowUp({
        operation,
        outcome,
        syncPushed: result?.syncPushed
      })
    : null
}

export function applyMobileHostedReviewRefresh(
  actionId: string,
  followUp: SourceControlOperationFollowUp | null,
  refresh: (() => void) | undefined
): void {
  // Why: review creation does not move HEAD, so the controller's head-change
  // effect cannot replace its previous no-review state.
  if (actionId === 'create-pr' || followUp?.refreshHostedReview) {
    refresh?.()
  }
}

export function markMobileSyncPushStageError<T>(error: T): T {
  if (isObjectLike(error)) {
    mobileSyncPushStageErrors.add(error)
  }
  return error
}

export function isMobileSyncPushStageError(error: unknown): boolean {
  return isObjectLike(error) && mobileSyncPushStageErrors.has(error)
}

export function markMobileRemoteOperationError<T>(
  error: T,
  operation: SourceControlRemoteOpKind
): T {
  if (isObjectLike(error)) {
    mobileRemoteOperationErrors.set(error, operation)
  }
  return error
}

function isObjectLike(value: unknown): value is object {
  return (typeof value === 'object' && value !== null) || typeof value === 'function'
}
