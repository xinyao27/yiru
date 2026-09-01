import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { parseWslUncPath } from '@yiru/runtime-protocol/model/platform'
import { getDefaultWslDistro, getWslHome } from '~main/hosts/capabilities'
import { readShellStartupEnvVar } from '~main/pty/shell-startup-env'

import { syncSystemConfigIntoManagedCodexHome } from '../config-mirror'
import {
  getSystemCodexHomePath,
  syncCodexGlobalInstructionsIntoManagedHome,
  syncSystemCodexResourcesIntoManagedHome
} from '../home-paths'
import { isCodexSystemDefaultRealHomeEnabled } from '../real-home-flag'
import { hasCustomCodexHomeOverride } from '../real-home-path'
import { readLaunchEnvValue, getEffectiveCodexHomeEnv } from './runtime-home-foundation'
import { CodexRuntimeHomeLayer9 } from './runtime-home-layer-9'
import {
  normalizeCodexRuntimeSelection,
  type CodexAccountSelectionTarget
} from './runtime-selection'

export abstract class CodexRuntimeHomeLayer10 extends CodexRuntimeHomeLayer9 {
  setRealHomeLaneGate(gate: () => boolean): void {
    this.realHomeLaneGate = gate
  }

  isHostSystemDefaultRealHomeSelected(launchEnv?: NodeJS.ProcessEnv): boolean {
    const settings = this.store.getSettings()
    if (
      !isCodexSystemDefaultRealHomeEnabled() ||
      normalizeCodexRuntimeSelection(settings).host !== null
    ) {
      return false
    }
    const effectiveEnv = launchEnv ? getEffectiveCodexHomeEnv(launchEnv) : process.env
    if (hasCustomCodexHomeOverride(effectiveEnv)) {
      return false
    }
    const shellCodexHome = readShellStartupEnvVar(
      'CODEX_HOME',
      launchEnv ? readLaunchEnvValue(launchEnv, 'HOME') : process.env.HOME,
      launchEnv ? readLaunchEnvValue(launchEnv, 'SHELL') : process.env.SHELL
    )
    return !hasCustomCodexHomeOverride({ CODEX_HOME: shellCodexHome })
  }

  isHostSystemDefaultRealHome(launchEnv?: NodeJS.ProcessEnv): boolean {
    return this.isHostSystemDefaultRealHomeSelected(launchEnv) && this.realHomeLaneGate()
  }

  syncActiveWslSelectionsBeforeRestart(): void {
    if (process.platform !== 'win32') {
      return
    }

    const settings = this.store.getSettings()
    for (const [selectedDistroKey, accountId] of Object.entries(
      normalizeCodexRuntimeSelection(settings).wsl
    )) {
      if (!accountId) {
        continue
      }
      const account = this.getActiveAccount(settings.codexManagedAccounts, accountId)
      if (!account || account.managedHomeRuntime !== 'wsl') {
        continue
      }
      this.safeReadBackActiveWslAccountBeforeRestart(account, selectedDistroKey)
    }
  }

  protected getWslSystemCodexHomePath(target: CodexAccountSelectionTarget): string | null {
    if (process.platform !== 'win32') {
      return null
    }
    const distro = target.wslDistro?.trim() || getDefaultWslDistro()
    if (!distro) {
      return null
    }
    const home = getWslHome(distro)
    return home ? this.joinWslPath(home, '.codex') : null
  }

  protected syncWslConfigAndGlobalInstructionsForLaunch(
    target: CodexAccountSelectionTarget,
    runtimeHomePath: string | null
  ): void {
    if (!runtimeHomePath) {
      return
    }
    const distro =
      parseWslUncPath(runtimeHomePath)?.distro || target.wslDistro?.trim() || getDefaultWslDistro()
    if (!distro) {
      return
    }
    const systemHomePath = this.getWslSystemCodexHomePath({ runtime: 'wsl', wslDistro: distro })
    if (!systemHomePath || systemHomePath === runtimeHomePath) {
      return
    }
    // Why: WSL uses a distro-local CODEX_HOME, so host resource mirroring
    // cannot provide the distro user's global instructions.
    syncCodexGlobalInstructionsIntoManagedHome({
      systemHomePath,
      managedHomePath: runtimeHomePath
    })
    syncSystemConfigIntoManagedCodexHome({ runtimeHomePath, systemHomePath })
  }

  prepareForRateLimitFetch(target?: CodexAccountSelectionTarget): string | null {
    if (target?.runtime === 'wsl') {
      const wslTarget = this.resolveWslDefaultTarget(target)
      const syncedRuntimeHomePath = this.getPreparedWslRateLimitHomePath(wslTarget)
      return syncedRuntimeHomePath ?? this.getWslSystemCodexHomePath(wslTarget)
    }
    const selfContainedAccount = this.getSelfContainedManagedHostAccount()
    const selfContainedHome = selfContainedAccount
      ? this.getTrustedSelfContainedManagedHomePath(selfContainedAccount)
      : null
    if (
      selfContainedAccount &&
      selfContainedHome &&
      existsSync(join(selfContainedHome, 'auth.json'))
    ) {
      return selfContainedHome
    }
    if (selfContainedAccount) {
      this.clearSelfContainedManagedSelection(selfContainedAccount)
    }
    if (this.isHostSystemDefaultRealHome()) {
      return getSystemCodexHomePath()
    }
    this.syncForCurrentSelection()
    syncSystemCodexResourcesIntoManagedHome()
    syncSystemConfigIntoManagedCodexHome()
    return this.getRuntimeHomePath()
  }
}
