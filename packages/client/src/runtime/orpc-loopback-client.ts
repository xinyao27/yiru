import {
  encodeRuntimeLoopbackTarget,
  parseRuntimeLoopbackBootstrap,
  RUNTIME_LOOPBACK_ERROR_FRAME,
  RUNTIME_LOOPBACK_READY_FRAME,
  type RuntimeLoopbackTarget
} from '~shared/runtime-loopback'

import { createWebRuntimeOrpcConnection } from '../web/orpc-channel'
import { WebShellServicesChannel } from '../web/shell-services-channel'
import { createRuntimeRpcAbortError } from './abortable-runtime-environment-call'
import type { RuntimeOrpcClientConnection } from './orpc-connection'

const DEFAULT_LOOPBACK_CONNECT_TIMEOUT_MS = 15_000

export async function openRuntimeLoopbackOrpcConnection(
  target: RuntimeLoopbackTarget,
  options: { timeoutMs?: number; signal?: AbortSignal; onClose?: () => void } = {}
): Promise<RuntimeOrpcClientConnection> {
  const credentials = await window.api.runtimeConnection.getCredentials()
  const ws = new WebSocket(credentials.endpoint)
  ws.binaryType = 'arraybuffer'

  const sendText = (frame: string): boolean => sendLoopbackFrame(ws, frame)
  const sendBinary = (frame: Uint8Array<ArrayBufferLike>): boolean => sendLoopbackFrame(ws, frame)
  const runtime = createWebRuntimeOrpcConnection(sendText, sendBinary, () => ws.close())
  const shell = new WebShellServicesChannel(sendText, sendBinary, () => ws.close())
  let isClosed = false
  let isReady = false

  const onMessage = (event: MessageEvent<unknown>): void => {
    if (!isReady) {
      return
    }
    if (typeof event.data === 'string') {
      if (!runtime.channel.receiveText(event.data) && !shell.receiveText(event.data)) {
        close()
      }
      return
    }
    const bytes = loopbackEventBytes(event.data)
    if (bytes === null || (!runtime.channel.receiveBinary(bytes) && !shell.receiveBinary(bytes))) {
      close()
    }
  }

  const close = (): void => {
    if (isClosed) {
      return
    }
    isClosed = true
    runtime.channel.close()
    shell.close()
    ws.removeEventListener('message', onMessage)
    ws.close()
    options.onClose?.()
  }

  const ready = waitForLoopbackBootstrap(ws, options.timeoutMs, options.signal)

  ws.addEventListener(
    'open',
    () => {
      ws.send(credentials.processToken)
      ws.send(encodeRuntimeLoopbackTarget(target))
    },
    { once: true }
  )
  ws.addEventListener('message', onMessage)
  ws.addEventListener('close', close, { once: true })

  try {
    await ready
    isReady = true
    if (!shell.connect()) {
      throw new Error('Runtime loopback shell-services link could not connect.')
    }
    return { client: runtime.client, transport: 'loopback', close }
  } catch (error) {
    close()
    throw error
  }
}

function waitForLoopbackBootstrap(
  ws: WebSocket,
  timeoutMs: number | undefined,
  signal: AbortSignal | undefined
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => finish(() => reject(new Error('Runtime loopback connection timed out.'))),
      timeoutMs ?? DEFAULT_LOOPBACK_CONNECT_TIMEOUT_MS
    )
    const finish = (complete: () => void): void => {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', onAbort)
      ws.removeEventListener('message', onMessage)
      ws.removeEventListener('error', onError)
      ws.removeEventListener('close', onClose)
      complete()
    }
    const onAbort = (): void => finish(() => reject(createRuntimeRpcAbortError()))
    const onError = (): void => finish(() => reject(new Error('Runtime loopback socket failed.')))
    const onClose = (): void =>
      finish(() => reject(new Error('Runtime loopback socket closed before authentication.')))
    const onMessage = (event: MessageEvent<unknown>): void => {
      if (typeof event.data !== 'string') {
        return
      }
      const bootstrap = parseLoopbackBootstrapFrame(event.data)
      if (bootstrap?.type === RUNTIME_LOOPBACK_READY_FRAME) {
        finish(resolve)
      } else if (bootstrap?.type === RUNTIME_LOOPBACK_ERROR_FRAME) {
        finish(() => reject(new Error(bootstrap.message)))
      } else {
        finish(() => reject(new Error('Runtime loopback sent an invalid bootstrap frame.')))
      }
    }
    if (signal?.aborted) {
      onAbort()
      return
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    ws.addEventListener('message', onMessage)
    ws.addEventListener('error', onError, { once: true })
    ws.addEventListener('close', onClose, { once: true })
  })
}

function parseLoopbackBootstrapFrame(frame: string) {
  try {
    return parseRuntimeLoopbackBootstrap(JSON.parse(frame))
  } catch {
    return null
  }
}

function sendLoopbackFrame(ws: WebSocket, frame: string | Uint8Array<ArrayBufferLike>): boolean {
  if (ws.readyState !== WebSocket.OPEN) {
    return false
  }
  if (typeof frame === 'string') {
    ws.send(frame)
  } else {
    const copy = new Uint8Array(frame.byteLength)
    copy.set(frame)
    ws.send(copy)
  }
  return true
}

function loopbackEventBytes(value: unknown): Uint8Array<ArrayBufferLike> | null {
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value)
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  }
  return null
}
