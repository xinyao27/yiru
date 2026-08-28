import type {
  RuntimeMobileSessionTabMove,
  RuntimeMobileSessionTabMoveResult,
  RuntimeMobileSessionTabGroup,
  RuntimeMobileSessionSnapshotTab,
  RuntimeMobileSessionTerminalTab,
  RuntimeMobileSessionBrowserTab,
  RuntimeMobileSessionTabsResult,
  RuntimeMobileSessionTabsSnapshot
} from '@yiru/runtime-protocol/workbench/runtime-types'
import type {
  TabGroupLayoutNode,
  TerminalPaneLayoutNode
} from '@yiru/runtime-protocol/workbench/types'

import { RuntimeContractAppendBrowserTabOrder } from './runtime-contract-append-browser-tab-order'

export abstract class RuntimeContractEmitMobileSessionTabsSnapshot extends RuntimeContractAppendBrowserTabOrder {
  protected abstract emitMobileSessionTabsSnapshot(snapshot: RuntimeMobileSessionTabsSnapshot): void

  protected abstract refreshMobileSessionPtyRecords(targetWorktreeId?: string | null): Promise<void>

  abstract activateMobileSessionTab(
    worktreeSelector: string,
    tabId: string,
    leafId?: string,
    opts?: { notifyClients?: boolean }
  ): Promise<RuntimeMobileSessionTabsResult>

  protected abstract activateMobileSessionTabForRemoteClient(
    worktreeId: string,
    snapshot: RuntimeMobileSessionTabsSnapshot,
    activeTab: RuntimeMobileSessionSnapshotTab
  ): void

  protected abstract shouldMaterializeHeadlessMobileSessionTab(
    snapshot: RuntimeMobileSessionTabsSnapshot,
    tab: RuntimeMobileSessionTerminalTab
  ): boolean

  protected abstract shouldPersistHeadlessMobileSessionActivation(
    snapshot: RuntimeMobileSessionTabsSnapshot,
    tab: RuntimeMobileSessionTerminalTab
  ): boolean

  protected abstract activateHeadlessMobileSessionTerminalTab(
    worktreeId: string,
    snapshot: RuntimeMobileSessionTabsSnapshot,
    activeTab: RuntimeMobileSessionTerminalTab
  ): void

  protected abstract persistHeadlessTerminalSplit(args: {
    tabId: string
    leafId: string
    ptyId: string
    splitFromLeafId: string
    direction: 'horizontal' | 'vertical'
  }): void

  protected abstract persistHeadlessTerminalActiveLeaf(
    worktreeId: string,
    tab: RuntimeMobileSessionTerminalTab
  ): void

  abstract closeMobileSessionTab(worktreeSelector: string, tabId: string): Promise<{ closed: true }>

  protected abstract notifyRendererOfHeadlessTerminalClose(parentTabId: string): void

  protected abstract closeHeadlessMobileBrowserTab(
    worktreeId: string,
    snapshot: RuntimeMobileSessionTabsSnapshot,
    tab: RuntimeMobileSessionBrowserTab
  ): Promise<void>

  protected abstract closeHeadlessMobileTerminalTab(
    worktreeId: string,
    snapshot: RuntimeMobileSessionTabsSnapshot,
    tab: RuntimeMobileSessionTerminalTab
  ): void

  abstract moveMobileSessionTab(
    worktreeSelector: string,
    move: RuntimeMobileSessionTabMove
  ): Promise<RuntimeMobileSessionTabMoveResult>

  abstract updateMobileSessionPaneLayout(
    worktreeSelector: string,
    args: {
      tabId: string
      root: TerminalPaneLayoutNode | null
      expandedLeafId: string | null
      titlesByLeafId?: Record<string, string>
    }
  ): Promise<{ updated: true }>

  abstract setMobileSessionTabProps(
    worktreeSelector: string,
    args: {
      tabId: string
      color?: string | null
      isPinned?: boolean
    }
  ): Promise<{ updated: true }>

  protected abstract persistHeadlessSessionTabProps(
    worktreeId: string,
    tabId: string,
    props: { color?: string | null; isPinned?: boolean }
  ): void

  protected abstract applyHeadlessSessionTabPropsToSnapshot(
    worktreeId: string,
    tabId: string,
    props: { color?: string | null; isPinned?: boolean }
  ): void

  protected abstract getMobileSessionTopLevelTabId(tab: RuntimeMobileSessionSnapshotTab): string

  protected abstract persistHeadlessTerminalPaneLayout(args: {
    tabId: string
    root: TerminalPaneLayoutNode | null
    expandedLeafId: string | null
    titlesByLeafId?: Record<string, string>
  }): void

  protected abstract applyHeadlessTerminalPaneLayoutToSnapshot(
    worktreeId: string,
    args: {
      tabId: string
      root: TerminalPaneLayoutNode | null
      expandedLeafId: string | null
      titlesByLeafId?: Record<string, string>
    }
  ): void

  protected abstract moveHeadlessMobileSessionTab(
    worktreeId: string,
    snapshot: RuntimeMobileSessionTabsSnapshot,
    move: RuntimeMobileSessionTabMove
  ): RuntimeMobileSessionTabMoveResult

  protected abstract splitHeadlessMobileSessionTabGroup(
    worktreeId: string,
    snapshot: RuntimeMobileSessionTabsSnapshot,
    move: Extract<RuntimeMobileSessionTabMove, { kind: 'split' }>
  ): RuntimeMobileSessionTabMoveResult

  protected abstract moveHeadlessMobileSessionTabToGroup(
    worktreeId: string,
    snapshot: RuntimeMobileSessionTabsSnapshot,
    move: Extract<RuntimeMobileSessionTabMove, { kind: 'move-to-group' }>
  ): RuntimeMobileSessionTabMoveResult

  protected abstract persistHeadlessTabGroups(
    worktreeId: string,
    groups: readonly RuntimeMobileSessionTabGroup[],
    layout: TabGroupLayoutNode
  ): void
}
