import type { NetworkProxySettings } from '@yiru/runtime-protocol/workbench/network-proxy'

import type { ClaudeRuntimeAuthPreparation } from '../agents/claude/accounts/runtime-auth-service'

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
