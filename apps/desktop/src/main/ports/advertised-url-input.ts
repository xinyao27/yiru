import { extractUrlCandidates, stripTerminalControls } from './advertised-url-parser'

const PER_PTY_BUFFER_LIMIT = 4096
const PENDING_PRE_BIND_LIMIT = 16 * 1024
const MAX_PENDING_ENTRIES = 32

class PtyBuffer {
  private raw = ''

  ingest(chunk: string): string {
    const chunkHasLineBreak = chunk.includes('\n') || chunk.includes('\r')
    this.raw += chunk
    if (this.raw.length > PER_PTY_BUFFER_LIMIT) {
      this.raw = this.raw.slice(-PER_PTY_BUFFER_LIMIT)
    }
    if (!chunkHasLineBreak) {
      return ''
    }
    const lastNewline = lastLineBreak(this.raw)
    if (lastNewline === -1) {
      return ''
    }
    const finalized = this.raw.slice(0, lastNewline + 1)
    this.raw = this.raw.slice(lastNewline + 1)
    return stripTerminalControls(finalized)
  }
}

export class AdvertisedUrlInput {
  private readonly buffers = new Map<string, PtyBuffer>()
  private readonly ptyToWorktree = new Map<string, string>()
  private readonly pending = new Map<string, string>()
  private readonly onUrl: (url: URL, ptyId: string, worktreeId: string, timestamp: number) => void

  constructor(onUrl: (url: URL, ptyId: string, worktreeId: string, timestamp: number) => void) {
    this.onUrl = onUrl
  }

  bindPty(ptyId: string, worktreeId: string): void {
    const pending = this.pending.get(ptyId)
    if (this.ptyToWorktree.get(ptyId) === worktreeId && pending === undefined) {
      return
    }
    this.ptyToWorktree.set(ptyId, worktreeId)
    if (pending !== undefined) {
      this.pending.delete(ptyId)
      this.ingest(ptyId, pending)
    }
  }

  unbindPty(ptyId: string): void {
    this.ptyToWorktree.delete(ptyId)
    this.buffers.delete(ptyId)
    this.pending.delete(ptyId)
  }

  forgetWorktree(worktreeId: string): void {
    for (const [ptyId, boundWorktreeId] of this.ptyToWorktree) {
      if (boundWorktreeId === worktreeId) {
        this.ptyToWorktree.delete(ptyId)
        this.buffers.delete(ptyId)
      }
    }
  }

  ingest(ptyId: string, chunk: string, now?: number): void {
    if (!chunk) {
      return
    }
    const worktreeId = this.ptyToWorktree.get(ptyId)
    if (!worktreeId) {
      this.bufferPendingInput(ptyId, chunk)
      return
    }
    let buffer = this.buffers.get(ptyId)
    if (!buffer) {
      buffer = new PtyBuffer()
      this.buffers.set(ptyId, buffer)
    }
    const finalized = buffer.ingest(chunk)
    if (!finalized) {
      return
    }
    const timestamp = now ?? Date.now()
    for (const url of extractUrlCandidates(finalized)) {
      this.onUrl(url, ptyId, worktreeId, timestamp)
    }
  }

  clear(): void {
    this.buffers.clear()
    this.ptyToWorktree.clear()
    this.pending.clear()
  }

  private bufferPendingInput(ptyId: string, chunk: string): void {
    // Why: daemon PTY data can arrive before spawn resolves the worktree ID.
    const merged = ((this.pending.get(ptyId) ?? '') + chunk).slice(-PENDING_PRE_BIND_LIMIT)
    this.pending.delete(ptyId)
    this.pending.set(ptyId, merged)
    while (this.pending.size > MAX_PENDING_ENTRIES) {
      const oldest = this.pending.keys().next().value
      if (oldest === undefined) {
        return
      }
      this.pending.delete(oldest)
    }
  }
}

function lastLineBreak(text: string): number {
  for (let index = text.length - 1; index >= 0; index--) {
    const character = text.charCodeAt(index)
    if (character === 0x0a || character === 0x0d) {
      return index
    }
  }
  return -1
}
