import type { ShellEvent } from '@yiru/runtime-protocol/contract'
import type { UpdateStatus } from '@yiru/runtime-protocol/updater'
import { getRuntimeHostPathsProvider } from '~main/runtime/host/paths-provider'
import { runtimeImplementation } from '~main/runtime/rpc/orpc/access-middleware'
import type { DaemonRestart } from '~main/server/restart'
import { installLatestDaemon } from '~main/updates/installer'
import { DaemonUpdateService } from '~main/updates/service'

class BunShellUpdater {
  private readonly publish: (event: ShellEvent) => void
  private readonly restartDaemon: DaemonRestart
  private readonly service = new DaemonUpdateService()
  private status: UpdateStatus = { state: 'idle' }

  constructor(restartDaemon: DaemonRestart, publish: (event: ShellEvent) => void) {
    this.publish = publish
    this.restartDaemon = restartDaemon
  }

  getStatus(): UpdateStatus {
    return this.status
  }

  async check(): Promise<void> {
    this.setStatus({ state: 'checking', userInitiated: true })
    try {
      const update = await this.service.check(true)
      this.setStatus(
        update.updateAvailable && update.latestVersion
          ? {
              state: 'available',
              version: update.latestVersion,
              releaseUrl: update.releaseUrl ?? undefined,
              changelog: null
            }
          : { state: 'not-available', userInitiated: true }
      )
    } catch (error) {
      this.setStatus({ state: 'error', message: errorMessage(error), userInitiated: true })
    }
  }

  async download(): Promise<void> {
    if (this.status.state !== 'available') {
      throw new Error('daemon_update_not_available')
    }
    const version = this.status.version
    this.setStatus({ state: 'downloading', percent: 0, version })
    try {
      const result = await installLatestDaemon({
        service: this.service,
        onDownloadProgress: (percent) => this.setStatus({ state: 'downloading', percent, version })
      })
      this.setStatus({ state: 'downloaded', version: result.version })
    } catch (error) {
      this.setStatus({ state: 'error', message: errorMessage(error) })
      throw error
    }
  }

  quitAndInstall(): void {
    if (this.status.state !== 'downloaded') {
      throw new Error('daemon_update_not_downloaded')
    }
    this.restartDaemon()
  }

  private setStatus(status: UpdateStatus): void {
    this.status = status
    this.publish({ type: 'updaterStatus', status })
  }
}

export function createBunShellUpdaterHandlers(
  restartDaemon: DaemonRestart,
  publish: (event: ShellEvent) => void
) {
  const updater = new BunShellUpdater(restartDaemon, publish)
  return {
    updater: {
      getVersion: runtimeImplementation.shell.updater.getVersion.handler(() =>
        getRuntimeHostPathsProvider().version()
      ),
      getStatus: runtimeImplementation.shell.updater.getStatus.handler(() => updater.getStatus()),
      check: runtimeImplementation.shell.updater.check.handler(() => updater.check()),
      download: runtimeImplementation.shell.updater.download.handler(() => updater.download()),
      quitAndInstall: runtimeImplementation.shell.updater.quitAndInstall.handler(() =>
        updater.quitAndInstall()
      )
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
