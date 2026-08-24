import {
  createShellReadyScanState,
  drainShellReadyHeldBytes,
  scanForShellReady,
  type ShellReadyScanState
} from '../shell-ready-marker-scanner'
import { PostReadyFlushGate } from './post-ready-flush-gate'
import type { ShellReadyState } from './types'

const SHELL_READY_TIMEOUT_MS = 15_000
export const CODEX_SHELL_READY_TIMEOUT_MS = 300

export class SessionShellReady {
  private state: ShellReadyState
  private scanState: ShellReadyScanState | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private stdinQueue: string[] = []
  private readonly postReadyFlushGate: PostReadyFlushGate
  private readonly writeToSubprocess: (data: string) => void
  private readonly emitReleasedBytes: (data: string) => void

  constructor(options: {
    supported: boolean
    timeoutMs?: number
    writeToSubprocess: (data: string) => void
    emitReleasedBytes: (data: string) => void
  }) {
    this.writeToSubprocess = options.writeToSubprocess
    this.emitReleasedBytes = options.emitReleasedBytes
    this.postReadyFlushGate = new PostReadyFlushGate(() => this.flushQueue())
    if (options.supported) {
      this.state = 'pending'
      this.scanState = createShellReadyScanState()
      this.timer = setTimeout(() => this.onTimeout(), options.timeoutMs ?? SHELL_READY_TIMEOUT_MS)
    } else {
      this.state = 'unsupported'
    }
  }

  get shellState(): ShellReadyState {
    return this.state
  }

  get isHoldingInput(): boolean {
    return this.state === 'pending' || this.postReadyFlushGate.isPending
  }

  write(data: string): void {
    if (this.isHoldingInput) {
      this.stdinQueue.push(data)
    } else {
      this.writeToSubprocess(data)
    }
  }

  filterOutput(data: string): string {
    if (this.state === 'pending' && this.scanState) {
      const scanned = scanForShellReady(this.scanState, data)
      if (scanned.matched) {
        this.transitionToReady(scanned.postMarkerBytesObserved)
      }
      return scanned.output
    }
    this.postReadyFlushGate.notifyData()
    return data
  }

  prepareForFinalSnapshot(): string {
    return this.releaseHeldBytes()
  }

  onProcessExit(): void {
    this.releaseHeldBytes()
    this.clearTimer()
    this.postReadyFlushGate.clear()
  }

  dispose(): void {
    this.clearTimer()
    this.scanState = null
    this.stdinQueue = []
    this.postReadyFlushGate.clear()
  }

  private transitionToReady(postMarkerBytesObserved: boolean): void {
    this.state = 'ready'
    this.scanState = null
    this.clearTimer()
    if (this.stdinQueue.length > 0) {
      this.postReadyFlushGate.arm(postMarkerBytesObserved)
    }
  }

  private onTimeout(): void {
    this.timer = null
    if (this.state !== 'pending') {
      return
    }
    this.state = 'timed_out'
    this.releaseHeldBytes()
    this.flushQueue()
  }

  private releaseHeldBytes(): string {
    if (!this.scanState) {
      return ''
    }
    const heldBytes = drainShellReadyHeldBytes(this.scanState)
    this.scanState = null
    this.emitReleasedBytes(heldBytes)
    return heldBytes
  }

  private flushQueue(): void {
    const queued = this.stdinQueue
    this.stdinQueue = []
    for (const data of queued) {
      this.writeToSubprocess(data)
    }
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }
}
