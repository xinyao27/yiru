import type { WebSocket } from 'ws'

import type { CoworkingHostDeviceEntry } from './device-registry'
import { isLongPollRequest } from './rpc-long-poll-classification'
import { LONG_POLL_CAP, RuntimeRpcPairingServer } from './rpc-pairing-server'
import { grantedAccessForDevice } from './rpc/access-adjudication'
import type { RpcRequest } from './rpc/core'
import type { AuthenticatedMobileSocket } from './rpc/mobile-socket-wiring'
import type { RuntimeOrpcInvocationDetails } from './rpc/orpc/bridge'
import type { RuntimeOrpcSocketHandler } from './rpc/orpc/socket-handler'
import {
  type RuntimeOrpcSocketInvocationLease,
  startRuntimeOrpcSocketKeepalive
} from './rpc/orpc/socket-handler'
import type { RuntimeOrpcWsInvocationLease } from './rpc/orpc/ws-handler'
import type { TerminalMultiplexConnections } from './terminal-multiplex/connections'

export abstract class RuntimeRpcAdmissionServer extends RuntimeRpcPairingServer {
  protected registerBinaryStreamHandler(
    connectionId: string | undefined,
    streamId: number,
    handler: Parameters<TerminalMultiplexConnections['register']>[2]
  ): () => void {
    return connectionId
      ? this.terminalMultiplex.register(connectionId, streamId, handler)
      : () => {}
  }

  protected handleWebSocketBinaryMessage(bytes: Uint8Array<ArrayBufferLike>, ws: WebSocket): void {
    const connectionId = this.mobileSocketWiring?.getConnectionId(ws)
    if (!connectionId) {
      return
    }
    this.terminalMultiplex.handle(connectionId, bytes)
  }

  protected registerWebSocketDispatchAbort(
    ws: WebSocket,
    requestId: string
  ): {
    signal: AbortSignal
    dispose: () => void
  } | null {
    const abortController = new AbortController()
    if (ws.readyState !== ws.OPEN) {
      abortController.abort()
      return { signal: abortController.signal, dispose: () => {} }
    }

    let state = this.wsDispatchAbortStates.get(ws)
    if (!state) {
      state = {
        controllers: new Set(),
        requests: new Map(),
        abortOnClose: () => this.abortWebSocketDispatches(ws)
      }
      this.wsDispatchAbortStates.set(ws, state)
      // Why: many streaming RPCs can share one WebSocket. A single socket-level
      // abort fan-out avoids MaxListenersExceededWarning while preserving cleanup.
      ws.on('close', state.abortOnClose)
      ws.on('error', state.abortOnClose)
    }
    if (state.requests.has(requestId)) {
      return null
    }
    state.controllers.add(abortController)
    state.requests.set(requestId, abortController)

    return {
      signal: abortController.signal,
      dispose: () => {
        const current = this.wsDispatchAbortStates.get(ws)
        if (!current) {
          return
        }
        current.controllers.delete(abortController)
        if (current.requests.get(requestId) === abortController) {
          current.requests.delete(requestId)
        }
        if (current.controllers.size > 0) {
          return
        }
        this.wsDispatchAbortStates.delete(ws)
        ws.off('close', current.abortOnClose)
        ws.off('error', current.abortOnClose)
      }
    }
  }

  protected abortWebSocketDispatches(ws: WebSocket): void {
    const state = this.wsDispatchAbortStates.get(ws)
    if (!state) {
      return
    }
    this.wsDispatchAbortStates.delete(ws)
    ws.off('close', state.abortOnClose)
    ws.off('error', state.abortOnClose)
    for (const controller of state.controllers) {
      controller.abort()
    }
    state.controllers.clear()
    state.requests.clear()
  }

  protected cancelWebSocketDispatch(ws: WebSocket, requestId: string): void {
    this.wsDispatchAbortStates.get(ws)?.requests.get(requestId)?.abort()
  }

  protected recordCoworkingHostOperation(
    request: RpcRequest,
    device: CoworkingHostDeviceEntry
  ): boolean {
    if (device.tier !== 'host' || !this.grantJournal) {
      return device.tier !== 'host'
    }
    try {
      this.grantJournal.recordHostOperation({
        requestId: request.id,
        method: request.method,
        deviceId: device.deviceId,
        deviceName: device.name,
        subject: device.subject,
        hostScopeKey: device.hostScopeKey
      })
      return true
    } catch {
      return false
    }
  }

  protected resolveRuntimeOrpcAdmission(socket: AuthenticatedMobileSocket) {
    const device = this.deviceRegistry?.validateToken(socket.device.deviceToken)
    if (!device || device.deviceId !== socket.device.deviceId) {
      return null
    }
    const grantedAccess = grantedAccessForDevice(device)
    return {
      principal: {
        kind: 'paired-device' as const,
        deviceId: device.deviceId,
        scope: device.scope
      },
      ...(grantedAccess ? { grantedAccess } : {})
    }
  }

  protected beforeRuntimeOrpcInvocation(
    socket: AuthenticatedMobileSocket,
    invocation: RuntimeOrpcInvocationDetails
  ): RuntimeOrpcWsInvocationLease | void {
    const device = this.deviceRegistry?.validateToken(socket.device.deviceToken)
    if (!device || device.deviceId !== socket.device.deviceId) {
      return {
        denial: {
          code: 'unauthorized',
          status: 401,
          message: 'The paired device is no longer authorized'
        }
      }
    }
    const terminalAdmission = this.terminalMultiplex.admitInvocation(
      socket.connectionId,
      invocation.method,
      invocation.input,
      device.deviceId,
      invocation.requestId
    )
    if (terminalAdmission !== 'accepted') {
      return {
        denial: {
          code: terminalAdmission,
          status: 409,
          message: 'Terminal multiplex admission was rejected'
        }
      }
    }
    const request: RpcRequest = {
      id: invocation.requestId ?? 'orpc',
      authToken: device.token,
      method: invocation.method,
      params: invocation.input
    }
    if (device.scope === 'coworking-host' && !this.recordCoworkingHostOperation(request, device)) {
      return {
        denial: {
          code: 'internal_error',
          status: 500,
          message: 'Privileged operation audit unavailable'
        }
      }
    }
    if (!isLongPollRequest(request)) {
      return
    }
    if (this.activeLongPolls >= LONG_POLL_CAP) {
      return {
        denial: {
          code: 'runtime_busy',
          status: 429,
          message: 'long-poll capacity reached; retry with backoff'
        }
      }
    }
    this.activeLongPolls += 1
    return {
      release: () => {
        this.activeLongPolls = Math.max(0, this.activeLongPolls - 1)
      }
    }
  }

  protected beforeRuntimeOrpcSocketInvocation(
    invocation: RuntimeOrpcInvocationDetails,
    connection: Parameters<RuntimeOrpcSocketHandler['open']>[1]
  ): RuntimeOrpcSocketInvocationLease | void {
    const request: RpcRequest = {
      id: invocation.requestId ?? 'orpc',
      authToken: this.authToken,
      method: invocation.method,
      params: invocation.input
    }
    if (!isLongPollRequest(request)) {
      return
    }
    if (this.activeLongPolls >= LONG_POLL_CAP) {
      return {
        denial: {
          code: 'runtime_busy',
          status: 429,
          message: 'long-poll capacity reached; retry with backoff'
        }
      }
    }
    this.activeLongPolls += 1
    const stopKeepalive = startRuntimeOrpcSocketKeepalive(connection)
    return {
      release: () => {
        stopKeepalive()
        this.activeLongPolls = Math.max(0, this.activeLongPolls - 1)
      }
    }
  }
}
