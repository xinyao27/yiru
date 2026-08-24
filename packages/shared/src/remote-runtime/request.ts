import { randomUUID } from 'node:crypto'

import type {
  RuntimeOrchestrationEnvelope,
  RuntimeRpcResponse
} from '@yiru/runtime-protocol/rpc-envelope'
import WebSocket from 'ws'

import {
  decrypt,
  deriveSharedKey,
  encrypt,
  generateKeyPair,
  publicKeyFromBase64,
  publicKeyToBase64
} from '../e2ee-crypto'
import type { PairingOffer } from '../pairing'
import type {
  RuntimeMethodContract,
  RuntimeMethodParams,
  RuntimeMethodResult
} from '../runtime-method-contract'
import { RemoteRuntimeClientError } from './client-error'
import {
  formatRemoteRuntimeCloseMessage,
  type HandshakeState,
  ignoreSettledRemoteRuntimeSocketError
} from './client-socket'
import { parseRemoteRuntimeResponse } from './request-response'

export function sendRemoteRuntimeRequest<TContract extends RuntimeMethodContract>(
  pairing: PairingOffer,
  contract: TContract,
  params: RuntimeMethodParams<TContract>,
  timeoutMs: number,
  options?: { beforeSend?: () => void | Promise<void> } & RuntimeOrchestrationEnvelope
): Promise<RuntimeRpcResponse<RuntimeMethodResult<TContract>>>
export function sendRemoteRuntimeRequest<TResult>(
  pairing: PairingOffer,
  method: string,
  params: unknown,
  timeoutMs: number,
  options?: { beforeSend?: () => void | Promise<void> } & RuntimeOrchestrationEnvelope
): Promise<RuntimeRpcResponse<TResult>>
export async function sendRemoteRuntimeRequest<TResult>(
  pairing: PairingOffer,
  contract: string | RuntimeMethodContract,
  params: unknown,
  timeoutMs: number,
  options: { beforeSend?: () => void | Promise<void> } & RuntimeOrchestrationEnvelope = {}
): Promise<RuntimeRpcResponse<TResult>> {
  const method = typeof contract === 'string' ? contract : contract.name
  return await new Promise((resolve, reject) => {
    const requestId = randomUUID()
    const keyPair = generateKeyPair()
    const serverPublicKey = publicKeyFromBase64(pairing.publicKeyB64)
    const sharedKey = deriveSharedKey(keyPair.secretKey, serverPublicKey)
    let state: HandshakeState = 'awaiting_ready'
    let settled = false
    let ws: WebSocket | null = null

    const cleanupSocketListeners = (): void => {
      const socket = ws
      if (!socket) {
        return
      }
      socket.off('open', onOpen)
      socket.off('error', onError)
      socket.off('close', onClose)
      socket.off('message', onMessage)
      // Why: the settled one-shot no longer needs Yiru callbacks, but a ws
      // can still report a late transport error after close is requested.
      if (socket.readyState !== WebSocket.CLOSED) {
        socket.on('error', ignoreSettledRemoteRuntimeSocketError)
      }
    }

    let timeout = setTimeout(onTimeout, timeoutMs)

    function onTimeout(): void {
      finish({
        ok: false,
        error: new RemoteRuntimeClientError(
          'runtime_timeout',
          'Timed out waiting for the runtime host to respond.'
        )
      })
    }

    function refreshTimeout(): void {
      const refreshableTimeout = timeout as { refresh?: () => void }
      if (typeof refreshableTimeout.refresh === 'function') {
        refreshableTimeout.refresh()
        return
      }
      // Why: mobile typechecks shared code with DOM timer types, where
      // setTimeout returns a number and Node's Timeout.refresh is absent.
      clearTimeout(timeout)
      timeout = setTimeout(onTimeout, timeoutMs)
    }

    const finish = (
      result: { ok: true; response: RuntimeRpcResponse<TResult> } | { ok: false; error: Error }
    ): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      try {
        cleanupSocketListeners()
        ws?.close()
      } catch {
        // ignore best-effort close
      }
      if (result.ok === false) {
        reject(result.error)
      } else {
        resolve(result.response)
      }
    }

    try {
      ws = new WebSocket(pairing.endpoint)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      finish({
        ok: false,
        error: new RemoteRuntimeClientError(
          'invalid_argument',
          `Invalid remote endpoint: ${message}`
        )
      })
      return
    }

    function onOpen(): void {
      ws?.send(
        JSON.stringify({
          type: 'e2ee_hello',
          publicKeyB64: publicKeyToBase64(keyPair.publicKey)
        })
      )
    }

    function onError(): void {
      finish({
        ok: false,
        error: new RemoteRuntimeClientError(
          'remote_runtime_unavailable',
          'Could not connect to the runtime host.'
        )
      })
    }

    function onClose(code: number, reason: Buffer): void {
      if (!settled) {
        finish({
          ok: false,
          error: new RemoteRuntimeClientError(
            'remote_runtime_unavailable',
            formatRemoteRuntimeCloseMessage(code, reason)
          )
        })
      }
    }

    function onMessage(data: WebSocket.RawData, isBinary: boolean): void {
      if (settled) {
        return
      }
      if (isBinary) {
        finish({
          ok: false,
          error: new RemoteRuntimeClientError(
            'invalid_runtime_response',
            'Runtime host returned an unexpected binary frame.'
          )
        })
        return
      }

      const frame = data.toString()
      if (state === 'awaiting_ready') {
        handleReadyFrame(frame)
        return
      }

      const plaintext = decrypt(frame, sharedKey)
      if (plaintext === null) {
        finish({
          ok: false,
          error: new RemoteRuntimeClientError(
            'invalid_runtime_response',
            'Runtime host returned an undecryptable frame.'
          )
        })
        return
      }

      if (state === 'awaiting_authenticated') {
        void handleAuthenticatedFrame(plaintext)
        return
      }

      handleRpcFrame(plaintext)
    }

    ws.once('open', onOpen)
    ws.once('error', onError)
    ws.on('close', onClose)
    ws.on('message', onMessage)

    function handleReadyFrame(frame: string): void {
      let ready: unknown
      try {
        ready = JSON.parse(frame)
      } catch {
        finish({
          ok: false,
          error: new RemoteRuntimeClientError(
            'invalid_runtime_response',
            'Runtime host returned an invalid E2EE handshake frame.'
          )
        })
        return
      }
      if (
        typeof ready !== 'object' ||
        ready === null ||
        (ready as { type?: unknown }).type !== 'e2ee_ready'
      ) {
        finish({
          ok: false,
          error: new RemoteRuntimeClientError(
            'invalid_runtime_response',
            'Runtime host returned an unexpected E2EE handshake frame.'
          )
        })
        return
      }
      state = 'awaiting_authenticated'
      ws?.send(
        encrypt(JSON.stringify({ type: 'e2ee_auth', deviceToken: pairing.deviceToken }), sharedKey)
      )
    }

    async function handleAuthenticatedFrame(plaintext: string): Promise<void> {
      let authenticated: unknown
      try {
        authenticated = JSON.parse(plaintext)
      } catch {
        finish({
          ok: false,
          error: new RemoteRuntimeClientError(
            'invalid_runtime_response',
            'Runtime host returned an invalid E2EE auth frame.'
          )
        })
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
        finish({
          ok: false,
          error: new RemoteRuntimeClientError(code, 'Runtime host rejected the pairing token.')
        })
        return
      }
      state = 'ready'
      try {
        // Why: handshake latency must not let a revoked queued mutation cross the wire.
        await options.beforeSend?.()
      } catch (error) {
        finish({
          ok: false,
          error: error instanceof Error ? error : new Error(String(error))
        })
        return
      }
      if (settled || !ws || ws.readyState !== WebSocket.OPEN) {
        return
      }
      ws?.send(
        encrypt(
          JSON.stringify({
            id: requestId,
            deviceToken: pairing.deviceToken,
            method,
            params,
            orchestrationCapability: options.orchestrationCapability,
            orchestrationContractVersion: options.orchestrationContractVersion,
            orchestrationRequestId: options.orchestrationRequestId
          }),
          sharedKey
        )
      )
    }

    function handleRpcFrame(plaintext: string): void {
      const result = parseRemoteRuntimeResponse<TResult>(plaintext, requestId)
      if (result.kind === 'keepalive') {
        refreshTimeout()
        return
      }
      if (result.kind === 'error') {
        finish({ ok: false, error: result.error })
        return
      }
      finish({ ok: true, response: result.response })
    }
  })
}
