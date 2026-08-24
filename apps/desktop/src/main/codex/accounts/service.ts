import type { Store } from '~main/persistence'
import type { RateLimitService } from '~main/rate-limits/service'
import type { CodexRateLimitAccountsState } from '~shared/types'

import { addCodexAccount, reauthenticateCodexAccount } from './account-addition'
import { removeCodexAccount, selectCodexAccount } from './account-selection'
import { CodexAccountState } from './account-state'
import { CodexAccountLogin } from './login'
import { CodexManagedConfig } from './managed-config'
import { CodexManagedHome, type CodexAccountAddTarget } from './managed-home'
import type { CodexRuntimeHomeService } from './runtime-home-service'
import type { CodexAccountSelectionTarget } from './runtime-selection'

export type { CodexAccountAddTarget } from './managed-home'

export class CodexAccountService {
  private mutationQueue: Promise<unknown> = Promise.resolve()
  private readonly state: CodexAccountState
  private readonly login = new CodexAccountLogin()
  private readonly homes = new CodexManagedHome()
  private readonly config: CodexManagedConfig

  constructor(store: Store, rateLimits: RateLimitService, runtimeHome: CodexRuntimeHomeService) {
    this.state = new CodexAccountState(store, rateLimits, runtimeHome)
    this.config = new CodexManagedConfig(store, this.homes)
    this.config.syncAllSafely()
  }

  listAccounts(): CodexRateLimitAccountsState {
    this.state.normalizeSelection()
    return this.state.snapshot()
  }

  addAccount(target?: CodexAccountAddTarget): Promise<CodexRateLimitAccountsState> {
    return this.serializeMutation(() =>
      addCodexAccount(this.state, this.login, this.homes, this.config, target)
    )
  }

  reauthenticateAccount(accountId: string): Promise<CodexRateLimitAccountsState> {
    return this.serializeMutation(() =>
      reauthenticateCodexAccount(this.state, this.login, this.homes, this.config, accountId)
    )
  }

  removeAccount(accountId: string): Promise<CodexRateLimitAccountsState> {
    return this.serializeMutation(() => removeCodexAccount(this.state, this.homes, accountId))
  }

  selectAccount(accountId: string | null): Promise<CodexRateLimitAccountsState> {
    return this.serializeMutation(() => selectCodexAccount(this.state, this.config, accountId))
  }

  selectAccountForTarget(
    accountId: string | null,
    target?: CodexAccountSelectionTarget
  ): Promise<CodexRateLimitAccountsState> {
    return this.serializeMutation(() =>
      selectCodexAccount(this.state, this.config, accountId, target)
    )
  }

  private serializeMutation<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mutationQueue.then(operation, operation)
    this.mutationQueue = next.catch(() => {})
    return next
  }
}
