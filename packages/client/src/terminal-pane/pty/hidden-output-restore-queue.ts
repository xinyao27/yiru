import type { PtyDataMeta } from '~renderer/runtime/pty-data-meta'

import type { OrderedOutputChunk, OrderedOutputSequence } from './ordered-output-sequence'

const MAX_PENDING_CHARS = 512 * 1024

type HiddenOutputRestoreQueueOptions = {
  orderedOutput: OrderedOutputSequence
  salvageDiscarded: (data: string) => void
  writeForeground: (data: string) => void
  onActivity: () => void
}

export type HiddenOutputRestoreQueue = {
  queue: (data: string, meta?: PtyDataMeta) => void
  drainAfterSnapshot: (snapshotSeq: number | undefined) => 'drained' | 'overflow' | 'refetch'
  hasPending: () => boolean
  isOverflowed: () => boolean
  takeForAbandonment: () => { chunks: OrderedOutputChunk[]; hadOverflow: boolean }
  discardSalvagingQueries: () => void
  clear: () => void
}

export function createHiddenOutputRestoreQueue(
  options: HiddenOutputRestoreQueueOptions
): HiddenOutputRestoreQueue {
  let chunks: OrderedOutputChunk[] = []
  let pendingChars = 0
  let hasOverflow = false

  const discardSalvagingQueries = (): void => {
    const discarded = chunks
    chunks = []
    pendingChars = 0
    for (const chunk of discarded) {
      options.salvageDiscarded(chunk.data)
    }
  }

  const clear = (): void => {
    chunks = []
    pendingChars = 0
    hasOverflow = false
  }

  return {
    queue: (data, meta) => {
      if (!data) {
        return
      }
      if (hasOverflow) {
        options.salvageDiscarded(data)
        options.onActivity()
        return
      }
      if (pendingChars + data.length > MAX_PENDING_CHARS) {
        discardSalvagingQueries()
        hasOverflow = true
        options.salvageDiscarded(data)
        options.onActivity()
        return
      }
      const chunk: OrderedOutputChunk = { data }
      if (typeof meta?.seq === 'number') {
        chunk.seq = meta.seq
      }
      if (typeof meta?.rawLength === 'number') {
        chunk.rawLength = meta.rawLength
      }
      chunks.push(chunk)
      pendingChars += data.length
      options.onActivity()
    },
    drainAfterSnapshot: (snapshotSeq) => {
      if (hasOverflow) {
        hasOverflow = false
        discardSalvagingQueries()
        return 'overflow'
      }
      while (chunks.length > 0) {
        const pending = chunks
        chunks = []
        pendingChars = 0
        for (const [index, chunk] of pending.entries()) {
          const data = options.orderedOutput.sliceAfterSnapshot(chunk, snapshotSeq)
          if (data === null) {
            for (const discarded of pending.slice(index)) {
              options.salvageDiscarded(discarded.data)
            }
            discardSalvagingQueries()
            return 'refetch'
          }
          if (typeof chunk.seq === 'number') {
            options.orderedOutput.advanceExpectedSeq(chunk.seq)
          }
          if (data) {
            options.writeForeground(data)
            options.orderedOutput.recordRendered(chunk)
          }
        }
        if (hasOverflow) {
          hasOverflow = false
          discardSalvagingQueries()
          return 'overflow'
        }
      }
      return 'drained'
    },
    hasPending: () => chunks.length > 0,
    isOverflowed: () => hasOverflow,
    takeForAbandonment: () => {
      const result = { chunks: hasOverflow ? [] : chunks.slice(), hadOverflow: hasOverflow }
      clear()
      return result
    },
    discardSalvagingQueries,
    clear
  }
}
