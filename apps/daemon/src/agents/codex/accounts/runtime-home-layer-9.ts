import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { CodexManagedAccount } from '@yiru/runtime-protocol/workbench/types'

import { writeFileAtomically } from './atomic-file-operations'
import type { CodexReadBackResult } from './runtime-home-foundation'
import { CodexRuntimeHomeLayer8 } from './runtime-home-layer-8'
import {
  normalizeCodexRuntimeSelection,
  type CodexAccountSelectionTarget
} from './runtime-selection'

export abstract class CodexRuntimeHomeLayer9 extends CodexRuntimeHomeLayer8 {
  syncForCurrentSelection(target?: CodexAccountSelectionTarget): void {
    if (target?.runtime === 'wsl') {
      this.syncWslRuntimeForCurrentSelection(target)
      return
    }

    const selfContainedAccount = this.getSelfContainedManagedHostAccount()
    if (selfContainedAccount) {
      this.syncSelfContainedManagedSelection(selfContainedAccount)
      return
    }

    const settings = this.store.getSettings()
    if (this.lastHostAccountUsedSelfContainedHome) {
      this.lastHostAccountUsedSelfContainedHome = false
      this.lastSyncedAccountId = null
      this.lastWrittenAuthJson = null
      if (this.isHostSystemDefaultRealHome()) {
        return
      }
    }
    const runtimeAuthExistedBeforeSync = existsSync(this.getRuntimeAuthPath())
    if (this.lastSyncedAccountId === null) {
      this.captureSystemDefaultSnapshot({ force: false })
    }
    const activeAccount = this.getActiveAccount(
      settings.codexManagedAccounts,
      normalizeCodexRuntimeSelection(settings).host
    )
    const previousAccount = this.getActiveAccount(
      settings.codexManagedAccounts,
      this.lastSyncedAccountId
    )
    if (this.getWslManagedHomePath(activeAccount)) {
      const previousWasHostManaged = previousAccount && !this.getWslManagedHomePath(previousAccount)
      const outgoingReadBackResult = previousWasHostManaged
        ? this.readBackRefreshedTokensForAccount(previousAccount, {
            updateLastWrittenAuthJson: false
          })
        : 'unchanged'
      if (previousWasHostManaged) {
        this.restoreSystemDefaultSnapshot({
          detectExternalLogin: outgoingReadBackResult !== 'rejected'
        })
      }
      this.lastSyncedAccountId = null
      this.lastWrittenAuthJson = null
      this.skipNextReadBackForAccountId = null
      return
    }
    let outgoingReadBackResult: CodexReadBackResult = 'unchanged'
    if (previousAccount && previousAccount.id !== activeAccount?.id) {
      outgoingReadBackResult = this.readBackRefreshedTokensForAccount(previousAccount, {
        updateLastWrittenAuthJson: true
      })
    }
    if (!activeAccount) {
      if (normalizeCodexRuntimeSelection(settings).host) {
        this.store.updateSettings({
          activeCodexManagedAccountId: null,
          activeCodexManagedAccountIdsByRuntime: {
            ...normalizeCodexRuntimeSelection(settings),
            host: null
          }
        })
      }
      // Why: only restore the system-default mirror when transitioning FROM a
      // managed account. When no managed account was ever active, later syncs
      // should mirror the user's current ~/.codex/auth.json instead of
      // replaying an old snapshot on every PTY launch / rate-limit fetch.
      if (this.lastSyncedAccountId !== null) {
        this.restoreSystemDefaultSnapshot({
          detectExternalLogin: outgoingReadBackResult !== 'rejected'
        })
        this.lastSyncedAccountId = null
      } else if (!runtimeAuthExistedBeforeSync) {
        const logoutMarkerStatus = this.getRuntimeLogoutMarkerStatus()
        if (logoutMarkerStatus.kind === 'applies') {
          this.lastWrittenAuthJson = null
        } else if (
          logoutMarkerStatus.kind === 'system-default-changed' &&
          logoutMarkerStatus.systemDefaultAuthJson !== null
        ) {
          this.restoreSystemDefaultSnapshot({ detectExternalLogin: false })
        } else if (logoutMarkerStatus.kind === 'system-default-changed') {
          // Why: a real ~/.codex logout after a local runtime logout should
          // keep runtime auth absent instead of restoring the stale snapshot.
          this.captureSystemDefaultSnapshot({ force: true })
          this.persistRuntimeLogoutMarker(null)
          this.lastWrittenAuthJson = null
        } else if (this.lastWrittenAuthJson === null) {
          // Why: Yiru-launched Codex sessions now use a Yiru-owned CODEX_HOME
          // even when no managed account is selected. Seed that runtime home
          // from the user's current system-default auth once so dev/prod Yiru
          // terminals stay logged in without mutating ~/.codex on startup.
          this.restoreSystemDefaultSnapshot({ detectExternalLogin: false })
        } else {
          this.persistRuntimeLogoutMarker()
        }
      } else {
        this.clearRuntimeLogoutMarker()
        this.syncRuntimeAuthWithSystemDefault()
      }
      return
    }

    const activeAuthPath = join(activeAccount.managedHomePath, 'auth.json')
    if (!existsSync(activeAuthPath)) {
      console.warn(
        '[codex-runtime-home] Active managed account is missing auth.json, restoring system default'
      )
      const outgoingReadBackResult =
        this.lastSyncedAccountId === activeAccount.id
          ? this.recoverRefreshForMissingActiveAccount(activeAccount)
          : 'unchanged'
      this.store.updateSettings({
        activeCodexManagedAccountId: null,
        activeCodexManagedAccountIdsByRuntime: {
          ...normalizeCodexRuntimeSelection(settings),
          host: null
        }
      })
      if (this.lastSyncedAccountId !== null) {
        this.restoreSystemDefaultSnapshot({
          detectExternalLogin: outgoingReadBackResult !== 'rejected'
        })
        this.lastSyncedAccountId = null
      }
      return
    }

    if (this.lastSyncedAccountId === null) {
      this.captureSystemDefaultSnapshot({ force: true })
    }

    // Why: Codex CLI refreshes expired OAuth tokens in CODEX_HOME/auth.json.
    // If we detect the runtime file differs from what Yiru last wrote, the CLI
    // must have refreshed — so we preserve those tokens back to managed
    // storage before overwriting runtime with managed state.
    if (this.lastSyncedAccountId === activeAccount.id) {
      if (this.skipNextReadBackForAccountId === activeAccount.id) {
        this.skipNextReadBackForAccountId = null
      } else {
        this.readBackRefreshedTokens({
          updateLastWrittenAuthJson: true
        })
      }
    }

    if (this.lastSyncedAccountId !== activeAccount.id) {
      this.skipNextReadBackForAccountId = null
    }
    this.lastSyncedAccountId = activeAccount.id
    this.writeRuntimeAuth(readFileSync(activeAuthPath, 'utf-8'))
  }

  protected recoverRefreshForMissingActiveAccount(
    account: CodexManagedAccount
  ): CodexReadBackResult {
    try {
      const runtimeAuthPath = this.getRuntimeAuthPath()
      if (!existsSync(runtimeAuthPath) || this.lastWrittenAuthJson === null) {
        return 'rejected'
      }
      const runtimeContents = readFileSync(runtimeAuthPath, 'utf-8')
      if (runtimeContents === this.lastWrittenAuthJson) {
        return 'unchanged'
      }
      // Why: when canonical auth vanished, the exact bytes Yiru last mirrored
      // are the only safe identity baseline for recovering a token refresh.
      if (!this.runtimeAuthMatchesAccount(runtimeContents, account, this.lastWrittenAuthJson)) {
        return 'rejected'
      }
      writeFileAtomically(join(account.managedHomePath, 'auth.json'), runtimeContents, {
        mode: 0o600
      })
      this.lastWrittenAuthJson = runtimeContents
      return 'persisted'
    } catch (error) {
      console.warn('[codex-runtime-home] Failed to recover missing managed auth:', error)
      return 'rejected'
    }
  }

  // Why: called by CodexAccountService before syncForCurrentSelection() after
  // re-auth or add-account. Those flows write fresh tokens to managed storage,
  // so the read-back must be skipped to avoid overwriting them with stale
  // runtime tokens.
}
