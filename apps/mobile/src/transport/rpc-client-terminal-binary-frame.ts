import {
  TerminalStreamOpcode,
  decodeTerminalStreamFrame,
  decodeTerminalStreamJson,
  decodeTerminalStreamText
} from './terminal-stream-protocol'

type TerminalSnapshotState = {
  streamId: number
  meta: Record<string, unknown>
  chunks: string[]
  retainedBytes: number
}

type StreamingListener = (result: unknown) => void

type PendingTerminalStreamEvents = {
  events: unknown[]
  retainedBytes: number
}

export type TerminalBinaryFrameState = {
  terminalSnapshots: Map<number, TerminalSnapshotState>
  pendingEvents: Map<number, PendingTerminalStreamEvents>
  streamOrder: Map<number, true>
  retainedBytes: number
}

type TerminalBinaryFrameOptions = {
  state: TerminalBinaryFrameState
  getListener: (streamId: number) => StreamingListener | undefined
  recordValidatedInboundTraffic: () => void
}

const MAX_PENDING_TERMINAL_STREAMS = 16
const MAX_PENDING_EVENTS_PER_STREAM = 256
// Why: desktop snapshots are capped at 512 KiB; one extra snapshot of headroom
// covers metadata and output racing the subscription without risking mobile OOM.
const MAX_PENDING_BYTES_PER_STREAM = 1024 * 1024
const MAX_PENDING_BYTES_TOTAL = 4 * 1024 * 1024

export function createTerminalBinaryFrameState(): TerminalBinaryFrameState {
  return {
    terminalSnapshots: new Map(),
    pendingEvents: new Map(),
    streamOrder: new Map(),
    retainedBytes: 0
  }
}

export function takePendingTerminalStreamEvents(
  state: TerminalBinaryFrameState,
  streamId: number
): unknown[] {
  const pending = state.pendingEvents.get(streamId)
  if (!pending) {
    return []
  }
  state.pendingEvents.delete(streamId)
  releaseRetainedBytes(state, pending.retainedBytes)
  forgetStreamIfEmpty(state, streamId)
  return pending.events
}

export function deleteTerminalBinaryStreamState(
  state: TerminalBinaryFrameState,
  streamId: number
): void {
  const pendingBytes = state.pendingEvents.get(streamId)?.retainedBytes ?? 0
  const snapshotBytes = state.terminalSnapshots.get(streamId)?.retainedBytes ?? 0
  state.pendingEvents.delete(streamId)
  state.terminalSnapshots.delete(streamId)
  state.streamOrder.delete(streamId)
  releaseRetainedBytes(state, pendingBytes + snapshotBytes)
}

export function clearTerminalBinaryFrameState(state: TerminalBinaryFrameState): void {
  state.pendingEvents.clear()
  state.terminalSnapshots.clear()
  state.streamOrder.clear()
  state.retainedBytes = 0
}

export function handleTerminalBinaryFrame(
  bytes: Uint8Array,
  options: TerminalBinaryFrameOptions
): void {
  const frame = decodeTerminalStreamFrame(bytes)
  if (!frame) {
    return
  }
  const listener = options.getListener(frame.streamId)
  const emit = (event: unknown, retainedBytes: number): void => {
    if (listener) {
      listener(event)
      return
    }
    let pending = options.state.pendingEvents.get(frame.streamId)
    if (!pending) {
      // Why: oRPC can deliver the binary snapshot before its `subscribed`
      // event reaches the iterator consumer that registers this stream ID.
      pending = { events: [], retainedBytes: 0 }
      options.state.pendingEvents.set(frame.streamId, pending)
    }
    if (
      pending.events.length >= MAX_PENDING_EVENTS_PER_STREAM ||
      !reserveRetainedBytes(options.state, frame.streamId, retainedBytes)
    ) {
      forgetStreamIfEmpty(options.state, frame.streamId)
      return
    }
    pending.events.push(event)
    pending.retainedBytes += retainedBytes
  }
  if (frame.opcode === TerminalStreamOpcode.Output) {
    options.recordValidatedInboundTraffic()
    emit(
      {
        type: 'data',
        streamId: frame.streamId,
        chunk: decodeTerminalStreamText(frame.payload)
      },
      frame.payload.byteLength
    )
    return
  }
  if (frame.opcode === TerminalStreamOpcode.SnapshotStart) {
    const meta = decodeTerminalStreamJson<Record<string, unknown>>(frame.payload)
    if (!meta) {
      return
    }
    options.recordValidatedInboundTraffic()
    deleteTerminalSnapshot(options.state, frame.streamId)
    if (!reserveRetainedBytes(options.state, frame.streamId, frame.payload.byteLength)) {
      return
    }
    options.state.terminalSnapshots.set(frame.streamId, {
      streamId: frame.streamId,
      meta,
      chunks: [],
      retainedBytes: frame.payload.byteLength
    })
    return
  }
  if (frame.opcode === TerminalStreamOpcode.SnapshotChunk) {
    options.recordValidatedInboundTraffic()
    const snapshot = options.state.terminalSnapshots.get(frame.streamId)
    if (!snapshot) {
      return
    }
    if (!reserveRetainedBytes(options.state, frame.streamId, frame.payload.byteLength)) {
      return
    }
    snapshot.chunks.push(decodeTerminalStreamText(frame.payload))
    snapshot.retainedBytes += frame.payload.byteLength
    return
  }
  if (frame.opcode === TerminalStreamOpcode.SnapshotEnd) {
    options.recordValidatedInboundTraffic()
    const snapshot = options.state.terminalSnapshots.get(frame.streamId)
    if (!snapshot) {
      return
    }
    deleteTerminalSnapshot(options.state, frame.streamId)
    const kind = snapshot.meta.kind === 'resized' ? 'resized' : 'scrollback'
    emit(
      {
        ...snapshot.meta,
        type: kind,
        streamId: frame.streamId,
        serialized: snapshot.chunks.join('')
      },
      snapshot.retainedBytes
    )
    return
  }
  if (frame.opcode === TerminalStreamOpcode.Resized) {
    const meta = decodeTerminalStreamJson<Record<string, unknown>>(frame.payload)
    if (!meta) {
      return
    }
    options.recordValidatedInboundTraffic()
    emit(
      {
        ...meta,
        type: 'resized',
        streamId: frame.streamId
      },
      frame.payload.byteLength
    )
    return
  }
  if (frame.opcode === TerminalStreamOpcode.Metadata) {
    const meta = decodeTerminalStreamJson<Record<string, unknown>>(frame.payload)
    if (!meta) {
      return
    }
    options.recordValidatedInboundTraffic()
    emit(
      {
        ...meta,
        type: 'metadata',
        streamId: frame.streamId
      },
      frame.payload.byteLength
    )
    return
  }
  if (frame.opcode === TerminalStreamOpcode.Error) {
    options.recordValidatedInboundTraffic()
    emit(
      {
        type: 'error',
        streamId: frame.streamId,
        message: decodeTerminalStreamText(frame.payload)
      },
      frame.payload.byteLength
    )
  }
}

function reserveRetainedBytes(
  state: TerminalBinaryFrameState,
  streamId: number,
  byteLength: number
): boolean {
  const streamBytes =
    (state.pendingEvents.get(streamId)?.retainedBytes ?? 0) +
    (state.terminalSnapshots.get(streamId)?.retainedBytes ?? 0)
  if (byteLength > MAX_PENDING_BYTES_PER_STREAM - streamBytes) {
    deleteTerminalBinaryStreamState(state, streamId)
    return false
  }
  if (!state.streamOrder.has(streamId)) {
    while (state.streamOrder.size >= MAX_PENDING_TERMINAL_STREAMS) {
      if (!evictOldestStream(state, streamId)) {
        return false
      }
    }
    state.streamOrder.set(streamId, true)
  }
  while (byteLength > MAX_PENDING_BYTES_TOTAL - state.retainedBytes) {
    if (!evictOldestStream(state, streamId)) {
      deleteTerminalBinaryStreamState(state, streamId)
      return false
    }
  }
  state.retainedBytes += byteLength
  return true
}

function evictOldestStream(state: TerminalBinaryFrameState, currentStreamId: number): boolean {
  const oldestStreamId = state.streamOrder.keys().next().value
  if (oldestStreamId === undefined || oldestStreamId === currentStreamId) {
    return false
  }
  deleteTerminalBinaryStreamState(state, oldestStreamId)
  return true
}

function deleteTerminalSnapshot(state: TerminalBinaryFrameState, streamId: number): void {
  const snapshot = state.terminalSnapshots.get(streamId)
  if (!snapshot) {
    return
  }
  state.terminalSnapshots.delete(streamId)
  releaseRetainedBytes(state, snapshot.retainedBytes)
  forgetStreamIfEmpty(state, streamId)
}

function forgetStreamIfEmpty(state: TerminalBinaryFrameState, streamId: number): void {
  if (!state.pendingEvents.has(streamId) && !state.terminalSnapshots.has(streamId)) {
    state.streamOrder.delete(streamId)
  }
}

function releaseRetainedBytes(state: TerminalBinaryFrameState, byteLength: number): void {
  state.retainedBytes = Math.max(0, state.retainedBytes - byteLength)
}
