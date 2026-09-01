import {
  shouldReconcileDeadSession,
  shouldReconcileMissingSession,
  type HasPty
} from '../terminal-dead-session-reconcile'
import type { ExitSession } from './exit-session'
import type { PaneBinding } from './pane-binding'
import type { PtyTransport } from './transport-types'

type SessionReconcilerOptions = {
  transport: PtyTransport
  exitSession: ExitSession
  paneBinding: PaneBinding
  getIsDisposed: () => boolean
}

export type SessionReconciler = {
  reconcileDead: (liveSessionIds: Set<string>, snapshotRequestedAt?: number) => void
  reconcileMissing: (hasPty: HasPty, livenessRequestedAt?: number) => void
}

export function createSessionReconciler(options: SessionReconcilerOptions): SessionReconciler {
  const reconcileDead = (liveSessionIds: Set<string>, snapshotRequestedAt?: number): void => {
    if (options.getIsDisposed()) {
      return
    }
    const ptyId = options.transport.getPtyId()
    if (
      !ptyId ||
      options.exitSession.hasHandled(ptyId) ||
      !shouldReconcileDeadSession({
        ptyId,
        connectionId: options.transport.getConnectionId?.(),
        liveSessionIds,
        ptyBoundAt: options.paneBinding.getBoundAt(),
        snapshotRequestedAt
      })
    ) {
      return
    }
    options.exitSession.onExit(ptyId)
  }
  const reconcileMissing = (hasPty: HasPty, livenessRequestedAt = performance.now()): void => {
    const requestedPtyId = options.transport.getPtyId()
    if (
      !requestedPtyId ||
      options.exitSession.hasHandled(requestedPtyId) ||
      options.transport.getConnectionId?.() != null
    ) {
      return
    }
    let liveness: Promise<boolean | null>
    try {
      liveness = Promise.resolve(hasPty(requestedPtyId))
    } catch {
      return
    }
    void liveness
      .then((isLive) => {
        if (options.getIsDisposed()) {
          return
        }
        const currentPtyId = options.transport.getPtyId()
        if (
          !currentPtyId ||
          currentPtyId !== requestedPtyId ||
          options.exitSession.hasHandled(currentPtyId) ||
          !shouldReconcileMissingSession({
            ptyId: currentPtyId,
            connectionId: options.transport.getConnectionId?.(),
            isLive,
            ptyBoundAt: options.paneBinding.getBoundAt(),
            livenessRequestedAt
          })
        ) {
          return
        }
        options.exitSession.onExit(currentPtyId)
      })
      .catch(() => {})
  }
  return { reconcileDead, reconcileMissing }
}
