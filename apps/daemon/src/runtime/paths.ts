import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

export type DaemonPathsProvider = {
  appPath: () => string
  downloadsPath: () => string
  executablePath: () => string
  homePath: () => string
  isPackaged: () => boolean
  resourcesPath: () => string | null
  tempPath: () => string
  userDataPath: () => string
  version: () => string
}

export function resolveDefaultUserDataPath(): string {
  const configured =
    process.env.YIRU_APP_USER_DATA_PATH?.trim() || process.env.YIRU_USER_DATA_PATH?.trim()
  if (configured) {
    return resolve(configured)
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'yiru')
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA?.trim()
    if (!appData) {
      throw new Error('daemon_user_data_path_unavailable')
    }
    return join(appData, 'yiru')
  }
  return join(process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), '.config'), 'yiru')
}

export function createDaemonPathsProvider(userDataPath: string): DaemonPathsProvider {
  const resolvedUserDataPath = resolve(userDataPath)
  const bundleDirectory = dirname(resolve(process.argv[1]?.trim() || process.execPath))
  const parentDirectory = dirname(bundleDirectory)
  const inferredResourcesPath =
    basename(parentDirectory).toLowerCase() === 'resources' ? parentDirectory : null
  const resourcesPath = process.env.YIRU_RESOURCES_PATH?.trim() || inferredResourcesPath
  const appPath =
    process.env.YIRU_APP_PATH?.trim() || resourcesPath || resolve(bundleDirectory, '..', '..')
  return {
    appPath: () => appPath,
    downloadsPath: () => join(homedir(), 'Downloads'),
    executablePath: () => process.execPath,
    homePath: homedir,
    isPackaged: () => resourcesPath !== null,
    resourcesPath: () => resourcesPath,
    tempPath: tmpdir,
    userDataPath: () => resolvedUserDataPath,
    version: getDaemonVersion
  }
}

export function getDaemonVersion(): string {
  return process.env.YIRU_APP_VERSION?.trim() || '0.0.0'
}
