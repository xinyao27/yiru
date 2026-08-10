// Why: RN auto-pongs WebSocket pings natively, so JS needs an app-level
// liveness probe to detect half-open sockets. Any inbound app traffic after a
// probe starts proves the link is alive; otherwise an unanswered probe
// force-closes the socket so the reconnect path can recover.
const ACTIVITY_PROBE_INTERVAL_MS = 20_000
const ACTIVITY_PROBE_TIMEOUT_MS = 8_000

type MobileRpcActivityProbeOptions = {
  isConnected: () => boolean
  currentSocket: () => WebSocket | null
  nextRequestId: () => string
  // Monotonic count of validated inbound frames. Growth during a probe window
  // is itself proof of liveness, so the probe stands down without a reply.
  inboundSequence: () => number
  registerPending: (id: string, settle: () => void) => void
  dropPending: (id: string) => void
  sendProbe: (id: string) => boolean
}

export type MobileRpcActivityProbe = {
  run: () => void
  start: () => void
  stop: () => void
}

export function createMobileRpcActivityProbe(
  options: MobileRpcActivityProbeOptions
): MobileRpcActivityProbe {
  let timer: ReturnType<typeof setInterval> | null = null

  const run = (): void => {
    const probeWs = options.currentSocket()
    if (!options.isConnected() || !probeWs) {
      return
    }
    const id = options.nextRequestId()
    const probeInboundSequence = options.inboundSequence()
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      options.dropPending(id)
      if (options.inboundSequence() > probeInboundSequence) {
        return
      }
      console.log('[net] activity-probe TIMEOUT — forcing reconnect')
      // Why: a stale probe timer must not close a replacement socket.
      if (probeWs === options.currentSocket() && probeWs.readyState === WebSocket.OPEN) {
        probeWs.close()
      }
    }, ACTIVITY_PROBE_TIMEOUT_MS)

    options.registerPending(id, () => {
      if (!timedOut) {
        clearTimeout(timeout)
      }
    })

    if (!options.sendProbe(id)) {
      clearTimeout(timeout)
      options.dropPending(id)
    }
  }

  const stop = (): void => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  return {
    run,
    start: () => {
      stop()
      timer = setInterval(run, ACTIVITY_PROBE_INTERVAL_MS)
    },
    stop
  }
}
