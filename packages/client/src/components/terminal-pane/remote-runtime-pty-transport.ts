import { translate } from '~renderer/i18n/i18n'
/* eslint-disable max-lines -- Why: remote PTY transport keeps lifecycle, JSON fallback, and binary stream wiring together so reconnect/destroy ordering stays testable as one behavior surface. */
import { createBrowserUuid } from '~renderer/lib/browser-uuid'
import { setDriverForPty } from '~renderer/lib/pane-manager/mobile-driver-state'
import { setFitOverride } from '~renderer/lib/pane-manager/mobile-fit-overrides'
import { callRuntimeOrpcByPath, type RuntimeClientTarget } from '~renderer/runtime/orpc-client'
import {
  REMOTE_TERMINAL_SNAPSHOT_TOO_LARGE,
  type RemoteRuntimeMultiplexedTerminal
} from '~renderer/runtime/terminal-multiplex/multiplexer'
import { getRuntimeTerminalMultiplexer } from '~renderer/runtime/terminal-multiplex/registry'
import { rememberTerminalSessionId } from '~renderer/runtime/terminal-session-id-index'
import { publishRendererTerminalSideEffects } from '~renderer/runtime/terminal-side-effect-client'
import {
  parseRuntimeTerminalPtyId,
  runtimeTerminalErrorMessage,
  toRuntimeTerminalPtyId
} from '~renderer/runtime/terminal-stream'
import {
  isWebTerminalSurfaceTabId,
  toHostSessionTabId
} from '~renderer/runtime/web-terminal-surface-id'
import {
  toRuntimeTerminalWorktreeSelector,
  toRuntimeWorktreeSelector
} from '~renderer/runtime/worktree-selector'
import type {
  RuntimeMobileSessionTerminalClientTab,
  RuntimeMobileSessionTabsResult,
  RuntimeTerminalCreate
} from '~shared/runtime-types'
import {
  isTerminalInputTooLargeWithDeferredMeasurement,
  iterateTerminalInputChunks
} from '~shared/terminal/input'

import { createPtyOutputProcessor } from './pty/output-processor'
import type {
  PtyConnectResult,
  PtyTransport,
  RuntimePtyTransportOptions
} from './pty/transport-types'
import {
  createRemoteRuntimePtyTextBatcher,
  createRemoteRuntimeViewportBatcher
} from './remote-runtime-pty-batching'
import { retryRuntimeUnavailable } from './runtime-unavailable-retry'
import { recordTerminalFreezeBreadcrumb } from './terminal-freeze-breadcrumbs'
import { deliverPtyDataWithDeferredCredit } from './terminal-pty-ack-gate'

const REMOTE_TERMINAL_INPUT_FLUSH_MS = 8
const REMOTE_TERMINAL_VIEWPORT_FLUSH_MS = 33
const HOST_SESSION_ATTACH_POLL_MS = 150
const HOST_SESSION_ATTACH_TIMEOUT_MS = 15_000
const PENDING_VIEWPORT_CLAIM_TIMEOUT_MS = 15_000

function remoteTerminalGoneMessage(): string {
  return translate(
    'auto.components.terminal.pane.remoteRuntimePtyTransport.gone',
    'Remote terminal was closed.'
  )
}

function isRemoteTerminalGoneMessage(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('terminal_handle_stale') ||
    normalized.includes('terminal handle is stale') ||
    normalized.includes('terminal_exited') ||
    normalized.includes('terminal_gone') ||
    normalized.includes('no_connected_pty') ||
    normalized.includes('terminal has no connected pty')
  )
}

/**
 * PTY transport backing a renderer terminal pane with a terminal on a remote
 * runtime host, over runtime RPC plus the multiplexed stream (create, subscribe, input,
 * resize, close, reattach).
 */
export function createRuntimePtyTransport(
  runtimeTarget: RuntimeClientTarget,
  opts: RuntimePtyTransportOptions = {}
): PtyTransport {
  const {
    command,
    cwd,
    cwdFallback,
    startupCommandDelivery,
    env,
    envToDelete,
    launchConfig,
    launchToken,
    launchAgent,
    worktreeId,
    tabId,
    leafId,
    activate,
    onPtyExit,
    onPtySpawn,
    onAgentStatus
  } = opts
  let connected = false
  let destroyed = false
  let handle: string | null = null
  let remotePtyId: string | null = null
  let currentRuntimeTarget = runtimeTarget
  let multiplexedStream: RemoteRuntimeMultiplexedTerminal | null = null
  let multiplexedStreamHandle: string | null = null
  let desiredViewport: { cols: number; rows: number } | null = null
  let desiredDelivery: Parameters<NonNullable<PtyTransport['setDeliveryState']>>[0] = {
    visible: true,
    interested: true,
    priority: 'active' as const
  }
  let sideEffectSeq = 0
  let storedCallbacks: Parameters<PtyTransport['connect']>[0]['callbacks'] = {}
  let resubscribing = false
  let resubscribeRequested = false
  let subscriptionGeneration = 0
  let pendingViewportClaim = false
  let pendingClaimInput = ''
  let pendingViewportClaimTimer: ReturnType<typeof setTimeout> | null = null
  const viewportClaimReadyWaiters = new Set<(ready: boolean) => void>()
  const clearPendingViewportClaim = (): void => {
    if (pendingViewportClaimTimer !== null) {
      clearTimeout(pendingViewportClaimTimer)
      pendingViewportClaimTimer = null
    }
    pendingViewportClaim = false
    pendingClaimInput = ''
    for (const resolve of viewportClaimReadyWaiters) {
      resolve(false)
    }
    viewportClaimReadyWaiters.clear()
  }
  const beginPendingViewportClaim = (): void => {
    pendingViewportClaim = true
    if (pendingViewportClaimTimer !== null) {
      return
    }
    pendingViewportClaimTimer = setTimeout(() => {
      if (!pendingViewportClaim) {
        return
      }
      clearPendingViewportClaim()
      storedCallbacks.onError?.(remoteTerminalGoneMessage())
    }, PENDING_VIEWPORT_CLAIM_TIMEOUT_MS)
  }
  const finishPendingViewportClaim = (stream: RemoteRuntimeMultiplexedTerminal): void => {
    if (pendingViewportClaimTimer !== null) {
      clearTimeout(pendingViewportClaimTimer)
      pendingViewportClaimTimer = null
    }
    pendingViewportClaim = false
    const queuedInput = pendingClaimInput
    pendingClaimInput = ''
    if (queuedInput) {
      stream.sendInput(queuedInput)
    }
    for (const resolve of viewportClaimReadyWaiters) {
      resolve(true)
    }
    viewportClaimReadyWaiters.clear()
  }
  // Why: tab/leaf ids identify the mirrored host pane, so every paired viewer
  // shares them. The instance suffix keeps one viewer's refresh off peer records.
  const clientId = `desktop:${tabId ?? 'tab'}:${leafId ?? 'leaf'}:${createBrowserUuid()}`
  const outputProcessor = createPtyOutputProcessor({
    onAgentStatus
  })

  function findReadyHostSessionHandle(
    snapshot: RuntimeMobileSessionTabsResult,
    hostTabId: string
  ): string | null {
    const terminalTabs = getHostSessionTerminalSurfaces(snapshot, hostTabId, {
      matchRequestedLeaf: false
    })
    if (leafId) {
      const requestedLeaf = terminalTabs.find(
        (tab) => tab.status === 'ready' && tab.parentTabId === hostTabId && tab.leafId === leafId
      )
      return requestedLeaf?.terminal ?? null
    }
    const preferred =
      terminalTabs.find(
        (tab) => tab.status === 'ready' && tab.parentTabId === hostTabId && tab.isActive
      ) ?? terminalTabs.find((tab) => tab.status === 'ready' && tab.parentTabId === hostTabId)
    return preferred?.terminal ?? null
  }

  function getHostSessionTerminalSurfaces(
    snapshot: RuntimeMobileSessionTabsResult,
    hostTabId: string,
    options: { matchRequestedLeaf: boolean }
  ): RuntimeMobileSessionTerminalClientTab[] {
    return snapshot.tabs.filter(
      (tab): tab is RuntimeMobileSessionTerminalClientTab =>
        tab.type === 'terminal' &&
        (tab.parentTabId === hostTabId || tab.id === hostTabId) &&
        (!options.matchRequestedLeaf || !leafId || tab.leafId === leafId)
    )
  }

  function hasHostSessionTerminalSurface(
    snapshot: RuntimeMobileSessionTabsResult,
    hostTabId: string
  ): boolean {
    return (
      getHostSessionTerminalSurfaces(snapshot, hostTabId, {
        matchRequestedLeaf: true
      }).length > 0
    )
  }

  async function waitForHostSessionHandle(hostTabId: string): Promise<string | null> {
    if (!worktreeId) {
      return null
    }
    const worktree = toRuntimeWorktreeSelector(worktreeId)
    const activated = await callRuntime<RuntimeMobileSessionTabsResult>('session.tabs.activate', {
      worktree,
      tabId: hostTabId,
      ...(leafId ? { leafId } : {})
    })
    const immediate = findReadyHostSessionHandle(activated, hostTabId)
    if (immediate) {
      return immediate
    }

    const startedAt = Date.now()
    while (!destroyed) {
      const remainingMs = HOST_SESSION_ATTACH_TIMEOUT_MS - (Date.now() - startedAt)
      if (remainingMs <= 0) {
        return null
      }
      // Why: host mirrors can be published before their PTY handle is ready,
      // but a stuck pending surface must not poll the runtime forever.
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(HOST_SESSION_ATTACH_POLL_MS, remainingMs))
      )
      const listed = await callRuntime<RuntimeMobileSessionTabsResult>('session.tabs.list', {
        worktree
      })
      const handle = findReadyHostSessionHandle(listed, hostTabId)
      if (handle) {
        return handle
      }
      if (!hasHostSessionTerminalSurface(listed, hostTabId)) {
        return null
      }
    }
    return null
  }

  async function listHostSessionHandle(hostTabId: string): Promise<string | null> {
    if (!worktreeId) {
      return null
    }
    const listed = await callRuntime<RuntimeMobileSessionTabsResult>('session.tabs.list', {
      worktree: toRuntimeWorktreeSelector(worktreeId)
    })
    return findReadyHostSessionHandle(listed, hostTabId)
  }

  async function attachHostSessionMirror(
    options: Parameters<PtyTransport['connect']>[0]
  ): Promise<PtyConnectResult | undefined> {
    if (!tabId || !isWebTerminalSurfaceTabId(tabId)) {
      return undefined
    }
    const hostTabId = toHostSessionTabId(tabId)
    const hostHandle = await waitForHostSessionHandle(hostTabId)
    if (!hostHandle || destroyed) {
      if (!destroyed) {
        storedCallbacks.onError?.(remoteTerminalGoneMessage())
      }
      return undefined
    }

    handle = hostHandle
    remotePtyId = toRuntimeTerminalPtyId(hostHandle, environmentIdForTarget(currentRuntimeTarget))
    connected = true
    desiredViewport = {
      cols: options.cols ?? 80,
      rows: options.rows ?? 24
    }
    onPtySpawn?.(remotePtyId)

    await subscribeToHandle()
    if (destroyed || !connected || !remotePtyId) {
      return undefined
    }

    return {
      id: remotePtyId,
      replay: ''
    } satisfies PtyConnectResult
  }

  // Why: dispatches by contract path through the negotiated oRPC client
  // instead of the runtime-environment transport adapter with a bare method
  // string — the bare-string channel skips capability negotiation and always
  // lands on the legacy dispatcher, which no longer serves domains retired
  // from it (see docs/runtime-orpc-migration.md Phase 6 D-stage).
  async function callRuntime<TResult>(method: string, params?: unknown): Promise<TResult> {
    return callRuntimeOrpcByPath<TResult>(currentRuntimeTarget, method.split('.'), params, {
      timeoutMs: 15_000
    })
  }

  async function closeRemoteTerminal(handleOverride?: string): Promise<void> {
    const targetHandle = handleOverride ?? handle
    if (!targetHandle) {
      return
    }
    try {
      await callRuntime('terminal.close', { terminal: targetHandle })
    } catch {
      // Best-effort parity with local disconnect/kill.
    }
  }

  async function sendInputAcceptedToRuntime(data: string): Promise<boolean> {
    const targetHandle = handle
    if (!connected || !targetHandle) {
      return false
    }
    if (!data) {
      return true
    }
    await inputBatcher.drain()
    if (!connected || handle !== targetHandle) {
      return false
    }
    if (pendingViewportClaim && !getCurrentMultiplexedStream(targetHandle)) {
      const ready = await new Promise<boolean>((resolve) => {
        viewportClaimReadyWaiters.add(resolve)
      })
      if (!ready || !connected || handle !== targetHandle) {
        return false
      }
    }
    // Why: normal remote sendInput may be waiting on yielded size validation;
    // drain it before acknowledged writes so terminal bytes stay ordered.
    const text = `${inputBatcher.takePending()}${data}`
    try {
      const tooLarge = isTerminalInputTooLargeWithDeferredMeasurement(text)
      if (typeof tooLarge === 'boolean' ? tooLarge : await tooLarge) {
        return false
      }
    } catch {
      return false
    }
    try {
      const stream = getCurrentMultiplexedStream(targetHandle)
      if (!stream) {
        return false
      }
      for (const chunk of iterateTerminalInputChunks(text)) {
        if (!connected || handle !== targetHandle) {
          return false
        }
        if (!(await stream.sendInputAccepted(chunk))) {
          return false
        }
      }
      return true
    } catch (error) {
      // Why: stale-handle errors must retire the mirror (recoverable via the
      // next snapshot) rather than dead-end in a red xterm banner (#7718).
      handleRemoteTerminalError(error)
      return false
    }
  }

  const inputBatcher = createRemoteRuntimePtyTextBatcher(REMOTE_TERMINAL_INPUT_FLUSH_MS, (text) => {
    const targetHandle = handle
    if (!connected || !targetHandle) {
      return
    }
    const stream = getCurrentMultiplexedStream(targetHandle)
    if (stream?.sendInput(text)) {
      return
    }
    if (pendingViewportClaim) {
      // Why: a claim during subscribe/reconnect has no stream record to own
      // yet. Hold its input until the stream can emit claim+input in one order.
      pendingClaimInput += text
      return
    }
    void callRuntime('terminal.send', {
      terminal: targetHandle,
      text,
      client: { id: clientId, type: 'desktop' },
      ...(desiredViewport ? { viewport: desiredViewport, claimViewport: true as const } : {})
    }).catch((error) => {
      handleRemoteTerminalError(error)
    })
  })

  function sendViewportUpdate(cols: number, rows: number, claim = false): void {
    const targetHandle = handle
    if (!connected || !targetHandle) {
      return
    }
    const stream = getCurrentMultiplexedStream(targetHandle)
    if (stream && (claim ? stream.claimViewport(cols, rows) : stream.resize(cols, rows))) {
      if (claim) {
        finishPendingViewportClaim(stream)
      }
      return
    }
    if (claim) {
      beginPendingViewportClaim()
    }
    void callRuntime('terminal.updateViewport', {
      terminal: targetHandle,
      client: { id: clientId, type: 'desktop' },
      viewport: { cols, rows },
      ...(claim ? { claim: true } : {})
    }).catch((error) => {
      if (isRemoteTerminalGoneMessage(runtimeTerminalErrorMessage(error))) {
        handleRemoteTerminalError(error)
      }
    })
  }

  const viewportBatcher = createRemoteRuntimeViewportBatcher(
    REMOTE_TERMINAL_VIEWPORT_FLUSH_MS,
    sendViewportUpdate
  )

  function rememberViewport(cols: number, rows: number): void {
    desiredViewport = { cols, rows }
  }

  function getCurrentMultiplexedStream(
    targetHandle: string
  ): RemoteRuntimeMultiplexedTerminal | null {
    return multiplexedStreamHandle === targetHandle ? multiplexedStream : null
  }

  function closeMultiplexedStream(): void {
    multiplexedStream?.close()
    multiplexedStream = null
    multiplexedStreamHandle = null
  }

  function isCurrentRemoteTerminal(targetHandle: string, targetPtyId: string | null): boolean {
    return (
      !destroyed &&
      connected &&
      handle === targetHandle &&
      remotePtyId === targetPtyId &&
      targetPtyId !== null
    )
  }

  function retireRemoteTerminalId(): void {
    connected = false
    clearPendingViewportClaim()
    const stalePtyId = remotePtyId
    handle = null
    remotePtyId = null
    closeMultiplexedStream()
    if (stalePtyId) {
      onPtyExit?.(stalePtyId)
    }
  }

  function handleRemoteTerminalError(error: unknown): void {
    const message = runtimeTerminalErrorMessage(error)
    if (message === REMOTE_TERMINAL_SNAPSHOT_TOO_LARGE) {
      // Why: an oversized initial snapshot is skipped but live output keeps
      // flowing — informational, not fatal, so never surface a red xterm banner.
      return
    }
    if (isRemoteTerminalGoneMessage(message)) {
      // Why: paired web clients consume host-published PTY handles. If the host
      // retires one between snapshots, clear this mirror and wait for the next
      // session-tabs update instead of surfacing a red xterm error.
      retireRemoteTerminalId()
      if (!isWebTerminalSurfaceTabId(tabId ?? '')) {
        storedCallbacks.onError?.(remoteTerminalGoneMessage())
      }
      return
    }
    storedCallbacks.onError?.(message)
  }

  // Why: after a transport drop the host may have re-minted this pane's
  // handle (reconnect, epoch or PTY change). Re-derive it from the current
  // session snapshot instead of resubscribing the stale closure value, which
  // would mirror (and type into) whatever PTY now sits behind it (#7718).
  async function resubscribeAfterTransportClose(previousHandle: string): Promise<void> {
    if (tabId && isWebTerminalSurfaceTabId(tabId)) {
      const nextHandle = await listHostSessionHandle(toHostSessionTabId(tabId))
      if (destroyed || !connected || handle !== previousHandle) {
        return
      }
      if (!nextHandle) {
        // Why: the host no longer publishes this surface; retire quietly and
        // let the next session-tabs snapshot drive respawn/removal.
        retireRemoteTerminalId()
        return
      }
      if (nextHandle !== previousHandle) {
        handle = nextHandle
        remotePtyId = toRuntimeTerminalPtyId(
          nextHandle,
          environmentIdForTarget(currentRuntimeTarget)
        )
        onPtySpawn?.(remotePtyId)
      }
    }
    await subscribeToHandle()
  }

  function scheduleResubscribeAfterTransportClose(): void {
    if (destroyed || !connected || !handle) {
      return
    }
    if (resubscribing) {
      resubscribeRequested = true
      return
    }
    resubscribing = true
    const resubscribeHandle = handle
    void resubscribeAfterTransportClose(resubscribeHandle)
      .catch((error) => {
        if (!destroyed && connected && handle) {
          clearPendingViewportClaim()
          handleRemoteTerminalError(error)
        }
      })
      .finally(() => {
        resubscribing = false
        if (resubscribeRequested) {
          resubscribeRequested = false
          scheduleResubscribeAfterTransportClose()
        }
      })
  }

  async function subscribeToHandle(): Promise<void> {
    if (!handle) {
      return
    }
    const subscribedHandle = handle
    const subscribedPtyId = remotePtyId
    const generation = ++subscriptionGeneration
    let transportClosed = false
    // Why: the viewport we hand the subscribe request. A resize landing during
    // the round-trip falls back to the one-shot RPC, which is refresh-only (no
    // leak) and no-ops before the stream record exists — so replay the latest
    // remembered viewport through the stream once it's current (below).
    const subscribedViewport = desiredViewport
    const isCurrentSubscription = (): boolean =>
      !transportClosed &&
      generation === subscriptionGeneration &&
      isCurrentRemoteTerminal(subscribedHandle, subscribedPtyId)
    const nextStream = await getRuntimeTerminalMultiplexer(currentRuntimeTarget).subscribeTerminal({
      terminal: subscribedHandle,
      client: { id: clientId, type: 'desktop' },
      viewport: subscribedViewport ?? undefined,
      callbacks: {
        onData: (data, meta, onParsed) => {
          if (isCurrentSubscription()) {
            const parseStartedAt = performance.now()
            deliverPtyDataWithDeferredCredit(
              () => {
                recordTerminalFreezeBreadcrumb('multiplex-output-parsed', {
                  bytes: meta.wireByteLength,
                  durationMs: performance.now() - parseStartedAt
                })
                onParsed()
              },
              () =>
                outputProcessor.processData(data, storedCallbacks, undefined, {
                  rawLength: data.length
                })
            )
          } else {
            onParsed()
          }
        },
        onSnapshot: (data, meta, onParsed) => {
          // Why: a snapshot with no body can still carry a pending mid-escape
          // tail that must be replayed so the next live chunk completes it.
          if ((data || meta?.pendingEscapeTailAnsi) && isCurrentSubscription()) {
            const parseStartedAt = performance.now()
            outputProcessor.processData(data, storedCallbacks, {
              replayingBufferedData: true,
              suppressAttentionEvents: true,
              ...(meta?.pendingEscapeTailAnsi
                ? { pendingEscapeTailAnsi: meta.pendingEscapeTailAnsi }
                : {}),
              snapshotCols: meta.cols,
              snapshotRows: meta.rows,
              onReplayParsed: () => {
                recordTerminalFreezeBreadcrumb('multiplex-snapshot-parsed', {
                  bytes: meta.wireByteLength,
                  durationMs: performance.now() - parseStartedAt
                })
                onParsed()
              }
            })
          } else {
            onParsed()
          }
        },
        onSideEffectBatch: (batch) => {
          if (!isCurrentSubscription() || !subscribedPtyId) {
            return
          }
          sideEffectSeq += 1
          publishRendererTerminalSideEffects({
            ptyId: subscribedPtyId,
            seq: sideEffectSeq,
            facts: batch.facts,
            replay: batch.replay
          })
        },
        onClearBuffer: () => {
          if (isCurrentSubscription()) {
            outputProcessor.processData('\x1b[2J\x1b[3J\x1b[H', storedCallbacks)
          }
        },
        onSubscribed: () => {
          if (!isCurrentSubscription()) {
            return
          }
          storedCallbacks.onConnect?.()
          storedCallbacks.onStatus?.('shell')
        },
        onEnd: () => {
          if (!isCurrentSubscription()) {
            return
          }
          outputProcessor.clearAccumulatedState()
          connected = false
          handle = null
          remotePtyId = null
          multiplexedStream = null
          multiplexedStreamHandle = null
          clearPendingViewportClaim()
          storedCallbacks.onExit?.(0)
          storedCallbacks.onDisconnect?.()
          if (subscribedPtyId) {
            onPtyExit?.(subscribedPtyId)
          }
        },
        onError: (message, error) => {
          if (isCurrentSubscription()) {
            recordTerminalFreezeBreadcrumb('multiplex-stream-error')
            handleRemoteTerminalError(message)
            if (error?.kind === 'protocol' && !error.retryable) {
              transportClosed = true
              connected = false
              clearPendingViewportClaim()
              multiplexedStream = null
              multiplexedStreamHandle = null
              storedCallbacks.onDisconnect?.()
            }
          }
        },
        onFitOverrideChanged: (event) => {
          if (isCurrentSubscription() && subscribedPtyId) {
            setFitOverride(subscribedPtyId, event.mode, event.cols, event.rows)
          }
        },
        onDriverChanged: (driver) => {
          if (isCurrentSubscription() && subscribedPtyId) {
            setDriverForPty(subscribedPtyId, driver)
          }
        },
        onTransportClose: () => {
          recordTerminalFreezeBreadcrumb('multiplex-reconnect')
          transportClosed = true
          if (generation !== subscriptionGeneration) {
            return
          }
          if (!isCurrentSubscription()) {
            // isCurrentSubscription excludes the just-closed stream by design.
            if (!isCurrentRemoteTerminal(subscribedHandle, subscribedPtyId)) {
              return
            }
          }
          multiplexedStream = null
          multiplexedStreamHandle = null
          scheduleResubscribeAfterTransportClose()
        }
      }
    })
    if (
      transportClosed ||
      generation !== subscriptionGeneration ||
      destroyed ||
      !connected ||
      handle !== subscribedHandle ||
      remotePtyId !== subscribedPtyId
    ) {
      nextStream.close()
      return
    }
    closeMultiplexedStream()
    multiplexedStream = nextStream
    multiplexedStreamHandle = subscribedHandle
    nextStream.setDeliveryState(desiredDelivery)
    // Why: a viewport change that landed during the subscribe round-trip took
    // the now-no-op one-shot fallback, so the stream record is still at the
    // subscribe-time size. Replay the latest remembered viewport so the PTY
    // tracks the current width instead of stalling until the next resize.
    if (pendingViewportClaim && desiredViewport) {
      nextStream.claimViewport(desiredViewport.cols, desiredViewport.rows)
      finishPendingViewportClaim(nextStream)
    } else if (
      desiredViewport &&
      (desiredViewport.cols !== subscribedViewport?.cols ||
        desiredViewport.rows !== subscribedViewport?.rows)
    ) {
      nextStream.resize(desiredViewport.cols, desiredViewport.rows)
    }
  }

  return {
    async connect(options) {
      storedCallbacks = options.callbacks
      if (destroyed || !worktreeId) {
        return
      }

      try {
        if (isWebTerminalSurfaceTabId(tabId ?? '')) {
          return await attachHostSessionMirror(options)
        }

        const commandToSend = options.command ?? command
        const startupCommandDeliveryToSend =
          options.startupCommandDelivery ?? startupCommandDelivery
        const envToSend = options.env ?? env
        const envToDeleteToSend = options.envToDelete ?? envToDelete
        const launchConfigToSend = options.launchConfig ?? launchConfig
        const launchTokenToSend = options.launchToken ?? launchToken
        const launchAgentToSend = options.launchAgent ?? launchAgent
        const created = await retryRuntimeUnavailable(
          () =>
            callRuntime<{ terminal: RuntimeTerminalCreate }>('terminal.create', {
              worktree: toRuntimeTerminalWorktreeSelector(worktreeId),
              viewport: { cols: options.cols ?? 80, rows: options.rows ?? 24 },
              ...(commandToSend !== undefined ? { command: commandToSend } : {}),
              ...(cwd !== undefined ? { cwd } : {}),
              ...(cwdFallback !== undefined ? { cwdFallback } : {}),
              ...(startupCommandDeliveryToSend !== undefined
                ? { startupCommandDelivery: startupCommandDeliveryToSend }
                : {}),
              ...(envToSend !== undefined ? { env: envToSend } : {}),
              ...(envToDeleteToSend !== undefined ? { envToDelete: envToDeleteToSend } : {}),
              ...(launchConfigToSend !== undefined ? { launchConfig: launchConfigToSend } : {}),
              ...(launchTokenToSend !== undefined ? { launchToken: launchTokenToSend } : {}),
              ...(launchAgentToSend !== undefined ? { launchAgent: launchAgentToSend } : {}),
              tabId,
              leafId,
              focus: false,
              // Why: this transport is backing an already-mounted renderer pane;
              // activation here is local state, not permission for remote UI reveal.
              presentation: 'background',
              ...(activate === true ? { activate: true } : {})
            }),
          () => destroyed
        )
        handle = created.terminal.handle
        if (created.terminal.ptyId) {
          rememberTerminalSessionId(
            created.terminal.handle,
            created.terminal.ptyId,
            environmentIdForTarget(currentRuntimeTarget)
          )
        }
        if (destroyed) {
          // Why: this is a cancelled launch, not a connected shared session.
          // Close the server PTY so rapid tab-open/tab-close does not leak.
          await closeRemoteTerminal(created.terminal.handle)
          return
        }

        remotePtyId = toRuntimeTerminalPtyId(handle, environmentIdForTarget(currentRuntimeTarget))
        connected = true
        desiredViewport = {
          cols: options.cols ?? 80,
          rows: options.rows ?? 24
        }
        onPtySpawn?.(remotePtyId)

        await subscribeToHandle()
        if (destroyed || !connected || !remotePtyId) {
          return
        }

        return {
          id: remotePtyId,
          replay: '',
          ...(created.terminal.restore.startupCwdFallback
            ? { startupCwdFallback: created.terminal.restore.startupCwdFallback }
            : {})
        } satisfies PtyConnectResult
      } catch (error) {
        storedCallbacks.onError?.(runtimeTerminalErrorMessage(error))
        return undefined
      }
    },

    attach(options) {
      storedCallbacks = options.callbacks
      const restoredTerminal = parseRuntimeTerminalPtyId(options.existingPtyId)
      const previousHandle = handle
      const nextHandle = restoredTerminal?.handle ?? null
      if (previousHandle && previousHandle !== nextHandle) {
        // Why: debounced input is scoped by the current terminal handle at flush time.
        inputBatcher.clear()
      }
      if (!restoredTerminal) {
        handle = null
        connected = false
        remotePtyId = null
        closeMultiplexedStream()
        storedCallbacks.onError?.('Remote runtime terminal id is invalid.')
        return
      }
      handle = restoredTerminal.handle
      currentRuntimeTarget = restoredTerminal.environmentId
        ? { kind: 'environment', environmentId: restoredTerminal.environmentId }
        : runtimeTarget
      remotePtyId = options.existingPtyId
      connected = true
      desiredViewport = {
        cols: options.cols ?? 80,
        rows: options.rows ?? 24
      }
      const targetHandle = handle
      const targetPtyId = remotePtyId
      void subscribeToHandle().catch((error) => {
        if (!isCurrentRemoteTerminal(targetHandle, targetPtyId)) {
          return
        }
        if (handle === targetHandle && multiplexedStreamHandle !== targetHandle) {
          closeMultiplexedStream()
        }
        clearPendingViewportClaim()
        handleRemoteTerminalError(error)
      })
    },

    disconnect() {
      inputBatcher.flush()
      inputBatcher.clear()
      viewportBatcher.flush()
      outputProcessor.clearAccumulatedState()
      if (!connected && !handle) {
        return
      }
      connected = false
      clearPendingViewportClaim()
      const id = remotePtyId
      closeMultiplexedStream()
      handle = null
      remotePtyId = null
      storedCallbacks.onDisconnect?.()
      if (id) {
        onPtyExit?.(id)
      }
    },

    detach() {
      inputBatcher.flush()
      inputBatcher.clear()
      viewportBatcher.flush()
      outputProcessor.clearAccumulatedState()
      connected = false
      clearPendingViewportClaim()
      closeMultiplexedStream()
      storedCallbacks = {}
    },

    sendInput(data: string): boolean {
      if (!connected || !handle) {
        return false
      }
      if (!data) {
        return true
      }
      // Why: callers use \r or terminal.send's enter flag for semantic Enter;
      // literal LF bytes from paste/programmatic input must survive the stream.
      return inputBatcher.push(data)
    },

    // Why: terminal query replies (CPR/DSR/DA/OSC color/pixel size) are read by
    // the querying program in raw mode with a short timeout. The 8ms input
    // debounce makes the reply miss that window, so it lands on the shell prompt
    // and is echoed literally / spliced into typed input (#7329). Flush any
    // pending batched input first so byte order is preserved, then send the
    // reply immediately without arming the debounce timer.
    sendInputImmediate(data: string): boolean {
      const targetHandle = handle
      if (!connected || !targetHandle) {
        return false
      }
      if (!data) {
        return true
      }
      // Why: earlier input (e.g. a large paste) may still be in async byte-length
      // validation, so it is captured in the batcher's validationTail and NOT in
      // takePending(). Bypassing the queue here would send the reply ahead of it
      // and reorder bytes on the wire. In that rare window, route the reply
      // through the batcher's ordered queue and flush what is already validated;
      // the reply lands right after the pending input once its validation
      // resolves. Order correctness beats the immediacy that the debounce
      // normally trades away.
      if (inputBatcher.hasPendingValidation()) {
        const accepted = inputBatcher.push(data)
        inputBatcher.flush()
        return accepted
      }
      const pending = inputBatcher.takePending()
      const text = `${pending}${data}`
      const stream = getCurrentMultiplexedStream(targetHandle)
      if (stream?.sendQueryReply(text)) {
        return true
      }
      if (pendingViewportClaim) {
        pendingClaimInput += text
        return true
      }
      void callRuntime('terminal.send', {
        terminal: targetHandle,
        text,
        client: { id: clientId, type: 'desktop' },
        ...(desiredViewport ? { viewport: desiredViewport, claimViewport: true as const } : {})
      }).catch((error) => {
        handleRemoteTerminalError(error)
      })
      return true
    },

    sendInputAccepted: sendInputAcceptedToRuntime,

    claimViewport(cols: number, rows: number): boolean {
      if (!connected || !handle) {
        return false
      }
      rememberViewport(cols, rows)
      viewportBatcher.clear()
      sendViewportUpdate(cols, rows, true)
      return true
    },

    resize(cols: number, rows: number, meta): boolean {
      if (!connected || !handle) {
        return false
      }
      rememberViewport(cols, rows)
      if (meta?.claim) {
        viewportBatcher.clear()
        sendViewportUpdate(cols, rows, true)
        return true
      }
      // Why: xterm fit can emit resize bursts while the user drags panes or
      // restores layouts. Remote runtimes only need the last viewport in a frame.
      viewportBatcher.queue(cols, rows)
      return true
    },

    setDeliveryState(state): boolean {
      desiredDelivery = state
      if (!handle) {
        return false
      }
      return getCurrentMultiplexedStream(handle)?.setDeliveryState(state) ?? false
    },

    isConnected() {
      return connected
    },

    getPtyId() {
      return remotePtyId
    },

    getConnectionId() {
      return null
    },

    getRuntimeEnvironmentId() {
      return environmentIdForTarget(currentRuntimeTarget)
    },

    async serializeBuffer(opts) {
      if (!connected || !handle) {
        return null
      }
      return getCurrentMultiplexedStream(handle)?.serializeBuffer(opts) ?? null
    },

    destroy() {
      destroyed = true
      this.disconnect()
      inputBatcher.clear()
      viewportBatcher.clear()
    }
  }
}

function environmentIdForTarget(target: RuntimeClientTarget): string | null {
  return target.kind === 'environment' ? target.environmentId : null
}
