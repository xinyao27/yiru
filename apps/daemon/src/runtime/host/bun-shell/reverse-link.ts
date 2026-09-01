import { webShellServicesConnectionId } from '../../rpc/orpc/shell-services-identity'
import {
  RuntimeShellServicesWsLinks,
  type RuntimeShellServicesSocket
} from '../../rpc/orpc/shell-services-ws'

export type BunShellServicesTransport = {
  close: (code?: number) => void
  identity: object
  sendBinary: (payload: Uint8Array<ArrayBufferLike>) => boolean
  sendText: (payload: string) => boolean
}

export type BunShellServicesBridge = {
  close: (connectionId: string, transport: BunShellServicesTransport) => void
  handleMessage: (
    connectionId: string,
    message: string | Uint8Array<ArrayBufferLike>,
    transport: BunShellServicesTransport
  ) => boolean
}

export function createBunShellServicesBridge(): BunShellServicesBridge {
  const links = new RuntimeShellServicesWsLinks()
  return {
    close: (connectionId, transport) => links.close(createSocket(connectionId, transport)),
    handleMessage: (connectionId, message, transport) => {
      const socket = createSocket(connectionId, transport)
      return typeof message === 'string'
        ? links.handleText(socket, message)
        : links.handleBinary(socket, message)
    }
  }
}

function createSocket(
  connectionId: string,
  transport: BunShellServicesTransport
): RuntimeShellServicesSocket {
  return {
    ...transport,
    connectionId,
    shellConnectionId: webShellServicesConnectionId(connectionId)
  }
}
