import { terminalMultiplexCrc32c } from '@yiru/runtime-protocol/terminal-multiplex/crc32c'
import type { TerminalMultiplexFrame } from '@yiru/runtime-protocol/terminal-multiplex/frame'
import { decodeTerminalMultiplexJson } from '@yiru/runtime-protocol/terminal-multiplex/json'
import {
  decodeTerminalMultiplexSnapshotChunkRecord,
  decodeTerminalMultiplexSnapshotEndRecord,
  decodeTerminalMultiplexSnapshotStartRecord,
  TERMINAL_MULTIPLEX_SNAPSHOT_CHUNK_DATA_BYTES
} from '@yiru/runtime-protocol/terminal-multiplex/snapshot-records'

import type { MobileTerminalSnapshot, MobileTerminalSnapshotMetadata } from './types'

const SNAPSHOT_MAX_BYTES = 2 * 1024 * 1024

export class MobileTerminalSnapshotAssembler {
  private startRecord: ReturnType<typeof decodeTerminalMultiplexSnapshotStartRecord> = null
  private sections: [Uint8Array, Uint8Array, Uint8Array, Uint8Array, Uint8Array] | null = null
  private offsets = [0, 0, 0, 0, 0]

  start(frame: TerminalMultiplexFrame): boolean {
    const record = decodeTerminalMultiplexSnapshotStartRecord(frame.payload)
    if (
      !record ||
      record.snapshotId === 0 ||
      record.snapshotId !== frame.correlationId ||
      record.coverageEndSeq !== frame.seq ||
      record.sectionBytes.some((bytes) => bytes > SNAPSHOT_MAX_BYTES) ||
      record.sectionBytes.reduce((total, bytes) => total + bytes, 0) > SNAPSHOT_MAX_BYTES
    ) {
      return false
    }
    this.startRecord = record
    this.sections = [
      new Uint8Array(record.sectionBytes[0]),
      new Uint8Array(record.sectionBytes[1]),
      new Uint8Array(record.sectionBytes[2]),
      new Uint8Array(record.sectionBytes[3]),
      new Uint8Array(record.sectionBytes[4])
    ]
    this.offsets = [0, 0, 0, 0, 0]
    return true
  }

  chunk(frame: TerminalMultiplexFrame): boolean {
    const record = decodeTerminalMultiplexSnapshotChunkRecord(frame.payload)
    const target = record ? this.sections?.[record.section] : undefined
    const start = this.startRecord
    if (
      !record ||
      !target ||
      !start ||
      record.snapshotId !== start.snapshotId ||
      frame.correlationId !== start.snapshotId ||
      frame.seq !== start.coverageEndSeq ||
      record.sectionOffset !== this.offsets[record.section] ||
      record.sectionOffset + record.data.byteLength > target.byteLength ||
      record.data.byteLength > TERMINAL_MULTIPLEX_SNAPSHOT_CHUNK_DATA_BYTES
    ) {
      return false
    }
    target.set(record.data, record.sectionOffset)
    this.offsets[record.section] += record.data.byteLength
    return true
  }

  end(frame: TerminalMultiplexFrame): MobileTerminalSnapshot | null {
    const end = decodeTerminalMultiplexSnapshotEndRecord(frame.payload)
    const start = this.startRecord
    const sections = this.sections
    if (
      !end ||
      !start ||
      !sections ||
      end.status !== 0 ||
      end.snapshotId !== start.snapshotId ||
      frame.correlationId !== start.snapshotId ||
      end.coverageEndSeq !== start.coverageEndSeq ||
      frame.seq !== start.coverageEndSeq ||
      sections.some((section, index) => section.byteLength !== this.offsets[index]) ||
      sections.reduce((total, section) => total + section.byteLength, 0) !== end.assembledBytes ||
      terminalMultiplexCrc32c(sections) !== end.crc32c
    ) {
      this.clear()
      return null
    }
    try {
      const text = sections.map((section) =>
        new TextDecoder('utf-8', { fatal: true }).decode(section)
      )
      const metadata = decodeSnapshotMetadata(decodeTerminalMultiplexJson(sections[4]))
      if (!metadata) {
        throw new Error('Invalid terminal snapshot metadata')
      }
      const snapshot = {
        id: start.snapshotId,
        cols: start.cols,
        rows: start.rows,
        activeBuffer: start.activeBuffer === 0 ? 'normal' : 'alternate',
        normalScrollback: text[0]!,
        normalScreen: text[1]!,
        alternateScreen: text[2]!,
        pendingEscapeTail: text[3]!,
        coverageEndSeq: start.coverageEndSeq.toString(),
        pendingDeliveryStartSeq: start.pendingDeliveryStartSeq.toString(),
        wireByteLength: end.assembledBytes,
        retainedScrollbackRows: start.retainedScrollbackRows,
        truncated: start.truncated,
        source: start.source === 0 ? 'headless' : 'provider',
        metadata
      } satisfies MobileTerminalSnapshot
      this.clear()
      return snapshot
    } catch {
      this.clear()
      return null
    }
  }

  clear(): void {
    this.startRecord = null
    this.sections = null
    this.offsets = [0, 0, 0, 0, 0]
  }
}

function decodeSnapshotMetadata(
  value: Record<string, unknown> | null
): MobileTerminalSnapshotMetadata | null {
  if (
    !value ||
    (value.cwd !== null && typeof value.cwd !== 'string') ||
    (value.lastTitle !== null && typeof value.lastTitle !== 'string') ||
    !Array.isArray(value.oscLinks) ||
    !isU32(value.kittyKeyboardFlags) ||
    (value.displayMode !== 'auto' && value.displayMode !== 'desktop') ||
    !isU32(value.requestedScrollbackRows)
  ) {
    return null
  }
  const oscLinks: MobileTerminalSnapshotMetadata['oscLinks'] = []
  for (const link of value.oscLinks) {
    if (
      typeof link !== 'object' ||
      link === null ||
      !('uri' in link) ||
      typeof link.uri !== 'string' ||
      !('start' in link) ||
      !isU32(link.start) ||
      !('end' in link) ||
      !isU32(link.end)
    ) {
      return null
    }
    oscLinks.push({ uri: link.uri, start: link.start, end: link.end })
  }
  return {
    cwd: value.cwd,
    lastTitle: value.lastTitle,
    oscLinks,
    kittyKeyboardFlags: value.kittyKeyboardFlags,
    displayMode: value.displayMode,
    requestedScrollbackRows: value.requestedScrollbackRows
  }
}

function isU32(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff
}
