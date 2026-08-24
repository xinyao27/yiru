import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { getRuntimeHostPathsProvider } from '../runtime/host/paths-provider'

export function getDaemonRuntimeDir(): string {
  const directory = join(getRuntimeHostPathsProvider().userDataPath(), 'daemon')
  mkdirSync(directory, { recursive: true })
  return directory
}

export function getDaemonHistoryDir(): string {
  const directory = join(getRuntimeHostPathsProvider().userDataPath(), 'terminal-history')
  mkdirSync(directory, { recursive: true })
  return directory
}

export function getDaemonEntryPath(): string {
  const pathsProvider = getRuntimeHostPathsProvider()
  const appPath = pathsProvider.appPath()
  // Why: packaged daemon code is unpacked so child_process.fork can execute it from disk.
  const basePath = pathsProvider.isPackaged()
    ? appPath.replace('app.asar', 'app.asar.unpacked')
    : appPath
  const directEntryPath = join(basePath, 'daemon-entry.js')
  return existsSync(directEntryPath)
    ? directEntryPath
    : join(basePath, 'out', 'main', 'daemon-entry.js')
}
