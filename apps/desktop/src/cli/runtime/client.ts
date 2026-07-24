import {
  describeRuntimeCompatBlock,
  evaluateRuntimeCompat,
  MIN_COMPATIBLE_RUNTIME_SERVER_VERSION,
  RUNTIME_PROTOCOL_VERSION
} from '@yiru/runtime-protocol/capabilities'

import { parsePairingCode, type PairingOffer } from '../../shared/pairing'
import type {
  RuntimeMethodContract,
  RuntimeMethodParams,
  RuntimeMethodResult
} from '../../shared/runtime-method-contract'
import { STATUS_GET_CONTRACT } from '../../shared/runtime-method-contracts/runtime-control-contracts'
import type { CliStatusResult, RuntimeStatus } from '../../shared/runtime-types'
import { markEnvironmentUsed, resolveEnvironmentPairingOffer } from './environments'
import { launchYiruApp } from './launch'
import { getDefaultUserDataPath, readMetadata } from './metadata'
import { getCliStatus, resolveDesktopWindowStatus } from './status'
import { sendRequest } from './transport'
import { RuntimeClientError, RuntimeRpcFailureError, type RuntimeRpcSuccess } from './types'
import { sendWebSocketRequest } from './websocket-transport'

// Why: for long-poll methods the caller's method-level
// `params.timeoutMs` is the inner waiter budget; we extend the client-side
// socket timeout to `timeoutMs + GRACE_MS` so the client's own idle timer
// never fires before the server-side waiter has had a chance to resolve and
// emit its terminal frame. The 10 s grace absorbs round-trip + one final
// keepalive window. See design doc §3.1.
const LONG_POLL_CLIENT_GRACE_MS = 10_000

export class RuntimeClient {
  private readonly userDataPath: string
  private readonly requestTimeoutMs: number
  private readonly remotePairing: PairingOffer | null
  private readonly environmentSelector: string | null
  private remoteCompatChecked = false

  // Why: browser commands trigger first-time session init (agent-browser connect +
  // CDP proxy setup) which can take 15-30s. 60s accommodates cold start without
  // being so large that genuine hangs go unnoticed.
  constructor(
    userDataPath = getDefaultUserDataPath(),
    requestTimeoutMs = 60_000,
    remotePairingCode = process.env.YIRU_PAIRING_CODE ?? process.env.YIRU_REMOTE_PAIRING ?? null,
    environmentSelector = process.env.YIRU_ENVIRONMENT ?? null
  ) {
    this.userDataPath = userDataPath
    this.requestTimeoutMs = requestTimeoutMs
    this.environmentSelector = environmentSelector
    this.remotePairing = resolveRemotePairing(userDataPath, remotePairingCode, environmentSelector)
  }

  get isRemote(): boolean {
    return this.remotePairing !== null
  }

  async call<TResult>(
    contract: string,
    params?: unknown,
    options?: {
      timeoutMs?: number
    }
  ): Promise<RuntimeRpcSuccess<TResult>>
  async call<TContract extends RuntimeMethodContract>(
    contract: TContract,
    params: RuntimeMethodParams<TContract>,
    options?: { timeoutMs?: number }
  ): Promise<RuntimeRpcSuccess<RuntimeMethodResult<TContract>>>
  async call<TResult>(
    contract: string | RuntimeMethodContract,
    params?: unknown,
    options?: { timeoutMs?: number }
  ): Promise<RuntimeRpcSuccess<TResult>> {
    const method = typeof contract === 'string' ? contract : contract.name
    const effectiveTimeoutMs = options?.timeoutMs ?? this.resolveMethodTimeoutMs(method, params)
    if (this.remotePairing) {
      if (method !== STATUS_GET_CONTRACT.name) {
        await this.ensureRemoteRuntimeCompatible(effectiveTimeoutMs)
      }
      const response = await sendWebSocketRequest<TResult>(
        this.remotePairing,
        method,
        params,
        effectiveTimeoutMs
      )
      if (response.ok === false) {
        throw new RuntimeRpcFailureError(response)
      }
      if (this.environmentSelector) {
        markEnvironmentUsed(this.userDataPath, this.environmentSelector, {
          runtimeId: response._meta.runtimeId
        })
      }
      return response
    }
    const metadata = readMetadata(this.userDataPath)
    const response = await sendRequest<TResult>(metadata, method, params, effectiveTimeoutMs)
    if (response.ok === false) {
      throw new RuntimeRpcFailureError(response)
    }
    return response
  }

  // Why: centralises the per-method timeout policy. Long-poll inner waiter
  // budgets live in `params.timeoutMs`; widen the client-side socket timeout
  // to `timeoutMs + grace` so it doesn't fire before the server has a chance
  // to resolve. Without this, a 5 min wait would still die at the 60 s default.
  // See design doc §3.1.
  private resolveMethodTimeoutMs(method: string, params?: unknown): number {
    if (
      (method === 'orchestration.check' && isWaitingCheck(params)) ||
      method === 'terminal.wait'
    ) {
      const inner = Number(getTimeoutMsParam(params))
      if (Number.isFinite(inner) && inner > 0) {
        return Math.max(inner + LONG_POLL_CLIENT_GRACE_MS, this.requestTimeoutMs)
      }
    }
    return this.requestTimeoutMs
  }

  async getCliStatus(): Promise<RuntimeRpcSuccess<CliStatusResult>> {
    if (this.remotePairing) {
      const response = await this.call(STATUS_GET_CONTRACT, undefined)
      this.assertRemoteRuntimeStatusCompatible(response.result)
      this.remoteCompatChecked = true
      const graphState = response.result.graphStatus
      return {
        id: response.id,
        ok: true,
        result: {
          // Why: remote status proves the paired runtime is reachable, not
          // that this client machine has a local Yiru desktop process.
          app: {
            running: false,
            pid: null,
            // Why: reuse the shared resolver so remote status honors the same
            // authoritativeWindowId fallback as local status for old runtimes.
            ...(() => {
              const desktopWindowStatus = resolveDesktopWindowStatus(response.result)
              return desktopWindowStatus ? { desktopWindowStatus } : {}
            })()
          },
          runtime: {
            state: graphState === 'ready' ? 'ready' : 'graph_not_ready',
            reachable: true,
            runtimeId: response.result.runtimeId,
            ...(response.result.appVersion ? { appVersion: response.result.appVersion } : {}),
            ...(response.result.remoteUpdateSupport
              ? { remoteUpdateSupport: response.result.remoteUpdateSupport }
              : {}),
            ...(response.result.capabilities ? { capabilities: response.result.capabilities } : {})
          },
          graph: {
            state: graphState
          }
        },
        _meta: response._meta
      }
    }
    return getCliStatus(this.userDataPath)
  }

  private async ensureRemoteRuntimeCompatible(timeoutMs: number): Promise<void> {
    if (!this.remotePairing || this.remoteCompatChecked) {
      return
    }
    const response = await sendWebSocketRequest(
      this.remotePairing,
      STATUS_GET_CONTRACT,
      undefined,
      timeoutMs
    )
    if (response.ok === false) {
      throw new RuntimeRpcFailureError(response)
    }
    this.assertRemoteRuntimeStatusCompatible(response.result)
    this.remoteCompatChecked = true
    if (this.environmentSelector) {
      markEnvironmentUsed(this.userDataPath, this.environmentSelector, {
        runtimeId: response._meta.runtimeId
      })
    }
  }

  private assertRemoteRuntimeStatusCompatible(status: RuntimeStatus): void {
    const verdict = evaluateRuntimeCompat({
      clientProtocolVersion: RUNTIME_PROTOCOL_VERSION,
      minCompatibleServerProtocolVersion: MIN_COMPATIBLE_RUNTIME_SERVER_VERSION,
      serverProtocolVersion: status.runtimeProtocolVersion ?? status.protocolVersion,
      serverMinCompatibleClientProtocolVersion:
        status.minCompatibleRuntimeClientVersion ?? status.minCompatibleMobileVersion
    })
    if (verdict.kind === 'blocked') {
      throw new RuntimeClientError('incompatible_runtime', describeRuntimeCompatBlock(verdict))
    }
  }

  async openYiru(timeoutMs = 15_000): Promise<RuntimeRpcSuccess<CliStatusResult>> {
    const initial = await this.getCliStatus()
    if (!this.remotePairing) {
      // Why: a blocked runtime can't open a window, so spawning the app would
      // only hit the single-instance lock and exit — bail before launching.
      if (initial.result.app.desktopWindowStatus === 'blocked') {
        throwDesktopActivationBlocked()
      }
      launchYiruApp()
    }
    if (isOpenYiruReady(initial, this.remotePairing !== null)) {
      return initial
    }

    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      const status = await this.getCliStatus()
      if (!this.remotePairing && status.result.app.desktopWindowStatus === 'blocked') {
        throwDesktopActivationBlocked()
      }
      if (isOpenYiruReady(status, this.remotePairing !== null)) {
        return status
      }
      await delay(250)
    }

    throw new RuntimeClientError(
      'runtime_open_timeout',
      this.remotePairing
        ? 'Timed out waiting for the remote Yiru runtime to become ready.'
        : 'Timed out waiting for a ready Yiru desktop window. The runtime may still be running headlessly.'
    )
  }
}

function isOpenYiruReady(status: RuntimeRpcSuccess<CliStatusResult>, remote: boolean): boolean {
  // Why: desktop availability can precede renderer graph/store attachment on a
  // cold launch; follow-up workspace RPCs are safe only once both are ready.
  return (
    status.result.graph.state === 'ready' &&
    (remote || status.result.app.desktopWindowStatus === 'available')
  )
}

function throwDesktopActivationBlocked(): never {
  throw new RuntimeClientError(
    'desktop_activation_blocked',
    'Yiru is running headlessly, but it cannot open a desktop window safely because the persistent terminal provider is unavailable. Quit Yiru normally and start the app again; do not use open -n.'
  )
}

function resolveRemotePairing(
  userDataPath: string,
  pairingCode: string | null,
  environmentSelector: string | null
): PairingOffer | null {
  if (pairingCode && environmentSelector) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Use either --pairing-code or --environment, not both.'
    )
  }
  if (environmentSelector) {
    return resolveEnvironmentPairingOffer(userDataPath, environmentSelector)
  }
  if (!pairingCode) {
    return null
  }
  const pairing = parsePairingCode(pairingCode)
  if (!pairing) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Invalid remote pairing code. Expected a yiru://pair?... URL or bare pairing payload.'
    )
  }
  return pairing
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isWaitingCheck(params: unknown): boolean {
  return (
    typeof params === 'object' &&
    params !== null &&
    'wait' in params &&
    (params as { wait: unknown }).wait === true
  )
}

function getTimeoutMsParam(params: unknown): unknown {
  if (typeof params !== 'object' || params === null || !('timeoutMs' in params)) {
    return undefined
  }
  return (params as { timeoutMs?: unknown }).timeoutMs
}
