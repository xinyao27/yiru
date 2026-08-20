import { terminalMultiplexCrc32c } from '@yiru/runtime-protocol/terminal-multiplex/crc32c'
import { TerminalMultiplexOpcode } from '@yiru/runtime-protocol/terminal-multiplex/frame'
import {
  encodeTerminalMultiplexSnapshotChunkRecord,
  encodeTerminalMultiplexSnapshotEndRecord,
  encodeTerminalMultiplexSnapshotStartRecord
} from '@yiru/runtime-protocol/terminal-multiplex/snapshot-records'
import type { YiruRuntimeService } from '~main/runtime/yiru-runtime'

import { buildTerminalMultiplexSnapshot } from './snapshot'

const SNAPSHOT_CHUNK_DATA_BYTES = 48 * 1024

type SendFrame = (
  opcode: (typeof TerminalMultiplexOpcode)[keyof typeof TerminalMultiplexOpcode],
  seq: bigint,
  correlationId: number,
  payload: Uint8Array<ArrayBufferLike>
) => boolean

export type TerminalMultiplexSentSnapshot = {
  snapshotId: number
  coverageEndSeq: bigint
  status: 0 | 1 | 2 | 3
  assembledBytes: number
  retainedScrollbackRows: number
  truncated: boolean
}

export async function sendTerminalMultiplexSnapshot(options: {
  runtime: YiruRuntimeService
  ptyId: string
  snapshotId: number
  reason: 0 | 1 | 2 | 3 | 4 | 5 | 6
  maxBytes: number
  scrollbackRows?: number
  pendingDeliveryStartSeq?: bigint
  send: SendFrame
  isCurrent?: () => boolean
}): Promise<TerminalMultiplexSentSnapshot> {
  const result = await buildTerminalMultiplexSnapshot(
    options.runtime,
    options.ptyId,
    options.maxBytes,
    options.scrollbackRows,
    options.pendingDeliveryStartSeq
  )
  if (result.kind !== 'complete') {
    const coverageEndSeq =
      result.kind === 'too-large'
        ? result.coverageEndSeq
        : options.runtime.getTerminalWireByteSequence(options.ptyId)
    const status = result.kind === 'too-large' ? 2 : 1
    options.send(
      TerminalMultiplexOpcode.SnapshotEnd,
      coverageEndSeq,
      options.snapshotId,
      encodeTerminalMultiplexSnapshotEndRecord({
        snapshotId: options.snapshotId,
        status,
        coverageEndSeq,
        assembledBytes: 0,
        crc32c: 0
      })
    )
    return {
      snapshotId: options.snapshotId,
      coverageEndSeq,
      status,
      assembledBytes: 0,
      retainedScrollbackRows: 0,
      truncated: result.kind === 'too-large'
    }
  }

  if (options.isCurrent && !options.isCurrent()) {
    return {
      snapshotId: options.snapshotId,
      coverageEndSeq: result.snapshot.coverageEndSeq,
      status: 3,
      assembledBytes: 0,
      retainedScrollbackRows: result.snapshot.retainedScrollbackRows,
      truncated: result.snapshot.truncated
    }
  }

  const snapshot = result.snapshot
  const sectionBytes = snapshot.sections.map((section) => section.byteLength)
  options.send(
    TerminalMultiplexOpcode.SnapshotStart,
    snapshot.coverageEndSeq,
    options.snapshotId,
    encodeTerminalMultiplexSnapshotStartRecord({
      snapshotId: options.snapshotId,
      reason: options.reason,
      source: snapshot.source,
      activeBuffer: snapshot.activeBuffer,
      truncated: snapshot.truncated,
      byteBudget: snapshot.byteBudget,
      coldRestore: snapshot.coldRestore,
      cols: snapshot.cols,
      rows: snapshot.rows,
      retainedScrollbackRows: snapshot.retainedScrollbackRows,
      coverageEndSeq: snapshot.coverageEndSeq,
      pendingDeliveryStartSeq: snapshot.pendingDeliveryStartSeq,
      sectionBytes: [
        sectionBytes[0]!,
        sectionBytes[1]!,
        sectionBytes[2]!,
        sectionBytes[3]!,
        sectionBytes[4]!
      ]
    })
  )
  for (let section = 0; section < snapshot.sections.length; section += 1) {
    const data = snapshot.sections[section]!
    for (let offset = 0; offset < data.byteLength; offset += SNAPSHOT_CHUNK_DATA_BYTES) {
      options.send(
        TerminalMultiplexOpcode.SnapshotChunk,
        snapshot.coverageEndSeq,
        options.snapshotId,
        encodeTerminalMultiplexSnapshotChunkRecord({
          snapshotId: options.snapshotId,
          section: snapshotSection(section),
          sectionOffset: offset,
          data: data.slice(offset, offset + SNAPSHOT_CHUNK_DATA_BYTES)
        })
      )
    }
  }
  const assembledBytes = sectionBytes.reduce((total, bytes) => total + bytes, 0)
  options.send(
    TerminalMultiplexOpcode.SnapshotEnd,
    snapshot.coverageEndSeq,
    options.snapshotId,
    encodeTerminalMultiplexSnapshotEndRecord({
      snapshotId: options.snapshotId,
      status: 0,
      coverageEndSeq: snapshot.coverageEndSeq,
      assembledBytes,
      crc32c: terminalMultiplexCrc32c(snapshot.sections)
    })
  )
  return {
    snapshotId: options.snapshotId,
    coverageEndSeq: snapshot.coverageEndSeq,
    status: 0,
    assembledBytes,
    retainedScrollbackRows: snapshot.retainedScrollbackRows,
    truncated: snapshot.truncated
  }
}

function snapshotSection(value: number): 0 | 1 | 2 | 3 | 4 {
  if (value === 0 || value === 1 || value === 2 || value === 3 || value === 4) {
    return value
  }
  throw new Error('Invalid terminal snapshot section')
}
