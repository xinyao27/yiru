import {
  WORKSPACE_CLEANUP_CLASSIFIER_VERSION,
  type WorkspaceCleanupDismissal
} from '~shared/workspace/cleanup'

import type { Store } from '../persistence'
import { scanWorkspaceCleanup } from './scan'

export { scanWorkspaceCleanup }

// Why: dismissals merge into the host's shared UI document rather than
// replace it outright — `updateUI` overwrites the `workspaceCleanup` key
// wholesale, so a concurrent dismissal from another paired client would be
// lost if this read-modify-write happened at the call site instead of here.
// Takes `getUI`/`updateUI` as separate parameters rather than a
// `Pick<Store, ...>` object because those members are optional on the
// runtime service's store facade, and narrowing a guard on individual
// member access at the call site does not narrow the object as a whole.
export function dismissWorkspaceCleanupCandidates(
  getUI: Store['getUI'],
  updateUI: Store['updateUI'],
  dismissals: readonly WorkspaceCleanupDismissal[]
): Record<string, WorkspaceCleanupDismissal> {
  const current = getUI().workspaceCleanup?.dismissals ?? {}
  const next = { ...current }
  for (const dismissal of dismissals) {
    if (
      dismissal &&
      dismissal.classifierVersion === WORKSPACE_CLEANUP_CLASSIFIER_VERSION &&
      typeof dismissal.worktreeId === 'string' &&
      typeof dismissal.fingerprint === 'string'
    ) {
      next[dismissal.worktreeId] = dismissal
    }
  }
  updateUI({ workspaceCleanup: { dismissals: next } })
  return next
}

export function clearWorkspaceCleanupDismissals(
  updateUI: Store['updateUI']
): Record<string, WorkspaceCleanupDismissal> {
  updateUI({ workspaceCleanup: { dismissals: {} } })
  return {}
}
