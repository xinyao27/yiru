import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { getRuntimeHostPathsProvider } from '../runtime/host/paths-provider'

export function resolveMacOSComputerUseAppPath(): string | null {
  const override = process.env.YIRU_COMPUTER_MACOS_HELPER_APP_PATH
  if (override && existsSync(override)) {
    return override
  }

  const paths = getRuntimeHostPathsProvider()
  const resourcesPath = paths.resourcesPath()
  const executableDirectory = dirname(paths.executablePath())
  const packaged = resourcesPath ? [join(resourcesPath, 'Yiru Computer Use.app')] : []
  const dev = [
    resolveManagedMacOSComputerUseAppPath(),
    join(
      executableDirectory,
      '..',
      'native',
      'computer-use-macos',
      '.build',
      'release',
      'Yiru Computer Use.app'
    ),
    join(executableDirectory, '..', 'libexec', 'Yiru Computer Use.app'),
    join(
      process.cwd(),
      'apps',
      'daemon',
      'native',
      'computer-use-macos',
      '.build',
      'release',
      'Yiru Computer Use.app'
    ),
    join(process.cwd(), 'native/computer-use-macos/.build/release/Yiru Computer Use.app'),
    resolve(__dirname, '../../native/computer-use-macos/.build/release/Yiru Computer Use.app')
  ]
  const candidates = [...packaged, ...dev]

  return candidates.find((candidate) => candidate && existsSync(candidate)) ?? null
}

export function resolveManagedMacOSComputerUseAppPath(): string {
  return join(
    getRuntimeHostPathsProvider().userDataPath(),
    'native',
    'computer-use',
    'Yiru Computer Use.app'
  )
}

export function resolveMacOSComputerUseExecutablePath(): string | null {
  const appPath = resolveMacOSComputerUseAppPath()
  if (!appPath) {
    return null
  }
  const executablePath = join(appPath, 'Contents', 'MacOS', 'yiru-computer-use-macos')
  return existsSync(executablePath) ? executablePath : null
}
