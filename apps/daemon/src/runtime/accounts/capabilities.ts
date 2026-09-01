import type { AccountsSnapshot } from '@yiru/runtime-protocol/contract'
import type {
  CodexRateLimitResetResult,
  CursorRateLimitRefreshContext,
  RateLimitRuntimeTarget,
  RateLimitState
} from '@yiru/runtime-protocol/workbench/rate-limit-types'
import type {
  ClaudeRateLimitAccountsState,
  CodexRateLimitAccountsState
} from '@yiru/runtime-protocol/workbench/types'
import type { ClaudeAccountSelectionTarget } from '~main/agents/claude/accounts/runtime-selection'
import type {
  ClaudeAccountAddTarget,
  ClaudeAccountService
} from '~main/agents/claude/accounts/service'
import type { CodexAccountSelectionTarget } from '~main/agents/codex/accounts/runtime-selection'
import type {
  CodexAccountAddTarget,
  CodexAccountService
} from '~main/agents/codex/accounts/service'
import type { RateLimitService } from '~main/rate-limits/service'

type RuntimeAccountServices = {
  claudeAccounts: ClaudeAccountService
  codexAccounts: CodexAccountService
  rateLimits: RateLimitService
}

export class RuntimeAccounts {
  private services: RuntimeAccountServices | null = null

  configure(services: RuntimeAccountServices): void {
    this.services = services
  }

  getSnapshot(): AccountsSnapshot {
    const { claudeAccounts, codexAccounts, rateLimits } = this.requireServices()
    return {
      claude: claudeAccounts.listAccounts(),
      codex: codexAccounts.listAccounts(),
      rateLimits: rateLimits.getState()
    }
  }

  listCachedClaude(): ClaudeRateLimitAccountsState {
    return this.requireServices().claudeAccounts.listAccounts()
  }

  listCachedCodex(): CodexRateLimitAccountsState {
    return this.requireServices().codexAccounts.listAccounts()
  }

  addClaude(target?: ClaudeAccountAddTarget): Promise<ClaudeRateLimitAccountsState> {
    return this.requireServices().claudeAccounts.addAccount(target)
  }

  cancelPendingClaudeLogin(): boolean {
    return this.requireServices().claudeAccounts.cancelPendingLogin()
  }

  reauthenticateClaude(accountId: string): Promise<ClaudeRateLimitAccountsState> {
    return this.requireServices().claudeAccounts.reauthenticateAccount(accountId)
  }

  addCodex(target?: CodexAccountAddTarget): Promise<CodexRateLimitAccountsState> {
    return this.requireServices().codexAccounts.addAccount(target)
  }

  reauthenticateCodex(accountId: string): Promise<CodexRateLimitAccountsState> {
    return this.requireServices().codexAccounts.reauthenticateAccount(accountId)
  }

  // Why: desktop polling pauses while unfocused and inactive-account caches
  // fill lazily. Mobile needs a bounded caller-side wait on these fetches.
  async refreshForMobile(): Promise<void> {
    const { rateLimits } = this.requireServices()
    await Promise.allSettled([
      rateLimits.refresh(),
      rateLimits.fetchInactiveClaudeAccountsOnOpen(),
      rateLimits.fetchInactiveCodexAccountsOnOpen()
    ])
  }

  // Why: reconnects replay subscriptions, so use the stale-aware lane rather
  // than turning each mobile reconnection into a forced provider fetch.
  async refreshForMobileSubscriber(): Promise<void> {
    const { rateLimits } = this.requireServices()
    await Promise.allSettled([
      rateLimits.refreshIfStale(),
      rateLimits.fetchInactiveClaudeAccountsOnOpen(),
      rateLimits.fetchInactiveCodexAccountsOnOpen()
    ])
  }

  selectClaude(
    accountId: string | null,
    target?: ClaudeAccountSelectionTarget
  ): Promise<ClaudeRateLimitAccountsState> {
    const { claudeAccounts } = this.requireServices()
    return target?.runtime
      ? claudeAccounts.selectAccountForTarget(accountId, target)
      : claudeAccounts.selectAccount(accountId)
  }

  selectCodex(
    accountId: string | null,
    target?: CodexAccountSelectionTarget
  ): Promise<CodexRateLimitAccountsState> {
    const { codexAccounts } = this.requireServices()
    return target?.runtime
      ? codexAccounts.selectAccountForTarget(accountId, target)
      : codexAccounts.selectAccount(accountId)
  }

  removeClaude(accountId: string): Promise<ClaudeRateLimitAccountsState> {
    return this.requireServices().claudeAccounts.removeAccount(accountId)
  }

  removeCodex(accountId: string): Promise<CodexRateLimitAccountsState> {
    return this.requireServices().codexAccounts.removeAccount(accountId)
  }

  onChanged(listener: (snapshot: AccountsSnapshot) => void): () => void {
    const services = this.requireServices()
    return services.rateLimits.onStateChange((rateLimits) => {
      listener({
        claude: services.claudeAccounts.listAccounts(),
        codex: services.codexAccounts.listAccounts(),
        rateLimits
      })
    })
  }

  refreshRateLimits(cursorContext?: CursorRateLimitRefreshContext | null): Promise<RateLimitState> {
    return this.requireServices().rateLimits.refresh(cursorContext ?? undefined)
  }

  refreshCodexRateLimits(target: RateLimitRuntimeTarget): Promise<RateLimitState> {
    return this.requireServices().rateLimits.refreshCodexForTarget(target)
  }

  refreshClaudeRateLimits(target: RateLimitRuntimeTarget): Promise<RateLimitState> {
    return this.requireServices().rateLimits.refreshClaudeForTarget(target)
  }

  consumeCodexRateLimitResetCredit(): Promise<CodexRateLimitResetResult> {
    return this.requireServices().rateLimits.consumeCodexRateLimitResetCredit()
  }

  fetchInactiveClaudeRateLimits(): Promise<void> {
    return this.requireServices().rateLimits.fetchInactiveClaudeAccountsOnOpen()
  }

  fetchInactiveCodexRateLimits(): Promise<void> {
    return this.requireServices().rateLimits.fetchInactiveCodexAccountsOnOpen()
  }

  refreshGrokRateLimits(): Promise<RateLimitState> {
    return this.requireServices().rateLimits.refreshGrok()
  }

  private requireServices(): RuntimeAccountServices {
    if (!this.services) {
      throw new Error('Account services are not configured on this runtime')
    }
    return this.services
  }
}
