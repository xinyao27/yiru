import { useMemo } from 'react'

import { searchBrowserPages, type SearchableBrowserPage } from '@/lib/browser-palette-search'
import {
  buildSearchableSimulatorTabs,
  searchSimulatorTabs,
  type SearchableSimulatorTab
} from '@/lib/simulator-palette-search'
import {
  buildSearchableWorkspaceTabs,
  searchWorkspaceTabs,
  type SearchableWorkspaceTab
} from '@/lib/workspace-tab-palette-search'

import type { BrowserPaletteItem, SimulatorPaletteItem, WorkspaceTabPaletteItem } from './types'
import type { PaletteHostOptionsResult } from './use-palette-host-options'
import type { PaletteStoreState } from './use-palette-store-state'
import type { WorktreeSearchResult } from './use-worktree-search'

type OpenTabsSearchInput = Pick<
  PaletteStoreState,
  | 'browserTabsByWorktree'
  | 'browserPagesByWorkspace'
  | 'activeTabType'
  | 'activeBrowserTabId'
  | 'activeWorktreeId'
  | 'unifiedTabsByWorktree'
  | 'activeGroupIdByWorktree'
  | 'groupsByWorktree'
  | 'tabsByWorktree'
  | 'openFiles'
  | 'agentStatusByPaneKey'
  | 'retainedAgentsByPaneKey'
  | 'sleepingAgentSessionsByPaneKey'
  | 'activeTabId'
  | 'activeTabIdByWorktree'
  | 'activeFileId'
  | 'activeFileIdByWorktree'
  | 'activeTabTypeByWorktree'
  | 'settings'
> &
  Pick<PaletteHostOptionsResult, 'repoMap'> &
  Pick<WorktreeSearchResult, 'worktreeOrder' | 'browserSortedWorktrees'> & {
    deferredQuery: string
  }

// Why: browser tabs, simulator tabs, and workspace (editor/terminal) tabs are
// all "open tab" results ranked into one OPEN TABS section — building and
// searching all three together keeps that cross-source ranking in one place.
export function useOpenTabsSearch(input: OpenTabsSearchInput) {
  const {
    browserSortedWorktrees,
    repoMap,
    worktreeOrder,
    browserTabsByWorktree,
    browserPagesByWorkspace,
    activeTabType,
    activeBrowserTabId,
    activeWorktreeId,
    deferredQuery,
    unifiedTabsByWorktree,
    activeGroupIdByWorktree,
    groupsByWorktree,
    tabsByWorktree,
    openFiles,
    agentStatusByPaneKey,
    retainedAgentsByPaneKey,
    sleepingAgentSessionsByPaneKey,
    activeTabId,
    activeTabIdByWorktree,
    activeFileId,
    activeFileIdByWorktree,
    activeTabTypeByWorktree,
    settings
  } = input

  const browserPageEntries = useMemo<SearchableBrowserPage[]>(() => {
    const entries: SearchableBrowserPage[] = []
    for (const worktree of browserSortedWorktrees) {
      const repoName = repoMap.get(worktree.repoId)?.displayName ?? ''
      const worktreeSortIndex = worktreeOrder.get(worktree.id) ?? Number.MAX_SAFE_INTEGER
      const workspaces = browserTabsByWorktree[worktree.id] ?? []
      for (const workspace of workspaces) {
        const pages = browserPagesByWorkspace[workspace.id] ?? []
        for (const page of pages) {
          entries.push({
            page,
            workspace,
            worktree,
            repoName,
            worktreeSortIndex,
            isCurrentPage:
              activeTabType === 'browser' &&
              workspace.id === activeBrowserTabId &&
              workspace.activePageId === page.id,
            isCurrentWorktree: activeWorktreeId === worktree.id
          })
        }
      }
    }
    return entries
  }, [
    activeBrowserTabId,
    activeTabType,
    activeWorktreeId,
    browserPagesByWorkspace,
    browserTabsByWorktree,
    browserSortedWorktrees,
    repoMap,
    worktreeOrder
  ])

  const browserMatches = useMemo(
    () => searchBrowserPages(browserPageEntries, deferredQuery.trim()),
    [browserPageEntries, deferredQuery]
  )

  const simulatorTabEntries = useMemo<SearchableSimulatorTab[]>(() => {
    return buildSearchableSimulatorTabs({
      worktrees: browserSortedWorktrees,
      repoMap,
      worktreeOrder,
      unifiedTabsByWorktree,
      activeGroupIdByWorktree,
      groupsByWorktree,
      activeWorktreeId,
      activeTabType
    })
  }, [
    activeGroupIdByWorktree,
    activeTabType,
    activeWorktreeId,
    browserSortedWorktrees,
    groupsByWorktree,
    repoMap,
    unifiedTabsByWorktree,
    worktreeOrder
  ])

  const simulatorMatches = useMemo(
    () => searchSimulatorTabs(simulatorTabEntries, deferredQuery.trim()),
    [simulatorTabEntries, deferredQuery]
  )

  const workspaceTabEntries = useMemo<SearchableWorkspaceTab[]>(() => {
    return buildSearchableWorkspaceTabs({
      worktrees: browserSortedWorktrees,
      repoMap,
      worktreeOrder,
      unifiedTabsByWorktree,
      tabsByWorktree,
      openFiles,
      agentStatusByPaneKey,
      retainedAgentsByPaneKey,
      sleepingAgentSessionsByPaneKey,
      activeGroupIdByWorktree,
      groupsByWorktree,
      activeWorktreeId,
      activeTabType,
      activeTabId,
      activeTabIdByWorktree,
      activeFileId,
      activeFileIdByWorktree,
      activeTabTypeByWorktree,
      generatedTitlesEnabled: settings?.tabAutoGenerateTitle === true
    })
  }, [
    activeFileId,
    activeFileIdByWorktree,
    activeGroupIdByWorktree,
    activeTabId,
    activeTabIdByWorktree,
    activeTabType,
    activeTabTypeByWorktree,
    activeWorktreeId,
    agentStatusByPaneKey,
    browserSortedWorktrees,
    groupsByWorktree,
    openFiles,
    repoMap,
    retainedAgentsByPaneKey,
    settings?.tabAutoGenerateTitle,
    sleepingAgentSessionsByPaneKey,
    tabsByWorktree,
    unifiedTabsByWorktree,
    worktreeOrder
  ])

  const workspaceTabMatches = useMemo(
    () => searchWorkspaceTabs(workspaceTabEntries, deferredQuery.trim()),
    [workspaceTabEntries, deferredQuery]
  )

  const browserItems = useMemo<BrowserPaletteItem[]>(
    () =>
      browserMatches.map((result) => ({
        id: `browser-page:${result.pageId}`,
        type: 'browser-page' as const,
        result
      })),
    [browserMatches]
  )

  const simulatorItems = useMemo<SimulatorPaletteItem[]>(
    () =>
      simulatorMatches.map((result) => ({
        id: `simulator-tab:${result.tabId}`,
        type: 'simulator-tab' as const,
        result
      })),
    [simulatorMatches]
  )

  const workspaceTabItems = useMemo<WorkspaceTabPaletteItem[]>(
    () =>
      workspaceTabMatches.map((result) => ({
        id: `workspace-tab:${result.tabId}`,
        type: 'workspace-tab' as const,
        result
      })),
    [workspaceTabMatches]
  )

  const openTabItems = useMemo<
    (BrowserPaletteItem | SimulatorPaletteItem | WorkspaceTabPaletteItem)[]
  >(
    () =>
      // Why: these result builders emit comparable ascending scores, so one sort
      // keeps cross-source ranking consistent within the OPEN TABS section.
      [...browserItems, ...simulatorItems, ...workspaceTabItems].sort((a, b) => {
        if (a.result.score !== b.result.score) {
          return a.result.score - b.result.score
        }
        return a.id.localeCompare(b.id)
      }),
    [browserItems, simulatorItems, workspaceTabItems]
  )

  const hasAnyOpenTabs =
    browserPageEntries.length > 0 ||
    simulatorTabEntries.length > 0 ||
    workspaceTabEntries.length > 0

  return { openTabItems, hasAnyOpenTabs }
}
