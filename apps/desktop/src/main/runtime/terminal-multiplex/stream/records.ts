import {
  decodeTerminalMultiplexAckRecord,
  decodeTerminalMultiplexCreditRecord,
  type TerminalMultiplexAckRecord,
  type TerminalMultiplexCreditRecord
} from '@yiru/runtime-protocol/terminal-multiplex/flow-records'
import type { TerminalMultiplexFrame } from '@yiru/runtime-protocol/terminal-multiplex/frame'
import { decodeTerminalMultiplexJson } from '@yiru/runtime-protocol/terminal-multiplex/json'
import {
  decodeTerminalMultiplexResizeRecord,
  decodeTerminalMultiplexSubscribeRecord,
  type TerminalMultiplexSubscribeRecord
} from '@yiru/runtime-protocol/terminal-multiplex/stream-records'

export type { TerminalMultiplexSubscribeRecord }

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
  return decodeTerminalMultiplexSubscribeRecord(payload)
}

export const decodeTerminalMultiplexResize = decodeTerminalMultiplexResizeRecord

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

function decodeViewport(value: unknown): { cols: number; rows: number } | null {
  return isRecord(value) && isU16(value.cols, 1, 1_000) && isU16(value.rows, 1, 500)
    ? { cols: value.cols, rows: value.rows }
    : null
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
