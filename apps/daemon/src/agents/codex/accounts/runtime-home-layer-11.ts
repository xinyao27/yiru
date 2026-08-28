import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { parseWslUncPath } from '@yiru/runtime-protocol/model/platform'
import type { CodexManagedAccount } from '@yiru/runtime-protocol/workbench/types'
import { getDefaultWslDistro } from '~main/hosts/capabilities'

import { syncSystemConfigIntoManagedCodexHome } from '../config-mirror'
import {
  getCodexSessionBackfillStateDirPath,
  getSystemCodexHomePath,
  syncSystemCodexResourcesIntoManagedHome
} from '../home-paths'
import { isCodexSystemDefaultRealHomeEnabled } from '../real-home-flag'
import { invalidateCodexSessionBackfillMarker } from '../session-backfill-marker'
import { startSystemCodexSessionBridgeInBackground } from '../session-bridge'
import {
  resolveHostCodexSessionSourceHome,
  resolveWslCodexSessionSourceHome
} from '../session-source-home'
import { startWslCodexSessionBridgeInBackground } from '../wsl-codex-session-bridge'
import { assertOwnedHostCodexManagedHomePath } from './host-codex-managed-home-ownership'
import { CodexRuntimeHomeLayer10 } from './runtime-home-layer-10'
import {
  normalizeCodexRuntimeSelection,
  type CodexAccountSelectionTarget
} from './runtime-selection'

export class CodexRuntimeHomeService extends CodexRuntimeHomeLayer10 {
  protected initializeLastSyncedState(): void {
    const settings = this.store.getSettings()
    const activeAccount = this.getActiveAccount(
      settings.codexManagedAccounts,
      normalizeCodexRuntimeSelection(settings).host
    )
    // Why: WSL-managed homes are never materialized into host ~/.codex.
    // Treating one as "last synced" makes cold start look like a host-account
    // transition and can restore/delete host auth that Yiru never touched.
    this.lastSyncedAccountId = this.getWslManagedHomePath(activeAccount)
      ? null
      : normalizeCodexRuntimeSelection(settings).host
  }

  /**
   * Materializes the runtime home needed before launching the CLI.
   *
   * Historical session bridging is requested in the background so launch setup
   * returns as soon as the active runtime home is ready.
   */

  prepareForCodexLaunch(
    target?: CodexAccountSelectionTarget,
    launchEnv?: NodeJS.ProcessEnv
  ): string | null {
    if (target?.runtime === 'wsl') {
      const wslTarget = this.resolveWslDefaultTarget(target)
      const syncedRuntimeHomePath = this.syncWslRuntimeForCurrentSelection(wslTarget)
      this.syncWslConfigAndGlobalInstructionsForLaunch(wslTarget, syncedRuntimeHomePath)
      const runtimeHomePath = syncedRuntimeHomePath ?? this.getWslSystemCodexHomePath(wslTarget)
      this.startWslSessionBridgeForLaunch(wslTarget, runtimeHomePath)
      return runtimeHomePath
    }
    const selfContainedAccount = this.getSelfContainedManagedHostAccount()
    if (selfContainedAccount) {
      const perAccountHome = this.prepareSelfContainedManagedHomeForLaunch(selfContainedAccount)
      if (perAccountHome) {
        return perAccountHome
      }
    }
    if (this.isHostSystemDefaultRealHome(launchEnv)) {
      return null
    }
    this.invalidateBackfillAfterManagedSystemDefaultLaunch(launchEnv)
    this.syncForCurrentSelection()
    syncSystemCodexResourcesIntoManagedHome()
    syncSystemConfigIntoManagedCodexHome()
    // Why: historical Codex sessions can be large; bridge them after launch
    // setup so starting a fresh Codex TUI never waits on a full tree walk.
    void startSystemCodexSessionBridgeInBackground(
      resolveHostCodexSessionSourceHome(this.store.getSettings())
    )
    return this.getRuntimeHomePath()
  }

  protected getSelfContainedManagedHostAccount(): CodexManagedAccount | null {
    if (!isCodexSystemDefaultRealHomeEnabled()) {
      return null
    }
    const settings = this.store.getSettings()
    const account = this.getActiveAccount(
      settings.codexManagedAccounts,
      normalizeCodexRuntimeSelection(settings).host
    )
    return account && !this.getWslManagedHomePath(account) ? account : null
  }

  protected getManagedHostAccountHomesForSessionDiscovery(): string[] {
    const flagEnabled = isCodexSystemDefaultRealHomeEnabled()
    const homes: string[] = []
    for (const account of this.store.getSettings().codexManagedAccounts) {
      if (this.getWslManagedHomePath(account)) {
        continue
      }
      const trustedHome = this.getTrustedSelfContainedManagedHomePath(account)
      if (trustedHome && (flagEnabled || existsSync(join(trustedHome, 'sessions')))) {
        homes.push(trustedHome)
      }
    }
    return homes
  }

  protected prepareSelfContainedManagedHomeForLaunch(account: CodexManagedAccount): string | null {
    const perAccountHome = this.getTrustedSelfContainedManagedHomePath(account)
    if (!perAccountHome || !existsSync(join(perAccountHome, 'auth.json'))) {
      this.clearSelfContainedManagedSelection(account)
      return null
    }
    this.lastSyncedAccountId = account.id
    this.lastHostAccountUsedSelfContainedHome = true
    syncSystemCodexResourcesIntoManagedHome(perAccountHome)
    syncSystemConfigIntoManagedCodexHome({
      runtimeHomePath: perAccountHome,
      systemHomePath: getSystemCodexHomePath()
    })
    return perAccountHome
  }

  protected syncSelfContainedManagedSelection(account: CodexManagedAccount): void {
    const perAccountHome = this.getTrustedSelfContainedManagedHomePath(account)
    if (perAccountHome && existsSync(join(perAccountHome, 'auth.json'))) {
      this.lastSyncedAccountId = account.id
      this.lastHostAccountUsedSelfContainedHome = true
      return
    }
    this.clearSelfContainedManagedSelection(account)
  }

  protected getTrustedSelfContainedManagedHomePath(account: CodexManagedAccount): string | null {
    try {
      assertOwnedHostCodexManagedHomePath({
        candidatePath: account.managedHomePath,
        managedAccountsRoot: this.getManagedAccountsRoot(),
        systemCodexHomePath: getSystemCodexHomePath(),
        expectedAccountId: account.id
      })
      // Preserve persisted path spelling so the injected value remains stable
      // across macOS /var and /private/var aliases.
      return account.managedHomePath
    } catch (error) {
      console.warn('[codex-runtime-home] Refusing untrusted managed account home:', error)
      return null
    }
  }

  protected clearSelfContainedManagedSelection(account: CodexManagedAccount): void {
    const settings = this.store.getSettings()
    if (normalizeCodexRuntimeSelection(settings).host !== account.id) {
      return
    }
    console.warn(
      '[codex-runtime-home] Active managed account home is invalid or missing auth.json, clearing selection'
    )
    this.store.updateSettings({
      activeCodexManagedAccountId: null,
      activeCodexManagedAccountIdsByRuntime: {
        ...normalizeCodexRuntimeSelection(settings),
        host: null
      }
    })
    this.lastSyncedAccountId = null
    this.lastHostAccountUsedSelfContainedHome = false
  }

  protected invalidateBackfillAfterManagedSystemDefaultLaunch(launchEnv?: NodeJS.ProcessEnv): void {
    if (normalizeCodexRuntimeSelection(this.store.getSettings()).host !== null) {
      return
    }
    if (
      this.isHostSystemDefaultRealHomeSelected(launchEnv) ||
      !isCodexSystemDefaultRealHomeEnabled()
    ) {
      invalidateCodexSessionBackfillMarker(
        join(getCodexSessionBackfillStateDirPath(), 'backfill-complete.json')
      )
    }
  }

  protected startWslSessionBridgeForLaunch(
    target: CodexAccountSelectionTarget,
    runtimeHomePath: string | null
  ): void {
    if (process.platform !== 'win32' || !runtimeHomePath) {
      return
    }
    const runtimeHomeWsl = parseWslUncPath(runtimeHomePath)
    const distro = target.wslDistro?.trim() || runtimeHomeWsl?.distro || getDefaultWslDistro()
    if (!distro) {
      return
    }
    // Why: history-only override lets custom-CODEX_HOME users bridge from their
    // real home; falls back to <wslHome>/.codex, which auth/config still use.
    const systemCodexHomePath =
      resolveWslCodexSessionSourceHome(this.store.getSettings(), distro) ??
      this.getWslSystemCodexHomePath({ runtime: 'wsl', wslDistro: distro })
    if (!systemCodexHomePath || systemCodexHomePath === runtimeHomePath) {
      return
    }
    // Why: WSL history must be hardlinked inside the distro; host-side links
    // cannot bridge Windows and WSL filesystems in a resume-visible way.
    void startWslCodexSessionBridgeInBackground({
      distro,
      systemCodexHomePath,
      managedCodexHomePath: runtimeHomePath
    })
  }

  getHostCodexHomePathsForSessionDiscovery(): string[] {
    const homes = [this.getRuntimeHomePath()]
    if (this.isHostSystemDefaultRealHome() || this.getSelfContainedManagedHostAccount()) {
      homes.push(getSystemCodexHomePath())
    }
    homes.push(...this.getManagedHostAccountHomesForSessionDiscovery())
    return homes.filter((home, index) => homes.indexOf(home) === index)
  }
}
