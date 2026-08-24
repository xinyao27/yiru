import type { Store } from '~main/persistence'
import type { RateLimitService } from '~main/rate-limits/service'
import type { ClaudeRateLimitAccountsState } from '~shared/types'

import { addClaudeAccount, reauthenticateClaudeAccount } from './account-addition'
import { removeClaudeAccount, selectClaudeAccount } from './account-selection'
import { ClaudeAccountState } from './account-state'
import { ClaudeAccountLogin } from './login'
import { ClaudeManagedAuthStorage, type ClaudeAccountAddTarget } from './managed-auth-storage'
import type { ClaudeRuntimeAuthService } from './runtime-auth-service'
import type { ClaudeAccountSelectionTarget } from './runtime-selection'

export type { ClaudeAccountAddTarget } from './managed-auth-storage'

export class ClaudeAccountService {
  private mutationQueue: Promise<unknown> = Promise.resolve()
  private readonly state: ClaudeAccountState
  private readonly login = new ClaudeAccountLogin()
  private readonly storage = new ClaudeManagedAuthStorage()

  constructor(store: Store, rateLimits: RateLimitService, runtimeAuth: ClaudeRuntimeAuthService) {
    this.state = new ClaudeAccountState(store, rateLimits, runtimeAuth)
  }

  listAccounts(): ClaudeRateLimitAccountsState {
    this.state.normalizeSelection()
    return this.state.snapshot()
  }

  addAccount(target?: ClaudeAccountAddTarget): Promise<ClaudeRateLimitAccountsState> {
    return this.serializeMutation(() =>
      addClaudeAccount(this.state, this.login, this.storage, target)
    )
  }

  reauthenticateAccount(accountId: string): Promise<ClaudeRateLimitAccountsState> {
    return this.serializeMutation(() =>
      reauthenticateClaudeAccount(this.state, this.login, this.storage, accountId)
    )
  }

  removeAccount(accountId: string): Promise<ClaudeRateLimitAccountsState> {
    return this.serializeMutation(() => removeClaudeAccount(this.state, this.storage, accountId))
  }

  selectAccount(accountId: string | null): Promise<ClaudeRateLimitAccountsState> {
    return this.serializeMutation(() => selectClaudeAccount(this.state, accountId))
  }

  selectAccountForTarget(
    accountId: string | null,
    target?: ClaudeAccountSelectionTarget
  ): Promise<ClaudeRateLimitAccountsState> {
    return this.serializeMutation(() => selectClaudeAccount(this.state, accountId, target))
  }

  cancelPendingLogin(): boolean {
    return this.login.cancel()
  }

  private serializeMutation<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mutationQueue.then(operation, operation)
    this.mutationQueue = next.catch(() => {})
    return next
  }
}
