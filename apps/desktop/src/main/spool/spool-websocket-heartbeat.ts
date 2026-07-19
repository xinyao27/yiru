import type { WebSocket } from 'ws'

const SPOOL_HEARTBEAT_INTERVAL_MS = 10_000
const SPOOL_HEARTBEAT_DEADLINE_MS = 30_000

/** Detects half-open Tailnet sockets so physical-connection grants cannot linger. */
export function startSpoolWebSocketHeartbeat(
  socket: WebSocket,
  onTimeout: () => void,
  now: () => number = Date.now
): () => void {
  let lastPongAt = now()
  let stopped = false
  const recordPong = (): void => {
    lastPongAt = now()
  }
  socket.on('pong', recordPong)
  const timer = setInterval(() => {
    if (stopped || socket.readyState !== socket.OPEN) {
      return
    }
    if (now() - lastPongAt > SPOOL_HEARTBEAT_DEADLINE_MS) {
      onTimeout()
      return
    }
    try {
      socket.ping()
    } catch {
      onTimeout()
    }
  }, SPOOL_HEARTBEAT_INTERVAL_MS)
  timer.unref()
  return () => {
    if (stopped) {
      return
    }
    stopped = true
    clearInterval(timer)
    socket.off('pong', recordPong)
  }
}
