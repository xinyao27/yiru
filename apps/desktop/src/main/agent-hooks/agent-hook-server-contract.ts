import type { AgentStatusIpcPayload, ParsedAgentStatusPayload } from '@yiru/workbench-model/agent'
import type { AgentHookEventPayload } from '~shared/agent/hook-listener'
import type { AgentHookSource } from '~shared/agent/hook-relay'
import type { AgentInterruptInferenceRequest } from '~shared/agent/interrupt-intent'
import type { LegacyPaneKeyAliasEntry } from '~shared/types'

import { AgentHookServerBase } from './agent-hook-server-base'
import type {
  EnrichedAgentHookEventPayload,
  AgentHookStatusChangeEntry,
  StatusChangeListener,
  PaneStatusClearListener,
  PaneKeyAliasPersistenceListener
} from './agent-hook-server-foundation'

export abstract class AgentHookServerContract extends AgentHookServerBase {
  abstract initializeForwardedHost(options: {
    env: string
    userDataPath: string
    endpointNamespace?: string
  }): void
  abstract setForwardedPtyEnv(env: Record<string, string>): void
  abstract setListener(listener: ((payload: EnrichedAgentHookEventPayload) => void) | null): void
  abstract subscribeStatusChanges(listener: StatusChangeListener): () => void
  abstract setPaneStatusClearListener(listener: PaneStatusClearListener | null): void
  abstract getStatusSnapshot(): AgentStatusIpcPayload[]
  abstract inferInterrupt(request: AgentInterruptInferenceRequest): boolean
  abstract getStatusChangeSnapshot(): AgentHookStatusChangeEntry[]
  protected abstract notifyStatusChangeListeners(): void
  protected abstract markTabClosedForAgentStatus(tabId: string): void
  protected abstract shouldSuppressClosedTabStatus(paneKey: string): boolean
  protected abstract markPaneClosedForAgentStatus(paneKey: string): void
  protected abstract attachStatusTiming(
    payload: AgentHookEventPayload,
    now?: number
  ): EnrichedAgentHookEventPayload
  protected abstract hashPromptForTelemetryDedupe(prompt: string): string
  protected abstract maybeTrackAgentPromptSent(
    payload: AgentHookEventPayload,
    previousStatus: EnrichedAgentHookEventPayload | undefined
  ): void
  protected abstract applyNormalizedStatus(
    payload: AgentHookEventPayload
  ): EnrichedAgentHookEventPayload
  protected abstract clearAssistantMessageRetry(paneKey: string): void
  protected abstract scheduleAssistantMessageRetry(
    source: AgentHookSource,
    body: unknown,
    original: EnrichedAgentHookEventPayload,
    attempt?: number,
    discoveryReady?: boolean
  ): void
  protected abstract applyAssistantMessageRetry(
    source: AgentHookSource,
    body: unknown,
    original: EnrichedAgentHookEventPayload,
    nextAttempt: number,
    requireExactOriginal: boolean
  ): void
  abstract setPaneKeyAliasPersistenceListener(
    listener: PaneKeyAliasPersistenceListener | null
  ): void
  protected abstract getPersistedPaneKeyAliases(): LegacyPaneKeyAliasEntry[]
  protected abstract notifyPaneKeyAliasPersistenceListener(): void
  protected abstract boundPaneKeyAliases(): void
  protected abstract getPhysicalPaneKeyForAuthority(paneKey: string, ptyId?: string): string
  abstract canTransferPaneAuthority(
    fromPaneKey: string,
    ptyId: string | undefined,
    ownsPty: (physicalPaneKey: string, ptyId: string) => boolean
  ): boolean
  abstract registerPaneKeyAlias(
    legacyPaneKey: string,
    stablePaneKey: string,
    ptyId?: string,
    updatedAt?: number,
    options?: { overwriteExisting?: boolean; authorityVerified?: boolean }
  ): void
  abstract transferPaneAuthority(
    fromPaneKey: string,
    toPaneKey: string,
    ptyId?: string,
    updatedAt?: number,
    options?: { authorityVerified?: boolean }
  ): void
  abstract retirePaneAuthority(paneKey: string): void
  abstract clearPaneKeyAliasesForPty(
    ptyId: string,
    options?: { shouldClearStablePaneKey?: (paneKey: string) => boolean }
  ): void
  protected abstract resolvePaneKeyAlias(paneKey: string): string
  protected abstract normalizeHookBodyPaneKeyAlias(body: unknown): unknown
  abstract ingestTerminalStatus(event: {
    paneKey: string
    tabId?: string
    worktreeId?: string
    connectionId?: string | null
    payload: ParsedAgentStatusPayload
  }): void
  abstract ingestRemote(
    envelope: {
      paneKey: string
      tabId?: string
      worktreeId?: string
      env?: string
      version?: string
      launchToken?: string
      hasExplicitPrompt?: boolean
      promptInteractionKey?: string
      hookEventName?: string
      toolUseId?: string
      toolAgentId?: string
      toolAgentType?: string
      providerSession?: unknown
      providerSessionOnly?: unknown
      isReplay?: boolean
      payload: unknown
    },
    connectionId: string | null
  ): void
  abstract start(options?: {
    env?: string
    userDataPath?: string
    endpointNamespace?: string
  }): Promise<void>
  abstract stop(): void
  abstract dropStatusEntry(paneKey: string): void
  abstract dropStatusEntriesByTabPrefix(tabId: string): void
  abstract clearPaneState(paneKey: string): void
  abstract reapRestoredClaudeSubagentsWithoutLiveAgent(
    isLocalExecutionHost: (worktreeId: string | undefined) => boolean,
    isLocalPaneAgentLive: (paneKey: string) => Promise<boolean>,
    isLocalPaneLivenessEvidenceCurrent: (paneKey: string) => boolean
  ): Promise<number>
  abstract buildPtyEnv(): Record<string, string>
  abstract get endpointFilePath(): string | null
  protected abstract configureHostState(options?: {
    env?: string
    userDataPath?: string
    endpointNamespace?: string
  }): void
  abstract get lastStatusPath(): string | null
  protected abstract maybeWriteEndpointFile(): void
  protected abstract hydrateLastStatusFromDisk(): void
  protected abstract serializeStatusFile(): string
  protected abstract scheduleStatusPersist(): void
  abstract flushStatusPersistSync(): void
  protected abstract runStatusPersist(): void
}
