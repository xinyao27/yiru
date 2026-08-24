import { LocalPtyProviderSpawn } from './spawn'
import { ptyProcesses } from './state'

export abstract class LocalPtyProviderIo extends LocalPtyProviderSpawn {
  // Local PTYs are always attached -- no-op. Remote providers use this to resubscribe.
  async attach(_id: string): Promise<void> {}
  hasPty(id: string): boolean {
    return ptyProcesses.has(id)
  }
  write(id: string, data: string): void {
    ptyProcesses.get(id)?.write(data)
  }
  resize(id: string, cols: number, rows: number): void {
    ptyProcesses.get(id)?.resize(cols, rows)
  }

  // Why: node-pty pause() stops reading the pty master fd, so the kernel
  // buffer fills and a flooding child blocks on write — true producer
  // backpressure. Best-effort: a PTY torn down mid-call must never throw
  // into the flow-control path.
  pauseProducer(id: string): void {
    try {
      ptyProcesses.get(id)?.pause()
    } catch {
      /* PTY already destroyed */
    }
  }

  resumeProducer(id: string): void {
    try {
      ptyProcesses.get(id)?.resume()
    } catch {
      /* PTY already destroyed */
    }
  }

  // Why: node-pty caches the last winsize it applied on the IPty handle, so its
  // cols/rows are the authoritative applied size (node-pty clamps invalid dims
  // and a resize on a dead handle is a no-op, neither of which the requested
  // size in ptySizes would reflect). The renderer's resume drift-check compares
  // against this to re-assert a resize the PTY never actually took.
  async getAppliedSize(id: string): Promise<{ cols: number; rows: number } | null> {
    const proc = ptyProcesses.get(id)
    if (!proc || proc.cols <= 0 || proc.rows <= 0) {
      return null
    }
    return { cols: proc.cols, rows: proc.rows }
  }
}
