import type { SshTarget } from '@yiru/runtime-protocol/ssh-connection'
import { isRuntimeOwnedSshTargetId } from '@yiru/workbench-model/workspace'

type OrphanedRuntimeSshTargetStore = {
  getSshTargets: () => SshTarget[]
  removeSshTarget: (id: string) => void
}

type RemoveOrphanedRuntimeSshTargetsArgs = {
  store: OrphanedRuntimeSshTargetStore
  log?: (message: string) => void
}

// Why: ephemeral VMs were the only producer of `runtime-ssh-` targets and were
// removed in P3b, so any left in a user's store is dead state that the renderer
// merely hides behind `isRuntimeOwnedSshTargetId`. Sweep it at launch instead of
// carrying the filter forever. Idempotent: a second run finds nothing to remove.
export function removeOrphanedRuntimeOwnedSshTargets({
  store,
  log
}: RemoveOrphanedRuntimeSshTargetsArgs): number {
  let targets: SshTarget[]
  try {
    targets = store.getSshTargets()
  } catch {
    // Why: an unreadable target list must not abort startup; a later launch retries.
    return 0
  }

  const orphaned = targets.filter((target) => isRuntimeOwnedSshTargetId(target.id))
  for (const target of orphaned) {
    store.removeSshTarget(target.id)
  }

  if (orphaned.length > 0) {
    const writeLog = log ?? console.info
    writeLog(
      `[ssh] Removed ${orphaned.length} orphaned runtime-owned SSH target(s) left by ephemeral VMs`
    )
  }
  return orphaned.length
}
