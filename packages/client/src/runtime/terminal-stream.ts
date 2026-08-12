import type { GlobalSettings } from '~shared/types'

import { callRuntimeOrpc } from './orpc-client'
import { RuntimeRpcCallError, getActiveRuntimeTarget } from './rpc-client'
import { getRuntimeTerminalMultiplexer } from './terminal-multiplex/registry'
import { publishRendererTerminalSideEffects } from './terminal-side-effect-client'

const RUNTIME_TERMINAL_PTY_ID_PREFIX = 'runtime:'
const RUNTIME_TERMINAL_OWNER_SEPARATOR = '@@'
const LIVE_TAIL_SUBSCRIPTION_TIMEOUT_MS = 10_000

export type RuntimeTerminalPtyIdParts = {
  environmentId: string | null
  handle: string
}

export function toRuntimeTerminalPtyId(handle: string, environmentId?: string | null): string {
  const owner = environmentId?.trim()
  if (!owner) {
    return `${RUNTIME_TERMINAL_PTY_ID_PREFIX}${handle}`
  }
  return `${RUNTIME_TERMINAL_PTY_ID_PREFIX}${encodeURIComponent(owner)}${RUNTIME_TERMINAL_OWNER_SEPARATOR}${encodeURIComponent(handle)}`
}

export function parseRuntimeTerminalPtyId(ptyId: string): RuntimeTerminalPtyIdParts | null {
  if (!ptyId.startsWith(RUNTIME_TERMINAL_PTY_ID_PREFIX)) {
    return null
  }
  const rest = ptyId.slice(RUNTIME_TERMINAL_PTY_ID_PREFIX.length)
  const separatorIndex = rest.indexOf(RUNTIME_TERMINAL_OWNER_SEPARATOR)
  if (separatorIndex === -1) {
    return { environmentId: null, handle: rest }
  }
  try {
    return {
      environmentId: decodeURIComponent(rest.slice(0, separatorIndex)),
      handle: decodeURIComponent(
        rest.slice(separatorIndex + RUNTIME_TERMINAL_OWNER_SEPARATOR.length)
      )
    }
  } catch {
    return null
  }
}

export function isRuntimeTerminalPtyId(ptyId: string | null | undefined): ptyId is string {
  return typeof ptyId === 'string' && parseRuntimeTerminalPtyId(ptyId) !== null
}

export function getRuntimeTerminalHandle(ptyId: string): string | null {
  return parseRuntimeTerminalPtyId(ptyId)?.handle ?? null
}

export function getRuntimeTerminalEnvironmentId(ptyId: string): string | null {
  return parseRuntimeTerminalPtyId(ptyId)?.environmentId ?? null
}

export function runtimeTerminalErrorMessage(error: unknown): string {
  if (error instanceof RuntimeRpcCallError) {
    return error.message
  }
  return error instanceof Error ? error.message : String(error)
}

export async function subscribeToRuntimeTerminalData(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  ptyId: string,
  clientId: string,
  watcher: (data: string) => void,
  options?: {
    startAtLiveTail?: boolean
    delivery?: {
      visible: boolean
      interested: boolean
      priority: 'parked' | 'visible' | 'active'
    }
  }
): Promise<() => void> {
  const terminal = getRuntimeTerminalHandle(ptyId)
  const ownerEnvironmentId = getRuntimeTerminalEnvironmentId(ptyId)
  const target = ownerEnvironmentId
    ? ({ kind: 'environment', environmentId: ownerEnvironmentId } as const)
    : getActiveRuntimeTarget(settings)
  if (!terminal) {
    return () => {}
  }

  let resolveLiveTail: (() => void) | null = null
  let rejectLiveTail: ((error: Error) => void) | null = null
  const liveTailReady = options?.startAtLiveTail
    ? new Promise<void>((resolve, reject) => {
        resolveLiveTail = resolve
        rejectLiveTail = reject
      })
    : null
  const rejectPendingLiveTail = (message: string): void => {
    rejectLiveTail?.(new Error(message))
    resolveLiveTail = null
    rejectLiveTail = null
  }

  let sideEffectSeq = 0
  const stream = await getRuntimeTerminalMultiplexer(target).subscribeTerminal({
    terminal,
    client: { id: clientId, type: 'desktop' },
    callbacks: {
      onData: (data, _meta, onParsed) => {
        watcher(data)
        onParsed()
      },
      onSnapshot: (data, _meta, onParsed) => {
        if (!options?.startAtLiveTail) {
          watcher(data)
        }
        onParsed()
      },
      onSideEffectBatch: (batch) => {
        sideEffectSeq += 1
        publishRendererTerminalSideEffects({
          ptyId,
          seq: sideEffectSeq,
          facts: batch.facts,
          replay: batch.replay
        })
      },
      onSubscribed: () => {
        resolveLiveTail?.()
        resolveLiveTail = null
        rejectLiveTail = null
      },
      onEnd: () => rejectPendingLiveTail('Remote terminal ended before live output was ready.'),
      onError: (message) => rejectPendingLiveTail(message),
      onTransportClose: () =>
        rejectPendingLiveTail('Remote terminal closed before live output was ready.')
    }
  })
  if (options?.delivery) {
    stream.setDeliveryState(options.delivery)
  }

  if (liveTailReady) {
    let timeout: ReturnType<typeof setTimeout> | null = setTimeout(
      () => rejectPendingLiveTail('Timed out waiting for remote terminal live output.'),
      LIVE_TAIL_SUBSCRIPTION_TIMEOUT_MS
    )
    try {
      // Why: outcome observers must ignore historical snapshots and be armed
      // before the command whose output they classify, including over SSH.
      await liveTailReady
    } catch (error) {
      stream.close()
      throw error
    } finally {
      if (timeout !== null) {
        clearTimeout(timeout)
        timeout = null
      }
    }
  }

  return () => stream.close()
}

export function subscribeToRuntimeTerminalExit(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  ptyId: string,
  onExit: (code: number) => void
): () => void {
  const terminal = getRuntimeTerminalHandle(ptyId)
  if (!terminal) {
    return () => {}
  }
  const environmentId = getRuntimeTerminalEnvironmentId(ptyId)
  const target = environmentId
    ? ({ kind: 'environment', environmentId } as const)
    : getActiveRuntimeTarget(settings)
  const controller = new AbortController()
  void callRuntimeOrpc(
    target,
    (client) => client.terminal.wait,
    { terminal, for: 'exit' },
    { signal: controller.signal, timeoutMs: 24 * 60 * 60 * 1_000 }
  )
    .then((result) => {
      if (!controller.signal.aborted) {
        onExit(result.wait.exitCode ?? 0)
      }
    })
    .catch(() => {})
  return () => controller.abort()
}
