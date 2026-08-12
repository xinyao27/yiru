import { randomUUID } from 'node:crypto'

import { ORPCError } from '@orpc/client'
import { RPCLink } from '@orpc/client/message-port'
import {
  RUNTIME_ORPC_ORCHESTRATION_CAPABILITY_HEADER,
  RUNTIME_ORPC_ORCHESTRATION_CONTRACT_VERSION_HEADER,
  RUNTIME_ORPC_ORCHESTRATION_REQUEST_ID_HEADER
} from '@yiru/runtime-protocol/orpc-peer-frame'
import type {
  RuntimeOrchestrationEnvelope,
  RuntimeRpcResponse
} from '@yiru/runtime-protocol/rpc-envelope'
import type { PairingOffer } from '~shared/pairing'
import type {
  RemoteRuntimeOrpcTunnel,
  SharedControlOrpcTunnelCallbacks
} from '~shared/remote-runtime/shared-control-types'

type ConnectOrpcTunnel = (
  environmentId: string,
  pairing: PairingOffer,
  ownerId: string,
  timeoutMs: number,
  callbacks: SharedControlOrpcTunnelCallbacks
) => Promise<RemoteRuntimeOrpcTunnel>

// Why: the orchestration envelope fields ride this pooled tunnel as per-call
// oRPC context rather than tunnel-level state — `headers` below reads them
// fresh from each call's own `options.context`, so concurrent callers sharing
// the one pooled link (an ai-vault scan next to a coworking forward) never
// see each other's `orchestrationRequestId`.
type RuntimeOrpcCallContext = {
  orchestrationCapability?: string
  orchestrationContractVersion?: number
  orchestrationRequestId?: string
}

type PooledOrpcEnvironmentClient = {
  link: RPCLink<RuntimeOrpcCallContext>
  isClosed: boolean
}

// Why: one tunnel per (pool namespace, environment) is reused across every
// unary call so concurrent callers (e.g. an ai-vault scan and a coworking
// forward hitting the same paired host) multiplex over the single oRPC
// request-id space `SharedControlOrpcTunnels` already provides, instead of
// each `.orpc.connect()` call replacing (and killing) the previous tunnel
// registered under the same owner id.
const pooledClients = new Map<string, Promise<PooledOrpcEnvironmentClient>>()

// Why: the unchanged main-to-remote E2EE tunnel hands back plain oRPC wire
// frames. Its internal adapter satisfies the oRPC MessagePort-like interface;
// this is not an Electron renderer transport and never leaves main.
class RuntimeOrpcTunnelPort {
  private readonly messageListeners = new Set<(event: { data: unknown }) => void>()
  private readonly closeListeners = new Set<() => void>()

  constructor(
    private readonly sink: {
      sendText: (frame: string) => boolean
      sendBinary: (frame: Uint8Array<ArrayBufferLike>) => boolean
    }
  ) {}

  on(event: string, callback: (event?: { data: unknown }) => void): void {
    if (event === 'message') {
      this.messageListeners.add(callback as (event: { data: unknown }) => void)
    } else if (event === 'close') {
      this.closeListeners.add(callback as () => void)
    }
  }

  postMessage(data: unknown): void {
    if (typeof data === 'string') {
      this.sink.sendText(data)
      return
    }
    if (data instanceof Uint8Array) {
      this.sink.sendBinary(data)
      return
    }
    if (data instanceof ArrayBuffer) {
      this.sink.sendBinary(new Uint8Array(data))
      return
    }
    throw new Error('Runtime oRPC tunnel received an unsupported frame to send')
  }

  emitMessage(data: unknown): void {
    for (const listener of this.messageListeners) {
      listener({ data })
    }
  }

  emitClose(): void {
    for (const listener of this.closeListeners) {
      listener()
    }
  }
}

async function createPooledOrpcEnvironmentClient(
  connect: ConnectOrpcTunnel,
  environmentId: string,
  pairing: PairingOffer,
  ownerId: string,
  timeoutMs: number
): Promise<PooledOrpcEnvironmentClient> {
  let tunnel: RemoteRuntimeOrpcTunnel | null = null
  const port = new RuntimeOrpcTunnelPort({
    sendText: (frame) => tunnel?.sendText(frame) ?? false,
    sendBinary: (frame) => tunnel?.sendBinary(frame) ?? false
  })
  const entry: PooledOrpcEnvironmentClient = {
    link: new RPCLink<RuntimeOrpcCallContext>({ port, headers: buildRuntimeOrpcCallHeaders }),
    isClosed: false
  }
  tunnel = await connect(environmentId, pairing, ownerId, timeoutMs, {
    onText: (frame) => port.emitMessage(frame),
    onBinary: (frame) => port.emitMessage(frame),
    // Why: the only binary-emitting leaves (browser.screencast,
    // terminal.multiplex) are streams, and this client is unary-only — the
    // oRPC gate that routes here requires a `RuntimeMethodContract`, which by
    // its own definition models one-shot request/response methods. So no
    // binary-emitting leaf can arrive on this tunnel and the side channel has
    // no listener to wake. Do not restate this as "those leaves are pinned on
    // legacy transport": slice 83 moved mobile's browser.screencast onto real
    // oRPC (over mobile's own WS transport, not this client), so the pinning
    // premise is false even though the conclusion still holds.
    onSideChannelBinary: () => {},
    onClose: () => {
      entry.isClosed = true
      port.emitClose()
    }
  })
  return entry
}

async function acquirePooledOrpcEnvironmentClient(
  connect: ConnectOrpcTunnel,
  poolKey: string,
  environmentId: string,
  pairing: PairingOffer,
  ownerId: string,
  timeoutMs: number
): Promise<PooledOrpcEnvironmentClient> {
  const cached = pooledClients.get(poolKey)
  if (cached) {
    const entry = await cached
    if (!entry.isClosed) {
      return entry
    }
    if (pooledClients.get(poolKey) === cached) {
      pooledClients.delete(poolKey)
    }
  }
  const promise = createPooledOrpcEnvironmentClient(
    connect,
    environmentId,
    pairing,
    ownerId,
    timeoutMs
  )
  pooledClients.set(poolKey, promise)
  void promise.catch(() => {
    if (pooledClients.get(poolKey) === promise) {
      pooledClients.delete(poolKey)
    }
  })
  return promise
}

// Why: an oRPC handler failure surfaces as a thrown `ORPCError` — the domain
// answer, mapped back to the legacy `{ok:false}` envelope so call sites keep
// reading `response.error` unchanged. Any other thrown value is a transport
// failure (tunnel never connected, frame decode error, abort) and must reject
// instead of masquerading as a domain response, matching how the one-shot and
// shared-control legacy paths already only resolve `{ok:false}` for a real
// server reply and reject on every connection-level failure.
function toRuntimeFailureFromOrpcError(
  error: ORPCError<string, unknown>
): RuntimeRpcResponse<never> {
  const normalizedCode = error.code.toLowerCase() === 'not_found' ? 'method_not_found' : error.code
  return {
    id: randomUUID(),
    ok: false,
    error: { code: normalizedCode, message: error.message, data: error.data }
  }
}

// Why: same header set the CLI's real oRPC client sends
// (`cli/runtime/transport.ts`'s `requestHeaders`) — the server reads them
// uniformly regardless of transport (`request-metadata.ts`'s interceptor),
// so this is the carrier `orchestrationRequestId` needs to survive the trip
// through a pooled, multiplexed tunnel instead of a fresh per-call link.
function buildRuntimeOrpcCallHeaders(options: {
  context: RuntimeOrpcCallContext
}): Record<string, string> {
  const { orchestrationCapability, orchestrationContractVersion, orchestrationRequestId } =
    options.context
  const headers: Record<string, string> = {}
  if (orchestrationCapability) {
    headers[RUNTIME_ORPC_ORCHESTRATION_CAPABILITY_HEADER] = orchestrationCapability
  }
  if (orchestrationContractVersion !== undefined) {
    headers[RUNTIME_ORPC_ORCHESTRATION_CONTRACT_VERSION_HEADER] = String(
      orchestrationContractVersion
    )
  }
  if (orchestrationRequestId) {
    headers[RUNTIME_ORPC_ORCHESTRATION_REQUEST_ID_HEADER] = orchestrationRequestId
  }
  return headers
}

export type RuntimeEnvironmentUnaryOrpcCallArgs = {
  connect: ConnectOrpcTunnel
  poolNamespace: string
  environmentId: string
  pairing: PairingOffer
  runtimeId: string
  path: readonly string[]
  params: unknown
  timeoutMs: number
  signal?: AbortSignal
  beforeSend?: () => void | Promise<void>
  envelope?: RuntimeOrchestrationEnvelope
}

export async function callRuntimeEnvironmentUnaryOrpc(
  args: RuntimeEnvironmentUnaryOrpcCallArgs
): Promise<RuntimeRpcResponse<unknown>> {
  const poolKey = `${args.poolNamespace}:${args.environmentId}`
  const pooled = await acquirePooledOrpcEnvironmentClient(
    args.connect,
    poolKey,
    args.environmentId,
    args.pairing,
    poolKey,
    args.timeoutMs
  )
  // Why: queued mutations must revalidate after the tunnel is ready but right
  // before the wire send, same timing guarantee `requestSharedControl` gives
  // the legacy shared-control path (see its "at transmission" comment).
  await args.beforeSend?.()
  args.signal?.throwIfAborted()
  try {
    const result = await pooled.link.call(args.path, args.params, {
      signal: args.signal,
      context: {
        orchestrationCapability: args.envelope?.orchestrationCapability,
        orchestrationContractVersion: args.envelope?.orchestrationContractVersion,
        orchestrationRequestId: args.envelope?.orchestrationRequestId
      }
    })
    return {
      id: randomUUID(),
      ok: true,
      result,
      _meta: { runtimeId: args.runtimeId }
    }
  } catch (error) {
    if (error instanceof ORPCError) {
      return toRuntimeFailureFromOrpcError(error)
    }
    throw error
  }
}
