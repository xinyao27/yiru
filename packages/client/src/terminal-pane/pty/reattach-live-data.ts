import type { PtyDataMeta } from '~renderer/runtime/pty-data-meta'

const MAX_CHARS = 512 * 1024
const MAX_CHUNKS = 1_024

type DeferredChunk = {
  data: string
  ptyId: string | null
  streamGeneration: number
  meta?: PtyDataMeta
}

type ReattachLiveDataOptions = {
  getIsDisposed: () => boolean
  getPtyId: () => string | null
  getStreamGeneration: () => number
  deliver: (data: string, meta: PtyDataMeta | undefined, streamGeneration: number) => void
}

export type ReattachLiveData = {
  begin: (ownerGeneration?: number) => void
  finish: (deliver: boolean, acceptedGeneration?: number) => void
  defer: (data: string, meta: PtyDataMeta | undefined, streamGeneration: number) => boolean
}

export function createReattachLiveData(options: ReattachLiveDataOptions): ReattachLiveData {
  let chunks: DeferredChunk[] | null = null
  let chars = 0
  let depth = 0
  let owners = new Map<number, { failed: boolean }>()

  const defer = (
    data: string,
    meta: PtyDataMeta | undefined,
    streamGeneration: number
  ): boolean => {
    if (chunks === null) {
      return false
    }
    // Why: a replacement stream must not inherit bytes or a gap marker from
    // the replay owner it superseded.
    chunks = chunks.filter((chunk) => chunk.streamGeneration === streamGeneration)
    chars = chunks.reduce((total, chunk) => total + chunk.data.length, 0)
    const oversized = data.length > MAX_CHARS
    const deferredData = oversized ? data.slice(-MAX_CHARS) : data
    chunks.push({
      data: deferredData,
      ptyId: options.getPtyId(),
      streamGeneration,
      ...(meta ? { meta } : {})
    })
    chars += deferredData.length
    let dropped = oversized
    while (chunks.length > 1 && (chunks.length > MAX_CHUNKS || chars > MAX_CHARS)) {
      const removed = chunks.shift()
      chars -= removed?.data.length ?? 0
      dropped = true
    }
    if (dropped && chunks[0]) {
      chunks[0].meta = { ...chunks[0].meta, droppedOutput: true }
    }
    return true
  }

  return {
    begin: (ownerGeneration = options.getStreamGeneration()) => {
      depth += 1
      if (depth === 1) {
        chunks = []
        chars = 0
        owners = new Map()
      }
      if (!owners.has(ownerGeneration)) {
        owners.set(ownerGeneration, { failed: false })
      }
    },
    finish: (deliver, acceptedGeneration = options.getStreamGeneration()) => {
      if (depth <= 0) {
        return
      }
      if (!deliver) {
        const owner = owners.get(acceptedGeneration)
        if (owner) {
          owner.failed = true
        }
      }
      depth -= 1
      if (depth > 0) {
        return
      }
      const pending = chunks
      chunks = null
      chars = 0
      const currentPtyId = options.getPtyId()
      const currentGeneration = options.getStreamGeneration()
      const currentOwner = owners.get(currentGeneration)
      owners = new Map()
      if (options.getIsDisposed() || !pending) {
        return
      }
      // Why: createOrAttach snapshots precede bytes emitted before its IPC
      // reply. Paint replay first, then admit live bytes so clear cannot erase them.
      for (const chunk of pending) {
        if (
          chunk.ptyId === currentPtyId &&
          chunk.streamGeneration === currentGeneration &&
          currentOwner?.failed !== true
        ) {
          options.deliver(chunk.data, chunk.meta, chunk.streamGeneration)
        }
      }
    },
    defer
  }
}
