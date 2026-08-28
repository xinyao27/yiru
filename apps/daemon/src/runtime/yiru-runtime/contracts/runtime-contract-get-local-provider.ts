import type { RuntimeEmulatorEvent } from '@yiru/runtime-protocol/contract'
import type { AiVaultListArgs, AiVaultListResult } from '@yiru/runtime-protocol/model/agent'
import type {
  TerminalQuickCommand,
  TerminalQuickCommandMutation
} from '@yiru/runtime-protocol/model/ui'
import type { FeatureInteractionId } from '@yiru/runtime-protocol/workbench/feature-interactions'
import type { RuntimeClientEvent } from '@yiru/runtime-protocol/workbench/runtime-client-events'
import type { RuntimeStatus } from '@yiru/runtime-protocol/workbench/runtime-types'
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
import type { IPtyProvider } from '~main/agents/provider-runtime/types'
import type { OrchestrationDb } from '~main/runtime/orchestration/db'
import type { OrchestrationWorkerServer } from '~main/runtime/orchestration/environment-transport'
import type { ShellServicesConnectionId } from '~main/runtime/rpc/orpc/shell-services-identity'
import type { dispatchShellUICommand } from '~main/runtime/rpc/orpc/shell-services-reverse-link'
import type { StatsSummaryOptions } from '~main/stats/summary'

import type { RuntimePtyController } from '../model/terminal-observation'

export abstract class RuntimeContractGetLocalProvider {
  abstract getLocalProvider(): IPtyProvider | null

  protected abstract stopPtysForDestructiveWorktreeRemoval(
    worktreeId: string,
    connectionId?: string
  ): Promise<void>

  abstract getStatsSummary(options?: StatsSummaryOptions): Promise<StatsSummary | null>

  abstract getMemorySnapshot(): Promise<MemorySnapshot>

  abstract getUIState(): PersistedUIState

  abstract updateUIState(updates: Partial<PersistedUIState>): PersistedUIState

  abstract recordFeatureInteraction(id: FeatureInteractionId): PersistedUIState

  abstract getClientSettings(): Pick<
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
  >

  abstract updateClientSettings(
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
  >

  abstract getClientTerminalQuickCommands(): TerminalQuickCommand[]

  abstract updateClientTerminalQuickCommands(
    mutation: TerminalQuickCommandMutation
  ): TerminalQuickCommand[]

  abstract updateClientPRBotAuthorOverride(args: {
    author: string
    isBot: boolean
  }): Pick<
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
  >

  abstract previewGhosttyImportForClient(): Promise<GhosttyImportPreview>

  abstract previewWarpThemeImportForClient(
    source: WarpThemeImportSource
  ): Promise<WarpThemeImportPreview>

  abstract getOrchestrationDb(): OrchestrationDb

  abstract setOrchestrationDb(db: OrchestrationDb): void

  abstract getRuntimeId(): string

  abstract resolveOrchestrationWorkerServer(selector: string): OrchestrationWorkerServer

  abstract syncOrchestrationFederation(runId?: string): Promise<void>

  protected abstract syncOrchestrationFederatedDispatch(dispatchId: string): Promise<void>

  abstract ensureOrchestrationFederationRelay(runId?: string): void

  abstract stopOrchestrationFederationRelay(): void

  abstract getStartedAt(): number

  abstract getStatus(): RuntimeStatus

  abstract listAiVaultSessions(args?: AiVaultListArgs): Promise<AiVaultListResult>

  abstract setPtyController(controller: RuntimePtyController | null): void

  abstract attachShellConnection(shellConnectionId: ShellServicesConnectionId): void

  abstract detachShellConnection(shellConnectionId: ShellServicesConnectionId): void

  protected abstract dispatchShellCommand(
    input: Parameters<typeof dispatchShellUICommand>[1]
  ): boolean

  abstract onClientEvent(listener: (event: RuntimeClientEvent) => void): () => void

  protected abstract emitClientEvent(event: RuntimeClientEvent): void

  abstract onEmulatorEvent(listener: (event: RuntimeEmulatorEvent) => void): () => void

  abstract emitEmulatorEvent(event: RuntimeEmulatorEvent): void
}
