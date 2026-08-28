import { lstat, readFile, readlink } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'

import type {
  CliInstallMethod,
  CliInstallStatus
} from '@yiru/runtime-protocol/workbench/cli-install-types'
import { getYiruCliCommandNameForPlatform } from '@yiru/runtime-protocol/workbench/yiru-cli-command-name'

import { buildAppImageCliWrapper } from './appimage-cli-wrapper'
import { isWindowsPackagedBundledCommand, type CliInstallContext } from './installer-context'
import { buildWindowsForwarder, extractManagedUnixLauncherTarget } from './installer-launchers'
import { isMissingError, isPathInsideOrEqual, samePathEntry } from './installer-path'

const DEV_COMMAND_NAME = getYiruCliCommandNameForPlatform('linux', 'development')
const DEV_LAUNCHER_DIR = ['cli', 'bin']

export function buildCliInstallStatus(
  context: CliInstallContext,
  args: {
    commandPath: string
    launcherPath: string
    installMethod: CliInstallMethod
    supported: boolean
    state: CliInstallStatus['state']
    currentTarget: string | null
    detail: string | null
  }
): CliInstallStatus {
  return {
    platform: context.platform,
    commandName: context.commandName,
    commandPath: args.commandPath,
    pathDirectory: dirname(args.commandPath),
    pathConfigured: false,
    launcherPath: args.launcherPath,
    installMethod: args.installMethod,
    supported: args.supported,
    state: args.state,
    currentTarget: args.currentTarget,
    unsupportedReason: null,
    detail: args.detail
  }
}

export async function inspectAppImageWrapper(
  context: CliInstallContext,
  commandPath: string,
  appImagePath: string
): Promise<CliInstallStatus> {
  try {
    const stats = await lstat(commandPath)
    if (!stats.isFile()) {
      return buildCliInstallStatus(context, {
        commandPath,
        launcherPath: appImagePath,
        installMethod: 'wrapper',
        supported: true,
        state: 'conflict',
        currentTarget: null,
        detail: `${commandPath} exists but is not a Yiru launcher script.`
      })
    }
    const currentContent = await readFile(commandPath, 'utf8')
    const expectedContent = buildAppImageCliWrapper(appImagePath)
    const isInstalled = currentContent === expectedContent
    return buildCliInstallStatus(context, {
      commandPath,
      launcherPath: appImagePath,
      installMethod: 'wrapper',
      supported: true,
      state: isInstalled ? 'installed' : 'stale',
      currentTarget: appImagePath,
      detail: isInstalled
        ? `Registered at ${commandPath}.`
        : `${commandPath} points to a different launcher.`
    })
  } catch (error) {
    if (!isMissingError(error)) {
      throw error
    }
    return buildCliInstallStatus(context, {
      commandPath,
      launcherPath: appImagePath,
      installMethod: 'wrapper',
      supported: true,
      state: 'not_installed',
      currentTarget: null,
      detail: `Register ${commandPath} to use Yiru from the terminal.`
    })
  }
}

export async function inspectSymlink(
  context: CliInstallContext,
  commandPath: string,
  launcherPath: string
): Promise<CliInstallStatus> {
  try {
    const stats = await lstat(commandPath)
    if (!stats.isSymbolicLink()) {
      if (stats.isFile()) {
        const managedTarget = extractManagedUnixLauncherTarget(await readFile(commandPath, 'utf8'))
        if (managedTarget) {
          return buildCliInstallStatus(context, {
            commandPath,
            launcherPath,
            installMethod: 'symlink',
            supported: true,
            state: 'stale',
            currentTarget: managedTarget,
            detail: `${commandPath} contains an older Yiru launcher.`
          })
        }
      }
      return buildCliInstallStatus(context, {
        commandPath,
        launcherPath,
        installMethod: 'symlink',
        supported: true,
        state: 'conflict',
        currentTarget: null,
        detail: `${commandPath} exists but is not a Yiru symlink.`
      })
    }
    const resolvedCurrentTarget = resolve(dirname(commandPath), await readlink(commandPath))
    const isInstalled = resolvedCurrentTarget === resolve(launcherPath)
    const isManagedStale =
      !isInstalled && isManagedSymlinkTarget(context, resolvedCurrentTarget, launcherPath)
    return buildCliInstallStatus(context, {
      commandPath,
      launcherPath,
      installMethod: 'symlink',
      supported: true,
      state: isInstalled ? 'installed' : isManagedStale ? 'stale' : 'conflict',
      currentTarget: resolvedCurrentTarget,
      detail: isInstalled
        ? `Registered at ${commandPath}.`
        : isManagedStale
          ? `${commandPath} points to an older Yiru launcher.`
          : `${commandPath} points to a non-Yiru launcher.`
    })
  } catch (error) {
    if (!isMissingError(error)) {
      throw error
    }
    return buildCliInstallStatus(context, {
      commandPath,
      launcherPath,
      installMethod: 'symlink',
      supported: true,
      state: 'not_installed',
      currentTarget: null,
      detail: `Register ${commandPath} to use Yiru from the terminal.`
    })
  }
}

function isManagedSymlinkTarget(
  context: CliInstallContext,
  resolvedTarget: string,
  launcherPath: string
): boolean {
  const expectedName = basename(launcherPath)
  if (context.isPackaged && isSiblingDevLauncherTarget(context, resolvedTarget, expectedName)) {
    return true
  }
  if (basename(resolvedTarget) !== expectedName) {
    return false
  }
  if (isPathInsideOrEqual(resolve(context.userDataPath, ...DEV_LAUNCHER_DIR), resolvedTarget)) {
    return true
  }
  if (context.platform === 'darwin') {
    return /(?:^|[/\\])[^/\\]+\.app[/\\]Contents[/\\]Resources[/\\]bin[/\\][^/\\]+$/.test(
      resolvedTarget
    )
  }
  return context.platform === 'linux'
    ? /(?:^|[/\\])resources[/\\]bin[/\\][^/\\]+$/.test(resolvedTarget)
    : false
}

function isSiblingDevLauncherTarget(
  context: CliInstallContext,
  resolvedTarget: string,
  packagedLauncherName: string
): boolean {
  if (![packagedLauncherName, DEV_COMMAND_NAME].includes(basename(resolvedTarget))) {
    return false
  }
  const packagedUserDataPath = resolve(context.userDataPath)
  const siblingDevUserDataPath = `${packagedUserDataPath}-dev`
  const siblingDevLauncherDir = resolve(siblingDevUserDataPath, ...DEV_LAUNCHER_DIR)
  return (
    basename(siblingDevUserDataPath) === `${basename(packagedUserDataPath)}-dev` &&
    isPathInsideOrEqual(siblingDevLauncherDir, resolvedTarget)
  )
}

export async function inspectWindowsWrapper(
  context: CliInstallContext,
  commandPath: string,
  launcherPath: string
): Promise<CliInstallStatus> {
  try {
    const stats = await lstat(commandPath)
    if (!stats.isFile()) {
      return buildCliInstallStatus(context, {
        commandPath,
        launcherPath,
        installMethod: 'wrapper',
        supported: true,
        state: 'conflict',
        currentTarget: null,
        detail: `${commandPath} exists but is not a Yiru launcher script.`
      })
    }
    if (isWindowsPackagedBundledCommand(context, commandPath, launcherPath, samePathEntry)) {
      return buildCliInstallStatus(context, {
        commandPath,
        launcherPath,
        installMethod: 'wrapper',
        supported: true,
        state: 'installed',
        currentTarget: launcherPath,
        detail: `Registered at ${commandPath}.`
      })
    }
    const isInstalled =
      (await readFile(commandPath, 'utf8')) === buildWindowsForwarder(launcherPath)
    return buildCliInstallStatus(context, {
      commandPath,
      launcherPath,
      installMethod: 'wrapper',
      supported: true,
      state: isInstalled ? 'installed' : 'stale',
      currentTarget: launcherPath,
      detail: isInstalled
        ? `Registered at ${commandPath}.`
        : `${commandPath} points to a different launcher.`
    })
  } catch (error) {
    if (!isMissingError(error)) {
      throw error
    }
    return buildCliInstallStatus(context, {
      commandPath,
      launcherPath,
      installMethod: 'wrapper',
      supported: true,
      state: 'not_installed',
      currentTarget: null,
      detail: `Register ${commandPath} to use Yiru from Command Prompt or PowerShell.`
    })
  }
}
