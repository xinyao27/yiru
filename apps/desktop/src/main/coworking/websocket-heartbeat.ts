import type { WebSocket } from 'ws'

const COWORKING_HEARTBEAT_INTERVAL_MS = 10_000
const COWORKING_HEARTBEAT_DEADLINE_MS = 30_000

/** Detects half-open Tailnet sockets so physical-connection grants cannot linger. */
export function startCoworkingWebSocketHeartbeat(
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
    if (now() - lastPongAt > COWORKING_HEARTBEAT_DEADLINE_MS) {
      onTimeout()
      return
    }
    try {
      socket.ping()
    } catch {
      onTimeout()
    }
  }, COWORKING_HEARTBEAT_INTERVAL_MS)
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
