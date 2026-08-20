import type { WorkspaceSessionPatch, WorkspaceSessionState } from '~shared/types'

import type { Store } from '../persistence'

type ShellSessionService = ReturnType<typeof createShellSessionService>

let shellSessionService: ShellSessionService | null = null

export function initializeShellSessionService(store: Store): void {
  shellSessionService = createShellSessionService(store)
}

export function getShellSessionService(): ShellSessionService {
  if (!shellSessionService) {
    throw new Error('shell_session_service_unavailable')
  }
  return shellSessionService
}

function createShellSessionService(store: Store) {
  return {
    get: (hostId?: string | null): WorkspaceSessionState =>
      hydrateTerminalScrollback(store, store.getWorkspaceSession(hostId)),
    set: (session: WorkspaceSessionState, hostId?: string | null): void =>
      store.setWorkspaceSession(session, hostId),
    patch: (patch: WorkspaceSessionPatch, hostId?: string | null): void =>
      store.patchWorkspaceSession(patch, hostId),
    // Why: durable lifecycle RPCs must propagate disk failures instead of
    // returning success through Store.flush(), which intentionally only logs.
    flush: (): void => store.flushOrThrow()
  }
}

function hydrateTerminalScrollback(
  store: Store,
  session: WorkspaceSessionState
): WorkspaceSessionState {
  let changed = false
  const terminalLayoutsByTabId = Object.fromEntries(
    Object.entries(session.terminalLayoutsByTabId).map(([tabId, layout]) => {
      if (!layout.scrollbackRefsByLeafId) {
        return [tabId, layout]
      }
      const buffersByLeafId = { ...layout.buffersByLeafId }
      let layoutChanged = false
      for (const [leafId, ref] of Object.entries(layout.scrollbackRefsByLeafId)) {
        if (buffersByLeafId[leafId] !== undefined) {
          continue
        }
        const buffer = store.readTerminalScrollbackSnapshot(ref)
        if (buffer !== null) {
          buffersByLeafId[leafId] = buffer
          changed = true
          layoutChanged = true
        }
      }
      return [tabId, layoutChanged ? { ...layout, buffersByLeafId } : layout]
    })
  )
  return changed ? { ...session, terminalLayoutsByTabId } : session
}
