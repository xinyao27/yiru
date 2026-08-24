import type { RuntimeAgentStatusEvent } from '@yiru/runtime-protocol/contract'
import type {
  RuntimeMobileSessionTabGroup,
  RuntimeMobileSessionSnapshotTab,
  RuntimeMobileSessionTerminalTab,
  RuntimeMobileSessionBrowserTab
} from '~shared/runtime-types'
import type { Tab, TerminalLayoutSnapshot, TerminalTab } from '~shared/types'

import type { RuntimePtyWorktreeRecord } from '../model/terminal-records'
import { RuntimeContractOnAgentStatusEvent } from './runtime-contract-on-agent-status-event'

export abstract class RuntimeContractAppendBrowserTabOrder extends RuntimeContractOnAgentStatusEvent {
  protected abstract appendBrowserTabOrder(
    groups: readonly RuntimeMobileSessionTabGroup[],
    browserTabIds: readonly string[],
    newTabAssignment?: { tabId: string; groupId: string },
    // browserPageId -> groupId from the prior/persisted groups. The terminal
    // distributor rebuilds tabOrder from terminal ids only and drops browser
    // ids, so this carries each browser's group across rebuilds.
    priorGroupByBrowserId?: ReadonlyMap<string, string>
  ): RuntimeMobileSessionTabGroup[]

  protected abstract collectBrowserGroupAssignment(
    groups: readonly RuntimeMobileSessionTabGroup[] | undefined,
    browserTabIds: readonly string[]
  ): Map<string, string>

  protected abstract isServeOwnedPtyId(ptyId: string | null | undefined): boolean

  protected abstract hasServeOwnedPtyBinding(tab: RuntimeMobileSessionTerminalTab): boolean

  protected abstract isServeOrSshOwnedPtyId(ptyId: string | null | undefined): boolean

  protected abstract hasServeOrSshOwnedBinding(tab: RuntimeMobileSessionTerminalTab): boolean

  protected abstract isRuntimeOwnedHeadlessMobileTab(
    worktreeId: string,
    tab: RuntimeMobileSessionTerminalTab
  ): boolean

  protected abstract mergeMobileSessionSnapshotTabs(
    baseTabs: readonly RuntimeMobileSessionSnapshotTab[],
    extraTabs: readonly RuntimeMobileSessionSnapshotTab[]
  ): RuntimeMobileSessionSnapshotTab[]

  protected abstract getMobileSessionSnapshotTabIdentityKeys(
    tab: RuntimeMobileSessionSnapshotTab
  ): string[]

  protected abstract mergeMobileSessionTabGroups(
    worktreeId: string,
    groups: readonly RuntimeMobileSessionTabGroup[],
    terminalTabs: readonly RuntimeMobileSessionTerminalTab[],
    activeTab: RuntimeMobileSessionTerminalTab | null
  ): RuntimeMobileSessionTabGroup[]

  protected abstract publishPtyBackedMobileSessionTerminal(
    worktreeId: string,
    pty: RuntimePtyWorktreeRecord,
    args: {
      tabId: string
      leafId: string
      title: string | null
      activate: boolean
      selectIfNoActiveTab?: boolean
      startupCwd?: string
      split?: { splitFromLeafId: string; direction: 'horizontal' | 'vertical' }
    }
  ): void

  protected abstract touchMobileSessionSnapshotsForPty(
    ptyId: string,
    options?: { immediate?: boolean }
  ): void

  protected abstract touchMobileSessionSnapshotsForAgentStatus(event: RuntimeAgentStatusEvent): void

  protected abstract buildHeadlessMobileSessionTerminalTabs(
    worktreeId: string,
    persistedTabs: readonly TerminalTab[]
  ): RuntimeMobileSessionTerminalTab[]

  protected abstract buildHeadlessMobileSessionBrowserTabs(
    worktreeId: string
  ): RuntimeMobileSessionBrowserTab[]

  protected abstract headlessBrowserTabsUnchanged(
    live: RuntimeMobileSessionBrowserTab[],
    existing: RuntimeMobileSessionBrowserTab[]
  ): boolean

  protected abstract browserLoadErrorsEqual(
    a: RuntimeMobileSessionBrowserTab['loadError'],
    b: RuntimeMobileSessionBrowserTab['loadError']
  ): boolean

  protected abstract browserCertificateFailuresEqual(
    a: RuntimeMobileSessionBrowserTab['certificateFailure'],
    b: RuntimeMobileSessionBrowserTab['certificateFailure']
  ): boolean

  protected abstract getPersistedUnifiedSessionTabProps(
    worktreeId: string,
    tabId: string
  ): Pick<Tab, 'color' | 'isPinned'> | null

  protected abstract collectPersistedTerminalLeafIds(
    layout: TerminalLayoutSnapshot | undefined
  ): string[]

  protected abstract deriveHeadlessLegacyTerminalLeafId(tabId: string): string

  protected abstract cloneTerminalLayoutSnapshot(
    layout: TerminalLayoutSnapshot
  ): TerminalLayoutSnapshot

  protected abstract isPersistedTerminalLeafActive(
    worktreeId: string,
    tabId: string,
    leafId: string,
    layout: TerminalLayoutSnapshot | undefined
  ): boolean

  protected abstract pickHeadlessActiveTerminalTab(
    tabs: readonly RuntimeMobileSessionTerminalTab[]
  ): RuntimeMobileSessionTerminalTab | null

  protected abstract collectHeadlessParentTabOrder(
    tabs: readonly RuntimeMobileSessionTerminalTab[]
  ): string[]

  protected abstract collectHeadlessTopLevelTabOrder(
    tabs: readonly RuntimeMobileSessionSnapshotTab[]
  ): string[]

  protected abstract getHeadlessMobileSessionGroupId(worktreeId: string): string

  protected abstract buildHeadlessMobileSessionTabGroups(
    worktreeId: string,
    tabs: readonly RuntimeMobileSessionSnapshotTab[],
    activeTab: RuntimeMobileSessionSnapshotTab | null,
    existingGroups?: readonly RuntimeMobileSessionTabGroup[],
    // Why: a new tab created via a specific group's "+" must land in THAT group,
    // not the active one — otherwise every "+" in a split funnels to one group.
    newTabAssignment?: { tabId: string; groupId: string }
  ): RuntimeMobileSessionTabGroup[]

  protected abstract distributeHeadlessTabsAcrossGroups(
    existingGroups: readonly RuntimeMobileSessionTabGroup[],
    tabOrder: readonly string[],
    activeTopLevelId: string | null,
    newTabAssignment?: { tabId: string; groupId: string }
  ): RuntimeMobileSessionTabGroup[]

  protected abstract buildMaterializedHeadlessParentLayout(
    leafId: string,
    ptyId: string,
    existingLayout: TerminalLayoutSnapshot | undefined,
    split?: { splitFromLeafId: string; direction: 'horizontal' | 'vertical' }
  ): TerminalLayoutSnapshot

  protected abstract removePersistedHeadlessTerminalTab(
    worktreeId: string,
    parentTabId: string
  ): string[]

  protected abstract persistHeadlessTerminalTabOrder(
    worktreeId: string,
    tabOrder: readonly string[]
  ): void
}
