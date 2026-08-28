import type { StatsSummary } from '@yiru/runtime-protocol/workbench/types'
import type { ClaudeUsageStore } from '~main/agents/claude/usage/store'
import type { CodexUsageStore } from '~main/agents/codex/usage/store'
import type { OpenCodeUsageStore } from '~main/agents/opencode/usage/store'
import type { StatsCollector } from '~main/stats/collector'
import {
  buildStatsSummary,
  type ProviderUsageStores,
  type StatsSummaryOptions
} from '~main/stats/summary'

type ProviderUsageStoreName = 'claude' | 'codex' | 'openCode'
type ProviderUsageStore = ClaudeUsageStore | CodexUsageStore | OpenCodeUsageStore

export class RuntimeProviderUsage {
  private readonly stores: ProviderUsageStores | null

  constructor(stores: ProviderUsageStores | null) {
    this.stores = stores
  }

  buildSummary(stats: StatsCollector, options: StatsSummaryOptions): Promise<StatsSummary> {
    return buildStatsSummary(stats, this.stores ?? undefined, options)
  }

  getStore(provider: 'claude'): ClaudeUsageStore
  getStore(provider: 'codex'): CodexUsageStore
  getStore(provider: 'openCode'): OpenCodeUsageStore
  getStore(provider: ProviderUsageStoreName): ProviderUsageStore {
    const stores = this.requireStores()
    switch (provider) {
      case 'claude':
        return stores.claude
      case 'codex':
        return stores.codex
      case 'openCode':
        return stores.openCode
    }
  }

  private requireStores(): ProviderUsageStores {
    if (!this.stores) {
      throw new Error('provider_usage_unavailable')
    }
    return this.stores
  }
}
