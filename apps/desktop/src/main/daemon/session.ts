import { isPowerShellProcess } from '~shared/shell-process-detection'
import type { TuiAgent } from '~shared/types'

import { HeadlessEmulator } from './headless-emulator'
import { isValidPtySize, normalizePtySize } from './pty-size'
import { SessionPendingOutput } from './session-pending-output'
import { SessionProducerPause } from './session-producer-pause'
import { SessionShellReady } from './session-shell-ready'
import { SessionTermination } from './session-termination'
import type { SessionOptions, SubprocessHandle } from './session-types'
import type {
  SessionState,
  ShellReadyState,
  TakePendingOutputResult,
  TerminalSnapshot
} from './types'

export { PRODUCER_PAUSE_FAILSAFE_MS } from './session-producer-pause'
export { CODEX_SHELL_READY_TIMEOUT_MS } from './session-shell-ready'
export {
  IMMEDIATE_KILL_PHYSICAL_EXIT_TIMEOUT_MS,
  SESSION_FORCE_KILL_RETRY_MS
} from './session-termination'
export type { SessionOptions, SubprocessHandle } from './session-types'

type AttachedClient = {
  token: symbol
  onData: (data: string) => void
  onExit: (code: number) => void
}

export class Session {
  readonly sessionId: string
  readonly terminalHandle: string | null
  readonly launchAgent: TuiAgent | null
  private stateValue: SessionState = 'running'
  private exitCodeValue: number | null = null
  private disposed = false
  private readonly emulator: HeadlessEmulator
  private readonly subprocess: SubprocessHandle
  private readonly onSessionExit?: (code: number) => void
  private attachedClients: AttachedClient[] = []
  private readonly shellReady: SessionShellReady
  private readonly producerPause: SessionProducerPause
  private readonly termination: SessionTermination
  private readonly pendingOutput = new SessionPendingOutput()
  private outputSequence = 0
  private readonly historySeededValue: boolean | undefined
  private subprocessDisposed = false

  constructor(options: SessionOptions) {
    this.sessionId = options.sessionId
    this.terminalHandle = options.terminalHandle ?? null
    this.launchAgent = options.launchAgent ?? null
    this.subprocess = options.subprocess
    this.onSessionExit = options.onExit
    const size = normalizePtySize(options.cols, options.rows)
    this.emulator = new HeadlessEmulator({
      cols: size.cols,
      rows: size.rows,
      scrollback: options.scrollback
    })
    // Why: recovery precedes listener registration because a shell can emit
    // its prompt synchronously as soon as onData subscribes.
    this.historySeededValue =
      options.historySeed === undefined ? undefined : this.emulator.writeSync(options.historySeed)
    this.shellReady = new SessionShellReady({
      supported: options.shellReadySupported,
      timeoutMs: options.shellReadyTimeoutMs,
      writeToSubprocess: (data) => this.subprocess.write(data),
      emitReleasedBytes: (data) => this.emitSubprocessOutput(data)
    })
    this.producerPause = new SessionProducerPause(this.subprocess)
    this.termination = new SessionTermination({
      sessionId: this.sessionId,
      subprocess: this.subprocess,
      isExited: () => this.stateValue === 'exited',
      onBegin: () => this.producerPause.resume()
    })
    this.subprocess.onData((data) => this.handleSubprocessData(data))
    this.subprocess.onExit((code) => this.handleSubprocessExit(code))
  }

  get state(): SessionState {
    return this.stateValue
  }
  get shellState(): ShellReadyState {
    return this.shellReady.shellState
  }
  get historySeeded(): boolean | undefined {
    return this.historySeededValue
  }
  get exitCode(): number | null {
    return this.exitCodeValue
  }
  get isAlive(): boolean {
    return this.stateValue !== 'exited'
  }
  get isTerminating(): boolean {
    return this.termination.isTerminating
  }
  get pid(): number {
    return this.subprocess.pid
  }

  beginTermination(): boolean {
    return this.termination.begin()
  }

  write(data: string): void {
    if (this.stateValue !== 'exited' && !this.disposed) {
      this.shellReady.write(data)
    }
  }

  resize(cols: number, rows: number): void {
    if (this.stateValue === 'exited' || this.disposed || !isValidPtySize(cols, rows)) {
      return
    }
    this.emulator.resize(cols, rows)
    this.pendingOutput.record({ kind: 'resize', cols, rows })
    this.subprocess.resize(cols, rows)
  }

  pauseProducer(): void {
    if (this.stateValue !== 'exited' && !this.disposed) {
      this.producerPause.pause()
    }
  }

  resumeProducer(): void {
    this.producerPause.resume()
  }

  kill(): void {
    this.termination.kill(Boolean(this.launchAgent))
  }

  signalTerminationRoot(): void {
    this.termination.signalTerminationRoot()
  }

  scheduleForceDisposeFallback(): void {
    this.termination.scheduleForceDisposeFallback()
  }

  forceKillAndWaitForExit(timeoutMs?: number): Promise<void> {
    return this.termination.forceKillAndWaitForExit(timeoutMs)
  }

  signal(signal: string): void {
    this.termination.signal(signal)
  }

  attachClient(client: { onData: (data: string) => void; onExit: (code: number) => void }): symbol {
    const token = Symbol('attach')
    this.attachedClients.push({ token, ...client })
    return token
  }

  detachClient(token: symbol): void {
    const index = this.attachedClients.findIndex((client) => client.token === token)
    if (index !== -1) {
      this.attachedClients.splice(index, 1)
    }
    if (this.attachedClients.length === 0) {
      this.producerPause.resume()
    }
  }

  detachAllClients(): void {
    this.attachedClients.length = 0
    this.producerPause.resume()
  }

  getSnapshot(options: { scrollbackRows?: number } = {}): TerminalSnapshot | null {
    return this.disposed
      ? null
      : { ...this.emulator.getSnapshot(options), outputSequence: this.outputSequence }
  }

  getPartialEscapeTailAnsi(): string {
    return this.disposed ? '' : this.emulator.partialEscapeTailAnsi
  }

  getAppliedSize(): { cols: number; rows: number } | null {
    return this.disposed ? null : this.emulator.getAppliedSize()
  }

  takePendingOutput(
    includeSnapshot: boolean,
    options: { teardownSnapshot?: boolean } = {}
  ): TakePendingOutputResult | null {
    if (this.disposed) {
      return null
    }
    const releasedBytes =
      includeSnapshot && options.teardownSnapshot === true ? this.prepareForFinalSnapshot() : ''
    const pending = this.pendingOutput.drain()
    return {
      records: includeSnapshot
        ? releasedBytes
          ? [{ kind: 'output', data: releasedBytes }]
          : []
        : pending.records,
      seq: pending.seq,
      overflowed: pending.overflowed,
      snapshot: includeSnapshot ? this.getSnapshot() : null
    }
  }

  getCwd(): string | null {
    return this.emulator.getCwd()
  }

  getForegroundProcess(): string | null {
    return this.subprocess.getForegroundProcess()
  }

  confirmForegroundProcess(): Promise<string | null> {
    return (
      this.subprocess.confirmForegroundProcess?.() ??
      Promise.resolve(this.subprocess.getForegroundProcess())
    )
  }

  clearScrollback(): void {
    if (this.disposed) {
      return
    }
    this.emulator.clearScrollback()
    this.pendingOutput.record({ kind: 'clear' })
    this.subprocess.clear?.()
    this.nudgePowerShellPromptRepaint()
  }

  prepareForFinalSnapshot(): string {
    return this.shellReady.prepareForFinalSnapshot()
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    const wasTerminating = this.termination.forceKillIfTerminating()
    const clientsToNotify = wasTerminating ? this.attachedClients.slice() : []
    if (wasTerminating) {
      this.exitCodeValue = -1
    }
    this.teardownSubprocess()
    this.stateValue = 'exited'
    this.attachedClients = []
    this.emulator.dispose()
    for (const client of clientsToNotify) {
      client.onExit(-1)
    }
  }

  disposeSubprocess(): void {
    this.teardownSubprocess()
    this.stateValue = 'exited'
  }

  async forceKillAndDisposeSubprocess(): Promise<void> {
    await this.forceKillAndWaitForExit()
    this.dispose()
  }

  private handleSubprocessData(data: string): void {
    if (!this.disposed) {
      this.emitSubprocessOutput(this.shellReady.filterOutput(data))
    }
  }

  private emitSubprocessOutput(data: string): void {
    if (data.length === 0) {
      return
    }
    this.outputSequence += data.length
    this.emulator.write(data)
    this.pendingOutput.record({ kind: 'output', data })
    for (const client of this.attachedClients) {
      client.onData(data)
    }
  }

  private handleSubprocessExit(code: number): void {
    this.termination.markExited()
    if (this.disposed) {
      return
    }
    this.exitCodeValue = code
    this.stateValue = 'exited'
    this.producerPause.release(false)
    this.shellReady.onProcessExit()
    this.disposeSubprocessHandle()
    for (const client of this.attachedClients) {
      client.onExit(code)
    }
    this.onSessionExit?.(code)
  }

  private teardownSubprocess(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.producerPause.resume()
    this.termination.dispose()
    this.shellReady.dispose()
    this.disposeSubprocessHandle()
  }

  private disposeSubprocessHandle(): void {
    if (this.subprocessDisposed) {
      return
    }
    this.subprocessDisposed = true
    try {
      this.subprocess.dispose()
    } catch (error) {
      console.warn('[Session] subprocess.dispose() threw:', error)
    }
  }

  private nudgePowerShellPromptRepaint(): void {
    if (
      process.platform === 'win32' &&
      !this.shellReady.isHoldingInput &&
      isPowerShellProcess(this.subprocess.getForegroundProcess()) &&
      this.emulator.isCursorOnEmptyPromptLine()
    ) {
      this.subprocess.write('\x0c')
    }
  }
}
