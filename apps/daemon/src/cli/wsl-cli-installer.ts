import type { CliInstallStatus } from '@yiru/runtime-protocol/workbench/cli-install-types'
import { getYiruCliCommandNameForPlatform } from '@yiru/runtime-protocol/workbench/yiru-cli-command-name'
import { getDefaultWslDistro } from '~main/hosts/capabilities'

import { CliInstaller } from './installer'
import { resolveWslCliReadyState } from './wsl-cli-ready-state'
import {
  buildSafeRemoveCommand,
  buildWslBridgeScript,
  buildWslLauncher,
  getPosixDirname,
  getWslBridgeMarker,
  getWslLauncherMarker,
  parseManagedLauncherTarget,
  quoteShell
} from './wsl-cli-scripts'
import { runWslCommand } from './wsl-command-runner'
import { buildWslRegistrationCommand } from './wsl-registration-command'

const MANAGED_MARKER = getWslLauncherMarker()
const BRIDGE_MANAGED_MARKER = getWslBridgeMarker()
const WSL_COMMAND_NAME = getYiruCliCommandNameForPlatform('linux')

function normalizeManagedScriptContent(content: string): string {
  return content.replace(/\n+$/u, '\n')
}

function managedScriptMatches(content: string, expected: string, managed: boolean): boolean {
  return content === expected || (managed && normalizeManagedScriptContent(content) === expected)
}

type WslCliInstallerOptions = {
  platform?: NodeJS.Platform
  distro?: string | null
  hostInstaller?: Pick<CliInstaller, 'getStatus'>
  wslRunner?: (distro: string, command: string) => Promise<string>
}

export type ManagedWslCliRepairResult = {
  changed: boolean
  managed: boolean
  status: CliInstallStatus
}

export class WslCliInstaller {
  private readonly platform: NodeJS.Platform
  private readonly distro: string | null
  private readonly hostInstaller: Pick<CliInstaller, 'getStatus'>
  private readonly wslRunner: (distro: string, command: string) => Promise<string>

  constructor(options: WslCliInstallerOptions = {}) {
    this.platform = options.platform ?? process.platform
    this.distro = options.distro === undefined ? getDefaultWslDistro() : options.distro
    this.hostInstaller = options.hostInstaller ?? new CliInstaller()
    this.wslRunner = options.wslRunner ?? runWslCommand
  }

  async getStatus(): Promise<CliInstallStatus> {
    const ready = await resolveWslCliReadyState({
      platform: this.platform,
      distro: this.distro,
      getHostStatus: () => this.hostInstaller.getStatus(),
      run: (distro, command) => this.run(distro, command)
    })
    if ('status' in ready) {
      return ready.status
    }

    const content = await this.readCommandFile(ready.distro, ready.commandPath)
    if (content === null) {
      return this.buildStatus({
        distro: ready.distro,
        commandPath: ready.commandPath,
        launcherPath: ready.launcherPath,
        state: 'not_installed',
        currentTarget: null,
        pathConfigured: ready.pathConfigured,
        detail: `Register ${ready.commandPath} to use Yiru from WSL.`
      })
    }

    if (content === 'not_file') {
      return this.buildStatus({
        distro: ready.distro,
        commandPath: ready.commandPath,
        launcherPath: ready.launcherPath,
        state: 'conflict',
        currentTarget: null,
        pathConfigured: ready.pathConfigured,
        detail: `${ready.commandPath} exists but is not a Yiru launcher script.`
      })
    }

    const expected = buildWslLauncher(ready.launcherPath, ready.bridgePath)
    const managed = content.includes(MANAGED_MARKER)
    const currentTarget = managed ? parseManagedLauncherTarget(content) : null
    if (managedScriptMatches(content, expected, managed)) {
      const bridgeContent = await this.readCommandFile(ready.distro, ready.bridgePath)
      const expectedBridge = buildWslBridgeScript()
      const bridgeManaged =
        typeof bridgeContent === 'string' && bridgeContent.includes(BRIDGE_MANAGED_MARKER)
      if (
        typeof bridgeContent === 'string' &&
        managedScriptMatches(bridgeContent, expectedBridge, bridgeManaged)
      ) {
        return this.buildStatus({
          distro: ready.distro,
          commandPath: ready.commandPath,
          launcherPath: ready.launcherPath,
          state: 'installed',
          currentTarget,
          pathConfigured: ready.pathConfigured,
          detail: `Registered in ${ready.distro} at ${ready.commandPath}.`
        })
      }

      return this.buildStatus({
        distro: ready.distro,
        commandPath: ready.commandPath,
        launcherPath: ready.launcherPath,
        state: bridgeContent === null || bridgeManaged ? 'stale' : 'conflict',
        currentTarget,
        pathConfigured: ready.pathConfigured,
        detail:
          bridgeContent === null || bridgeManaged
            ? `${ready.commandPath} is missing its PowerShell bridge.`
            : `${ready.bridgePath} exists but is not managed by Yiru.`
      })
    }

    // Why: a stale managed launcher is only repairable when its bridge is
    // ours too; reporting conflict here keeps repair from a doomed install
    // whose bridge guard would fail on every startup.
    const bridgeConflict = managed && (await this.isBridgeConflict(ready.distro, ready.bridgePath))
    return this.buildStatus({
      distro: ready.distro,
      commandPath: ready.commandPath,
      launcherPath: ready.launcherPath,
      state: managed && !bridgeConflict ? 'stale' : 'conflict',
      currentTarget,
      pathConfigured: ready.pathConfigured,
      detail: !managed
        ? `${ready.commandPath} exists but is not managed by Yiru.`
        : bridgeConflict
          ? `${ready.bridgePath} exists but is not managed by Yiru.`
          : `${ready.commandPath} points to a different Yiru launcher.`
    })
  }

  private async isBridgeConflict(distro: string, bridgePath: string): Promise<boolean> {
    const bridgeContent = await this.readCommandFile(distro, bridgePath)
    if (bridgeContent === null) {
      return false
    }
    return bridgeContent === 'not_file' || !bridgeContent.includes(BRIDGE_MANAGED_MARKER)
  }

  async repairManagedRegistration(): Promise<ManagedWslCliRepairResult> {
    const status = await this.getStatus()
    if (!status.supported) {
      return { changed: false, managed: false, status }
    }
    if (status.state === 'conflict') {
      // Why: a user-owned bridge conflicts with repair, but the launcher is
      // still Yiru-managed and must remain registered for future reconciliation.
      return { changed: false, managed: status.currentTarget !== null, status }
    }

    if (status.state === 'stale') {
      return { changed: true, managed: true, status: await this.install(status) }
    }

    return { changed: false, managed: status.state === 'installed', status }
  }

  async install(precomputedStatus?: CliInstallStatus): Promise<CliInstallStatus> {
    // Why: repair passes its fresh probe; re-probing here would double every
    // WSL round trip on the startup reconciliation path.
    const status = precomputedStatus ?? (await this.getStatus())
    if (
      !status.supported ||
      !status.commandPath ||
      !status.launcherPath ||
      !status.pathDirectory ||
      !this.distro
    ) {
      throw new Error(status.detail ?? 'WSL CLI registration is unavailable.')
    }
    if (status.state === 'conflict') {
      throw new Error(`Refusing to replace non-Yiru command at ${status.commandPath}.`)
    }

    await this.run(
      this.distro,
      buildWslRegistrationCommand({
        commandPath: status.commandPath,
        launcherPath: status.launcherPath,
        pathDirectory: status.pathDirectory,
        managedMarker: MANAGED_MARKER,
        bridgeManagedMarker: BRIDGE_MANAGED_MARKER
      })
    )
    return this.getStatus()
  }

  async remove(): Promise<CliInstallStatus> {
    const status = await this.getStatus()
    if (!status.supported || !status.commandPath) {
      return status
    }
    if (status.state === 'not_installed') {
      return status
    }
    if (status.state === 'conflict') {
      throw new Error(`Refusing to remove non-Yiru command at ${status.commandPath}.`)
    }

    if (!this.distro) {
      return status
    }
    await this.run(this.distro, buildSafeRemoveCommand(status.commandPath))
    return this.getStatus()
  }

  private async readCommandFile(
    distro: string,
    commandPath: string
  ): Promise<string | 'not_file' | null> {
    const output = await this.run(
      distro,
      [
        `if [ -L ${quoteShell(commandPath)} ]; then`,
        '  printf __YIRU_NOT_FILE__',
        `elif [ ! -e ${quoteShell(commandPath)} ]; then`,
        '  printf __YIRU_MISSING__',
        `elif [ ! -f ${quoteShell(commandPath)} ]; then`,
        '  printf __YIRU_NOT_FILE__',
        'else',
        `  cat ${quoteShell(commandPath)}`,
        'fi'
      ].join('\n')
    )
    if (output === '__YIRU_MISSING__') {
      return null
    }
    if (output === '__YIRU_NOT_FILE__') {
      return 'not_file'
    }
    return output
  }

  private buildStatus(args: {
    distro: string
    commandPath: string
    launcherPath: string
    state: CliInstallStatus['state']
    currentTarget: string | null
    pathConfigured: boolean
    detail: string
  }): CliInstallStatus {
    return {
      platform: 'linux',
      commandName: WSL_COMMAND_NAME,
      commandPath: args.commandPath,
      pathDirectory: getPosixDirname(args.commandPath),
      pathConfigured: args.pathConfigured,
      launcherPath: args.launcherPath,
      installMethod: 'wrapper',
      supported: true,
      state: args.state,
      currentTarget: args.currentTarget,
      unsupportedReason: null,
      detail:
        args.state === 'installed' && !args.pathConfigured
          ? `${args.commandPath} is registered, but ${getPosixDirname(args.commandPath)} is not on PATH in ${args.distro}.`
          : args.detail
    }
  }

  private async run(distro: string, command: string): Promise<string> {
    return this.wslRunner(distro, command)
  }
}
