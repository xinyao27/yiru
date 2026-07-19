import { readRequesterControlState } from './spool-control-state-wire-validation'
import type { SpoolDesktopRecord } from './spool-desktop-record'
import type { SpoolSubscription } from './spool-peer-connection-contract'

export function ensureSpoolControlSubscription(
  record: SpoolDesktopRecord,
  worktreeRef: string,
  emit: () => void
): void {
  if (!record.connection || record.controlSubscriptions.has(worktreeRef)) {
    return
  }
  const connection = record.connection
  const connectionEpoch = record.connectionEpoch
  let subscription: SpoolSubscription | null = null
  const release = (): void => {
    if (subscription && record.controlSubscriptions.get(worktreeRef) === subscription) {
      record.controlSubscriptions.delete(worktreeRef)
      record.controlStates.delete(worktreeRef)
      emit()
    }
  }
  subscription = connection.subscribe<unknown>(
    'control.subscribe',
    { worktreeRef },
    {
      next: (value) => {
        const state = readRequesterControlState(value, worktreeRef)
        if (!state) {
          throw new Error('invalid_spool_control_state')
        }
        if (record.connectionEpoch === connectionEpoch) {
          record.controlStates.set(worktreeRef, {
            desktopRef: record.descriptor.desktopRef,
            worktreeRef,
            connectionEpoch,
            status: state.status,
            ...(state.approvedAt === undefined ? {} : { approvedAt: state.approvedAt })
          })
          emit()
        }
      },
      error: release,
      complete: release
    }
  )
  if (
    record.connection === connection &&
    record.status === 'connected' &&
    record.connectionEpoch === connectionEpoch
  ) {
    record.controlSubscriptions.set(worktreeRef, subscription)
  } else {
    subscription.close()
  }
}
