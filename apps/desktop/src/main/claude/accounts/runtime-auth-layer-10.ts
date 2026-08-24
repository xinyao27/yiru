import { existsSync, readFileSync } from 'node:fs'

import { writeActiveClaudeKeychainCredentialsForRuntime } from './keychain'
import { hasLiveClaudePtys } from './live-pty-gate'
import { isOauthTokenExpiring } from './oauth-refresh'
import { ClaudeRuntimeAuthLayer9 } from './runtime-auth-layer-9'
import {
  getSelectedClaudeAccountIdForTarget,
  normalizeClaudeAccountSelectionTarget,
  normalizeClaudeRuntimeSelection,
  setSelectedClaudeAccountIdForTarget,
  type ClaudeAccountSelectionTarget
} from './runtime-selection'

export abstract class ClaudeRuntimeAuthLayer10 extends ClaudeRuntimeAuthLayer9 {
  protected async doSyncForCurrentSelection(target?: ClaudeAccountSelectionTarget): Promise<void> {
    const settings = this.store.getSettings()
    const effectiveTarget = this.resolveWslDefaultTarget(target)
    const normalizedTarget = normalizeClaudeAccountSelectionTarget(effectiveTarget)
    const activeAccountId = getSelectedClaudeAccountIdForTarget(settings, normalizedTarget)
    const activeAccount = this.getActiveAccount(settings.claudeManagedAccounts, activeAccountId)
    const previousAccount = this.getActiveAccount(
      settings.claudeManagedAccounts,
      this.lastSyncedAccountId
    )
    this.managedRefreshDeferredByLivePtyAccountId = null
    const previousManagedCredentialsJson = previousAccount
      ? await this.readManagedCredentials(previousAccount)
      : null
    const previousManagedOauthAccount = previousAccount
      ? this.readManagedOauthAccount(previousAccount)
      : null
    if (previousAccount && previousAccount.id !== activeAccount?.id) {
      if (previousManagedCredentialsJson) {
        const outgoingReadBackResult = await this.readBackRefreshedTokens(
          previousManagedCredentialsJson,
          {
            updateLastWrittenCredentialsJson: true
          }
        )
        if (
          outgoingReadBackResult.status === 'rejected' &&
          outgoingReadBackResult.runtimeCredentialsChanged &&
          hasLiveClaudePtys()
        ) {
          if (
            outgoingReadBackResult.runtimeCredentialsJson &&
            this.liveRuntimeCredentialsCanUpdateActiveAccount(
              outgoingReadBackResult.runtimeCredentialsJson,
              previousAccount,
              previousManagedCredentialsJson,
              previousManagedOauthAccount
            )
          ) {
            // Why: switching away while Claude is live must preserve verified
            // token refreshes before replacing the shared runtime credentials.
            await this.writeManagedCredentials(
              previousAccount,
              outgoingReadBackResult.runtimeCredentialsJson
            )
          } else {
            // Why: Claude's runtime credential blob can lack enough identity
            // proof to attribute a live-session refresh. Do not persist that
            // unverified blob, but also do not block the user from moving new
            // terminals to the selected managed account.
            console.warn(
              '[claude-runtime-auth] Skipping unverified live Claude auth read-back while switching accounts'
            )
          }
        }
      }
    }
    if (!activeAccount) {
      if (activeAccountId) {
        const nextSelection = setSelectedClaudeAccountIdForTarget(
          normalizeClaudeRuntimeSelection(settings),
          null,
          normalizedTarget
        )
        this.store.updateSettings({
          activeClaudeManagedAccountId:
            normalizedTarget.runtime === 'host' ? null : settings.activeClaudeManagedAccountId,
          activeClaudeManagedAccountIdsByRuntime: nextSelection
        })
      }
      if (normalizedTarget.runtime === 'wsl') {
        return
      }
      if (this.lastSyncedAccountId !== null) {
        await (previousAccount
          ? this.restoreSystemDefaultSnapshot(
              previousManagedCredentialsJson,
              previousManagedOauthAccount
            )
          : this.restoreSystemDefaultSnapshot(this.lastWrittenCredentialsJson, undefined))
        this.lastSyncedAccountId = null
      }
      return
    }

    if (activeAccount.managedAuthRuntime === 'wsl') {
      if (!this.getOwnedManagedAuthPath(activeAccount)) {
        console.warn(
          '[claude-runtime-auth] Active WSL managed account is not owned by Yiru, restoring system default'
        )
        const nextSelection = setSelectedClaudeAccountIdForTarget(
          normalizeClaudeRuntimeSelection(settings),
          null,
          normalizedTarget
        )
        this.store.updateSettings({
          activeClaudeManagedAccountId:
            normalizedTarget.runtime === 'host' ? null : settings.activeClaudeManagedAccountId,
          activeClaudeManagedAccountIdsByRuntime: nextSelection
        })
        return
      }
      const credentialsJson = await this.readManagedCredentials(activeAccount)
      if (!credentialsJson || !this.isValidCredentialsJsonObject(credentialsJson)) {
        console.warn(
          '[claude-runtime-auth] Active WSL managed account is missing or has invalid credentials, restoring system default'
        )
        const nextSelection = setSelectedClaudeAccountIdForTarget(
          normalizeClaudeRuntimeSelection(settings),
          null,
          normalizedTarget
        )
        this.store.updateSettings({
          activeClaudeManagedAccountId:
            normalizedTarget.runtime === 'host' ? null : settings.activeClaudeManagedAccountId,
          activeClaudeManagedAccountIdsByRuntime: nextSelection
        })
        return
      }
      // Why: WSL managed Claude accounts are already isolated by their Linux
      // CLAUDE_CONFIG_DIR. Materializing them into Windows ~/.claude would mix
      // two runtime auth stores and break the Terminal-default runtime contract.
      this.clearLastWrittenRuntimeState()
      return
    }

    if (!this.getOwnedManagedAuthPath(activeAccount)) {
      console.warn(
        '[claude-runtime-auth] Active managed account is not owned by Yiru, restoring system default'
      )
      if (this.lastSyncedAccountId !== null) {
        if (
          previousAccount &&
          (previousAccount.id !== activeAccount.id ||
            this.hasMaterializedRuntimeAuth ||
            this.runtimeOauthAccountMatches(this.readManagedOauthAccount(previousAccount)))
        ) {
          await this.restoreSystemDefaultSnapshotForMissingManagedCredentials(
            previousAccount,
            previousManagedOauthAccount
          )
        } else if (!previousAccount && this.hasMaterializedRuntimeAuth) {
          await this.restoreSystemDefaultSnapshot(this.lastWrittenCredentialsJson, undefined)
        }
      }
      this.store.updateSettings({ activeClaudeManagedAccountId: null })
      this.lastSyncedAccountId = null
      return
    }

    let credentialsJson = await this.readManagedCredentials(activeAccount)
    if (!credentialsJson || !this.isValidCredentialsJsonObject(credentialsJson)) {
      console.warn(
        '[claude-runtime-auth] Active managed account is missing or has invalid credentials, restoring system default'
      )
      if (this.lastSyncedAccountId !== null) {
        if (
          previousAccount &&
          (previousAccount.id !== activeAccount.id ||
            this.hasMaterializedRuntimeAuth ||
            this.runtimeOauthAccountMatches(previousManagedOauthAccount))
        ) {
          await this.restoreSystemDefaultSnapshotForMissingManagedCredentials(
            previousAccount,
            previousManagedOauthAccount
          )
        } else if (!previousAccount && this.hasMaterializedRuntimeAuth) {
          await this.restoreSystemDefaultSnapshot(this.lastWrittenCredentialsJson, undefined)
        }
      }
      this.store.updateSettings({ activeClaudeManagedAccountId: null })
      this.lastSyncedAccountId = null
      return
    }

    if (this.lastSyncedAccountId === null) {
      const paths = this.pathResolver.getRuntimePaths()
      const runtimeCredentialsJson = existsSync(paths.credentialsPath)
        ? readFileSync(paths.credentialsPath, 'utf-8')
        : null
      await this.captureSystemDefaultSnapshotForManagedEntry(
        runtimeCredentialsJson,
        credentialsJson
      )
    }

    // Why: Claude CLI refreshes expired OAuth tokens and writes them back to
    // .credentials.json. If we detect the runtime file differs from what Yiru
    // last wrote, the CLI must have refreshed — so we preserve those tokens
    // back to managed storage before overwriting runtime with managed state.
    if (this.lastSyncedAccountId === activeAccount.id) {
      if (this.skipNextReadBackForAccountId === activeAccount.id) {
        this.skipNextReadBackForAccountId = null
      } else {
        const readBackResult = await this.readBackRefreshedTokens(credentialsJson, {
          updateLastWrittenCredentialsJson: true
        })
        if (readBackResult.status === 'persisted') {
          const updatedCredentialsJson = await this.readManagedCredentials(activeAccount)
          if (updatedCredentialsJson && this.isValidCredentialsJsonObject(updatedCredentialsJson)) {
            credentialsJson = updatedCredentialsJson
          }
        } else if (
          readBackResult.status === 'rejected' &&
          readBackResult.runtimeCredentialsChanged &&
          // Why: a live Claude that lost a refresh-token race wipes its runtime
          // blob (empty tokens). Preserving that wreckage would leave every new
          // session logged out — rematerialize managed credentials instead.
          readBackResult.hasValidChangedRuntimeCredentials &&
          hasLiveClaudePtys()
        ) {
          if (
            readBackResult.runtimeCredentialsJson &&
            this.liveRuntimeCredentialsCanUpdateActiveAccount(
              readBackResult.runtimeCredentialsJson,
              activeAccount,
              credentialsJson,
              this.readManagedOauthAccount(activeAccount)
            )
          ) {
            // Why: this Claude process was launched under the active managed
            // account, but persistence still needs positive account proof.
            await this.writeManagedCredentials(activeAccount, readBackResult.runtimeCredentialsJson)
            credentialsJson = readBackResult.runtimeCredentialsJson
          } else {
            // Why: while Claude is running, an unknown refresh can still belong
            // to a live session. Rewriting stale managed auth logs that session out.
            console.warn(
              '[claude-runtime-auth] Preserving changed Claude runtime credentials while live Claude terminals are running'
            )
            this.lastSyncedAccountId = activeAccount.id
            this.hasMaterializedRuntimeAuth = true
            return
          }
        }
      }
    }

    if (this.lastSyncedAccountId !== activeAccount.id) {
      this.skipNextReadBackForAccountId = null
    }

    // Why: own the OAuth refresh whenever no live `claude` owns these
    // credentials — both switching into an account and re-syncing the active
    // account with an expired token. A single-use refresh token is rotated and
    // persisted to managed storage atomically before we materialize it, so the
    // runtime never gets a stale token that fails with invalid_grant. Skipped
    // entirely while a Claude PTY is live: that process owns the credentials
    // and refreshing here would race its own rotation (double-rotation
    // invalidates one copy) — the read-back above preserves its refresh instead.
    const liveClaudePtys = hasLiveClaudePtys()
    if (liveClaudePtys && isOauthTokenExpiring(credentialsJson)) {
      this.managedRefreshDeferredByLivePtyAccountId = activeAccount.id
    }
    if (!liveClaudePtys) {
      const refreshed = await this.refreshManagedAccountTokenIfNeeded(
        activeAccount,
        credentialsJson
      )
      if (refreshed) {
        credentialsJson = refreshed
      }
    }

    const paths = this.pathResolver.getRuntimePaths()
    this.writeRuntimeCredentials(credentialsJson)
    if (process.platform === 'darwin') {
      // Why: Claude Code 2.1+ reads the scoped service, while older builds read
      // the legacy unsuffixed service. Runtime switching must satisfy both.
      try {
        await writeActiveClaudeKeychainCredentialsForRuntime(credentialsJson, paths.configDir)
      } catch (error) {
        await this.restoreSystemDefaultSnapshot(
          credentialsJson,
          this.readManagedOauthAccount(activeAccount)
        )
        throw error
      }
    }
    const managedOauthAccount = this.readManagedOauthAccount(activeAccount)
    if (this.writeRuntimeOauthAccount(managedOauthAccount)) {
      this.lastWrittenOauthAccount = managedOauthAccount
      this.hasLastWrittenOauthAccount = true
    } else {
      this.lastWrittenOauthAccount = null
      this.hasLastWrittenOauthAccount = false
    }
    this.lastSyncedAccountId = activeAccount.id
    this.hasMaterializedRuntimeAuth = true
  }

  // Why: called by ClaudeAccountService before syncForCurrentSelection() after
  // re-auth or add-account. Those flows write fresh tokens to managed storage,
  // so the read-back must be skipped to avoid overwriting them with stale
  // runtime tokens.
}
