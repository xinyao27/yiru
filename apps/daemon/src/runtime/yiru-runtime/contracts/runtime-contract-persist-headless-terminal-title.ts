import type { ProcessedAgentStatusChunk } from '@yiru/runtime-protocol/workbench/agent/status-osc'
import type {
  RuntimeMarkdownReadTabResult,
  RuntimeMarkdownSaveTabResult,
  RuntimeMobileSessionTabGroup,
  RuntimeMobileSessionTabsResult,
  RuntimeMobileSessionTabsSnapshot
} from '@yiru/runtime-protocol/workbench/runtime-types'
import type { TerminalChunkScanFlags } from '@yiru/runtime-protocol/workbench/terminal/chunk-scan-flags'
import type {
  TerminalSideEffectBatch,
  TerminalSideEffectFact
} from '@yiru/runtime-protocol/workbench/terminal/side-effect-facts'
import type { Repo } from '@yiru/runtime-protocol/workbench/types'
import type { PtyTransientFact, TerminalChunk } from '~main/agents/provider-runtime/types'
import type { TerminalQueryReplyOwner } from '~main/runtime/terminal-model-query-authority'

import type { RuntimePtyTitleTrackerEntry } from '../model/terminal-observation'
import type { TerminalTailWaitState } from '../model/terminal-tail-state'
import type { ResolvedWorktree } from '../model/worktree-resolution'
import { RuntimeContractEmitMobileSessionTabsSnapshot } from './runtime-contract-emit-mobile-session-tabs-snapshot'

export abstract class RuntimeContractPersistHeadlessTerminalTitle extends RuntimeContractEmitMobileSessionTabsSnapshot {
  protected abstract persistHeadlessTerminalTitle(
    worktreeId: string,
    tabId: string,
    title: string | null
  ): void

  protected abstract normalizeMobileSessionTabOrder(
    snapshot: RuntimeMobileSessionTabsSnapshot | undefined,
    targetGroup: RuntimeMobileSessionTabGroup,
    tabOrder: readonly string[]
  ): string[]

  protected abstract collectPublicMobileSessionTabIds(
    snapshot: RuntimeMobileSessionTabsSnapshot | undefined
  ): Set<string>

  protected abstract resolveMobileSessionHostTabId(
    snapshot: RuntimeMobileSessionTabsSnapshot | undefined,
    tabId: string
  ): string | null

  abstract readMobileMarkdownTab(
    worktreeSelector: string,
    tabId: string
  ): Promise<RuntimeMarkdownReadTabResult>

  abstract saveMobileMarkdownTab(
    worktreeSelector: string,
    tabId: string,
    baseVersion: string,
    content: string
  ): Promise<RuntimeMarkdownSaveTabResult>

  protected abstract resolveRuntimeGitTarget(worktreeSelector: string): Promise<{
    worktree: ResolvedWorktree
    repo?: Repo
    localGitOptions?: { wslDistro?: string }
  }>

  protected abstract resolveRuntimeFileTarget(worktreeSelector: string): Promise<{
    worktree: ResolvedWorktree
  }>

  abstract onMobileSessionTabsChanged(
    listener: (snapshot: RuntimeMobileSessionTabsResult) => void
  ): () => void

  abstract preAllocateHandleForPty(ptyId: string): string

  abstract createPreAllocatedTerminalHandle(): string

  abstract registerPreAllocatedHandleForPty(ptyId: string, handle: string): void

  protected abstract adoptControllerTerminalHandle(ptyId: string, handle: string | undefined): void

  abstract onPtySpawned(ptyId: string): void

  abstract registerPty(
    ptyId: string,
    worktreeId: string,
    connectionId?: string | null,
    binding?: { tabId: string; leafId: string },
    isWsl?: boolean,
    trustedWorktreeInstanceId?: string | null
  ): void

  abstract noteTerminalSpawnCommand(ptyId: string, command: string | null | undefined): void

  abstract onPtyData(
    ptyId: string,
    chunk: TerminalChunk,
    at: number,
    sequenceChars?: number,
    queryReplyOwner?: TerminalQueryReplyOwner
  ): number

  protected abstract scheduleWaitBlockedCheck(ptyId: string, appendedText: string, at: number): void

  protected abstract runWaitBlockedCheck(
    ptyId: string,
    state: {
      lastAt: number
      lastWaitState: TerminalTailWaitState | null
      appended: string
      keywordCarry: string
      timer: ReturnType<typeof setTimeout> | null
    },
    at: number
  ): void

  protected abstract clearWaitBlockedCheckState(ptyId: string): void

  protected abstract processAgentStatusOscForPty(
    ptyId: string,
    data: string,
    scanFlags?: TerminalChunkScanFlags
  ): ProcessedAgentStatusChunk

  protected abstract flushPendingTerminalSideEffectFacts(
    ptyId: string,
    entry: RuntimePtyTitleTrackerEntry
  ): void

  abstract ingestSyntheticTitleFrame(ptyId: string, data: string): void

  abstract setPtyTransientFactDelegation(
    ptyId: string,
    delegated: boolean,
    scanSeedAnsi?: string
  ): void

  abstract emitDaemonPtyTransientFact(ptyId: string, fact: PtyTransientFact): void

  abstract notePtyDataGap(ptyId: string, droppedChars?: number): void

  protected abstract recordTerminalSideEffectFact(ptyId: string, fact: TerminalSideEffectFact): void

  protected abstract emitTerminalSideEffectBatch(
    ptyId: string,
    facts: TerminalSideEffectFact[],
    options?: { replay?: boolean }
  ): void

  protected abstract resolveTerminalSideEffectAttribution(ptyId: string): {
    worktreeId?: string
    tabId?: string
    paneKey?: string
    connectionId?: string | null
  }

  abstract getTerminalSideEffectSnapshot(ptyId: string): TerminalSideEffectBatch | null

  protected abstract getTrackedRawTitleForPty(ptyId: string): string | null

  protected abstract makeMobileTitleGateKey(rawTitle: string, normalizedTitle: string): string

  protected abstract getOrCreatePtyTitleTrackerEntry(ptyId: string): RuntimePtyTitleTrackerEntry

  protected abstract applyTrackedPtyTitle(
    ptyId: string,
    rawTitle: string,
    normalizedTitle: string
  ): boolean

  protected abstract disposePtyTitleTracker(ptyId: string): void

  protected abstract resetTrackedTerminalStateForProviderGeneration(ptyId: string): void

  protected abstract setTerminalSideEffectConsumerAvailable(available: boolean): void

  protected abstract refreshTerminalSideEffectConsumerAvailability(): void
}
