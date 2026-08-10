import type { WebContents } from 'electron'

import type { BrowserPageCdpEvent, BrowserPageCdpLease } from './page/handle'

type DebuggerLeaseState = {
  attachedByLease: boolean
  owners: Set<symbol>
}

const debuggerLeases = new WeakMap<WebContents, DebuggerLeaseState>()

export function acquireElectronDebugger(webContents: WebContents): BrowserPageCdpLease {
  if (webContents.isDestroyed()) {
    throw new Error('Browser tab is no longer available')
  }

  const dbg = webContents.debugger
  let state = debuggerLeases.get(webContents)
  if (!state) {
    state = { attachedByLease: false, owners: new Set() }
    debuggerLeases.set(webContents, state)
  }

  if (!dbg.isAttached()) {
    dbg.attach('1.3')
    state.attachedByLease = true
  }

  const owner = Symbol('electron-debugger-lease')
  state.owners.add(owner)
  let released = false
  const subscriptions = new Set<() => void>()

  return {
    isConnected: () => !released && !webContents.isDestroyed() && dbg.isAttached(),
    sendCommand: async (method, params = {}, sessionId) => {
      if (released || webContents.isDestroyed() || !dbg.isAttached()) {
        throw new Error('Browser debugger is no longer attached')
      }
      return sessionId
        ? await dbg.sendCommand(method, params, sessionId)
        : await dbg.sendCommand(method, params)
    },
    subscribe: (listener) => {
      if (released) {
        return () => {}
      }
      const onMessage = (
        _event: unknown,
        method: string,
        params: unknown,
        sessionId?: string
      ): void => {
        const event: BrowserPageCdpEvent = {
          type: 'message',
          method,
          params: params && typeof params === 'object' ? (params as Record<string, unknown>) : {},
          ...(sessionId ? { sessionId } : {})
        }
        listener(event)
      }
      const onDetach = (_event: unknown, reason?: string): void => {
        listener({ type: 'detached', ...(reason ? { reason } : {}) })
      }
      dbg.on('message', onMessage)
      dbg.on('detach', onDetach)
      const unsubscribe = (): void => {
        dbg.removeListener('message', onMessage)
        dbg.removeListener('detach', onDetach)
        subscriptions.delete(unsubscribe)
      }
      subscriptions.add(unsubscribe)
      return unsubscribe
    },
    release: () => {
      if (released) {
        return
      }
      released = true
      for (const unsubscribe of subscriptions) {
        unsubscribe()
      }
      state.owners.delete(owner)
      if (state.owners.size > 0) {
        return
      }
      debuggerLeases.delete(webContents)
      if (!state.attachedByLease || !dbg.isAttached()) {
        return
      }
      try {
        dbg.detach()
      } catch {
        // Best-effort release: the tab may already be gone or DevTools may
        // have taken ownership after Electron emitted a detach event.
      }
    }
  }
}
