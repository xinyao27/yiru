import type { SpoolPublicWorktreeInstance } from './spool-worktree-visibility'

export function isSameSpoolPublicWorktreeInstance(
  left: SpoolPublicWorktreeInstance,
  right: SpoolPublicWorktreeInstance
): boolean {
  return (
    left.worktreeId === right.worktreeId &&
    left.instanceId === right.instanceId &&
    left.shareEpoch === right.shareEpoch &&
    left.spoolIncarnationId === right.spoolIncarnationId &&
    left.actualHostScope === right.actualHostScope
  )
}
