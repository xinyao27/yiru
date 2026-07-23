import type { PtyDataMeta } from './pty-data-meta'
import { clearPreHandlerPtyState } from './pty-pre-handler-buffer'

export const ptyDataHandlers = new Map<string, (data: string, meta?: PtyDataMeta) => void>()
/** Sidecars observe bytes after the primary renderer so auxiliary work never delays xterm. */
export const ptyDataSidecars = new Map<string, Set<(data: string) => void>>()
/** Relay replay is separate so panes can suppress xterm auto-replies while restoring output. */
export const ptyReplayHandlers = new Map<string, (data: string) => void>()
export const ptyExitHandlers = new Map<string, (code: number) => void>()
/** Transport teardown cancels closure state that could emit stale status after removal. */
export const ptyTeardownHandlers = new Map<string, () => void>()

export type PtyDataHandlerShutdownSnapshot = {
  ptyId: string
  dataHandler?: (data: string, meta?: PtyDataMeta) => void
  replayHandler?: (data: string) => void
  teardownHandler?: () => void
}

/** Silences data/status effects while teardown runs; exit ownership stays live. */
export function unregisterPtyDataHandlers(ptyIds: string[]): PtyDataHandlerShutdownSnapshot[] {
  const snapshots: PtyDataHandlerShutdownSnapshot[] = []
  for (const id of ptyIds) {
    snapshots.push({
      ptyId: id,
      dataHandler: ptyDataHandlers.get(id),
      replayHandler: ptyReplayHandlers.get(id),
      teardownHandler: ptyTeardownHandlers.get(id)
    })
    ptyDataHandlers.delete(id)
    ptyReplayHandlers.delete(id)
    ptyTeardownHandlers.get(id)?.()
    ptyTeardownHandlers.delete(id)
    clearPreHandlerPtyState(id)
  }
  return snapshots
}

export function restorePtyDataHandlersAfterFailedShutdown(
  snapshots: readonly PtyDataHandlerShutdownSnapshot[]
): void {
  for (const snapshot of snapshots) {
    if (snapshot.dataHandler) {
      ptyDataHandlers.set(snapshot.ptyId, snapshot.dataHandler)
    }
    if (snapshot.replayHandler) {
      ptyReplayHandlers.set(snapshot.ptyId, snapshot.replayHandler)
    }
    if (snapshot.teardownHandler) {
      ptyTeardownHandlers.set(snapshot.ptyId, snapshot.teardownHandler)
    }
  }
}
