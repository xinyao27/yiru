import { join } from 'node:path'

import type { AiVaultSessionRuntimeTarget } from '~main/ai-vault/session/root-configuration'
import { getWslHomeAsync } from '~main/wsl'

import type { ClaudeRuntimeAuthPreparation } from './runtime-auth-foundation'
import { ClaudeRuntimeAuthLayer10 } from './runtime-auth-layer-10'
import {
  getSelectedClaudeAccountIdForTarget,
  type ClaudeAccountSelectionTarget
} from './runtime-selection'

export class ClaudeRuntimeAuthService extends ClaudeRuntimeAuthLayer10 {
  async prepareForClaudeLaunch(
    target?: ClaudeAccountSelectionTarget
  ): Promise<ClaudeRuntimeAuthPreparation> {
    const effectiveTarget = target ?? this.getDefaultAccountSelectionTarget()
    await this.syncForCurrentSelection(effectiveTarget)
    return this.getPreparation(effectiveTarget)
  }

  async prepareForRateLimitFetch(
    target?: ClaudeAccountSelectionTarget
  ): Promise<ClaudeRuntimeAuthPreparation> {
    const effectiveTarget = target ?? this.getDefaultAccountSelectionTarget()
    await this.syncForCurrentSelection(effectiveTarget)
    return this.getPreparation(effectiveTarget)
  }

  async syncForCurrentSelection(target?: ClaudeAccountSelectionTarget): Promise<void> {
    await this.serializeMutation(() =>
      this.doSyncForCurrentSelection(target ?? this.getDefaultAccountSelectionTarget())
    )
  }

  async forceMaterializeCurrentSelectionForRollback(): Promise<void> {
    await this.serializeMutation(async () => {
      const settings = this.store.getSettings()
      if (!settings.activeClaudeManagedAccountId) {
        const previousAccount = this.getActiveAccount(
          settings.claudeManagedAccounts,
          this.lastSyncedAccountId
        )
        await this.restoreSystemDefaultSnapshot(
          previousAccount ? await this.readManagedCredentials(previousAccount) : null,
          previousAccount ? this.readManagedOauthAccount(previousAccount) : undefined
        )
        this.lastSyncedAccountId = null
        return
      }
      await this.doSyncForCurrentSelection()
    })
  }

  getRuntimeConfigDir(): string {
    return this.pathResolver.getRuntimePaths().configDir
  }

  async resolveSessionProjectRoots(target: AiVaultSessionRuntimeTarget): Promise<string[]> {
    if (target.runtime === 'host') {
      return [join(this.getRuntimeConfigDir(), 'projects')]
    }
    const distro = target.wslDistro.trim()
    const home = distro ? await getWslHomeAsync(distro) : null
    if (!home) {
      throw new Error('Claude WSL session root is unavailable')
    }
    const roots = [join(home, '.claude', 'projects')]
    for (const account of this.store.getSettings().claudeManagedAccounts) {
      if (
        account.managedAuthRuntime !== 'wsl' ||
        account.wslDistro?.trim().toLowerCase() !== distro.toLowerCase()
      ) {
        continue
      }
      const managedAuthPath = this.getOwnedManagedAuthPath(account)
      if (!managedAuthPath) {
        // Why: omitting a configured managed root could permanently under-attest first publication.
        throw new Error('Claude managed WSL session root is unavailable')
      }
      roots.push(join(managedAuthPath, 'projects'))
    }
    return [...new Set(roots)]
  }

  protected initializeLastSyncedState(): void {
    const settings = this.store.getSettings()
    this.lastSyncedAccountId = getSelectedClaudeAccountIdForTarget(settings, { runtime: 'host' })
  }

  protected async safeSyncForCurrentSelection(): Promise<void> {
    try {
      await this.syncForCurrentSelection()
    } catch (error) {
      console.warn('[claude-runtime-auth] Failed to sync runtime auth state:', error)
    }
  }

  protected serializeMutation<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.mutationQueue.then(fn, fn)
    this.mutationQueue = next.catch(() => {})
    return next
  }
}
