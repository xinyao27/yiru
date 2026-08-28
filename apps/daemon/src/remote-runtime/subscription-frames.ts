import {
  RuntimeRpcEnvelopeSchema,
  type RuntimeRpcResponse
} from '@yiru/runtime-protocol/rpc-envelope'
import { RemoteRuntimeClientError } from '@yiru/runtime-protocol/workbench/remote-runtime/client-error'
import { DedicatedRemoteRuntimeOrpcPeer } from '@yiru/runtime-protocol/workbench/remote-runtime/dedicated-orpc-peer'
import { RUNTIME_INBOUND_BINARY_STREAM_CAPABILITY } from '@yiru/runtime-protocol/workbench/runtime-orpc-socket'

import { decrypt, decryptBytes, encrypt } from '../e2ee-crypto'
import {
  rejectInvalidDedicatedOrpcFrame,
  startDedicatedOrpcSubscription
} from './subscription-dedicated-orpc'
import type { RemoteRuntimeSubscriptionSession } from './subscription-session'

function hasAuthenticatedCapability(value: unknown, capability: string): boolean {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const capabilities = (value as { capabilities?: unknown }).capabilities
  return Array.isArray(capabilities) && capabilities.includes(capability)
}

function authenticatedRuntimeId(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const runtimeId = (value as { runtimeId?: unknown }).runtimeId
  return typeof runtimeId === 'string' && runtimeId.length > 0 ? runtimeId : null
}

export function handleRemoteRuntimeSubscriptionMessage<TResult>(
  session: RemoteRuntimeSubscriptionSession<TResult>,
  data: string | Uint8Array<ArrayBufferLike>
): void {
  if (typeof data !== 'string') {
    handleBinaryFrame(session, data)
    return
  }

  const frame = data
  if (session.state === 'awaiting_ready') {
    handleReadyFrame(session, frame)
    return
  }

  const plaintext = decrypt(frame, session.sharedKey)
  if (plaintext === null) {
    session.fail(
      new RemoteRuntimeClientError(
        'invalid_runtime_response',
        'Runtime host returned an undecryptable frame.'
      )
    )
    return
  }

  if (session.state === 'awaiting_authenticated') {
    handleAuthenticatedFrame(session, plaintext)
    return
  }

  if (session.dedicatedOrpcPeer) {
    if (!session.dedicatedOrpcPeer.receiveText(plaintext)) {
      rejectInvalidDedicatedOrpcFrame(session)
    }
    return
  }
  handleRpcFrame(session, plaintext)
}

function handleReadyFrame<TResult>(
  session: RemoteRuntimeSubscriptionSession<TResult>,
  frame: string
): void {
  let ready: unknown
  try {
    ready = JSON.parse(frame)
  } catch {
    session.fail(
      new RemoteRuntimeClientError(
        'invalid_runtime_response',
        'Runtime host returned an invalid E2EE handshake frame.'
      )
    )
    return
  }
  if (
    typeof ready !== 'object' ||
    ready === null ||
    (ready as { type?: unknown }).type !== 'e2ee_ready'
  ) {
    session.fail(
      new RemoteRuntimeClientError(
        'invalid_runtime_response',
        'Runtime host returned an unexpected E2EE handshake frame.'
      )
    )
    return
  }
  session.state = 'awaiting_authenticated'
  session.ws?.send(
    encrypt(
      JSON.stringify({ type: 'e2ee_auth', deviceToken: session.pairing.deviceToken }),
      session.sharedKey
    )
  )
}

function handleAuthenticatedFrame<TResult>(
  session: RemoteRuntimeSubscriptionSession<TResult>,
  plaintext: string
): void {
  let authenticated: unknown
  try {
    authenticated = JSON.parse(plaintext)
  } catch {
    session.fail(
      new RemoteRuntimeClientError(
        'invalid_runtime_response',
        'Runtime host returned an invalid E2EE auth frame.'
      )
    )
    return
  }
  const type = (authenticated as { type?: unknown }).type
  if (type !== 'e2ee_authenticated') {
    const code =
      typeof authenticated === 'object' &&
      authenticated !== null &&
      (authenticated as { error?: { code?: unknown } }).error?.code === 'unauthorized'
        ? 'unauthorized'
        : 'invalid_runtime_response'
    session.fail(new RemoteRuntimeClientError(code, 'Runtime host rejected the pairing token.'))
    return
  }
  if (
    session.method === 'terminal.multiplex' &&
    !hasAuthenticatedCapability(authenticated, RUNTIME_INBOUND_BINARY_STREAM_CAPABILITY)
  ) {
    session.fail(
      new RemoteRuntimeClientError(
        'binary_terminal_stream_unsupported',
        'Runtime host does not support the dedicated inbound binary terminal stream.'
      )
    )
    return
  }
  session.state = 'ready'
  if (session.method === 'terminal.multiplex') {
    startTerminalMultiplex(session, authenticated)
    return
  }
  session.ws?.send(
    encrypt(
      JSON.stringify({
        id: session.requestId,
        deviceToken: session.pairing.deviceToken,
        method: session.method,
        params: session.params
      }),
      session.sharedKey
    )
  )
  session.succeed()
}

function startTerminalMultiplex<TResult>(
  session: RemoteRuntimeSubscriptionSession<TResult>,
  authenticated: unknown
): void {
  const runtimeId = authenticatedRuntimeId(authenticated)
  if (!runtimeId) {
    session.fail(
      new RemoteRuntimeClientError(
        'invalid_runtime_response',
        'Runtime host did not identify the authenticated runtime.'
      )
    )
    return
  }
  session.setDedicatedOrpcPeer(
    new DedicatedRemoteRuntimeOrpcPeer(
      session.requestId,
      (frame) => session.sendOrpcText(frame),
      (bytes) => session.sendBinary(bytes),
      (frame) => session.callbacks.onBinary?.(frame)
    )
  )
  void startDedicatedOrpcSubscription(session, runtimeId)
}

function handleRpcFrame<TResult>(
  session: RemoteRuntimeSubscriptionSession<TResult>,
  plaintext: string
): void {
  let raw: unknown
  try {
    raw = JSON.parse(plaintext)
  } catch {
    session.fail(
      new RemoteRuntimeClientError(
        'invalid_runtime_response',
        'Runtime host returned an invalid response frame.'
      )
    )
    return
  }
  const parsed = RuntimeRpcEnvelopeSchema.safeParse(raw)
  if (!parsed.success || '_keepalive' in parsed.data) {
    return
  }
  const response = parsed.data as RuntimeRpcResponse<TResult>
  if (response.id !== session.requestId) {
    session.fail(
      new RemoteRuntimeClientError(
        'invalid_runtime_response',
        'Runtime host returned a mismatched response id.'
      )
    )
    return
  }
  session.callbacks.onResponse(response)
}

function handleBinaryFrame<TResult>(
  session: RemoteRuntimeSubscriptionSession<TResult>,
  frame: Uint8Array<ArrayBufferLike>
): void {
  if (session.state !== 'ready') {
    session.fail(
      new RemoteRuntimeClientError(
        'invalid_runtime_response',
        'Runtime host returned binary data before authentication.'
      )
    )
    return
  }
  const plaintext = decryptBytes(frame, session.sharedKey)
  if (plaintext === null) {
    session.fail(
      new RemoteRuntimeClientError(
        'invalid_runtime_response',
        'Runtime host returned an undecryptable binary frame.'
      )
    )
    return
  }
  if (session.dedicatedOrpcPeer) {
    if (!session.dedicatedOrpcPeer.receiveBinary(plaintext)) {
      rejectInvalidDedicatedOrpcFrame(session)
    }
    return
  }
  session.callbacks.onBinary?.(plaintext)
}
