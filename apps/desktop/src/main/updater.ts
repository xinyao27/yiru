import { UpdaterEvents } from './updater/events'

class Updater extends UpdaterEvents {}

const updater = new Updater()

export const resolveUpdateInstallMode = updater.resolveUpdateInstallMode
export const getUpdateStatus = updater.getUpdateStatus
export const configureRemoteServerUpdateInstallMode = updater.configureRemoteServerUpdateInstallMode
export const getRemoteServerUpdateSupport = updater.getRemoteServerUpdateSupport
export const getRemoteServerUpdaterSnapshot = updater.getRemoteServerUpdaterSnapshot
export const checkForRemoteServerUpdate = updater.checkForRemoteServerUpdate
export const downloadRemoteServerUpdate = updater.downloadRemoteServerUpdate
export const installRemoteServerUpdate = updater.installRemoteServerUpdate
export const checkForUpdates = updater.checkForUpdates
export const checkForUpdatesFromMenu = updater.checkForUpdatesFromMenu
export const isQuittingForUpdate = updater.isQuittingForUpdate
export const quitAndInstall = updater.quitAndInstall
export const dismissNudge = updater.dismissNudge
export const setupAutoUpdater = updater.setupAutoUpdater
export const downloadUpdate = updater.downloadUpdate
