import {
  decodeBrowserScreencastFrame,
  type BrowserScreencastFrame
} from './browser-screencast-protocol'
import {
  generateKeyPair,
  deriveSharedKey,
  publicKeyFromBase64,
  publicKeyToBase64,
  encrypt,
  encryptBytes,
  decrypt,
  decryptBytes
} from './e2ee'
import { createMobileRpcActivityProbe } from './rpc-client-activity-probe'
import { createMobileRuntimeOrpcTransport } from './rpc-client-orpc-wiring'
import { createMobileStatusCompatProbe, type DesktopStatusPayload } from './rpc-client-status-probe'
import {
  clearTerminalBinaryFrameState,
  createTerminalBinaryFrameState,
  deleteTerminalBinaryStreamState,
  handleTerminalBinaryFrame,
  takePendingTerminalStreamEvents
} from './rpc-client-terminal-binary-frame'
import { markRpcDeliveryUnknown } from './rpc-delivery-ambiguity'
import { isRpcResponse } from './rpc-response-shape'
import type { RuntimeOrpcClient } from './runtime-orpc-client'
import { describeSocketEvent } from './socket-event-debug'
import { MobileRuntimeTerminalMultiplexer } from './terminal-multiplex/multiplexer'
import type { MobileTerminalMultiplexer } from './terminal-multiplex/types'
import type { RpcResponse, ConnectionState, ConnectionLogLevel, ConnectionLogSink } from './types'
import { websocketPayloadToUint8 } from './websocket-payload-bytes'

type PendingRequest = {
  resolve: (response: RpcResponse) => void
  reject: (error: Error) => void
}

type ConnectWaiter = {
  resolve: () => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout> | null
}

type StreamingListener = (result: unknown) => void

export type RpcClient = {
  // Typed runtime contract client — every runtime RPC and subscription goes
  // through this. Mobile requires an oRPC-capable host unconditionally; there
  // is no bare-string fallback.
  orpc: RuntimeOrpcClient
  terminalMultiplexer: MobileTerminalMultiplexer
  getState: () => ConnectionState
  // Why: UI escalates "Reconnecting…" to "Can't connect" once attempts cross
  // a threshold. 0 means never failed; counter is reset on successful open.
  getReconnectAttempt: () => number
  // Why: timestamp (ms epoch) of the last time we reached 'connected'.
  // null = never connected since the client was created. Used by the UI
  // to distinguish "host moved/never reachable" from "transient blip".
  getLastConnectedAt: () => number | null
  onStateChange: (listener: (state: ConnectionState) => void) => () => void
  // Why: app-resume hook. Android/iOS can kill the TCP path or park the
  // reconnect loop while the app is backgrounded; callers invoke this on
  // AppState 'active' so the session recovers without an app restart.
  notifyForeground: () => void
  // Why: diagnostic-only fallback for the protocol-compat gate (see
  // rpc-client-status-probe.ts) — not a general request primitive.
  probeStatusForProtocolCompat: (timeoutMs?: number) => Promise<DesktopStatusPayload | null>
  close: () => void
}

// Why: tiered backoff. The first four entries (500ms→4s) keep
// auto-recovery snappy for the common case — a brief Wi-Fi blip,
// laptop wake, or AP-isolation cycle. Beyond that we slow down
// (8s→60s) so a phone whose desktop is genuinely unreachable doesn't
// burn a TCP SYN every 4s indefinitely while still healing on its
// own when the network recovers. With 12 total attempts, the last
// four reuse the 60s cap (Math.min(idx, length-1)), so total elapsed
// time across all 12 attempts is ≈ 6 minutes before the give-up cap
// fires (0.5+1+2+4+8+15+30+60+60+60+60+60 ≈ 360s).
const RECONNECT_DELAYS = [500, 1000, 2000, 4000, 8000, 15_000, 30_000, 60_000]
// Why: cap fast auto-retry once we're clearly unreachable for a long time.
// With the tiered backoff above this is ≈ 6 minutes of continuous
// failure before the UI surfaces the re-pair banner. The longer
// runway tolerates flaky AP-isolation routers and laptop sleep cycles
// that briefly drop the LAN path. MUST stay aligned with
// connection-health.ts UNREACHABLE_ATTEMPTS so the "unreachable"
// verdict matches the moment the loop slows to the trickle cadence.
const GIVE_UP_AFTER_ATTEMPTS = 12
// Why: past the cap the loop must never park permanently. A wedged
// Tailscale/VPN tunnel produces no AppState or network-type transition
// (still Wi-Fi, still "online"), so no revival nudge ever fires — users
// had to toggle Tailscale off/on just to force one. A slow trickle dial
// self-heals once the tunnel recovers while staying cheap: one TCP
// attempt per 90s, foreground-only (iOS/Android suspend JS timers in
// the background).
const TRICKLE_RECONNECT_DELAY_MS = 90_000
// Why: a single `unauthorized`/`e2ee_error` is not proof the pairing is dead.
// Issue #5200: a tablet showed "Auth failed" and forced a needless re-pair
// while the desktop still listed it as paired with a valid token — a transient
// rejection (mid-session resume race, a stale frame after background) latched
// the terminal auth-failed state permanently. Retry the full handshake this
// many times with a clean reconnect before declaring auth dead. A genuinely
// revoked token is rejected on every attempt and converges to auth-failed in
// seconds; a one-off glitch self-heals without the user re-pairing.
const AUTH_RETRY_BUDGET = 3
const CONNECT_TIMEOUT_MS = 12_000
const HANDSHAKE_TIMEOUT_MS = 5_000
// Why: RN's WebSocket implementation may not expose static readyState
// constants, but the protocol value for CONNECTING is stable across runtimes.
const WEBSOCKET_CONNECTING_STATE = 0

export type ConnectOptions = {
  onStateChange?: (state: ConnectionState) => void
  // Fires for every observable lifecycle event so the UI can render a
  // detailed connection log. Useful when 'Connecting…' hangs forever
  // (e.g. broken Tailscale route) and you need to see *where* it's stuck.
  onLog?: ConnectionLogSink
}

export function connect(
  endpoint: string,
  deviceToken: string,
  serverPublicKeyB64: string,
  optionsOrLegacy?: ConnectOptions | ((state: ConnectionState) => void)
): RpcClient {
  // Why: keep backward-compat with callers that pass a bare onStateChange fn.
  const options: ConnectOptions =
    typeof optionsOrLegacy === 'function'
      ? { onStateChange: optionsOrLegacy }
      : (optionsOrLegacy ?? {})
  const onStateChange = options.onStateChange
  const onLog = options.onLog
  let logCounter = 0
  function emitLog(level: ConnectionLogLevel, message: string, detail?: string) {
    if (!onLog) {
      return
    }
    onLog({
      id: `log-${++logCounter}-${Date.now()}`,
      ts: Date.now(),
      level,
      message,
      detail
    })
  }
  let ws: WebSocket | null = null
  let state: ConnectionState = 'disconnected'
  let requestCounter = 0
  let reconnectAttempt = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let connectTimer: ReturnType<typeof setTimeout> | null = null
  let handshakeTimer: ReturnType<typeof setTimeout> | null = null
  let intentionallyClosed = false
  // Why: consecutive auth rejections since the last successful connect. We
  // tolerate up to AUTH_RETRY_BUDGET (issue #5200) before latching auth-failed
  // so a transient rejection doesn't force a needless re-pair. Reset to 0 on
  // every 'connected'.
  let authRejectionCount = 0
  let lastConnectedAt: number | null = null
  // Why: cheap diagnostics for RN/OkHttp process-state poisoning: do retry
  // attempts differ, is anything inbound, and are closes instant or slow?
  let lastInboundAt: number | null = null
  let inboundSequence = 0
  let lastWsClosedAt: number | null = null
  let wsConstructionCounter = 0
  let currentWsOpenedAt: number | null = null

  // Why: fresh ephemeral keypair per connection provides forward secrecy.
  // The shared key is derived from our ephemeral secret + server's static public key.
  let sharedKey: Uint8Array | null = null
  const serverPublicKey = publicKeyFromBase64(serverPublicKeyB64)

  const pending = new Map<string, PendingRequest>()
  const terminalStreamListeners = new Map<number, StreamingListener>()
  const terminalBinaryFrameState = createTerminalBinaryFrameState()
  const stateListeners = new Set<(state: ConnectionState) => void>()
  const connectWaiters: ConnectWaiter[] = []

  if (onStateChange) {
    stateListeners.add(onStateChange)
  }

  // Diagnostic: tracks how long we've been in the current state. Useful
  // for spotting "stuck in connecting" or "stuck in reconnecting" cases
  // in the logs.
  let stateEnteredAt = Date.now()

  function rejectConnectWaiters(reason: string) {
    const error = new Error(reason)
    for (const waiter of connectWaiters.splice(0)) {
      if (waiter.timeout) {
        clearTimeout(waiter.timeout)
      }
      waiter.reject(error)
    }
  }

  function setState(next: ConnectionState) {
    if (state === next) {
      return
    }
    const prev = state
    const dwelt = Date.now() - stateEnteredAt
    state = next
    stateEnteredAt = Date.now()
    console.log('[net] state', {
      from: prev,
      to: next,
      dweltMs: dwelt,
      attempt: reconnectAttempt,
      endpoint: redactedEndpoint(endpoint)
    })
    if (next === 'connected') {
      lastConnectedAt = Date.now()
      // Why: a clean handshake proves the token is valid — clear the auth
      // retry budget so a future isolated rejection gets the full budget again.
      authRejectionCount = 0
      for (const waiter of connectWaiters.splice(0)) {
        if (waiter.timeout) {
          clearTimeout(waiter.timeout)
        }
        waiter.resolve()
      }
    } else if (next === 'disconnected' || next === 'auth-failed') {
      const reason =
        next === 'auth-failed' ? 'Unauthorized — pairing may be revoked' : 'Connection closed'
      rejectConnectWaiters(reason)
    }
    for (const listener of stateListeners) {
      listener(next)
    }
    // Why: the oRPC link is bound to one socket generation. Rebuild it on every
    // fresh channel so in-flight calls fail loudly instead of silently writing
    // into a dead port, and tear it down whenever the channel drops.
    if (next === 'connected') {
      orpcTransport.connected()
    } else if (prev === 'connected') {
      orpcTransport.disconnected()
      terminalStreamListeners.clear()
      clearTerminalBinaryFrameState(terminalBinaryFrameState)
    }
    terminalMultiplexer.controlConnectionChanged(next === 'connected')
  }

  // Why: don't dump device tokens / full URLs into log scrolls; truncate to
  // the host:port so reconnect lifecycles are still readable.
  function redactedEndpoint(ep: string): string {
    try {
      const m = ep.match(/^wss?:\/\/([^/]+)/i)
      return m ? m[1] : 'unknown'
    } catch {
      return 'unknown'
    }
  }

  function waitForConnected(timeoutMs?: number): Promise<void> {
    if (state === 'connected') {
      return Promise.resolve()
    }
    if (intentionallyClosed) {
      return Promise.reject(new Error('Client closed'))
    }
    if (state === 'reconnecting' && reconnectAttempt >= GIVE_UP_AFTER_ATTEMPTS) {
      // Why: past the retry cap the loop only trickles every 90s — callers
      // must fail fast rather than hang on a host that's been unreachable
      // for minutes. A trickle dial that succeeds flips state to 'connected'
      // and later requests go through normally.
      return Promise.reject(new Error('Connection retry limit reached'))
    }
    return new Promise((resolve, reject) => {
      const waiter: ConnectWaiter = { resolve, reject, timeout: null }
      if (timeoutMs !== undefined) {
        // Why: a request's timeout budget must include offline/reconnect
        // waiting, not only the RPC after the socket becomes connected.
        waiter.timeout = setTimeout(
          () => {
            const index = connectWaiters.indexOf(waiter)
            if (index !== -1) {
              connectWaiters.splice(index, 1)
            }
            reject(new Error('Timed out while connecting to the remote Yiru runtime.'))
          },
          Math.max(0, timeoutMs)
        )
      }
      connectWaiters.push(waiter)
    })
  }

  function nextId(): string {
    return `rpc-${++requestCounter}-${Date.now()}`
  }

  function openConnection() {
    if (intentionallyClosed) {
      return
    }

    const now = Date.now()
    wsConstructionCounter++
    console.log('[net] openConnection', {
      attempt: reconnectAttempt,
      endpoint: redactedEndpoint(endpoint),
      // Why: process-poisoning diagnostic. If wsCount is high (e.g. >50)
      // and every recent open fails with 1006, suspect RN/OkHttp internal
      // pool corruption that only force-quit clears. Compare msSinceLast*
      // values to the failure cadence: instant repeated fails with no
      // inbound traffic between them = process-state stuck.
      wsCount: wsConstructionCounter,
      msSinceLastConnected: lastConnectedAt != null ? now - lastConnectedAt : null,
      msSinceLastClose: lastWsClosedAt != null ? now - lastWsClosedAt : null,
      msSinceLastInbound: lastInboundAt != null ? now - lastInboundAt : null
    })
    setState('connecting')
    sharedKey = null

    currentWsOpenedAt = now
    emitLog(
      'info',
      reconnectAttempt > 0 ? `Reconnecting (attempt ${reconnectAttempt + 1})` : 'Opening WebSocket',
      endpoint
    )

    ws = new WebSocket(endpoint)
    const openingWs = ws
    const ignoreStaleSocketEvent = (eventName: string): boolean => {
      if (ws === openingWs) {
        return false
      }
      // Why: React Native can deliver callbacks from a timed-out socket after
      // reconnect has swapped in a replacement; stale events must not mutate it.
      console.log('[net] stale ws event ignored', {
        eventName,
        state,
        attempt: reconnectAttempt
      })
      return true
    }

    // Why: React Native can leave TCP/WebSocket opens pending indefinitely on
    // flaky network handoffs. Force the existing onclose reconnect path if
    // onopen never arrives, instead of leaving the UI stuck at "Connecting...".
    connectTimer = setTimeout(() => {
      connectTimer = null
      if (ws === openingWs && openingWs.readyState === WEBSOCKET_CONNECTING_STATE) {
        console.log('[net] connect-timeout fired (onopen never arrived)', {
          attempt: reconnectAttempt,
          timeoutMs: CONNECT_TIMEOUT_MS
        })
        emitLog(
          'error',
          'WebSocket connect timeout',
          `No TCP/WS handshake within ${CONNECT_TIMEOUT_MS / 1000}s — endpoint unreachable?`
        )
        openingWs.close()
        if (ws === openingWs) {
          handleSocketClosed(openingWs, { timedOut: true })
        }
      }
    }, CONNECT_TIMEOUT_MS)

    ws.onopen = () => {
      if (ignoreStaleSocketEvent('open')) {
        return
      }
      console.log('[net] ws.onopen', { attempt: reconnectAttempt })
      clearConnectTimer()
      reconnectAttempt = 0
      setState('handshaking')
      emitLog('success', 'WebSocket open', 'Starting E2EE handshake')

      // Why: generate a fresh ephemeral keypair for each connection.
      // This provides forward secrecy — compromising one session's key
      // doesn't compromise past or future sessions.
      const ephemeral = generateKeyPair()
      const hello = JSON.stringify({
        type: 'e2ee_hello',
        publicKeyB64: publicKeyToBase64(ephemeral.publicKey)
      })
      openingWs.send(hello)
      emitLog('info', 'Sent e2ee_hello', 'Awaiting server e2ee_ready')

      sharedKey = deriveSharedKey(ephemeral.secretKey, serverPublicKey)

      handshakeTimer = setTimeout(() => {
        handshakeTimer = null
        if (ws !== openingWs || state !== 'handshaking') {
          return
        }
        console.log('[net] handshake-timeout fired (e2ee_authenticated never arrived)', {
          timeoutMs: HANDSHAKE_TIMEOUT_MS
        })
        emitLog(
          'error',
          'Handshake timeout',
          `No e2ee_ready/e2ee_authenticated within ${HANDSHAKE_TIMEOUT_MS / 1000}s`
        )
        openingWs.close()
      }, HANDSHAKE_TIMEOUT_MS)
    }

    // Why: binary frames decode asynchronously (Blob → bytes), so unqueued
    // handling can apply frame N+1 before N and corrupt terminal deltas. One
    // chain per socket keeps string and binary messages in arrival order.
    let messageChain: Promise<void> = Promise.resolve()

    ws.onmessage = (event) => {
      if (ignoreStaleSocketEvent('message')) {
        return
      }
      const data = event.data
      messageChain = messageChain.then(() => handleSocketMessage(data)).catch(() => {})
    }

    async function handleSocketMessage(rawData: unknown) {
      lastInboundAt = Date.now()
      const raw = typeof rawData === 'string' ? rawData : null

      // Why: during handshaking, e2ee_ready is plaintext because it precedes
      // encrypted auth; e2ee_authenticated/e2ee_error are encrypted.
      if (state === 'handshaking') {
        if (raw === null) {
          return
        }
        try {
          const msg = JSON.parse(raw)
          if (msg.type === 'e2ee_ready') {
            emitLog('success', 'Received e2ee_ready', 'Sending device token')
            sendEncrypted({ type: 'e2ee_auth', deviceToken })
            return
          }
        } catch {
          // Not plaintext JSON — fall through and try encrypted handshake messages.
        }

        if (!sharedKey || sharedKey.length !== 32) {
          return
        }

        const plaintext = decrypt(raw, sharedKey)
        if (plaintext === null) {
          return
        }

        try {
          const msg = JSON.parse(plaintext)
          if (msg.type === 'e2ee_authenticated') {
            if (handshakeTimer) {
              clearTimeout(handshakeTimer)
              handshakeTimer = null
            }
            console.log('[net] e2ee_authenticated — connected')
            setState('connected')
            emitLog('success', 'Authenticated', 'Channel ready for RPC')
            activityProbe.start()
          } else if (msg.type === 'e2ee_error' || (!msg.ok && msg.error?.code === 'unauthorized')) {
            console.log('[net] e2ee auth FAILED', { msgType: msg.type, error: msg.error })
            if (handshakeTimer) {
              clearTimeout(handshakeTimer)
              handshakeTimer = null
            }
            handleAuthRejection('Unauthorized — pairing may be revoked')
          }
        } catch {
          // Not JSON — ignore during handshake.
        }
        return
      }

      // Why: guard against decrypt with an invalid key — sharedKey can be null
      // after destroy() or if a message arrives during a reconnect race.
      if (!sharedKey || sharedKey.length !== 32) {
        return
      }

      if (raw === null) {
        const bytes = await websocketPayloadToUint8(rawData)
        if (ws !== openingWs) {
          return
        }
        if (!bytes) {
          return
        }
        const plaintextBytes = decryptBytes(bytes, sharedKey)
        if (!plaintextBytes) {
          return
        }
        handleBinaryFrame(plaintextBytes)
        return
      }

      const plaintext = decrypt(raw, sharedKey)
      if (plaintext === null) {
        return
      }

      if (orpcTransport.receiveText(plaintext)) {
        recordValidatedInboundTraffic()
        return
      }

      let response: unknown
      try {
        response = JSON.parse(plaintext)
      } catch {
        return
      }
      if (!isRpcResponse(response)) {
        return
      }
      recordValidatedInboundTraffic()

      // Why: a mid-session unauthorized may be a transient glitch, not a dead
      // pairing (issue #5200). handleAuthRejection retries the handshake a few
      // times before latching auth-failed, while still bounding churn via the
      // budget so a genuinely revoked token doesn't reconnect forever.
      if (!response.ok && response.error.code === 'unauthorized') {
        handleAuthRejection('Unauthorized — pairing may be revoked')
        return
      }

      const req = pending.get(response.id)
      if (req) {
        pending.delete(response.id)
        req.resolve(response)
      }
    }

    ws.onclose = (event) => {
      const e = event as { code?: number; reason?: string; wasClean?: boolean } | undefined
      const closeAt = Date.now()
      // Why: time-since-construct distinguishes failure modes. Instant
      // close (<300ms) = TCP RST / port closed / route unreachable / RN
      // synchronous reject. Mid (300ms–3s) = DNS/connect attempt + reset.
      // Slow (>3s) = TCP SYN timeout / packet loss / NAT wedge. If an
      // entire reconnect burst is all instant, the problem is local
      // process state or routing, not packet loss.
      const constructToCloseMs = currentWsOpenedAt != null ? closeAt - currentWsOpenedAt : null
      const aliveMs =
        currentWsOpenedAt != null && state === 'connected' ? closeAt - currentWsOpenedAt : null
      const inboundIdleMs = lastInboundAt != null ? closeAt - lastInboundAt : null
      // Why: statically imported (not closure-built) — an earlier hot-reload
      // bug came from a stale closure capturing a half-loaded module.
      const closeEvent = describeSocketEvent(event)
      console.log('[net] ws.onclose', {
        code: e?.code,
        reason: e?.reason,
        wasClean: e?.wasClean,
        state,
        attempt: reconnectAttempt,
        intentionallyClosed,
        endpoint: redactedEndpoint(endpoint),
        constructToCloseMs,
        aliveMs,
        inboundIdleMs,
        eventKeys: closeEvent.keys,
        eventStr: closeEvent.json
      })
      // Why: a stale socket's close must not clobber the live attempt's
      // diagnostics — mutate only when this socket is still the current one,
      // the same identity guard the other handlers use.
      if (ws === openingWs) {
        lastWsClosedAt = closeAt
        currentWsOpenedAt = null
      }
      handleSocketClosed(openingWs)
    }

    ws.onerror = (event) => {
      if (ignoreStaleSocketEvent('error')) {
        return
      }
      // Why: RN surfaces network errors here (DNS failure, TCP RST, etc).
      // onclose fires right after, but logging the error message gives us
      // the original cause that the close code alone can hide.
      const e = event as { message?: string } | undefined
      const errEvent = describeSocketEvent(event)
      console.log('[net] ws.onerror', {
        message: e?.message,
        state,
        attempt: reconnectAttempt,
        eventKeys: errEvent.keys,
        eventStr: errEvent.json
      })
    }
  }

  function handleSocketClosed(closedWs: WebSocket, opts: { timedOut?: boolean } = {}) {
    if (ws !== closedWs) {
      console.log('[net] handleSocketClosed STALE — ignoring (ws already swapped)', {
        state,
        attempt: reconnectAttempt
      })
      return
    }
    clearConnectTimer()
    ws = null
    sharedKey = null
    if (handshakeTimer) {
      clearTimeout(handshakeTimer)
      handshakeTimer = null
    }
    activityProbe.stop()
    if (intentionallyClosed) {
      console.log('[net] handleSocketClosed — intentional close')
      setState('disconnected')
      rejectAllPending('Connection closed', { deliveryUnknown: true })
      return
    }
    console.log('[net] handleSocketClosed → reconnect', {
      timedOut: !!opts.timedOut,
      pendingCount: pending.size,
      attempt: reconnectAttempt
    })
    emitLog('warn', 'WebSocket closed', 'Will attempt to reconnect')
    rejectAllPending('Connection interrupted', { deliveryUnknown: true })
    setState('reconnecting')
    scheduleReconnect()
  }

  // Why: a token rejection (handshake e2ee_error/unauthorized or a mid-session
  // unauthorized RPC) may be transient — issue #5200. Retry the full handshake
  // up to AUTH_RETRY_BUDGET times before declaring auth dead, so a one-off
  // glitch self-heals instead of forcing the user to re-pair. A genuinely
  // revoked token fails every retry and latches auth-failed within seconds.
  function handleAuthRejection(reason: string): void {
    authRejectionCount++
    if (authRejectionCount < AUTH_RETRY_BUDGET) {
      console.log('[net] auth rejected — retrying handshake', {
        attempt: authRejectionCount,
        budget: AUTH_RETRY_BUDGET,
        endpoint: redactedEndpoint(endpoint)
      })
      emitLog(
        'warn',
        'Authentication rejected',
        `Retrying (${authRejectionCount}/${AUTH_RETRY_BUDGET})`
      )
      // Why: close the current socket but DON'T set intentionallyClosed —
      // we want handleSocketClosed to route into the reconnect path so the
      // token gets a fresh handshake. rejectAllPending unblocks in-flight RPCs.
      const closing = ws
      ws = null
      sharedKey = null
      // Why: in-flight requests were already written to the wire, so losing
      // their response is ambiguous — same marker as every other socket-loss path.
      rejectAllPending(reason, { deliveryUnknown: true })
      if (closing) {
        closing.close()
      }
      setState('reconnecting')
      scheduleReconnect()
      return
    }
    console.log('[net] auth rejected — budget exhausted, latching auth-failed', {
      attempt: authRejectionCount,
      endpoint: redactedEndpoint(endpoint)
    })
    intentionallyClosed = true
    ws?.close()
    ws = null
    setState('auth-failed')
    rejectAllPending(reason, { deliveryUnknown: true })
  }

  function scheduleReconnect() {
    // Why: spinning fast reconnects forever drains battery and floods logs
    // when the host is genuinely unreachable (wrong IP, port closed,
    // host moved). Past GIVE_UP_AFTER_ATTEMPTS the UI surfaces a
    // "Can't reach desktop, re-pair?" banner and the loop drops to the
    // 90s trickle cadence instead of parking — a permanently parked loop
    // could only be revived by an AppState/network transition, which a
    // wedged VPN tunnel never produces.
    const pastGiveUpCap = reconnectAttempt >= GIVE_UP_AFTER_ATTEMPTS
    let delay: number
    if (pastGiveUpCap) {
      // Why: the counter holds at the cap — connection-health thresholds and
      // the "Can't reach desktop" verdict key off attempts >= 12, and a
      // successful open resets it to 0 anyway.
      delay = TRICKLE_RECONNECT_DELAY_MS
      rejectConnectWaiters('Connection retry limit reached')
    } else {
      delay = RECONNECT_DELAYS[Math.min(reconnectAttempt, RECONNECT_DELAYS.length - 1)]!
      reconnectAttempt++
    }
    console.log('[net] scheduleReconnect', {
      delayMs: delay,
      attempt: reconnectAttempt,
      trickle: pastGiveUpCap
    })
    emitLog(
      'info',
      `Reconnect scheduled in ${delay}ms`,
      pastGiveUpCap ? `Attempt ${reconnectAttempt} (slow retry)` : `Attempt ${reconnectAttempt}`
    )
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      openConnection()
    }, delay)
  }

  function clearConnectTimer() {
    if (connectTimer) {
      clearTimeout(connectTimer)
      connectTimer = null
    }
  }

  const activityProbe = createMobileRpcActivityProbe({
    isConnected: () => state === 'connected',
    currentSocket: () => ws,
    nextRequestId: nextId,
    inboundSequence: () => inboundSequence,
    registerPending: (id, settle) => pending.set(id, { resolve: settle, reject: settle }),
    dropPending: (id) => pending.delete(id),
    sendProbe: (id) => sendEncrypted({ id, deviceToken, method: 'status.get' })
  })

  const probeStatusForProtocolCompat = createMobileStatusCompatProbe({
    nextRequestId: nextId,
    registerPending: (id, resolve, reject) => pending.set(id, { resolve, reject }),
    dropPending: (id) => pending.delete(id),
    sendProbe: (id) => sendEncrypted({ id, deviceToken, method: 'status.get' })
  })

  function rejectAllPending(reason: string, options?: { deliveryUnknown?: boolean }) {
    // Why: pending requests were written successfully, so losing their response
    // is ambiguous even when the socket close itself was intentional.
    const error = options?.deliveryUnknown
      ? markRpcDeliveryUnknown(new Error(reason))
      : new Error(reason)
    for (const [id, req] of pending) {
      pending.delete(id)
      queueMicrotask(() => req.reject(error))
    }
  }

  function recordValidatedInboundTraffic(): void {
    inboundSequence++
  }

  function handleBinaryFrame(bytes: Uint8Array): void {
    if (orpcTransport.receiveBinary(bytes)) {
      recordValidatedInboundTraffic()
      return
    }
    const browserFrame = decodeBrowserScreencastFrame(bytes)
    if (browserFrame) {
      recordValidatedInboundTraffic()
      handleBrowserBinaryFrame(browserFrame)
      return
    }
    handleTerminalBinaryFrame(bytes, {
      state: terminalBinaryFrameState,
      getListener: (streamId) => terminalStreamListeners.get(streamId),
      recordValidatedInboundTraffic
    })
  }

  function handleBrowserBinaryFrame(frame: BrowserScreencastFrame): void {
    orpcTransport.handleBrowserBinaryFrame(frame)
  }

  // Writes an already-framed oRPC payload onto the same encrypted channel the
  // legacy JSON-RPC envelopes use, so oRPC never bypasses E2EE.
  function sendEncryptedFrame(payload: string | Uint8Array<ArrayBufferLike>): boolean {
    if (!ws || ws.readyState !== WebSocket.OPEN || !sharedKey) {
      return false
    }
    ws.send(
      typeof payload === 'string' ? encrypt(payload, sharedKey) : encryptBytes(payload, sharedKey)
    )
    return true
  }

  function registerOrpcTerminalStream(streamId: number, listener: StreamingListener): () => void {
    terminalStreamListeners.set(streamId, listener)
    const pendingEvents = takePendingTerminalStreamEvents(terminalBinaryFrameState, streamId)
    for (const event of pendingEvents) {
      listener(event)
    }
    return () => {
      if (terminalStreamListeners.get(streamId) === listener) {
        terminalStreamListeners.delete(streamId)
        deleteTerminalBinaryStreamState(terminalBinaryFrameState, streamId)
      }
    }
  }

  function sendEncrypted(request: unknown): boolean {
    if (ws && ws.readyState === WebSocket.OPEN && sharedKey) {
      ws.send(encrypt(JSON.stringify(request), sharedKey))
      return true
    }
    console.log('[net] sendEncrypted FAILED — channel not ready', {
      hasWs: !!ws,
      readyState: ws?.readyState,
      hasKey: !!sharedKey,
      state
    })
    // Why: if the state machine still thinks we're connected but the
    // underlying WebSocket has flipped to CLOSING/CLOSED without onclose
    // having fired (RN's WebSocket sometimes drops the event, or the
    // server half-closed the stream), force a reconnect. Without this
    // every send silently fails forever and the user sees a frozen UI.
    if (state === 'connected' && ws && ws.readyState !== WebSocket.OPEN) {
      console.log('[net] sendEncrypted detected ws desync — forcing reconnect', {
        readyState: ws.readyState
      })
      handleSocketClosed(ws, { timedOut: false })
    }
    return false
  }

  const orpcTransport = createMobileRuntimeOrpcTransport({
    waitForConnected: () => waitForConnected(),
    getState: () => state,
    nextRequestId: nextId,
    sendFrame: sendEncryptedFrame,
    registerTerminalStream: registerOrpcTerminalStream
  })
  const terminalMultiplexer = new MobileRuntimeTerminalMultiplexer({
    getControlClient: () => orpcTransport.client,
    deviceToken,
    serverPublicKeyB64
  })

  openConnection()

  const client: RpcClient = {
    orpc: orpcTransport.client,
    terminalMultiplexer,

    getState(): ConnectionState {
      return state
    },

    getReconnectAttempt(): number {
      return reconnectAttempt
    },

    getLastConnectedAt(): number | null {
      return lastConnectedAt
    },

    onStateChange(listener: (state: ConnectionState) => void): () => void {
      stateListeners.add(listener)
      return () => stateListeners.delete(listener)
    },

    notifyForeground(): void {
      if (intentionallyClosed) {
        return
      }
      if (state === 'connected') {
        // Why: the OS can kill the TCP path while the app is backgrounded
        // without delivering onclose, leaving a half-open socket that
        // blackholes input. Probe now so death is detected in ≤8s instead
        // of waiting out the 20s interval (issue #5049).
        console.log('[net] foreground — probing live connection')
        activityProbe.start()
        activityProbe.run()
        return
      }
      if (state === 'reconnecting') {
        // Why: while backgrounded the retry loop may be sitting on a 60s
        // backoff or 90s trickle timer. Returning to the foreground is a
        // strong user signal — restart with a fresh attempt budget
        // immediately instead of waiting out the timer.
        console.log('[net] foreground — restarting reconnect loop', {
          attempt: reconnectAttempt,
          hadTimer: !!reconnectTimer
        })
        if (reconnectTimer) {
          clearTimeout(reconnectTimer)
          reconnectTimer = null
        }
        reconnectAttempt = 0
        openConnection()
      }
    },

    probeStatusForProtocolCompat,

    close() {
      intentionallyClosed = true
      terminalMultiplexer.close()
      orpcTransport.close()
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      clearConnectTimer()
      if (handshakeTimer) {
        clearTimeout(handshakeTimer)
        handshakeTimer = null
      }
      activityProbe.stop()
      if (ws) {
        ws.close()
        ws = null
      }
      sharedKey = null
      setState('disconnected')
      rejectAllPending('Client closed', { deliveryUnknown: true })
    }
  }

  return client
}
