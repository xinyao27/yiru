import type { TerminalMultiplexFrame } from '@yiru/runtime-protocol/terminal-multiplex/frame'
import { decodeTerminalMultiplexJson } from '@yiru/runtime-protocol/terminal-multiplex/json'

type RemoteTerminalEndRecord = {
  exitCode: number | null
  reason: 'exit'
  historyKept: boolean
}

type RemoteTerminalModelRestoreRecord = {
  reason:
    | 'hidden-drop'
    | 'pending-cap'
    | 'ack-stall'
    | 'sequence-gap'
    | 'provider-gap'
    | 'renderer-replaced'
  markerSeq: string
  snapshotFollows: boolean
}

export function decodeRemoteTerminalEnd(
  frame: TerminalMultiplexFrame
): RemoteTerminalEndRecord | null {
  const value = decodeTerminalMultiplexJson(frame.payload)
  const exitCode = value?.exitCode
  if (
    !value ||
    (exitCode !== null && !isI32(exitCode)) ||
    value.reason !== 'exit' ||
    typeof value.historyKept !== 'boolean'
  ) {
    return null
  }
  return { exitCode, reason: value.reason, historyKept: value.historyKept }
}

export function decodeRemoteTerminalModelRestore(
  frame: TerminalMultiplexFrame
): RemoteTerminalModelRestoreRecord | null {
  const value = decodeTerminalMultiplexJson(frame.payload)
  if (
    !value ||
    !isRestoreReason(value.reason) ||
    value.markerSeq !== frame.seq.toString() ||
    typeof value.snapshotFollows !== 'boolean'
  ) {
    return null
  }
  return {
    reason: value.reason,
    markerSeq: value.markerSeq,
    snapshotFollows: value.snapshotFollows
  }
}

function isI32(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= -0x80000000 &&
    value <= 0x7fffffff
  )
}

function isRestoreReason(value: unknown): value is RemoteTerminalModelRestoreRecord['reason'] {
  return (
    value === 'hidden-drop' ||
    value === 'pending-cap' ||
    value === 'ack-stall' ||
    value === 'sequence-gap' ||
    value === 'provider-gap' ||
    value === 'renderer-replaced'
  )
}
