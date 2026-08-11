export type TerminalMultiplexEpochRecord = {
  phase: 0 | 1
  protocolMinor: number
  maxFrameBytes: number
  maxStreams: number
  heartbeatMs: number
  connectionGeneration: number
}

export type TerminalMultiplexHeartbeatRecord = {
  phase: 0 | 1
  appState: 0 | 1 | 2
  senderQueueBytes: number
  monotonicMicros: bigint
}

export function encodeTerminalMultiplexEpochRecord(
  record: TerminalMultiplexEpochRecord
): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(24)
  const view = new DataView(out.buffer)
  view.setUint8(0, record.phase)
  view.setUint8(1, record.protocolMinor)
  view.setUint16(2, 0, true)
  view.setUint32(4, record.maxFrameBytes, true)
  view.setUint32(8, record.maxStreams, true)
  view.setUint32(12, record.heartbeatMs, true)
  view.setUint32(16, record.connectionGeneration, true)
  view.setUint32(20, 0, true)
  return out
}

export function decodeTerminalMultiplexEpochRecord(
  payload: Uint8Array<ArrayBufferLike>
): TerminalMultiplexEpochRecord | null {
  if (payload.byteLength !== 24) {
    return null
  }
  const view = payloadView(payload)
  const phase = view.getUint8(0)
  if (
    (phase !== 0 && phase !== 1) ||
    view.getUint16(2, true) !== 0 ||
    view.getUint32(20, true) !== 0
  ) {
    return null
  }
  return {
    phase,
    protocolMinor: view.getUint8(1),
    maxFrameBytes: view.getUint32(4, true),
    maxStreams: view.getUint32(8, true),
    heartbeatMs: view.getUint32(12, true),
    connectionGeneration: view.getUint32(16, true)
  }
}

export function encodeTerminalMultiplexHeartbeatRecord(
  record: TerminalMultiplexHeartbeatRecord
): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(16)
  const view = new DataView(out.buffer)
  view.setUint8(0, record.phase)
  view.setUint8(1, record.appState)
  view.setUint16(2, 0, true)
  view.setUint32(4, record.senderQueueBytes, true)
  view.setBigUint64(8, record.monotonicMicros, true)
  return out
}

export function decodeTerminalMultiplexHeartbeatRecord(
  payload: Uint8Array<ArrayBufferLike>
): TerminalMultiplexHeartbeatRecord | null {
  if (payload.byteLength !== 16) {
    return null
  }
  const view = payloadView(payload)
  const phase = view.getUint8(0)
  const appState = view.getUint8(1)
  if ((phase !== 0 && phase !== 1) || appState > 2 || view.getUint16(2, true) !== 0) {
    return null
  }
  return {
    phase,
    appState: decodeHeartbeatAppState(appState),
    senderQueueBytes: view.getUint32(4, true),
    monotonicMicros: view.getBigUint64(8, true)
  }
}

function decodeHeartbeatAppState(appState: number): 0 | 1 | 2 {
  if (appState === 0) {
    return 0
  }
  if (appState === 1) {
    return 1
  }
  return 2
}

function payloadView(payload: Uint8Array<ArrayBufferLike>): DataView {
  return new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
}
