export type TerminalMultiplexAckRecord = {
  kind: 0 | 1 | 2 | 3
  status: 0 | 1 | 2 | 3
  errorCode: number
  acknowledgedBytes: number
  cumulativeSeq: bigint
  receiverQueueBytes: number
}

export type TerminalMultiplexCreditRecord = {
  direction: 0 | 1
  reason: 0 | 1 | 2 | 3
  maxInFlightBytes: number
  ackEveryBytes: number
  maxFrameBytes: number
}

export type TerminalMultiplexVisibilityRecord = {
  visible: boolean
  deliveryInterest: boolean
  priority: 0 | 1 | 2
  stateVersion: number
}

export type TerminalMultiplexKillRecord = { keepHistory: boolean; immediate: true }

export type TerminalMultiplexInputRecord = {
  kind: 0 | 1
  data: Uint8Array<ArrayBufferLike>
}

export function encodeTerminalMultiplexAckRecord(
  record: TerminalMultiplexAckRecord
): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(24)
  const view = new DataView(out.buffer)
  view.setUint8(0, record.kind)
  view.setUint8(1, record.status)
  view.setUint16(2, record.errorCode, true)
  view.setUint32(4, record.acknowledgedBytes, true)
  view.setBigUint64(8, record.cumulativeSeq, true)
  view.setUint32(16, record.receiverQueueBytes, true)
  view.setUint32(20, 0, true)
  return out
}

export function decodeTerminalMultiplexAckRecord(
  payload: Uint8Array<ArrayBufferLike>
): TerminalMultiplexAckRecord | null {
  if (payload.byteLength !== 24) {
    return null
  }
  const view = payloadView(payload)
  const kind = view.getUint8(0)
  const status = view.getUint8(1)
  if (kind > 3 || status > 3 || view.getUint32(20, true) !== 0) {
    return null
  }
  return {
    kind: kind as TerminalMultiplexAckRecord['kind'],
    status: status as TerminalMultiplexAckRecord['status'],
    errorCode: view.getUint16(2, true),
    acknowledgedBytes: view.getUint32(4, true),
    cumulativeSeq: view.getBigUint64(8, true),
    receiverQueueBytes: view.getUint32(16, true)
  }
}

export function encodeTerminalMultiplexCreditRecord(
  record: TerminalMultiplexCreditRecord
): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(16)
  const view = new DataView(out.buffer)
  view.setUint8(0, record.direction)
  view.setUint8(1, record.reason)
  view.setUint16(2, 0, true)
  view.setUint32(4, record.maxInFlightBytes, true)
  view.setUint32(8, record.ackEveryBytes, true)
  view.setUint32(12, record.maxFrameBytes, true)
  return out
}

export function decodeTerminalMultiplexCreditRecord(
  payload: Uint8Array<ArrayBufferLike>
): TerminalMultiplexCreditRecord | null {
  if (payload.byteLength !== 16) {
    return null
  }
  const view = payloadView(payload)
  const direction = view.getUint8(0)
  const reason = view.getUint8(1)
  if (direction > 1 || reason > 3 || view.getUint16(2, true) !== 0) {
    return null
  }
  return {
    direction: direction as TerminalMultiplexCreditRecord['direction'],
    reason: reason as TerminalMultiplexCreditRecord['reason'],
    maxInFlightBytes: view.getUint32(4, true),
    ackEveryBytes: view.getUint32(8, true),
    maxFrameBytes: view.getUint32(12, true)
  }
}

export function encodeTerminalMultiplexVisibilityRecord(
  record: TerminalMultiplexVisibilityRecord
): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(8)
  const view = new DataView(out.buffer)
  view.setUint8(0, record.visible ? 1 : 0)
  view.setUint8(1, record.deliveryInterest ? 1 : 0)
  view.setUint8(2, record.priority)
  view.setUint8(3, 0)
  view.setUint32(4, record.stateVersion, true)
  return out
}

export function decodeTerminalMultiplexVisibilityRecord(
  payload: Uint8Array<ArrayBufferLike>
): TerminalMultiplexVisibilityRecord | null {
  if (payload.byteLength !== 8) {
    return null
  }
  const view = payloadView(payload)
  const visible = decodeBool(view.getUint8(0))
  const deliveryInterest = decodeBool(view.getUint8(1))
  const priority = view.getUint8(2)
  if (visible === null || deliveryInterest === null || priority > 2 || view.getUint8(3) !== 0) {
    return null
  }
  return {
    visible,
    deliveryInterest,
    priority: priority as TerminalMultiplexVisibilityRecord['priority'],
    stateVersion: view.getUint32(4, true)
  }
}

export function encodeTerminalMultiplexKillRecord(
  record: TerminalMultiplexKillRecord
): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(8)
  const view = new DataView(out.buffer)
  view.setUint8(0, record.keepHistory ? 1 : 0)
  view.setUint8(1, 1)
  return out
}

export function decodeTerminalMultiplexKillRecord(
  payload: Uint8Array<ArrayBufferLike>
): TerminalMultiplexKillRecord | null {
  if (payload.byteLength !== 8) {
    return null
  }
  const view = payloadView(payload)
  const keepHistory = decodeBool(view.getUint8(0))
  if (
    keepHistory === null ||
    view.getUint8(1) !== 1 ||
    view.getUint16(2, true) !== 0 ||
    view.getUint32(4, true) !== 0
  ) {
    return null
  }
  return { keepHistory, immediate: true }
}

export function encodeTerminalMultiplexInputRecord(
  record: TerminalMultiplexInputRecord
): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(8 + record.data.byteLength)
  const view = new DataView(out.buffer)
  view.setUint8(0, record.kind)
  view.setUint8(1, 0)
  view.setUint16(2, 0, true)
  view.setUint32(4, record.data.byteLength, true)
  out.set(record.data, 8)
  return out
}

export function decodeTerminalMultiplexInputRecord(
  payload: Uint8Array<ArrayBufferLike>
): TerminalMultiplexInputRecord | null {
  if (payload.byteLength < 8) {
    return null
  }
  const view = payloadView(payload)
  const kind = view.getUint8(0)
  const dataBytes = view.getUint32(4, true)
  if (
    kind > 1 ||
    view.getUint8(1) !== 0 ||
    view.getUint16(2, true) !== 0 ||
    dataBytes !== payload.byteLength - 8 ||
    !isStrictUtf8(payload.subarray(8))
  ) {
    return null
  }
  return { kind: kind as TerminalMultiplexInputRecord['kind'], data: payload.slice(8) }
}

function payloadView(payload: Uint8Array<ArrayBufferLike>): DataView {
  return new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
}

function decodeBool(value: number): boolean | null {
  return value === 0 ? false : value === 1 ? true : null
}

function isStrictUtf8(payload: Uint8Array<ArrayBufferLike>): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(payload)
    return true
  } catch {
    return false
  }
}
