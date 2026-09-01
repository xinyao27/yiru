import { encodeTerminalMultiplexJson } from '@yiru/runtime-protocol/terminal-multiplex/json'
import type { YiruRuntimeService } from '~main/runtime/yiru-runtime'

const DEFAULT_SNAPSHOT_BYTES = 2 * 1024 * 1024
const HARD_SNAPSHOT_BYTES = 8 * 1024 * 1024
const DEFAULT_SCROLLBACK_ROWS = 1_000
const TERMINAL_SNAPSHOT_ENCODER = new TextEncoder()

export type TerminalMultiplexSnapshot = {
  activeBuffer: 0 | 1
  cols: number
  rows: number
  retainedScrollbackRows: number
  coverageEndSeq: bigint
  pendingDeliveryStartSeq: bigint
  sections: readonly [Uint8Array, Uint8Array, Uint8Array, Uint8Array, Uint8Array]
  truncated: boolean
  byteBudget: boolean
  coldRestore: boolean
  source: 0 | 1
}

export type TerminalMultiplexSnapshotResult =
  | { kind: 'complete'; snapshot: TerminalMultiplexSnapshot }
  | { kind: 'unavailable' }
  | { kind: 'too-large'; coverageEndSeq: bigint }

export async function buildTerminalMultiplexSnapshot(
  runtime: YiruRuntimeService,
  ptyId: string,
  clientMaxBytes: number,
  requestedScrollbackRows = DEFAULT_SCROLLBACK_ROWS,
  pendingDeliveryStartSeq?: bigint
): Promise<TerminalMultiplexSnapshotResult> {
  const effectiveCap = Math.min(
    Math.max(0, Math.floor(clientMaxBytes)),
    DEFAULT_SNAPSHOT_BYTES,
    HARD_SNAPSHOT_BYTES
  )
  const requestedRows = Math.max(0, Math.floor(requestedScrollbackRows))
  const mandatory = await serializeSnapshot(runtime, ptyId, 0)
  if (!mandatory) {
    return { kind: 'unavailable' }
  }
  if (sectionBytes(mandatory.sections) > effectiveCap) {
    return { kind: 'too-large', coverageEndSeq: mandatory.coverageEndSeq }
  }

  let low = 0
  let high = requestedRows
  let selected = mandatory
  while (low <= high) {
    const candidateRows = Math.floor((low + high) / 2)
    const candidate =
      candidateRows === 0 ? mandatory : await serializeSnapshot(runtime, ptyId, candidateRows)
    if (!candidate) {
      high = candidateRows - 1
      continue
    }
    if (sectionBytes(candidate.sections) <= effectiveCap) {
      selected = candidate
      low = candidateRows + 1
    } else {
      high = candidateRows - 1
    }
  }

  const retainedScrollbackRows = Math.min(selected.retainedScrollbackRows, requestedRows)
  const truncated = retainedScrollbackRows < requestedRows
  return {
    kind: 'complete',
    snapshot: {
      ...selected,
      pendingDeliveryStartSeq:
        pendingDeliveryStartSeq !== undefined && pendingDeliveryStartSeq <= selected.coverageEndSeq
          ? pendingDeliveryStartSeq
          : selected.coverageEndSeq,
      retainedScrollbackRows,
      truncated,
      byteBudget: truncated
    }
  }
}

async function serializeSnapshot(
  runtime: YiruRuntimeService,
  ptyId: string,
  scrollbackRows: number
): Promise<TerminalMultiplexSnapshot | null> {
  const serialized = await runtime.serializeTerminalMultiplexBuffer(ptyId, scrollbackRows)
  if (!serialized) {
    return null
  }
  const activeBuffer = serialized.alternateScreen ? 1 : 0
  const normalScrollback = encodeText(serialized.scrollbackAnsi ?? '')
  const normalScreen = encodeText(activeBuffer === 0 ? serialized.data : '')
  const alternateScreen = encodeText(activeBuffer === 1 ? serialized.data : '')
  const pendingEscapeTail = encodeText(serialized.pendingEscapeTailAnsi ?? '')
  const metadata = encodeTerminalMultiplexJson({
    cwd: serialized.cwd ?? null,
    lastTitle: serialized.lastTitle ?? null,
    oscLinks: (serialized.oscLinks ?? []).map((link) => ({
      uri: link.uri,
      start: Math.max(0, link.row * serialized.cols + link.startCol),
      end: Math.max(0, link.row * serialized.cols + link.endCol)
    })),
    kittyKeyboardFlags: serialized.kittyKeyboardFlags,
    displayMode: runtime.getMobileDisplayMode(ptyId),
    requestedScrollbackRows: scrollbackRows
  })
  const coverageEndSeq = serialized.wireByteSeq
  return {
    activeBuffer,
    cols: serialized.cols,
    rows: serialized.rows,
    retainedScrollbackRows: serialized.retainedScrollbackRows,
    coverageEndSeq,
    pendingDeliveryStartSeq: coverageEndSeq,
    sections: [normalScrollback, normalScreen, alternateScreen, pendingEscapeTail, metadata],
    truncated: false,
    byteBudget: false,
    coldRestore: false,
    source: serialized.source === 'headless' ? 0 : 1
  }
}

function sectionBytes(sections: TerminalMultiplexSnapshot['sections']): number {
  return sections.reduce((total, section) => total + section.byteLength, 0)
}

function encodeText(value: string): Uint8Array {
  return TERMINAL_SNAPSHOT_ENCODER.encode(value)
}
