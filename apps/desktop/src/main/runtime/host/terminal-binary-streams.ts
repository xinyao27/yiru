import type { TerminalStreamFrame } from '~shared/terminal/stream-protocol'
import { decodeTerminalStreamFrame } from '~shared/terminal/stream-protocol'

type TerminalBinaryStreamHandler = (frame: TerminalStreamFrame) => void

export class NodeRuntimeHostTerminalBinaryStreams {
  private readonly handlers = new Map<string, Map<number, TerminalBinaryStreamHandler>>()
  private readonly connectionUse = new Map<string, 'control' | 'multiplex'>()

  admitInvocation(connectionId: string, method: string): boolean {
    const requestedUse = method === 'terminal.multiplex' ? 'multiplex' : 'control'
    const currentUse = this.connectionUse.get(connectionId)
    if (!currentUse) {
      this.connectionUse.set(connectionId, requestedUse)
      return true
    }
    return currentUse === 'control' && requestedUse === 'control'
  }

  register(
    connectionId: string,
    streamId: number,
    handler: TerminalBinaryStreamHandler
  ): () => void {
    if (!connectionId || !Number.isSafeInteger(streamId) || streamId < 0) {
      return () => {}
    }
    let connectionHandlers = this.handlers.get(connectionId)
    if (!connectionHandlers) {
      connectionHandlers = new Map()
      this.handlers.set(connectionId, connectionHandlers)
    }
    connectionHandlers.set(streamId, handler)
    return () => {
      const current = this.handlers.get(connectionId)
      if (!current || current.get(streamId) !== handler) {
        return
      }
      current.delete(streamId)
      if (current.size === 0) {
        this.handlers.delete(connectionId)
      }
    }
  }

  handle(
    connectionId: string,
    bytes: Uint8Array<ArrayBufferLike>,
    expectedStreamId?: number
  ): boolean {
    const frame = decodeTerminalStreamFrame(bytes)
    if (!frame || (expectedStreamId !== undefined && frame.streamId !== expectedStreamId)) {
      return false
    }
    const handler = this.handlers.get(connectionId)?.get(frame.streamId)
    if (!handler) {
      return false
    }
    handler(frame)
    return true
  }

  closeConnection(connectionId: string): void {
    this.handlers.delete(connectionId)
    this.connectionUse.delete(connectionId)
  }
}
