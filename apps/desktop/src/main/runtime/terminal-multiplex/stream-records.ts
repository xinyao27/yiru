import {
  decodeTerminalMultiplexAckRecord,
  decodeTerminalMultiplexCreditRecord,
  type TerminalMultiplexAckRecord,
  type TerminalMultiplexCreditRecord
} from '@yiru/runtime-protocol/terminal-multiplex/flow-records'
import type { TerminalMultiplexFrame } from '@yiru/runtime-protocol/terminal-multiplex/frame'
import { decodeTerminalMultiplexJson } from '@yiru/runtime-protocol/terminal-multiplex/json'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type TerminalMultiplexSubscribeRecord = {
  terminal: string
  transportGeneration: string
  client: { id: string; type: 'desktop' | 'mobile' | 'web' }
  viewport?: { cols: number; rows: number }
  lastParsedSeq: bigint
  delivery: { visible: boolean; interested: boolean; priority: 0 | 1 | 2 }
  snapshotMaxBytes: number
}

export type TerminalMultiplexResizeRecord = {
  cols: number
  rows: number
  reason: 'fit' | 'user' | 'restore-pulse'
}

export type TerminalMultiplexClaimRecord = {
  action: 'register' | 'claim' | 'release' | 'report'
  cols: number
  rows: number
  clientId: string
}

export type TerminalMultiplexSnapshotRequestRecord = {
  requestedScrollbackRows: number
  snapshotMaxBytes: number | null
}

export function decodeTerminalMultiplexClientAck(
  frame: TerminalMultiplexFrame
): TerminalMultiplexAckRecord | null {
  const record = decodeTerminalMultiplexAckRecord(frame.payload)
  if (
    !record ||
    record.cumulativeSeq !== frame.seq ||
    (record.kind === 0 && frame.correlationId !== 0) ||
    (record.kind !== 0 && frame.correlationId === 0)
  ) {
    return null
  }
  return record
}

export function decodeTerminalMultiplexClientCredit(
  frame: TerminalMultiplexFrame
): TerminalMultiplexCreditRecord | null {
  const record = decodeTerminalMultiplexCreditRecord(frame.payload)
  if (
    !record ||
    record.direction !== 0 ||
    frame.seq !== 0n ||
    frame.correlationId !== 0 ||
    record.maxFrameBytes === 0 ||
    record.maxFrameBytes > 1024 * 1024
  ) {
    return null
  }
  return record
}

export function decodeTerminalMultiplexSubscribe(
  payload: Uint8Array<ArrayBufferLike>
): TerminalMultiplexSubscribeRecord | null {
  const value = decodeTerminalMultiplexJson(payload)
  if (!value || !isString(value.terminal) || !isString(value.transportGeneration)) {
    return null
  }
  if (!UUID_PATTERN.test(value.transportGeneration) || !isRecord(value.client)) {
    return null
  }
  const clientType = value.client.type
  if (
    !isString(value.client.id) ||
    (clientType !== 'desktop' && clientType !== 'mobile' && clientType !== 'web')
  ) {
    return null
  }
  const viewport = decodeViewport(value.viewport)
  if (value.viewport !== undefined && !viewport) {
    return null
  }
  const lastParsedSeq = decodeU64(value.lastParsedSeq)
  const delivery = decodeDelivery(value.delivery)
  if (
    lastParsedSeq === null ||
    !delivery ||
    !isU32(value.snapshotMaxBytes) ||
    !hasRequiredCapabilities(value.capabilities)
  ) {
    return null
  }
  return {
    terminal: value.terminal,
    transportGeneration: value.transportGeneration,
    client: { id: value.client.id, type: clientType },
    ...(viewport ? { viewport } : {}),
    lastParsedSeq,
    delivery,
    snapshotMaxBytes: value.snapshotMaxBytes
  }
}

export function decodeTerminalMultiplexResize(
  payload: Uint8Array<ArrayBufferLike>
): TerminalMultiplexResizeRecord | null {
  const value = decodeTerminalMultiplexJson(payload)
  const viewport = value ? decodeViewport(value) : null
  const reason = value?.reason
  return viewport && (reason === 'fit' || reason === 'user' || reason === 'restore-pulse')
    ? { ...viewport, reason }
    : null
}

export function decodeTerminalMultiplexClaim(
  payload: Uint8Array<ArrayBufferLike>
): TerminalMultiplexClaimRecord | null {
  const value = decodeTerminalMultiplexJson(payload)
  const viewport = value ? decodeViewport(value) : null
  const action = value?.action
  if (
    !viewport ||
    !isString(value?.clientId) ||
    (action !== 'register' && action !== 'claim' && action !== 'release' && action !== 'report')
  ) {
    return null
  }
  return { ...viewport, action, clientId: value.clientId }
}

export function decodeTerminalMultiplexSnapshotRequest(
  payload: Uint8Array<ArrayBufferLike>
): TerminalMultiplexSnapshotRequestRecord | null {
  const value = decodeTerminalMultiplexJson(payload)
  if (!value) {
    return null
  }
  const requestedRows = value.requestedScrollbackRows ?? 0
  const snapshotMaxBytes = value.snapshotMaxBytes
  if (!isU32(requestedRows) || (snapshotMaxBytes !== undefined && !isU32(snapshotMaxBytes))) {
    return null
  }
  return {
    requestedScrollbackRows: requestedRows,
    snapshotMaxBytes: typeof snapshotMaxBytes === 'number' ? snapshotMaxBytes : null
  }
}

export function decodeTerminalMultiplexSignal(payload: Uint8Array<ArrayBufferLike>): string | null {
  const value = decodeTerminalMultiplexJson(payload)
  const signal = value?.signal
  return signal === 'SIGINT' ||
    signal === 'SIGTERM' ||
    signal === 'SIGKILL' ||
    signal === 'SIGQUIT' ||
    signal === 'SIGHUP' ||
    signal === 'SIGWINCH' ||
    signal === 'SIGTSTP' ||
    signal === 'SIGCONT'
    ? signal
    : null
}

function decodeDelivery(value: unknown): TerminalMultiplexSubscribeRecord['delivery'] | null {
  if (
    !isRecord(value) ||
    typeof value.visible !== 'boolean' ||
    typeof value.interested !== 'boolean'
  ) {
    return null
  }
  const priority =
    value.priority === 'parked'
      ? 0
      : value.priority === 'visible'
        ? 1
        : value.priority === 'active'
          ? 2
          : null
  return priority === null
    ? null
    : { visible: value.visible, interested: value.interested, priority }
}

function decodeViewport(value: unknown): { cols: number; rows: number } | null {
  return isRecord(value) && isU16(value.cols, 1, 1_000) && isU16(value.rows, 1, 500)
    ? { cols: value.cols, rows: value.rows }
    : null
}

function hasRequiredCapabilities(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.dualScreenSnapshot === 1 &&
    value.parseAck === 1 &&
    value.explicitWriteAck === 1
  )
}

function decodeU64(value: unknown): bigint | null {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)$/.test(value)) {
    return null
  }
  const decoded = BigInt(value)
  return decoded <= 0xffffffffffffffffn ? decoded : null
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isU32(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff
}

function isU16(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}
