import type { SubprocessHandle } from './session-types'

export const PRODUCER_PAUSE_FAILSAFE_MS = 5_000

export class SessionProducerPause {
  private paused = false
  private failsafeTimer: ReturnType<typeof setTimeout> | null = null
  private readonly subprocess: SubprocessHandle

  constructor(subprocess: SubprocessHandle) {
    this.subprocess = subprocess
  }

  pause(): void {
    this.paused = true
    this.subprocess.pause?.()
    if (this.failsafeTimer) {
      clearTimeout(this.failsafeTimer)
    }
    this.failsafeTimer = setTimeout(() => {
      this.failsafeTimer = null
      this.paused = false
      this.subprocess.resume?.()
    }, PRODUCER_PAUSE_FAILSAFE_MS)
  }

  resume(): void {
    this.release(true)
  }

  release(shouldResume: boolean): void {
    if (this.failsafeTimer) {
      clearTimeout(this.failsafeTimer)
      this.failsafeTimer = null
    }
    if (!this.paused) {
      return
    }
    this.paused = false
    if (shouldResume) {
      this.subprocess.resume?.()
    }
  }
}
