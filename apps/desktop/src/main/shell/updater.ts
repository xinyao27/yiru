import { app } from 'electron'
import type { UpdateCheckOptions } from '~shared/types'

import {
  checkForUpdatesFromMenu,
  dismissNudge,
  downloadUpdate,
  getUpdateStatus,
  quitAndInstall
} from '../updater'

let ensureConfigured: () => void = () => {}

export function setShellUpdaterConfiguration(ensure: () => void): void {
  ensureConfigured = ensure
}

export function getShellUpdaterService() {
  return {
    getStatus: getUpdateStatus,
    getVersion: () => app.getVersion(),
    check: (options?: UpdateCheckOptions): void => {
      ensureConfigured()
      checkForUpdatesFromMenu(options)
    },
    download: downloadUpdate,
    quitAndInstall,
    dismissNudge
  }
}
