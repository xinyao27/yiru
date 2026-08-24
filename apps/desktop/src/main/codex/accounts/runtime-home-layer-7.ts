import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { WSL_CODEX_RUNTIME_HOME_SEGMENTS } from '~main/pty/codex-home-wsl-env'
import { getDefaultWslDistro, getWslHome } from '~main/wsl'
import type { CodexManagedAccount } from '~shared/types'

import { CodexRuntimeHomeLayer6 } from './runtime-home-layer-6'
import {
  getWslSelectionKey,
  getSelectedCodexAccountIdForTarget,
  normalizeCodexRuntimeSelection,
  setSelectedCodexAccountIdForTarget,
  type CodexAccountSelectionTarget
} from './runtime-selection'

export abstract class CodexRuntimeHomeLayer7 extends CodexRuntimeHomeLayer6 {
  protected syncWslRuntimeForCurrentSelection(target: CodexAccountSelectionTarget): string | null {
    if (process.platform !== 'win32') {
      return null
    }

    const wslTarget = this.resolveWslDefaultTarget(target)
    const settings = this.store.getSettings()
    const activeAccount = this.getActiveAccount(
      settings.codexManagedAccounts,
      getSelectedCodexAccountIdForTarget(settings, wslTarget)
    )
    const distro = wslTarget.wslDistro?.trim() || activeAccount?.wslDistro || getDefaultWslDistro()
    if (!distro) {
      return null
    }

    const runtimeHomePath = this.getWslRuntimeHomePath(distro)
    if (!runtimeHomePath) {
      return null
    }
    this.wslRuntimeHomePathByDistro.set(distro, runtimeHomePath)

    mkdirSync(runtimeHomePath, { recursive: true })
    this.safeMigrateLegacyWslActiveHomePointer(distro, runtimeHomePath)
    this.seedWslRuntimeHome(runtimeHomePath, activeAccount, distro)

    const runtimeAuthPath = join(runtimeHomePath, 'auth.json')
    const previousWslAccountId = this.lastSyncedWslAccountIdByDistro.get(distro) ?? null
    if (previousWslAccountId) {
      if (this.skipNextReadBackForAccountId === previousWslAccountId) {
        this.skipNextReadBackForAccountId = null
      } else {
        const previousWslAccount = this.getActiveAccount(
          settings.codexManagedAccounts,
          previousWslAccountId
        )
        if (previousWslAccount) {
          this.readBackRefreshedTokensFromPath(runtimeAuthPath, {
            updateLastWrittenAuthJson: true,
            lastWrittenAuthJson: this.lastWrittenWslAuthJsonByDistro.get(distro) ?? null,
            setLastWrittenAuthJson: (contents) => {
              this.lastWrittenWslAuthJsonByDistro.set(distro, contents)
            },
            expectedAccountId: previousWslAccount.id
          })
        }
      }
    }

    const activeAuthPath = activeAccount ? join(activeAccount.managedHomePath, 'auth.json') : null
    if (activeAccount && activeAuthPath && existsSync(activeAuthPath)) {
      const activeAuth = readFileSync(activeAuthPath, 'utf-8')
      this.writeRuntimeAuthAtPath(runtimeAuthPath, activeAuth)
      this.lastWrittenWslAuthJsonByDistro.set(distro, activeAuth)
      this.lastSyncedWslAccountIdByDistro.set(distro, activeAccount.id)
      return runtimeHomePath
    }
    if (activeAccount && activeAuthPath) {
      console.warn(
        '[codex-runtime-home] Active WSL managed account is missing auth.json, restoring system default'
      )
      this.store.updateSettings({
        activeCodexManagedAccountId: settings.activeCodexManagedAccountId,
        activeCodexManagedAccountIdsByRuntime: setSelectedCodexAccountIdForTarget(
          normalizeCodexRuntimeSelection(settings),
          null,
          wslTarget
        )
      })
    }

    const systemAuthPath = this.getWslSystemCodexAuthPath({ runtime: 'wsl', wslDistro: distro })
    if (systemAuthPath && existsSync(systemAuthPath)) {
      const systemAuth = readFileSync(systemAuthPath, 'utf-8')
      const mirroredSystemDefaultAuth = this.lastWrittenWslAuthJsonByDistro.get(distro) ?? null
      const runtimeAuth = existsSync(runtimeAuthPath)
        ? readFileSync(runtimeAuthPath, 'utf-8')
        : null
      if (
        runtimeAuth !== null &&
        runtimeAuth !== systemAuth &&
        this.runtimeAuthMatchesSystemDefaultIdentity(runtimeAuth, systemAuth) &&
        ((mirroredSystemDefaultAuth !== null && systemAuth === mirroredSystemDefaultAuth) ||
          (mirroredSystemDefaultAuth === null &&
            this.runtimeAuthIsFresher(runtimeAuth, systemAuth)))
      ) {
        // Why: WSL runtime homes are per-distro and their in-memory baseline is
        // lost on app restart. A same-identity fresher runtime auth is a Codex
        // token refresh and should be copied back before we mirror ~/.codex.
        this.writeRuntimeAuthAtPath(systemAuthPath, runtimeAuth)
        this.lastWrittenWslAuthJsonByDistro.set(distro, runtimeAuth)
        this.lastSyncedWslAccountIdByDistro.set(distro, null)
        return runtimeHomePath
      }
      this.writeRuntimeAuthAtPath(runtimeAuthPath, systemAuth)
      this.lastWrittenWslAuthJsonByDistro.set(distro, systemAuth)
      this.lastSyncedWslAccountIdByDistro.set(distro, null)
      return runtimeHomePath
    }

    rmSync(runtimeAuthPath, { force: true })
    this.lastWrittenWslAuthJsonByDistro.set(distro, null)
    this.lastSyncedWslAccountIdByDistro.set(distro, null)
    return runtimeHomePath
  }

  protected getWslRuntimeHomePath(distro: string): string | null {
    const home = getWslHome(distro)
    return home ? this.joinWslPath(home, ...WSL_CODEX_RUNTIME_HOME_SEGMENTS) : null
  }

  protected safeReadBackActiveWslAccountBeforeRestart(
    account: CodexManagedAccount,
    selectedDistroKey: string
  ): void {
    try {
      this.readBackActiveWslAccountBeforeRestart(account, selectedDistroKey)
    } catch (error) {
      console.warn('[codex-runtime-home] Failed to preserve WSL Codex auth before restart:', error)
    }
  }

  protected readBackActiveWslAccountBeforeRestart(
    account: CodexManagedAccount,
    selectedDistroKey: string
  ): void {
    const distro =
      selectedDistroKey === getWslSelectionKey(null)
        ? account.wslDistro?.trim()
        : selectedDistroKey.trim() || account.wslDistro?.trim()
    if (!distro) {
      return
    }

    const runtimeHomePath = this.wslRuntimeHomePathByDistro.get(distro)
    if (!runtimeHomePath) {
      return
    }

    this.readBackRefreshedTokensFromPath(join(runtimeHomePath, 'auth.json'), {
      updateLastWrittenAuthJson: true,
      lastWrittenAuthJson: this.lastWrittenWslAuthJsonByDistro.get(distro) ?? null,
      setLastWrittenAuthJson: (contents) => {
        this.lastWrittenWslAuthJsonByDistro.set(distro, contents)
      },
      expectedAccountId: account.id
    })
  }

  protected safeMigrateLegacyWslActiveHomePointer(distro: string, runtimeHomePath: string): void {
    try {
      this.migrateLegacyWslActiveHomePointer(distro, runtimeHomePath)
    } catch (error) {
      console.warn('[codex-runtime-home] Failed to migrate legacy WSL active Codex home:', error)
    }
  }
}
