import type { NetworkProxySettings } from '~shared/network-proxy'

import type { ClaudeRuntimeAuthPreparation } from '../claude/accounts/runtime-auth-service'

export type FetchClaudeRateLimitsOptions = {
  authPreparation?: ClaudeRuntimeAuthPreparation
  allowPtyFallback?: boolean
  allowUsagePanelSupplement?: boolean
  networkProxySettings?: NetworkProxySettings
  signal?: AbortSignal
}

export type FetchManagedAccountUsageOptions = {
  allowUsagePanelSupplement?: boolean
  networkProxySettings?: NetworkProxySettings
  signal?: AbortSignal
}
