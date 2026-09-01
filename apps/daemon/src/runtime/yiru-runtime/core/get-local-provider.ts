import { applyPRBotAuthorOverride } from '@yiru/runtime-protocol/model/review'
import {
  applyTerminalQuickCommandMutation,
  MAX_QUICK_COMMANDS,
  type TerminalQuickCommand,
  type TerminalQuickCommandMutation
} from '@yiru/runtime-protocol/model/ui'
import type { FeatureInteractionId } from '@yiru/runtime-protocol/workbench/feature-interactions'
import type {
  WarpThemeImportPreview,
  WarpThemeImportSource
} from '@yiru/runtime-protocol/workbench/terminal/custom-themes'
import type {
  GlobalSettings,
  PersistedUIState,
  StatsSummary,
  MemorySnapshot
} from '@yiru/runtime-protocol/workbench/types'
import type { GhosttyImportPreview } from '@yiru/runtime-protocol/workbench/types'
import { applyAgentStatusHooksEnabled } from '~main/agents/hooks/managed-agent-hook-controls'
import type { IPtyProvider } from '~main/agents/provider-runtime/types'
import { collectMemorySnapshot } from '~main/memory/collector'
import type { StatsSummaryOptions } from '~main/stats/summary'

import { RuntimeComposition } from '../runtime-composition'

export abstract class RuntimeCoreGetLocalProvider extends RuntimeComposition {
  getLocalProvider(): IPtyProvider | null {
    return this.getLocalProviderFn ? this.getLocalProviderFn() : null
  }

  async getStatsSummary(options: StatsSummaryOptions = {}): Promise<StatsSummary | null> {
    return this.stats ? this.providerUsage.buildSummary(this.stats, options) : null
  }

  getMemorySnapshot(): Promise<MemorySnapshot> {
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }
    return collectMemorySnapshot(this.store, this.getHostProcessMetricsFn)
  }

  getUIState(): PersistedUIState {
    if (!this.store?.getUI) {
      throw new Error('runtime_unavailable')
    }
    return this.store.getUI()
  }

  updateUIState(updates: Partial<PersistedUIState>): PersistedUIState {
    if (!this.store?.getUI || !this.store.updateUI) {
      throw new Error('runtime_unavailable')
    }
    this.store.updateUI(updates)
    return this.store.getUI()
  }

  recordFeatureInteraction(id: FeatureInteractionId): PersistedUIState {
    if (!this.store?.recordFeatureInteraction) {
      throw new Error('runtime_unavailable')
    }
    return this.store.recordFeatureInteraction(id)
  }

  getClientSettings(): Pick<
    GlobalSettings,
    | 'defaultTuiAgent'
    | 'disabledTuiAgents'
    | 'agentCmdOverrides'
    | 'agentDefaultArgs'
    | 'agentDefaultEnv'
    | 'agentStatusHooksEnabled'
    | 'minimaxGroupId'
    | 'minimaxUsageModels'
    | 'prBotAuthorOverrides'
  > {
    if (!this.store?.getSettings) {
      throw new Error('runtime_unavailable')
    }
    const settings = this.store.getSettings()
    return {
      defaultTuiAgent: settings.defaultTuiAgent ?? null,
      disabledTuiAgents: settings.disabledTuiAgents ?? [],
      agentCmdOverrides: settings.agentCmdOverrides ?? {},
      agentDefaultArgs: settings.agentDefaultArgs ?? {},
      agentDefaultEnv: settings.agentDefaultEnv ?? {},
      agentStatusHooksEnabled: settings.agentStatusHooksEnabled !== false,
      minimaxGroupId: settings.minimaxGroupId ?? '',
      minimaxUsageModels: settings.minimaxUsageModels ?? 'general',
      prBotAuthorOverrides: settings.prBotAuthorOverrides ?? []
    }
  }

  updateClientSettings(
    updates: Pick<
      Partial<GlobalSettings>,
      | 'agentStatusHooksEnabled'
      | 'defaultTuiAgent'
      | 'disabledTuiAgents'
      | 'agentDefaultArgs'
      | 'agentDefaultEnv'
      | 'minimaxGroupId'
      | 'minimaxUsageModels'
      | 'prBotAuthorOverrides'
    >
  ): Pick<
    GlobalSettings,
    | 'defaultTuiAgent'
    | 'disabledTuiAgents'
    | 'agentCmdOverrides'
    | 'agentDefaultArgs'
    | 'agentDefaultEnv'
    | 'agentStatusHooksEnabled'
    | 'minimaxGroupId'
    | 'minimaxUsageModels'
    | 'prBotAuthorOverrides'
  > {
    if (!this.store?.getSettings || !this.store.updateSettings) {
      throw new Error('runtime_unavailable')
    }
    const before = this.store.getSettings().agentStatusHooksEnabled !== false
    this.store.updateSettings(updates, { notifyListeners: true })
    if (
      typeof updates.agentStatusHooksEnabled === 'boolean' &&
      before !== updates.agentStatusHooksEnabled
    ) {
      applyAgentStatusHooksEnabled(updates.agentStatusHooksEnabled)
    }
    return this.getClientSettings()
  }

  getClientTerminalQuickCommands(): TerminalQuickCommand[] {
    if (!this.store?.getSettings) {
      throw new Error('runtime_unavailable')
    }
    return this.store.getSettings().terminalQuickCommands ?? []
  }

  updateClientTerminalQuickCommands(
    mutation: TerminalQuickCommandMutation
  ): TerminalQuickCommand[] {
    if (!this.store?.getSettings || !this.store.updateSettings) {
      throw new Error('runtime_unavailable')
    }
    const current = this.getClientTerminalQuickCommands()
    if (
      mutation.type === 'upsert' &&
      !current.some((command) => command.id === mutation.command.id) &&
      current.length >= MAX_QUICK_COMMANDS
    ) {
      throw new Error('Quick command limit reached')
    }
    this.store.updateSettings(
      { terminalQuickCommands: applyTerminalQuickCommandMutation(current, mutation) },
      { notifyListeners: true }
    )
    return this.getClientTerminalQuickCommands()
  }

  updateClientPRBotAuthorOverride(args: { author: string; isBot: boolean }) {
    if (!this.store?.getSettings || !this.store.updateSettings) {
      throw new Error('runtime_unavailable')
    }
    const current = this.store.getSettings().prBotAuthorOverrides
    this.store.updateSettings(
      { prBotAuthorOverrides: applyPRBotAuthorOverride(current, args.author, args.isBot) },
      { notifyListeners: true }
    )
    return this.getClientSettings()
  }

  previewGhosttyImportForClient(): Promise<GhosttyImportPreview> {
    if (!this.previewGhosttyImportForClientFn) {
      return Promise.resolve({ found: false, diff: {}, unsupportedKeys: [] })
    }
    return this.previewGhosttyImportForClientFn()
  }

  previewWarpThemeImportForClient(source: WarpThemeImportSource): Promise<WarpThemeImportPreview> {
    if (!this.previewWarpThemeImportForClientFn) {
      return Promise.resolve({ found: false, themes: [], skippedFiles: [] })
    }
    return this.previewWarpThemeImportForClientFn(source)
  }
}
