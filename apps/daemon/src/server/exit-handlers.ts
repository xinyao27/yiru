import { translate } from '../i18n/translate'

export function installDaemonExitHandlers(shutdown: () => Promise<void>): void {
  let shutdownPromise: Promise<void> | null = null
  let isExitRequested = false
  const stopDaemon = (exitCode: number): void => {
    if (isExitRequested) {
      return
    }
    isExitRequested = true
    shutdownPromise ??= shutdown()
    void shutdownPromise.then(
      () => process.exit(exitCode),
      (error: unknown) => {
        console.error(`[daemon] ${translate('Runtime host shutdown failed')}:`, error)
        process.exit(1)
      }
    )
  }
  process.on('SIGINT', () => stopDaemon(0))
  process.on('SIGTERM', () => stopDaemon(0))
  // Why: launchd and systemd are configured to replace failed services; SIGHUP is Yiru's
  // explicit restart signal, so its non-zero exit hands ownership back to the supervisor.
  process.on('SIGHUP', () => stopDaemon(75))
  if (process.connected) {
    process.once('disconnect', () => stopDaemon(0))
  }
}
