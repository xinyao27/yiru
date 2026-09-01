export function createRemoteRuntimeSocket(endpoint: string): WebSocket {
  const socket = new WebSocket(endpoint)
  socket.binaryType = 'arraybuffer'
  return socket
}

export function remoteRuntimeSocketBytes(data: unknown): Uint8Array<ArrayBufferLike> | null {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data)
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  }
  return null
}

export function pingRemoteRuntimeSocket(socket: WebSocket): void {
  const ping = Reflect.get(socket, 'ping')
  if (typeof ping === 'function') {
    Reflect.apply(ping, socket, [])
  }
}

export function terminateRemoteRuntimeSocket(socket: WebSocket): void {
  const terminate = Reflect.get(socket, 'terminate')
  if (typeof terminate === 'function') {
    Reflect.apply(terminate, socket, [])
    return
  }
  socket.close()
}
