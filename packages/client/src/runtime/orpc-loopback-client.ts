import type { RuntimeLoopbackTarget } from '~renderer/runtime-loopback'

import { createWebRuntimeOrpcConnection } from '../web/orpc-channel'
import { WebShellServicesChannel } from '../web/shell-services-channel'
import type { RuntimeOrpcClientConnection } from './orpc-connection'
import {
  openAuthenticatedRuntimeLoopbackSocket,
  runtimeLoopbackEventBytes,
  sendRuntimeLoopbackSocketFrame
} from './orpc-loopback-socket'

export async function openRuntimeLoopbackOrpcConnection(
  target: RuntimeLoopbackTarget,
  options: { timeoutMs?: number; signal?: AbortSignal; onClose?: () => void } = {}
): Promise<RuntimeOrpcClientConnection> {
  const ws = await openAuthenticatedRuntimeLoopbackSocket(target, options)
  const sendText = (frame: string): boolean => sendRuntimeLoopbackSocketFrame(ws, frame)
  const sendBinary = (frame: Uint8Array<ArrayBufferLike>): boolean =>
    sendRuntimeLoopbackSocketFrame(ws, frame)
  const runtime = createWebRuntimeOrpcConnection(sendText, sendBinary, () => ws.close())
  const shell = new WebShellServicesChannel(sendText, sendBinary, () => ws.close())
  let isClosed = false

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
  const onMessage = (event: MessageEvent<unknown>): void => {
    if (typeof event.data === 'string') {
      if (!runtime.channel.receiveText(event.data) && !shell.receiveText(event.data)) {
        close()
      }
      return
    }
    const bytes = runtimeLoopbackEventBytes(event.data)
    if (bytes === null || (!runtime.channel.receiveBinary(bytes) && !shell.receiveBinary(bytes))) {
      close()
    }
  }

  ws.addEventListener('message', onMessage)
  ws.addEventListener('close', close, { once: true })
  if (!shell.connect()) {
    close()
    throw new Error('Runtime loopback shell-services link could not connect.')
  }
  return { client: runtime.client, transport: 'loopback', close }
}
