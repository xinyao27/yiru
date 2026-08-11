export type TerminalMultiplexSnapshotStartRecord = {
  snapshotId: number
  reason: 0 | 1 | 2 | 3 | 4 | 5 | 6
  source: 0 | 1
  activeBuffer: 0 | 1
  truncated: boolean
  byteBudget: boolean
  coldRestore: boolean
  cols: number
  rows: number
  retainedScrollbackRows: number
  coverageEndSeq: bigint
  pendingDeliveryStartSeq: bigint
  sectionBytes: readonly [number, number, number, number, number]
}

export type TerminalMultiplexSnapshotChunkRecord = {
  snapshotId: number
  section: 0 | 1 | 2 | 3 | 4
  sectionOffset: number
  data: Uint8Array<ArrayBufferLike>
}

export type TerminalMultiplexSnapshotEndRecord = {
  snapshotId: number
  status: 0 | 1 | 2 | 3
  coverageEndSeq: bigint
  assembledBytes: number
  crc32c: number
}

export const TERMINAL_MULTIPLEX_SNAPSHOT_CHUNK_DATA_BYTES = 48 * 1024

export function encodeTerminalMultiplexSnapshotStartRecord(
  record: TerminalMultiplexSnapshotStartRecord
): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(64)
  const view = new DataView(out.buffer)
  const flags =
    (record.truncated ? 1 : 0) | (record.byteBudget ? 2 : 0) | (record.coldRestore ? 4 : 0)
  view.setUint32(0, record.snapshotId, true)
  view.setUint8(4, record.reason)
  view.setUint8(5, record.source)
  view.setUint8(6, record.activeBuffer)
  view.setUint8(7, flags)
  view.setUint16(8, record.cols, true)
  view.setUint16(10, record.rows, true)
  view.setUint32(12, record.retainedScrollbackRows, true)
  view.setBigUint64(16, 0n, true)
  view.setBigUint64(24, record.coverageEndSeq, true)
  view.setBigUint64(32, record.pendingDeliveryStartSeq, true)
  record.sectionBytes.forEach((bytes, index) => view.setUint32(40 + index * 4, bytes, true))
  view.setUint32(60, 0, true)
  return out
}

export function decodeTerminalMultiplexSnapshotStartRecord(
  payload: Uint8Array<ArrayBufferLike>
): TerminalMultiplexSnapshotStartRecord | null {
  if (payload.byteLength !== 64) {
    return null
  }
  const view = payloadView(payload)
  const reason = view.getUint8(4)
  const source = view.getUint8(5)
  const activeBuffer = view.getUint8(6)
  const flags = view.getUint8(7)
  const coverageEndSeq = view.getBigUint64(24, true)
  const pendingDeliveryStartSeq = view.getBigUint64(32, true)
  if (
    reason > 6 ||
    source > 1 ||
    activeBuffer > 1 ||
    (flags & ~7) !== 0 ||
    view.getUint16(8, true) < 1 ||
    view.getUint16(8, true) > 1000 ||
    view.getUint16(10, true) < 1 ||
    view.getUint16(10, true) > 500 ||
    view.getBigUint64(16, true) !== 0n ||
    pendingDeliveryStartSeq > coverageEndSeq ||
    view.getUint32(60, true) !== 0
  ) {
    return null
  }
  return {
    snapshotId: view.getUint32(0, true),
    reason: reason as TerminalMultiplexSnapshotStartRecord['reason'],
    source: source as TerminalMultiplexSnapshotStartRecord['source'],
    activeBuffer: activeBuffer as TerminalMultiplexSnapshotStartRecord['activeBuffer'],
    truncated: (flags & 1) !== 0,
    byteBudget: (flags & 2) !== 0,
    coldRestore: (flags & 4) !== 0,
    cols: view.getUint16(8, true),
    rows: view.getUint16(10, true),
    retainedScrollbackRows: view.getUint32(12, true),
    coverageEndSeq,
    pendingDeliveryStartSeq,
    sectionBytes: [
      view.getUint32(40, true),
      view.getUint32(44, true),
      view.getUint32(48, true),
      view.getUint32(52, true),
      view.getUint32(56, true)
    ]
  }
}

export function encodeTerminalMultiplexSnapshotChunkRecord(
  record: TerminalMultiplexSnapshotChunkRecord
): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(16 + record.data.byteLength)
  const view = new DataView(out.buffer)
  view.setUint32(0, record.snapshotId, true)
  view.setUint8(4, record.section)
  view.setUint8(5, 0)
  view.setUint16(6, 0, true)
  view.setUint32(8, record.sectionOffset, true)
  view.setUint32(12, record.data.byteLength, true)
  out.set(record.data, 16)
  return out
}

export function decodeTerminalMultiplexSnapshotChunkRecord(
  payload: Uint8Array<ArrayBufferLike>
): TerminalMultiplexSnapshotChunkRecord | null {
  if (payload.byteLength < 16) {
    return null
  }
  const view = payloadView(payload)
  const section = view.getUint8(4)
  if (
    section > 4 ||
    view.getUint8(5) !== 0 ||
    view.getUint16(6, true) !== 0 ||
    view.getUint32(12, true) !== payload.byteLength - 16 ||
    payload.byteLength - 16 > TERMINAL_MULTIPLEX_SNAPSHOT_CHUNK_DATA_BYTES
  ) {
    return null
  }
  return {
    snapshotId: view.getUint32(0, true),
    section: section as TerminalMultiplexSnapshotChunkRecord['section'],
    sectionOffset: view.getUint32(8, true),
    data: payload.slice(16)
  }
}

export function encodeTerminalMultiplexSnapshotEndRecord(
  record: TerminalMultiplexSnapshotEndRecord
): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(24)
  const view = new DataView(out.buffer)
  view.setUint32(0, record.snapshotId, true)
  view.setUint8(4, record.status)
  view.setUint8(5, 0)
  view.setUint16(6, 0, true)
  view.setBigUint64(8, record.coverageEndSeq, true)
  view.setUint32(16, record.assembledBytes, true)
  view.setUint32(20, record.crc32c, true)
  return out
}

export function decodeTerminalMultiplexSnapshotEndRecord(
  payload: Uint8Array<ArrayBufferLike>
): TerminalMultiplexSnapshotEndRecord | null {
  if (payload.byteLength !== 24) {
    return null
  }
  const view = payloadView(payload)
  const status = view.getUint8(4)
  if (status > 3 || view.getUint8(5) !== 0 || view.getUint16(6, true) !== 0) {
    return null
  }
  return {
    snapshotId: view.getUint32(0, true),
    status: status as TerminalMultiplexSnapshotEndRecord['status'],
    coverageEndSeq: view.getBigUint64(8, true),
    assembledBytes: view.getUint32(16, true),
    crc32c: view.getUint32(20, true)
  }
}

function payloadView(payload: Uint8Array<ArrayBufferLike>): DataView {
  return new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
}
