import {
  TerminalStreamOpcode,
  decodeTerminalStreamFrame,
  decodeTerminalStreamJson,
  decodeTerminalStreamText
} from './terminal-stream-protocol'

export type TerminalSnapshotState = {
  streamId: number
  meta: Record<string, unknown>
  chunks: string[]
}

type StreamingListener = (result: unknown) => void

type TerminalBinaryFrameOptions = {
  terminalSnapshots: Map<number, TerminalSnapshotState>
  pendingEvents: Map<number, unknown[]>
  getListener: (streamId: number) => StreamingListener | undefined
  recordValidatedInboundTraffic: () => void
}

const MAX_PENDING_TERMINAL_STREAMS = 16
const MAX_PENDING_EVENTS_PER_STREAM = 256

export function handleTerminalBinaryFrame(
  bytes: Uint8Array,
  options: TerminalBinaryFrameOptions
): void {
  const frame = decodeTerminalStreamFrame(bytes)
  if (!frame) {
    return
  }
  const listener = options.getListener(frame.streamId)
  const emit = (event: unknown): void => {
    if (listener) {
      listener(event)
      return
    }
    let pending = options.pendingEvents.get(frame.streamId)
    if (!pending) {
      // Why: oRPC can deliver the binary snapshot before its `subscribed`
      // event reaches the iterator consumer that registers this stream ID.
      if (options.pendingEvents.size >= MAX_PENDING_TERMINAL_STREAMS) {
        const oldestStreamId = options.pendingEvents.keys().next().value
        if (oldestStreamId !== undefined) {
          options.pendingEvents.delete(oldestStreamId)
          options.terminalSnapshots.delete(oldestStreamId)
        }
      }
      pending = []
      options.pendingEvents.set(frame.streamId, pending)
    }
    if (pending.length < MAX_PENDING_EVENTS_PER_STREAM) {
      pending.push(event)
    }
  }
  if (frame.opcode === TerminalStreamOpcode.Output) {
    options.recordValidatedInboundTraffic()
    emit({
      type: 'data',
      streamId: frame.streamId,
      chunk: decodeTerminalStreamText(frame.payload)
    })
    return
  }
  if (frame.opcode === TerminalStreamOpcode.SnapshotStart) {
    const meta = decodeTerminalStreamJson<Record<string, unknown>>(frame.payload)
    if (!meta) {
      return
    }
    options.recordValidatedInboundTraffic()
    if (
      !options.terminalSnapshots.has(frame.streamId) &&
      options.terminalSnapshots.size >= MAX_PENDING_TERMINAL_STREAMS
    ) {
      const oldestStreamId = options.terminalSnapshots.keys().next().value
      if (oldestStreamId !== undefined) {
        options.terminalSnapshots.delete(oldestStreamId)
      }
    }
    options.terminalSnapshots.set(frame.streamId, {
      streamId: frame.streamId,
      meta,
      chunks: []
    })
    return
  }
  if (frame.opcode === TerminalStreamOpcode.SnapshotChunk) {
    options.recordValidatedInboundTraffic()
    const snapshot = options.terminalSnapshots.get(frame.streamId)
    if (!snapshot) {
      return
    }
    snapshot.chunks.push(decodeTerminalStreamText(frame.payload))
    return
  }
  if (frame.opcode === TerminalStreamOpcode.SnapshotEnd) {
    options.recordValidatedInboundTraffic()
    const snapshot = options.terminalSnapshots.get(frame.streamId)
    if (!snapshot) {
      return
    }
    options.terminalSnapshots.delete(frame.streamId)
    const kind = snapshot.meta.kind === 'resized' ? 'resized' : 'scrollback'
    emit({
      ...snapshot.meta,
      type: kind,
      streamId: frame.streamId,
      serialized: snapshot.chunks.join('')
    })
    return
  }
  if (frame.opcode === TerminalStreamOpcode.Resized) {
    const meta = decodeTerminalStreamJson<Record<string, unknown>>(frame.payload)
    if (!meta) {
      return
    }
    options.recordValidatedInboundTraffic()
    emit({
      ...meta,
      type: 'resized',
      streamId: frame.streamId
    })
    return
  }
  if (frame.opcode === TerminalStreamOpcode.Metadata) {
    const meta = decodeTerminalStreamJson<Record<string, unknown>>(frame.payload)
    if (!meta) {
      return
    }
    options.recordValidatedInboundTraffic()
    emit({
      ...meta,
      type: 'metadata',
      streamId: frame.streamId
    })
    return
  }
  if (frame.opcode === TerminalStreamOpcode.Error) {
    options.recordValidatedInboundTraffic()
    emit({
      type: 'error',
      streamId: frame.streamId,
      message: decodeTerminalStreamText(frame.payload)
    })
  }
}
