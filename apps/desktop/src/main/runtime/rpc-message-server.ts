import {
  MOBILE_DEVELOPMENT_PAIRING_METHOD,
  type MobileDevelopmentPairingInput,
  type MobileDevelopmentPairingResult
} from '@yiru/runtime-protocol/mobile-development-pairing'
import { STATUS_GET_CONTRACT } from '@yiru/runtime-protocol/status'
import type { WebSocket } from 'ws'
import {
  readRemoteRuntimeCancellationRequestId,
  REMOTE_RUNTIME_CANCEL_REQUEST_METHOD
} from '~shared/remote-runtime/request-cancellation'
import type { RuntimeMetadata } from '~shared/runtime-bootstrap'

import { writeRuntimeMetadata } from './metadata'
import { RuntimeRpcAdmissionServer } from './rpc-admission-server'
import { isLongPollRequest } from './rpc-long-poll-classification'
import { injectDeviceScope, LONG_POLL_CAP } from './rpc-pairing-server'
import { grantedAccessForDevice } from './rpc/access-adjudication'
import { RuntimeRpcHandlerError, type RpcRequest, type RpcResponse } from './rpc/core'
import { errorResponse, successResponse } from './rpc/errors'
import type { RpcMessageContext } from './rpc/transport'
import type { WebSocketTransport } from './rpc/ws-transport'

export class RuntimeRpcMessageServer extends RuntimeRpcAdmissionServer {
  protected async handleMessage(
    rawMessage: string,
    context?: RpcMessageContext
  ): Promise<RpcResponse> {
    // Why: empty messages are sent by the Unix socket transport layer when a
    // client exceeds the max message size. The transport closes the connection
    // after this response.
    if (!rawMessage) {
      return this.buildError('unknown', 'request_too_large', 'RPC request exceeds the maximum size')
    }

    const parsed = this.parseAndAuth(rawMessage)
    if ('error' in parsed) {
      return parsed.error
    }
    const request = parsed.request

    // Why: long-poll admission fence. Short RPCs bypass the counter entirely
    // — it only guards handlers that can block for minutes. See §7 risk #2.
    const longPoll = isLongPollRequest(request)
    if (longPoll && this.activeLongPolls >= LONG_POLL_CAP) {
      return this.buildError(
        request.id,
        'runtime_busy',
        'long-poll capacity reached; retry with backoff'
      )
    }
    if (longPoll) {
      this.activeLongPolls += 1
      // Why: arm the keepalive timer only for long-polls. Short RPCs never
      // touch it so the `setInterval` is never created. See §3.1.
      context?.startKeepalive()
    }

    try {
      return await this.dispatcher.dispatch(request, {
        signal: longPoll ? context?.signal : undefined
      })
    } finally {
      if (longPoll) {
        this.activeLongPolls = Math.max(0, this.activeLongPolls - 1)
      }
    }
  }

  protected createDevelopmentMobilePairing(
    params: MobileDevelopmentPairingInput
  ): MobileDevelopmentPairingResult {
    if (!this.enableDevelopmentMobilePairing) {
      throw new RuntimeRpcHandlerError(
        'method_not_found',
        `Unknown method: ${MOBILE_DEVELOPMENT_PAIRING_METHOD}`
      )
    }
    const offer = this.createMobilePairingOffer({
      address: params.address,
      name: params.deviceName,
      credentialPolicy: 'reuse-named'
    })
    if (!offer.available) {
      throw new RuntimeRpcHandlerError(
        'runtime_unavailable',
        'Mobile WebSocket transport is unavailable'
      )
    }
    const result: MobileDevelopmentPairingResult = {
      pairingUrl: offer.pairingUrl,
      endpoint: offer.endpoint,
      deviceId: offer.deviceId
    }
    return result
  }

  protected parseAndAuth(rawMessage: string): { request: RpcRequest } | { error: RpcResponse } {
    let request: RpcRequest
    try {
      request = JSON.parse(rawMessage) as RpcRequest
    } catch {
      return { error: this.buildError('unknown', 'bad_request', 'Invalid JSON request') }
    }

    if (typeof request.id !== 'string' || request.id.length === 0) {
      return { error: this.buildError('unknown', 'bad_request', 'Missing request id') }
    }
    if (typeof request.method !== 'string' || request.method.length === 0) {
      return { error: this.buildError(request.id, 'bad_request', 'Missing RPC method') }
    }
    if (typeof request.authToken !== 'string' || request.authToken.length === 0) {
      return { error: this.buildError(request.id, 'unauthorized', 'Missing auth token') }
    }
    if (request.authToken !== this.authToken) {
      return { error: this.buildError(request.id, 'unauthorized', 'Invalid auth token') }
    }

    return { request }
  }

  // Why: WebSocket messages go through streaming dispatch which can emit
  // multiple responses. Auth uses per-device tokens from the device registry.
  protected async handleWebSocketMessage(
    rawMessage: string,
    reply: (response: string) => void,
    sendBinary: (response: Uint8Array<ArrayBufferLike>) => boolean | void,
    wsTransport?: WebSocketTransport,
    ws?: WebSocket,
    authenticatedDeviceToken?: string | null
  ): Promise<void> {
    let request: RpcRequest
    try {
      request = JSON.parse(rawMessage) as RpcRequest
    } catch {
      reply(JSON.stringify(this.buildError('unknown', 'bad_request', 'Invalid JSON request')))
      return
    }

    if (typeof request.id !== 'string' || request.id.length === 0) {
      reply(JSON.stringify(this.buildError('unknown', 'bad_request', 'Missing request id')))
      return
    }
    if (typeof request.method !== 'string' || request.method.length === 0) {
      reply(JSON.stringify(this.buildError(request.id, 'bad_request', 'Missing RPC method')))
      return
    }

    const requestToken =
      typeof (request as Record<string, unknown>).deviceToken === 'string'
        ? ((request as Record<string, unknown>).deviceToken as string)
        : null
    if (authenticatedDeviceToken && requestToken && requestToken !== authenticatedDeviceToken) {
      reply(JSON.stringify(this.buildError(request.id, 'unauthorized', 'Device token mismatch')))
      return
    }
    // Why: E2EE already authenticated the WebSocket channel. Use that bound
    // identity for authorization instead of trusting a repeated request field.
    const token = authenticatedDeviceToken ?? requestToken
    if (!token) {
      reply(JSON.stringify(this.buildError(request.id, 'unauthorized', 'Missing device token')))
      return
    }
    const device = this.deviceRegistry?.validateToken(token)
    if (!device) {
      reply(JSON.stringify(this.buildError(request.id, 'unauthorized', 'Invalid device token')))
      return
    }
    if (device.scope === 'mobile' && !this.dispatcher.isAvailableToMobile(request.method)) {
      reply(
        JSON.stringify(
          this.buildError(
            request.id,
            'forbidden',
            `Method '${request.method}' is not available to mobile clients`
          )
        )
      )
      return
    }
    if (device.scope === 'coworking-host' && !this.recordCoworkingHostOperation(request, device)) {
      reply(
        JSON.stringify(
          this.buildError(request.id, 'internal_error', 'Privileged operation audit unavailable')
        )
      )
      return
    }

    if (request.method === REMOTE_RUNTIME_CANCEL_REQUEST_METHOD) {
      const targetRequestId = readRemoteRuntimeCancellationRequestId(request.params)
      if (!ws || !targetRequestId) {
        reply(
          JSON.stringify(
            this.buildError(request.id, 'invalid_argument', 'Invalid cancellation request')
          )
        )
        return
      }
      this.cancelWebSocketDispatch(ws, targetRequestId)
      reply(
        JSON.stringify(
          successResponse(
            request.id,
            { runtimeId: this.runtime.getRuntimeId() },
            {
              cancelled: true
            }
          )
        )
      )
      return
    }

    // Why: associate the deviceToken with this WebSocket so ws.on('close')
    // can notify the runtime which mobile client disconnected.
    if (wsTransport && ws) {
      wsTransport.setClientId(ws, token)
    }

    const longPoll = isLongPollRequest(request)
    if (longPoll && this.activeLongPolls >= LONG_POLL_CAP) {
      reply(
        JSON.stringify(
          this.buildError(
            request.id,
            'runtime_busy',
            'long-poll capacity reached; retry with backoff'
          )
        )
      )
      return
    }

    const abortRegistration = ws ? this.registerWebSocketDispatchAbort(ws, request.id) : null
    if (ws && !abortRegistration) {
      reply(JSON.stringify(this.buildError(request.id, 'bad_request', 'Duplicate request id')))
      return
    }
    if (longPoll) {
      this.activeLongPolls += 1
    }

    // Why: older/saved WebSocket pairings may not carry scope metadata, so
    // stamp the authenticated scope onto the one method that probes the runtime.
    const replyForRequest =
      request.method === STATUS_GET_CONTRACT.name
        ? (response: string): void => reply(injectDeviceScope(response, device.scope))
        : reply

    const connectionId = ws ? this.mobileSocketWiring?.getConnectionId(ws) : undefined
    // Why: resolved per request rather than cached at connect time, so a revoked
    // or downgraded grant takes effect on the next call instead of surviving for
    // the life of the socket.
    const grantedAccess = grantedAccessForDevice(
      this.deviceRegistry?.getDevice(device.deviceId) ?? null
    )
    try {
      await this.dispatcher.dispatchStreaming(request, replyForRequest, {
        connectionId,
        clientId: token,
        principal: {
          kind: 'paired-device',
          deviceId: device.deviceId,
          scope: device.scope
        },
        // Why: gates the mobile-only payload diet so
        // full-screen web/desktop runtime clients aren't truncated.
        clientKind: device.scope === 'mobile' ? 'mobile' : 'runtime',
        ...(grantedAccess ? { grantedAccess } : {}),
        signal: abortRegistration?.signal,
        sendBinary,
        registerBinaryStreamHandler: (streamId, handler) =>
          this.registerBinaryStreamHandler(connectionId, streamId, handler)
      })
    } finally {
      abortRegistration?.dispose()
      if (longPoll) {
        this.activeLongPolls = Math.max(0, this.activeLongPolls - 1)
      }
    }
  }

  protected buildError(id: string, code: string, message: string): RpcResponse {
    return errorResponse(id, { runtimeId: this.runtime.getRuntimeId() }, code, message)
  }

  protected writeMetadata(): void {
    const metadata: RuntimeMetadata = {
      runtimeId: this.runtime.getRuntimeId(),
      pid: this.pid,
      transports: this.transports,
      authToken: this.authToken,
      startedAt: this.runtime.getStartedAt()
    }
    writeRuntimeMetadata(this.userDataPath, metadata)
  }
}
