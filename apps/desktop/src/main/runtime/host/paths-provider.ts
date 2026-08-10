import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

import { translateMain } from '~main/i18n/main-i18n'

export type RuntimeHostPathsProvider = {
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

let pathsProvider: RuntimeHostPathsProvider | null = null

export function createNodeRuntimeHostPathsProvider(
  userDataPath = resolveDefaultNodeUserDataPath()
): RuntimeHostPathsProvider {
  const resolvedUserDataPath = resolve(userDataPath)
  const bundleDirectory = dirname(resolve(process.argv[1]?.trim() || process.execPath))
  const inferredResourcesPath = inferResourcesPath(bundleDirectory)
  const resourcesPath = process.env.YIRU_RESOURCES_PATH?.trim() || inferredResourcesPath
  const appPath =
    process.env.YIRU_APP_PATH?.trim() ||
    (resourcesPath ? join(resourcesPath, 'app.asar') : resolve(bundleDirectory, '..', '..'))
  return {
    appPath: () => appPath,
    downloadsPath: () => join(homedir(), 'Downloads'),
    executablePath: () => process.execPath,
    homePath: homedir,
    isPackaged: () => resourcesPath !== null,
    resourcesPath: () => resourcesPath,
    tempPath: tmpdir,
    userDataPath: () => resolvedUserDataPath,
    version: () => process.env.YIRU_APP_VERSION?.trim() || '0.0.0'
  }
}

function inferResourcesPath(bundleDirectory: string): string | null {
  const parentDirectory = dirname(bundleDirectory)
  return basename(parentDirectory).toLowerCase() === 'resources' ? parentDirectory : null
}

export function getRuntimeHostPathsProvider(): RuntimeHostPathsProvider {
  pathsProvider ??= createNodeRuntimeHostPathsProvider()
  return pathsProvider
}

export function setRuntimeHostPathsProvider(provider: RuntimeHostPathsProvider): void {
  pathsProvider = provider
}

function resolveDefaultNodeUserDataPath(): string {
  const configuredPath =
    process.env.YIRU_APP_USER_DATA_PATH?.trim() || process.env.YIRU_USER_DATA_PATH?.trim()
  if (configuredPath) {
    return configuredPath
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'yiru')
  }
  if (process.platform === 'win32') {
    const appDataPath = process.env.APPDATA?.trim()
    if (!appDataPath) {
      throw new Error(
        translateMain(
          'runtimeHost.appDataRequired',
          'APPDATA is required to resolve the Yiru runtime data path'
        )
      )
    }
    return join(appDataPath, 'yiru')
  }
  return join(process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), '.config'), 'yiru')
}
