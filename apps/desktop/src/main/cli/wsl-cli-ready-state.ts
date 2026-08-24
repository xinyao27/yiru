import type { CliInstallStatus } from '~shared/cli-install-types'
import { getYiruCliCommandNameForPlatform } from '~shared/yiru-cli-command-name'

import { getBridgePathFromCommandPath, quoteShell } from './wsl-cli-scripts'

export type WslCliReadyState =
  | { status: CliInstallStatus }
  | {
      distro: string
      commandPath: string
      bridgePath: string
      launcherPath: string
      pathConfigured: boolean
    }

export async function resolveWslCliReadyState(args: {
  platform: NodeJS.Platform
  distro: string | null
  getHostStatus: () => Promise<CliInstallStatus>
  run: (distro: string, command: string) => Promise<string>
}): Promise<WslCliReadyState> {
  if (args.platform !== 'win32') {
    return {
      status: unsupported(
        'platform_not_supported',
        'WSL CLI registration is only available on Windows.'
      )
    }
  }
  if (!args.distro) {
    return { status: unsupported('platform_not_supported', 'No WSL distribution is available.') }
  }

  const hostStatus = await args.getHostStatus()
  if (!hostStatus.launcherPath) {
    return {
      status: unsupported(
        hostStatus.unsupportedReason ?? 'launcher_missing',
        hostStatus.detail ?? 'The Windows Yiru CLI launcher is missing.'
      )
    }
  }

  const home = (await args.run(args.distro, 'printf %s "$HOME"')).trim()
  if (!home.startsWith('/')) {
    return { status: unsupported('launcher_missing', 'Unable to resolve the WSL home directory.') }
  }

  const interopReady =
    (
      await args.run(
        args.distro,
        '{ command -v powershell.exe >/dev/null 2>&1 || [ -x /mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe ]; } && command -v wslpath >/dev/null 2>&1 && printf yes || printf no'
      )
    ).trim() === 'yes'
  if (!interopReady) {
    return {
      status: unsupported(
        'launcher_missing',
        'WSL Windows interop is unavailable; Yiru cannot launch the Windows CLI from WSL.'
      )
    }
  }

  const pathDirectory = `${home}/.local/bin`
  const commandPath = `${pathDirectory}/${getYiruCliCommandNameForPlatform('linux')}`
  const pathConfigured =
    (
      await args.run(
        args.distro,
        `case ":$PATH:" in *:${quoteShell(pathDirectory)}:*) printf yes ;; *) printf no ;; esac`
      )
    ).trim() === 'yes'
  return {
    distro: args.distro,
    commandPath,
    bridgePath: getBridgePathFromCommandPath(commandPath),
    launcherPath: hostStatus.launcherPath,
    pathConfigured
  }
}

function unsupported(
  unsupportedReason: NonNullable<CliInstallStatus['unsupportedReason']>,
  detail: string
): CliInstallStatus {
  return {
    platform: 'linux',
    commandName: getYiruCliCommandNameForPlatform('linux'),
    commandPath: null,
    pathDirectory: null,
    pathConfigured: false,
    launcherPath: null,
    installMethod: null,
    supported: false,
    state: 'unsupported',
    currentTarget: null,
    unsupportedReason,
    detail
  }
}
