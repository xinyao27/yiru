import type {
  NativeChatSessionInput,
  RuntimeNativeChatReadSessionResult,
  RuntimeNativeChatSubscriptionEvent
} from '@yiru/runtime-protocol/contract'
import type { AgentType } from '@yiru/workbench-model/agent'
import { translate } from '~renderer/i18n/i18n'
import { isWebClientLocation } from '~renderer/lib/web-client-location'
import {
  callRuntimeOrpc,
  createRuntimeOrpcClient,
  isRuntimeOrpcErrorCode,
  type RuntimeClientTarget
} from '~renderer/runtime/orpc-client'
import { isRuntimeCompatBlockError } from '~renderer/runtime/protocol-compat'
import { useAppStore } from '~renderer/store'

type NativeChatSubscribeArgs = NativeChatSessionInput & { subscriptionId: string }
type NativeChatSubscriptionFrame = Exclude<RuntimeNativeChatSubscriptionEvent, { type: 'end' }>
type NativeChatReadSessionResult = RuntimeNativeChatReadSessionResult

export type NativeChatSessionTransport = {
  readSession: (
    agent: AgentType,
    sessionId: string,
    limit?: number,
    transcriptPath?: string
  ) => Promise<NativeChatReadSessionResult>
  subscribe: (
    args: NativeChatSubscribeArgs,
    onFrame: (frame: NativeChatSubscriptionFrame) => void
  ) => () => void
}

const RUNTIME_TOO_OLD =
  'This remote runtime is too old to show agent chat history. Update the remote runtime to view it.'

const RUNTIME_NATIVE_CHAT_RECONNECT_MS = 2_000

/** Map a runtime read failure to the message the read-error state renders. A
 *  version block (old runtime lacking the method, or the protocol-compat gate)
 *  gets the explicit "update the remote runtime" copy (R4); anything else — a
 *  timeout or transport error — gets a generic message, so a transient failure is
 *  never mislabeled as a version problem (KTD-4, not catch-all). */
export function toRuntimeNativeChatErrorMessage(err: unknown): string {
  if (isRuntimeOrpcErrorCode(err, 'method_not_found')) {
    return RUNTIME_TOO_OLD
  }
  if (isRuntimeCompatBlockError(err)) {
    return RUNTIME_TOO_OLD
  }
  return "Couldn't read agent chat from the remote runtime."
}

function subscribeNativeChatFrames(
  target: RuntimeClientTarget,
  args: NativeChatSubscribeArgs,
  onFrame: (frame: NativeChatSubscriptionFrame) => void
): () => void {
  let cancelled = false
  let receivedFrame = false
  let activeAttempt = 0
  let attemptController: AbortController | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  const scheduleReconnect = (attempt: number): void => {
    if (cancelled || attempt !== activeAttempt || reconnectTimer) {
      return
    }
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      openStream()
    }, RUNTIME_NATIVE_CHAT_RECONNECT_MS)
  }

  const openStream = (): void => {
    const attempt = ++activeAttempt
    const controller = new AbortController()
    attemptController?.abort()
    attemptController = controller
    void (async () => {
      let connection: Awaited<ReturnType<typeof createRuntimeOrpcClient>> | null = null
      let shouldReconnect = false
      try {
        connection = await createRuntimeOrpcClient(target, {
          signal: controller.signal,
          timeoutMs: 15_000
        })
        const stream = await connection.client.nativeChat.subscribe(args, {
          signal: controller.signal
        })
        for await (const frame of stream) {
          if (cancelled || controller.signal.aborted || attempt !== activeAttempt) {
            return
          }
          if (frame.type === 'end') {
            shouldReconnect = true
            break
          }
          receivedFrame = true
          onFrame(frame)
        }
        if (!cancelled && !controller.signal.aborted) {
          shouldReconnect = true
        }
      } catch (error) {
        if (cancelled || controller.signal.aborted || attempt !== activeAttempt) {
          return
        }
        if (receivedFrame) {
          shouldReconnect = true
        } else {
          onFrame({
            type: 'snapshot',
            messages: [],
            hasMore: false,
            error: toRuntimeNativeChatErrorMessage(error)
          })
        }
      } finally {
        connection?.close()
        if (shouldReconnect) {
          scheduleReconnect(attempt)
        }
      }
    })()
  }

  openStream()
  return () => {
    cancelled = true
    attemptController?.abort()
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }
}

function localNativeChatSubscriptionTarget(): RuntimeClientTarget | null {
  if (!isWebClientLocation()) {
    return { kind: 'local' }
  }
  const environmentId = useAppStore.getState().settings?.activeRuntimeEnvironmentId?.trim()
  return environmentId ? { kind: 'environment', environmentId } : null
}

const localNativeChatTransport: NativeChatSessionTransport = {
  readSession: async (agent, sessionId, limit, transcriptPath) => {
    const target = localNativeChatSubscriptionTarget()
    if (!target) {
      return {
        error: translate(
          'components.native-chat.state.pairHost',
          'Pair a host to view agent chat history.'
        )
      }
    }
    return callRuntimeOrpc(target, (client) => client.nativeChat.readSession, {
      agent,
      sessionId,
      limit: limit ?? (isWebClientLocation() ? undefined : 300),
      transcriptPath
    })
  },
  subscribe: (args, onFrame) => {
    const target = localNativeChatSubscriptionTarget()
    if (!target) {
      onFrame({
        type: 'snapshot',
        messages: [],
        hasMore: false,
        error: translate(
          'components.native-chat.state.pairHost',
          'Pair a host to view agent chat history.'
        )
      })
      return () => {}
    }
    return subscribeNativeChatFrames(target, args, onFrame)
  }
}

function createRuntimeNativeChatTransport(environmentId: string): NativeChatSessionTransport {
  const target: RuntimeClientTarget = { kind: 'environment', environmentId }

  return {
    readSession: async (agent, sessionId, limit, transcriptPath) => {
      try {
        return await callRuntimeOrpc(
          target,
          (client) => client.nativeChat.readSession,
          { agent, sessionId, limit, transcriptPath },
          { timeoutMs: 15_000 }
        )
      } catch (err) {
        return { error: toRuntimeNativeChatErrorMessage(err) }
      }
    },
    subscribe: (args, onFrame) => subscribeNativeChatFrames(target, args, onFrame)
  }
}

/** Select the read/subscribe transport for a pane. Route to the remote runtime
 *  only for a `runtime:`-owned pane on a non-web client (KTD-2); web and
 *  local/`ssh:`-owned panes keep the local adapter. */
export function getNativeChatSessionTransport(
  runtimeEnvironmentId: string | null
): NativeChatSessionTransport {
  if (runtimeEnvironmentId && !isWebClientLocation()) {
    return createRuntimeNativeChatTransport(runtimeEnvironmentId)
  }
  return localNativeChatTransport
}

let subscriptionCounter = 0

/** Unique per-subscribe id for `NativeChatSessionTransport.subscribe`. */
export function nextNativeChatSubscriptionId(): string {
  subscriptionCounter += 1
  return `native-chat-${subscriptionCounter}-${Date.now()}`
}

/** Resolves the subscription teardown defensively for callers mounted before
 *  every transport returned a synchronous unsubscribe function. */
export function resolveNativeChatUnsubscribe(unsubscribe: unknown): void {
  if (typeof unsubscribe === 'function') {
    ;(unsubscribe as () => void)()
    return
  }
  if (unsubscribe && typeof (unsubscribe as { then?: unknown }).then === 'function') {
    void (unsubscribe as Promise<unknown>).then((fn) => {
      if (typeof fn === 'function') {
        ;(fn as () => void)()
      }
    })
  }
}
