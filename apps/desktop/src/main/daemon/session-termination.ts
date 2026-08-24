import { PhysicalExitTracker } from '~shared/physical-exit-tracker'

import { killWithDescendantSweep } from '../pty-descendant-termination'
import type { SubprocessHandle } from './session-types'

const KILL_TIMEOUT_MS = 5_000
export const IMMEDIATE_KILL_PHYSICAL_EXIT_TIMEOUT_MS = 8_000
export const SESSION_FORCE_KILL_RETRY_MS = 250
const SESSION_FORCE_KILL_MAX_ATTEMPTS = 2

export class SessionTermination {
  private terminating = false
  private killTimer: ReturnType<typeof setTimeout> | null = null
  private forceKillSent = false
  private readonly physicalExit = new PhysicalExitTracker()
  private readonly sessionId: string
  private readonly subprocess: SubprocessHandle
  private readonly isExited: () => boolean
  private readonly onBegin: () => void

  constructor(options: {
    sessionId: string
    subprocess: SubprocessHandle
    isExited: () => boolean
    onBegin: () => void
  }) {
    this.sessionId = options.sessionId
    this.subprocess = options.subprocess
    this.isExited = options.isExited
    this.onBegin = options.onBegin
  }

  get isTerminating(): boolean {
    return this.terminating
  }

  begin(): boolean {
    if (this.isExited() || this.terminating) {
      return false
    }
    this.terminating = true
    this.onBegin()
    return true
  }

  kill(hasLaunchAgent: boolean): void {
    if (!this.begin()) {
      return
    }
    if (!hasLaunchAgent) {
      this.signalTerminationRoot()
    } else {
      void Promise.resolve(
        killWithDescendantSweep(this.subprocess.pid, () => this.signalTerminationRoot(), {
          // Why: a root can exit during process-table capture; never apply a
          // stale descendant snapshot to a recycled PID.
          ownsRoot: () => !this.isExited()
        })
      ).catch((error) => {
        if (!this.isExited()) {
          this.resetAfterSignalFailure()
        }
        console.warn('[Session] descendant-aware graceful kill failed:', error)
      })
    }
    this.scheduleForceDisposeFallback()
  }

  signalTerminationRoot(): void {
    if (this.isExited()) {
      return
    }
    try {
      this.subprocess.kill()
    } catch (error) {
      this.resetAfterSignalFailure()
      throw error
    }
  }

  scheduleForceDisposeFallback(): void {
    if (!this.killTimer) {
      this.armForceKillFallback(KILL_TIMEOUT_MS, SESSION_FORCE_KILL_MAX_ATTEMPTS)
    }
  }

  async forceKillAndWaitForExit(
    timeoutMs = IMMEDIATE_KILL_PHYSICAL_EXIT_TIMEOUT_MS
  ): Promise<void> {
    if (this.isExited()) {
      return
    }
    if (!this.terminating) {
      this.terminating = true
      this.onBegin()
    }
    await this.requestForceKillWithRetry()
    await this.physicalExit.waitForExit(
      timeoutMs,
      () => new Error(`Timed out waiting for PTY process exit: ${this.sessionId}`)
    )
  }

  signal(signal: string): void {
    if (!this.isExited()) {
      this.subprocess.signal(signal)
    }
  }

  markExited(): void {
    this.physicalExit.markExited()
    this.terminating = false
    this.clearKillTimer()
  }

  forceKillIfTerminating(): boolean {
    if (!this.terminating || this.isExited()) {
      return false
    }
    try {
      this.subprocess.forceKill()
    } catch {
      // The child may already be gone.
    }
    this.terminating = false
    return true
  }

  dispose(): void {
    this.clearKillTimer()
  }

  private resetAfterSignalFailure(): void {
    this.terminating = false
    this.clearKillTimer()
  }

  private armForceKillFallback(delayMs: number, attemptsRemaining: number): void {
    this.killTimer = setTimeout(() => {
      this.killTimer = null
      if (this.isExited()) {
        return
      }
      try {
        this.requestForceKill()
      } catch (error) {
        console.warn('[Session] failed to force-kill terminating subprocess:', error)
        if (attemptsRemaining > 1) {
          this.armForceKillFallback(SESSION_FORCE_KILL_RETRY_MS, attemptsRemaining - 1)
        }
      }
    }, delayMs)
  }

  private requestForceKill(): void {
    if (this.isExited() || this.forceKillSent) {
      return
    }
    this.forceKillSent = true
    try {
      this.subprocess.forceKill()
    } catch (error) {
      this.forceKillSent = false
      throw error
    }
  }

  private async requestForceKillWithRetry(): Promise<void> {
    let lastError: unknown
    for (let attempt = 0; attempt < SESSION_FORCE_KILL_MAX_ATTEMPTS; attempt++) {
      try {
        this.requestForceKill()
        return
      } catch (error) {
        lastError = error
      }
      if (attempt + 1 < SESSION_FORCE_KILL_MAX_ATTEMPTS) {
        try {
          await this.physicalExit.waitForExit(
            SESSION_FORCE_KILL_RETRY_MS,
            () => new Error(`Retrying force-kill for PTY ${this.sessionId}`)
          )
          return
        } catch {
          // The bounded waiter detached; retry the still-owned process.
        }
      }
    }
    throw lastError
  }

  private clearKillTimer(): void {
    if (this.killTimer) {
      clearTimeout(this.killTimer)
      this.killTimer = null
    }
  }
}
