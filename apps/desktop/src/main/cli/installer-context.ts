import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import type { CliInstallMethod } from '~shared/cli-install-types'
import { getYiruCliCommandNameForPlatform } from '~shared/yiru-cli-command-name'

import { getRuntimeHostPathsProvider } from '../runtime/host/paths-provider'
import { getBundledLauncherPath, ensureDevLauncher } from './installer-launchers'
import {
  readWindowsUserPath,
  runMacPrivilegedCommand,
  writeWindowsUserPath
} from './installer-path'

const PRODUCTION_COMMAND_NAME = getYiruCliCommandNameForPlatform('linux')
const DEV_COMMAND_NAME = getYiruCliCommandNameForPlatform('linux', 'development')
const DEFAULT_MAC_COMMAND_PATH = `/usr/local/bin/${PRODUCTION_COMMAND_NAME}`

export type CliInstallerOptions = {
  platform?: NodeJS.Platform
  isPackaged?: boolean
  userDataPath?: string
  resourcesPath?: string
  execPath?: string
  appPath?: string
  homePath?: string
  localAppDataPath?: string
  processPathEnv?: string | null
  commandPathOverride?: string | null
  privilegedRunner?: (command: string) => Promise<void>
  userPathReader?: () => Promise<string | null>
  userPathWriter?: (value: string) => Promise<void>
  /** Why: AppImage reports its stable outer path while resources use an ephemeral mount. */
  appImagePath?: string | null
}

export type CliInstallContext = {
  platform: NodeJS.Platform
  isPackaged: boolean
  userDataPath: string
  resourcesPath: string
  execPathValue: string
  appPathValue: string
  homePath: string
  localAppDataPath: string
  processPathEnv: string | null
  commandPathOverride: string | null
  macCommandPath: string
  privilegedRunner: (command: string) => Promise<void>
  userPathReader: () => Promise<string | null>
  userPathWriter: (value: string) => Promise<void>
  appImagePath: string | null
  commandName: string
}

export type InstallSpec = {
  commandPath: string
  installMethod: CliInstallMethod
}

export function createCliInstallContext(options: CliInstallerOptions = {}): CliInstallContext {
  const pathsProvider = getRuntimeHostPathsProvider()
  const platform = options.platform ?? process.platform
  const isPackaged = options.isPackaged ?? pathsProvider.isPackaged()
  const homePath = options.homePath ?? homedir()
  const resourcesPath =
    options.resourcesPath ?? pathsProvider.resourcesPath() ?? pathsProvider.appPath()
  const commandPathOverride =
    options.commandPathOverride ?? process.env.YIRU_CLI_INSTALL_PATH ?? null
  const defaultMacPath = DEFAULT_MAC_COMMAND_PATH
  return {
    platform,
    isPackaged,
    userDataPath: options.userDataPath ?? pathsProvider.userDataPath(),
    resourcesPath,
    execPathValue: options.execPath ?? pathsProvider.executablePath(),
    appPathValue: options.appPath ?? pathsProvider.appPath(),
    homePath,
    localAppDataPath:
      options.localAppDataPath ?? process.env.LOCALAPPDATA ?? join(homePath, 'AppData', 'Local'),
    processPathEnv: options.processPathEnv ?? process.env.PATH ?? process.env.Path ?? null,
    commandPathOverride,
    // Why: Apple Silicon often lacks /usr/local/bin; use the standard user bin directory.
    macCommandPath: existsSync(dirname(defaultMacPath))
      ? defaultMacPath
      : join(homePath, '.local', 'bin', PRODUCTION_COMMAND_NAME),
    privilegedRunner: options.privilegedRunner ?? runMacPrivilegedCommand,
    userPathReader: options.userPathReader ?? readWindowsUserPath,
    userPathWriter: options.userPathWriter ?? writeWindowsUserPath,
    appImagePath:
      platform === 'linux' && isPackaged
        ? (options.appImagePath ?? process.env.APPIMAGE ?? null)
        : null,
    commandName: !isPackaged && !commandPathOverride ? DEV_COMMAND_NAME : PRODUCTION_COMMAND_NAME
  }
}

export function isLinuxAppImage(context: CliInstallContext): boolean {
  return context.platform === 'linux' && Boolean(context.appImagePath)
}

export function isWindowsPackagedBundledCommand(
  context: CliInstallContext,
  commandPath: string | null,
  launcherPath: string | null,
  samePath: (platform: NodeJS.Platform, left: string, right: string) => boolean
): commandPath is string {
  return (
    context.platform === 'win32' &&
    context.isPackaged &&
    commandPath !== null &&
    launcherPath !== null &&
    samePath('win32', commandPath, launcherPath)
  )
}

export function resolveInstallSpec(context: CliInstallContext): InstallSpec | null {
  const commandPath = resolveCommandPath(context)
  if (!commandPath) {
    return null
  }
  if (context.platform === 'darwin' || context.platform === 'linux') {
    return { commandPath, installMethod: isLinuxAppImage(context) ? 'wrapper' : 'symlink' }
  }
  return context.platform === 'win32' ? { commandPath, installMethod: 'wrapper' } : null
}

function resolveCommandPath(context: CliInstallContext): string | null {
  if (context.commandPathOverride) {
    return context.commandPathOverride
  }
  if (!context.isPackaged) {
    if (context.platform === 'darwin') {
      return `/usr/local/bin/${DEV_COMMAND_NAME}`
    }
    if (context.platform === 'linux') {
      return join(context.homePath, '.local', 'bin', DEV_COMMAND_NAME)
    }
    if (context.platform === 'win32') {
      return join(
        context.localAppDataPath,
        'Programs',
        'Yiru Dev',
        'bin',
        `${DEV_COMMAND_NAME}.cmd`
      )
    }
  }
  if (context.platform === 'darwin') {
    return context.macCommandPath
  }
  if (context.platform === 'linux') {
    return join(context.homePath, '.local', 'bin', PRODUCTION_COMMAND_NAME)
  }
  return context.platform === 'win32'
    ? getBundledLauncherPath(context.platform, context.resourcesPath)
    : null
}

export async function resolveLauncherPath(context: CliInstallContext): Promise<string | null> {
  if (!['darwin', 'linux', 'win32'].includes(context.platform)) {
    return null
  }
  if (isLinuxAppImage(context)) {
    return context.appImagePath && existsSync(context.appImagePath) ? context.appImagePath : null
  }
  if (context.isPackaged) {
    const bundledPath = getBundledLauncherPath(context.platform, context.resourcesPath)
    return bundledPath && existsSync(bundledPath) ? bundledPath : null
  }
  return ensureDevLauncher({
    platform: context.platform,
    userDataPath: context.userDataPath,
    execPath: context.execPathValue,
    cliEntryPath: join(context.appPathValue, 'out', 'cli', 'index.js'),
    commandName: context.commandName
  })
}
