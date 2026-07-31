import { useMemo } from 'react'
import { buildWorktreeChecksReviewIndex } from '~renderer/components/cmd-j/worktree-checks-review-index'
import { sortWorktreesSmart } from '~renderer/components/sidebar/smart-sort'
import {
  isAutomationGeneratedWorkspace,
  isDefaultBranchWorkspace
} from '~renderer/components/sidebar/visible-worktrees'
import { orderEmptyQueryWorktrees } from '~renderer/components/worktree-jump-palette/order-empty-query-worktrees'
import {
  getWorktreePaletteSearchScope,
  searchWorktrees
} from '~renderer/components/worktree-jump-palette/worktree-palette-search'
import { getWorkspacePortsByWorktreeId } from '~renderer/lib/workspace-port-groups'
import {
  getLiveAgentStatusByWorktreeId,
  isInactiveWorkspace
} from '~renderer/lib/worktree-activity-state'
import type { Worktree } from '~shared/types'

import type { WorktreePaletteItem } from './types'
import type { PaletteHostOptionsResult } from './use-palette-host-options'
import type { PaletteStoreState } from './use-palette-store-state'

type WorktreeSearchInput = Pick<
  PaletteStoreState,
  | 'settings'
  | 'worktreesByRepo'
  | 'agentStatusEpoch'
  | 'agentStatusByPaneKey'
  | 'tabsByWorktree'
  | 'allWorktrees'
  | 'hideDefaultBranchWorkspace'
  | 'hideAutomationGeneratedWorkspaces'
  | 'showSleepingWorkspaces'
  | 'ptyIdsByTabId'
  | 'browserTabsByWorktree'
  | 'activeWorktreeId'
  | 'lastVisitedAtByWorktreeId'
  | 'runtimePaneTitlesByTabId'
  | 'migrationUnsupportedByPtyId'
  | 'terminalLayoutsByTabId'
  | 'prCache'
  | 'hostedReviewCache'
  | 'workspacePortScan'
> &
  Pick<PaletteHostOptionsResult, 'repoMap' | 'repoByHostIdentity' | 'canCreateWorktree'> & {
    hasQuery: boolean
    deferredQuery: string
  }

// Why: the worktree side of the jump palette — filtering, empty-query ordering,
// smart-sort ranking, and search matching — is one cohesive pipeline; keeping it
// in its own hook lets the render layer stay a pure function of the result.
export function useWorktreeSearch(input: WorktreeSearchInput) {
  const {
    settings,
    worktreesByRepo,
    agentStatusEpoch,
    agentStatusByPaneKey,
    tabsByWorktree,
    allWorktrees,
    hideDefaultBranchWorkspace,
    hideAutomationGeneratedWorkspaces,
    showSleepingWorkspaces,
    ptyIdsByTabId,
    browserTabsByWorktree,
    activeWorktreeId,
    lastVisitedAtByWorktreeId,
    runtimePaneTitlesByTabId,
    migrationUnsupportedByPtyId,
    terminalLayoutsByTabId,
    prCache,
    hostedReviewCache,
    workspacePortScan,
    repoMap,
    repoByHostIdentity,
    canCreateWorktree,
    hasQuery,
    deferredQuery
  } = input

  const isLoading = canCreateWorktree && Object.keys(worktreesByRepo).length === 0

  // Why: keep running-agent workspaces visible under "Hide sleeping" even when
  // their live PTY is momentarily absent, matching the sidebar filter. #7197
  const liveAgentActivity = useMemo(() => {
    void agentStatusEpoch
    const statusByWorktreeId = getLiveAgentStatusByWorktreeId(
      agentStatusByPaneKey,
      tabsByWorktree,
      Date.now()
    )
    return { statusByWorktreeId, worktreeIds: new Set(statusByWorktreeId.keys()) }
  }, [agentStatusByPaneKey, agentStatusEpoch, tabsByWorktree])
  const worktreeIdsWithLiveAgent = liveAgentActivity.worktreeIds

  // Why: the empty-query palette mirrors sidebar filters so opening Search
  // starts from the same quiet list. Typed search switches to the global
  // non-archived scope below.
  const emptyQueryVisibleWorktrees = useMemo(
    () =>
      allWorktrees.filter((worktree) => {
        if (worktree.isArchived) {
          return false
        }
        if (hideDefaultBranchWorkspace && isDefaultBranchWorkspace(worktree)) {
          return false
        }
        if (hideAutomationGeneratedWorkspaces && isAutomationGeneratedWorkspace(worktree)) {
          return false
        }
        if (
          !showSleepingWorkspaces &&
          isInactiveWorkspace(
            worktree.id,
            tabsByWorktree,
            ptyIdsByTabId,
            browserTabsByWorktree,
            worktreeIdsWithLiveAgent
          )
        ) {
          return false
        }
        return true
      }),
    [
      allWorktrees,
      browserTabsByWorktree,
      hideAutomationGeneratedWorkspaces,
      hideDefaultBranchWorkspace,
      ptyIdsByTabId,
      showSleepingWorkspaces,
      tabsByWorktree,
      worktreeIdsWithLiveAgent
    ]
  )

  // Why: empty-query rows use focus-recency (lastVisitedAtByWorktreeId) with
  // lastActivityAt fallback so SSH / quiet worktrees don't get pushed below
  // the fold by noisy local worktrees. Current worktree is excluded from the
  // empty-query rows per product model (Cmd+J is a switch surface, not a
  // "show me everything" surface), but kept in visibleWorktreesForState so
  // empty-state/loading logic remains unaffected.
  // See docs/cmd-j-empty-query-ordering.md.
  const { visibleWorktreesForState, switchableWorktreesForRows } = useMemo(
    () =>
      orderEmptyQueryWorktrees({
        visibleWorktrees: emptyQueryVisibleWorktrees,
        activeWorktreeId,
        lastVisitedAtByWorktreeId
      }),
    [emptyQueryVisibleWorktrees, activeWorktreeId, lastVisitedAtByWorktreeId]
  )

  const searchScopeWorktrees = useMemo(
    () =>
      getWorktreePaletteSearchScope({
        hasQuery,
        allWorktrees,
        emptyQueryWorktrees: switchableWorktreesForRows
      }),
    [allWorktrees, hasQuery, switchableWorktreesForRows]
  )

  // Why: typed queries still route through sortWorktreesSmart — switcher
  // ranking only diverges from smart-sort on the empty-query branch.
  const sortedWorktrees = useMemo(
    () =>
      hasQuery
        ? sortWorktreesSmart(
            searchScopeWorktrees,
            tabsByWorktree,
            repoMap,
            agentStatusByPaneKey,
            runtimePaneTitlesByTabId,
            ptyIdsByTabId,
            migrationUnsupportedByPtyId,
            terminalLayoutsByTabId
          )
        : searchScopeWorktrees,
    [
      hasQuery,
      searchScopeWorktrees,
      tabsByWorktree,
      repoMap,
      agentStatusByPaneKey,
      runtimePaneTitlesByTabId,
      ptyIdsByTabId,
      migrationUnsupportedByPtyId,
      terminalLayoutsByTabId
    ]
  )

  const browserSortedWorktrees = useMemo(() => {
    // Why: browser-tab search is explicitly cross-worktree, so it must keep
    // indexing live browser pages even when their owning worktree is archived
    // or hidden by the default-branch-workspace setting. A user who opened a
    // tab on the default-branch worktree before toggling hide-on should still
    // be able to Cmd+J back to it — the setting hides the *workspace row*,
    // not the browser tabs that live inside it.
    return sortWorktreesSmart(
      allWorktrees,
      tabsByWorktree,
      repoMap,
      agentStatusByPaneKey,
      runtimePaneTitlesByTabId,
      ptyIdsByTabId,
      migrationUnsupportedByPtyId,
      terminalLayoutsByTabId
    )
  }, [
    allWorktrees,
    tabsByWorktree,
    repoMap,
    agentStatusByPaneKey,
    runtimePaneTitlesByTabId,
    ptyIdsByTabId,
    migrationUnsupportedByPtyId,
    terminalLayoutsByTabId
  ])

  // Why: browser rows need worktree lookups for repo badge colors, and browser
  // search intentionally includes archived worktrees. This map must cover all
  // worktrees, not just the non-archived sortedWorktrees used for the Worktrees scope.
  const worktreeMap = useMemo(() => {
    const map = new Map<string, Worktree>()
    for (const worktree of browserSortedWorktrees) {
      map.set(worktree.id, worktree)
    }
    return map
  }, [browserSortedWorktrees])

  const worktreeOrder = useMemo(
    () => new Map(browserSortedWorktrees.map((worktree, index) => [worktree.id, index])),
    [browserSortedWorktrees]
  )

  const checksReviewByWorktree = useMemo(
    () =>
      buildWorktreeChecksReviewIndex({
        worktrees: allWorktrees,
        repoByHostIdentity,
        prCache,
        hostedReviewCache,
        settings
      }),
    [allWorktrees, hostedReviewCache, prCache, repoByHostIdentity, settings]
  )

  const worktreeMatches = useMemo(
    () =>
      searchWorktrees(
        sortedWorktrees,
        deferredQuery.trim(),
        repoMap,
        prCache,

        getWorkspacePortsByWorktreeId(workspacePortScan),
        checksReviewByWorktree
      ),
    [sortedWorktrees, deferredQuery, repoMap, prCache, workspacePortScan, checksReviewByWorktree]
  )

  const worktreeItems = useMemo<WorktreePaletteItem[]>(
    () =>
      worktreeMatches
        .map((match) => {
          const worktree = worktreeMap.get(match.worktreeId)
          if (!worktree) {
            return null
          }
          return {
            id: `worktree:${worktree.id}`,
            type: 'worktree' as const,
            match,
            worktree
          }
        })
        .filter((item): item is WorktreePaletteItem => item !== null),
    [worktreeMap, worktreeMatches]
  )

  // Why: empty-state / "has any worktrees?" uses the full visible list
  // (including current) so the palette never claims to be empty just
  // because the only visible worktree is the currently active one.
  // See docs/cmd-j-empty-query-ordering.md.
  const hasAnyWorktrees = visibleWorktreesForState.length > 0
  const hasAnySearchableWorktrees = hasQuery ? searchScopeWorktrees.length > 0 : hasAnyWorktrees

  return {
    isLoading,
    liveAgentStatusByWorktreeId: liveAgentActivity.statusByWorktreeId,
    browserSortedWorktrees,
    worktreeMap,
    worktreeOrder,
    worktreeItems,
    hasAnyWorktrees,
    hasAnySearchableWorktrees
  }
}

export type WorktreeSearchResult = ReturnType<typeof useWorktreeSearch>
