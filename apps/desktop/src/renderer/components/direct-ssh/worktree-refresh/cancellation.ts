import type {
  DirectSshWorktreeRefreshAttempt,
  DirectSshWorktreeRefreshReleaseReason
} from './scheduler-contract'

export function cancelDirectSshWorktreeRefreshAttempt(
  attempt: DirectSshWorktreeRefreshAttempt,
  reason: DirectSshWorktreeRefreshReleaseReason
): boolean {
  try {
    const outcome = attempt.cancel(reason)
    return outcome !== false && outcome !== 'retained' && outcome !== 'already-settled'
  } catch {
    return true
  }
}
