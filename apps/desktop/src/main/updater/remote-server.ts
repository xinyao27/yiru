import { is } from '@electron-toolkit/utils'
import { app } from 'electron'
import type {
  RemoteServerUpdateInstallMode,
  RemoteServerUpdateInstallResult,
  RemoteServerUpdaterSnapshot,
  RemoteServerUpdateSupport
} from '~shared/remote-server-update'
import type { UpdateCheckOptions, UpdateStatus } from '~shared/types'

import { resolveRemoteServerUpdateSupport } from '../remote-server-update-support'
import { UpdaterInstallation } from './installation'

export abstract class UpdaterRemoteServer extends UpdaterInstallation {
  getUpdateStatus = (): UpdateStatus => {
    return this.currentStatus
  }

  configureRemoteServerUpdateInstallMode = (installMode: RemoteServerUpdateInstallMode): void => {
    this.remoteServerUpdateInstallMode = installMode
  }

  getRemoteServerUpdateSupport = (): RemoteServerUpdateSupport => {
    return resolveRemoteServerUpdateSupport({
      installMode: this.remoteServerUpdateInstallMode,
      isPackaged: app.isPackaged,
      isDev: is.dev,
      updaterInitialized: this.autoUpdaterInitialized
    })
  }

  getRemoteServerUpdaterSnapshot = (runtimeId: string): RemoteServerUpdaterSnapshot => {
    return {
      appVersion: app.getVersion(),
      runtimeId,
      support: this.getRemoteServerUpdateSupport(),
      status: this.getUpdateStatus()
    }
  }

  assertRemoteServerUpdateAvailable = (): void => {
    if (!this.getRemoteServerUpdateSupport().automatic) {
      throw new Error('remote_update_manual_required')
    }
  }

  checkForRemoteServerUpdate = (
    runtimeId: string,
    options?: UpdateCheckOptions
  ): RemoteServerUpdaterSnapshot => {
    this.assertRemoteServerUpdateAvailable()
    this.checkForUpdatesFromMenu(options)
    return this.getRemoteServerUpdaterSnapshot(runtimeId)
  }

  downloadRemoteServerUpdate = (runtimeId: string): RemoteServerUpdaterSnapshot => {
    this.assertRemoteServerUpdateAvailable()
    if (this.currentStatus.state !== 'available') {
      throw new Error('remote_update_not_available')
    }
    this.downloadUpdate()
    return this.getRemoteServerUpdaterSnapshot(runtimeId)
  }

  installRemoteServerUpdate = (runtimeId: string): RemoteServerUpdateInstallResult => {
    this.assertRemoteServerUpdateAvailable()
    if (this.currentStatus.state !== 'downloaded') {
      throw new Error('remote_update_not_downloaded')
    }
    const result: RemoteServerUpdateInstallResult = {
      accepted: true,
      fromVersion: app.getVersion(),
      targetVersion: this.currentStatus.version,
      runtimeId
    }
    this.quitAndInstall()
    return result
  }
}
