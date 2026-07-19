const SPOOL_START_RETRY_MS = 5_000

/** Retries recoverable local availability failures without remembering authority. */
export class SpoolDesktopStartRecovery {
  private timer: ReturnType<typeof setTimeout> | null = null

  schedule(diagnostic: string, retry: () => Promise<void>): void {
    this.cancel()
    if (!isRecoverableDiagnostic(diagnostic)) {
      return
    }
    this.timer = setTimeout(() => {
      this.timer = null
      void retry()
    }, SPOOL_START_RETRY_MS)
    this.timer.unref()
  }

  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }
}

function isRecoverableDiagnostic(diagnostic: string): boolean {
  // Why: uncertain persistence and a missing Windows rule need explicit
  // repair; retrying every other local/Tailnet availability failure is safe.
  return (
    diagnostic !== 'persistence_unavailable' && diagnostic !== 'spool_windows_firewall_unavailable'
  )
}
