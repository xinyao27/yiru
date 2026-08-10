import type { RpcClient } from './rpc-client'
import type { ConnectionState } from './types'

export type MobileConnectionPath = 'lan' | 'tailscale'

export class LogicalClientCutoverError extends Error {
  constructor() {
    super('RPC interrupted by connection migration')
  }
}

export function isLogicalClientCutoverError(error: unknown): boolean {
  return error instanceof LogicalClientCutoverError
}

export type StableLogicalRpcClient = RpcClient & {
  migrateTo(session: RpcClient, path: MobileConnectionPath, timeoutMs?: number): Promise<void>
  suspendActiveSession(): void
  getActivePath(): MobileConnectionPath
  getGeneration(): number
}

export function createStableLogicalRpcClient(
  initialSession: RpcClient,
  initialPath: MobileConnectionPath
): StableLogicalRpcClient {
  let activeSession = initialSession
  let activePath = initialPath
  let generation = 1
  let closed = false
  let suspended = false
  let activeStateUnsubscribe: (() => void) | null = null
  const stateListeners = new Set<(state: ConnectionState) => void>()
  let state = initialSession.getState()

  bindActiveState(initialSession, generation)

  const logical: StableLogicalRpcClient = {
    // Why: resolved on every access rather than captured once, so typed calls
    // always land on the session that is live now — migrateTo swaps the
    // physical client underneath this logical one.
    get orpc() {
      return activeSession.orpc
    },

    getState: () => state,
    getReconnectAttempt: () => activeSession.getReconnectAttempt(),
    getLastConnectedAt: () => activeSession.getLastConnectedAt(),
    onStateChange(listener) {
      stateListeners.add(listener)
      return () => stateListeners.delete(listener)
    },
    notifyForeground: () => {
      if (!suspended) {
        activeSession.notifyForeground()
      }
    },
    probeStatusForProtocolCompat: (timeoutMs) =>
      activeSession.probeStatusForProtocolCompat(timeoutMs),
    close() {
      if (closed) {
        return
      }
      closed = true
      activeStateUnsubscribe?.()
      activeStateUnsubscribe = null
      // Why: the physical client knows whether each request reached the wire and
      // preserves that ambiguity; a blanket logical rejection would erase it.
      activeSession.close()
      publishState('disconnected')
    },

    suspendActiveSession() {
      if (closed || suspended) {
        return
      }
      suspended = true
      activeStateUnsubscribe?.()
      activeStateUnsubscribe = null
      // Why: let the physical close settle in-flight requests with delivery
      // evidence instead of turning every suspend into a definite rejection.
      activeSession.close()
      publishState('disconnected')
    },

    async migrateTo(nextSession, path, timeoutMs = 12_000) {
      if (closed) {
        nextSession.close()
        throw new Error('Client closed')
      }
      try {
        await waitForAuthenticated(nextSession, timeoutMs)
      } catch (error) {
        nextSession.close()
        throw error
      }
      if (closed) {
        nextSession.close()
        throw new Error('Client closed')
      }
      const previous = activeSession
      const previousStateUnsubscribe = activeStateUnsubscribe
      const nextGeneration = generation + 1

      generation = nextGeneration
      activeSession = nextSession
      activePath = path
      suspended = false
      previousStateUnsubscribe?.()
      bindActiveState(nextSession, nextGeneration)
      state = nextSession.getState()
      for (const listener of stateListeners) {
        listener(state)
      }
      previous.close()
    },

    getActivePath: () => activePath,
    getGeneration: () => generation
  }

  return logical

  function bindActiveState(session: RpcClient, sessionGeneration: number): void {
    activeStateUnsubscribe = session.onStateChange((next) => {
      if (!closed && generation === sessionGeneration && session === activeSession) {
        publishState(next)
      }
    })
  }

  function publishState(next: ConnectionState): void {
    if (state === next) {
      return
    }
    state = next
    for (const listener of stateListeners) {
      listener(next)
    }
  }
}

function waitForAuthenticated(session: RpcClient, timeoutMs: number): Promise<void> {
  if (session.getState() === 'connected') {
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = session.onStateChange((state) => {
      if (state === 'connected') {
        finish()
        resolve()
      } else if (state === 'auth-failed' || state === 'disconnected') {
        finish()
        reject(new Error(`replacement session ${state}`))
      }
    })
    timer = setTimeout(() => {
      finish()
      reject(new Error('replacement session authentication timed out'))
    }, timeoutMs)

    function finish(): void {
      if (settled) {
        return
      }
      settled = true
      if (timer) {
        clearTimeout(timer)
      }
      unsubscribe()
    }
  })
}
