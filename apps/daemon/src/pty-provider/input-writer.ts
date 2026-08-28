const MAX_PENDING_INPUT_BYTES = 1024 * 1024
const TERMINAL_INPUT_ENCODER = new TextEncoder()

export class BunTerminalInputWriter {
  private readonly terminal: Bun.Terminal
  private readonly queue: Uint8Array<ArrayBuffer>[] = []
  private offset = 0
  private pendingBytes = 0
  private isWriting = false

  constructor(terminal: Bun.Terminal) {
    this.terminal = terminal
  }

  write(data: string): void {
    if (!data) {
      return
    }
    if (this.terminal.closed) {
      throw new Error('pty_input_closed')
    }
    const bytes = TERMINAL_INPUT_ENCODER.encode(data)
    if (this.pendingBytes + bytes.byteLength > MAX_PENDING_INPUT_BYTES) {
      throw new Error('pty_input_backpressure')
    }
    this.queue.push(bytes)
    this.pendingBytes += bytes.byteLength
    this.drain()
  }

  drain(): void {
    if (this.isWriting || this.terminal.closed) {
      return
    }
    this.isWriting = true
    try {
      while (this.queue.length > 0) {
        const chunk = this.queue[0]
        const remaining = chunk.subarray(this.offset)
        const written = this.terminal.write(remaining)
        if (written <= 0) {
          return
        }
        if (written > remaining.byteLength) {
          throw new Error('pty_input_write_invalid')
        }
        this.offset += written
        this.pendingBytes -= written
        if (this.offset === chunk.byteLength) {
          this.queue.shift()
          this.offset = 0
        }
      }
    } finally {
      this.isWriting = false
    }
  }

  clear(): void {
    this.queue.length = 0
    this.offset = 0
    this.pendingBytes = 0
  }
}
