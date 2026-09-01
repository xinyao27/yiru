import type { SleepingAgentLaunchConfig } from '@yiru/runtime-protocol/model/agent'
import type {
  AgentStatusOrchestrationContext,
  AgentStatusEntry
} from '@yiru/runtime-protocol/model/agent'
import type {
  RuntimeMobileSessionClientTab,
  RuntimeMobileSessionTabGroup,
  RuntimeMobileSessionSnapshotTab,
  RuntimeMobileSessionTerminalTab,
  RuntimeMobileSessionTabsResult,
  RuntimeMobileSessionTabsSnapshot,
  BrowserTabInfo
} from '@yiru/runtime-protocol/workbench/runtime-types'
import type { TabGroupLayoutNode } from '@yiru/runtime-protocol/workbench/types'
import type { OrchestrationDb } from '~main/runtime/orchestration/db'

import type { RuntimeAgentRowSnapshot } from '../model/terminal-observation'
import type { RuntimeLeafRecord, RuntimePtyWorktreeRecord } from '../model/terminal-records'
import { RuntimeContractResolveFolderWorkspaceLaunchScope } from './runtime-contract-resolve-folder-workspace-launch-scope'

export abstract class RuntimeContractSyncMobileSessionTabs extends RuntimeContractResolveFolderWorkspaceLaunchScope {
  protected abstract syncMobileSessionTabs(
    snapshots: RuntimeMobileSessionTabsSnapshot[] | undefined
  ): void

  protected abstract mergePreservedHeadlessMobileSessionTabs(
    snapshot: RuntimeMobileSessionTabsSnapshot,
    existing: RuntimeMobileSessionTabsSnapshot | undefined
  ): RuntimeMobileSessionTabsSnapshot

  protected abstract buildPreservedHeadlessMobileSessionSnapshot(
    existing: RuntimeMobileSessionTabsSnapshot
  ): RuntimeMobileSessionTabsSnapshot | null

  protected abstract collectPreservedHeadlessMobileSessionTabs(
    existing: RuntimeMobileSessionTabsSnapshot,
    incoming?: RuntimeMobileSessionTabsSnapshot
  ): RuntimeMobileSessionSnapshotTab[]

  protected abstract shouldPreserveHeadlessMobileSessionTab(
    snapshot: RuntimeMobileSessionTabsSnapshot,
    tab: RuntimeMobileSessionSnapshotTab
  ): boolean

  protected abstract isHeadlessMobileSessionPublication(publicationEpoch: string): boolean

  protected abstract getMergedMobileSessionPublicationEpoch(
    snapshot: RuntimeMobileSessionTabsSnapshot,
    preservedTabs: readonly RuntimeMobileSessionSnapshotTab[]
  ): string

  protected abstract notifyMobileSessionTabsRemoved(worktreeId: string): void

  abstract notifyMobileSessionTabsChanged(worktreeId?: string): void

  protected abstract notifyMobileSessionTabsChangedNow(worktreeId: string): void

  protected abstract notifyMobileSessionTabSnapshots(): void

  protected abstract getMobileSessionTabsForWorktree(
    worktreeId: string
  ): RuntimeMobileSessionTabsResult

  protected abstract resolveMobileMarkdownWorktreeId(
    worktreeSelector: string,
    tabId: string
  ): Promise<string>

  protected abstract getLiveBrowserTabsByPageId(worktreeId: string): Map<string, BrowserTabInfo>

  protected abstract collectReturnedSessionTabIds(
    tabs: readonly RuntimeMobileSessionClientTab[]
  ): Set<string>

  protected abstract sanitizeMobileSessionTabGroups(
    groups: readonly RuntimeMobileSessionTabGroup[] | undefined,
    returnedTabs: readonly RuntimeMobileSessionClientTab[]
  ): RuntimeMobileSessionTabGroup[] | undefined

  protected abstract pruneMobileSessionTabGroupLayout(
    layout: TabGroupLayoutNode | null | undefined,
    validGroupIds: ReadonlySet<string>
  ): TabGroupLayoutNode | null

  protected abstract toMobileSessionTabsResult(
    snapshot: RuntimeMobileSessionTabsSnapshot
  ): RuntimeMobileSessionTabsResult

  protected abstract getFreshHookAgentStatusForMobileTab(
    worktreeId: string,
    paneKey: string,
    tab: RuntimeMobileSessionTerminalTab
  ): AgentStatusEntry | null

  protected abstract buildPtyMobileAgentStatus(
    pty: RuntimePtyWorktreeRecord | null,
    tab: RuntimeMobileSessionTerminalTab,
    terminalHandle: string | null
  ): { agentStatus: AgentStatusEntry } | Record<string, never>

  protected abstract getFreshRetainedAgentStatusForMobileTab(
    paneKey: string,
    pty: RuntimePtyWorktreeRecord | null,
    tab: RuntimeMobileSessionTerminalTab
  ): RuntimeAgentRowSnapshot | null

  protected abstract findPtyForMobileTerminalTab(
    worktreeId: string,
    tab: RuntimeMobileSessionTerminalTab,
    options?: { allowWorktreeOnlyMatch?: boolean }
  ): RuntimePtyWorktreeRecord | null

  protected abstract getMobileTerminalPaneKey(tab: RuntimeMobileSessionTerminalTab): string

  protected abstract mobileTerminalTabMatchesPty(
    worktreeId: string,
    tab: RuntimeMobileSessionTerminalTab,
    pty: RuntimePtyWorktreeRecord,
    paneKey?: string
  ): boolean

  abstract getAgentStatusForHandle(handle: string): string | null

  abstract getAgentStatusOrchestrationContextForPaneKey(
    paneKey: string
  ): AgentStatusOrchestrationContext | undefined

  abstract getAgentStatusTerminalHandleForPaneKey(paneKey: string): string | undefined

  abstract getAgentStatusLaunchConfigForPaneKey(
    paneKey: string,
    args?: { launchToken?: string }
  ): SleepingAgentLaunchConfig | undefined

  protected abstract buildAgentOrchestrationByPaneKey():
    | Record<string, AgentStatusOrchestrationContext>
    | undefined

  protected abstract getAgentStatusOrchestrationContextForHandle(
    handle: string,
    db?: OrchestrationDb | null
  ): AgentStatusOrchestrationContext | undefined

  protected abstract getRecentCompletedDispatchForTerminal(
    handle: string,
    db?: OrchestrationDb | null
  ): ReturnType<OrchestrationDb['getLatestDispatchForTerminal']>

  protected abstract getTerminalHandleForPaneKey(paneKey: string): string | null

  protected abstract getPtyRecordForPaneKey(paneKey: string): RuntimePtyWorktreeRecord | null

  protected abstract getPaneKeyForTerminalHandle(handle: string): string | null

  protected abstract setPtyManagementTitleFromObservedTitle(
    pty: RuntimePtyWorktreeRecord,
    title: string | null | undefined,
    observedAt: number
  ): void

  protected abstract nextTitleObservationSequence(): number

  abstract isTerminalRunningAgent(handle: string): Promise<boolean>

  protected abstract isPtyRunningAgent(
    pty: RuntimePtyWorktreeRecord,
    leaf?: RuntimeLeafRecord | null
  ): Promise<boolean>
}
