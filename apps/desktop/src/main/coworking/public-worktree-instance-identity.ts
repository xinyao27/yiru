import type { CoworkingPublicWorktreeInstance } from './worktree-visibility'

export function isSameCoworkingPublicWorktreeInstance(
  left: CoworkingPublicWorktreeInstance,
  right: CoworkingPublicWorktreeInstance
): boolean {
  return (
    left.worktreeId === right.worktreeId &&
    left.instanceId === right.instanceId &&
    left.shareEpoch === right.shareEpoch &&
    left.coworkingIncarnationId === right.coworkingIncarnationId &&
    left.actualHostScope === right.actualHostScope
  )
}
