import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { CaretDown as ChevronDown, CaretRight as ChevronRight } from '~renderer/icons/hugeicons'
import { useWorktreeMap } from '~renderer/store/selectors'
import { Button } from '~renderer/ui/button'

import type {
  UnifiedProjectGroup,
  UnifiedSessionRow,
  UnifiedWorktreeRow
} from './resource-usage-merge-types'
import {
  MetricPair,
  ROW_TRAILING_GUTTER_CLS,
  sortProjectGroups,
  sortWorktrees,
  type SortOption
} from './resource-usage-metrics'
import { WorktreeRow } from './resource-usage-rows'

export function ResourceTree({
  repos,
  sortOption,
  collapsedRepos,
  toggleRepo,
  collapsedWorktrees,
  activeWorktreeId,
  toggleWorktree,
  navigateToWorktree,
  navigateToTab,
  onDelete,
  onKillSession
}: {
  repos: UnifiedProjectGroup[]
  sortOption: SortOption
  collapsedRepos: Set<string>
  toggleRepo: (repoId: string) => void
  collapsedWorktrees: Set<string>
  activeWorktreeId: string | null
  toggleWorktree: (worktreeId: string) => void
  navigateToWorktree: (worktreeId: string) => void
  navigateToTab: (tabId: string, paneKey: string | null) => void
  onDelete: (worktreeId: string) => void
  onKillSession: (session: UnifiedSessionRow) => void
}): React.JSX.Element {
  const worktreeById = useWorktreeMap()

  const sortedRepos = (() => {
    const grouped = sortProjectGroups(repos, sortOption)
    return grouped.map((repo) => ({
      ...repo,
      worktrees: sortWorktrees(repo.worktrees, sortOption)
    }))
  })()

  const renderWorktree = (wt: UnifiedWorktreeRow): React.JSX.Element => {
    const storeRecord = worktreeById.get(wt.worktreeId) ?? null
    return (
      <WorktreeRow
        key={wt.worktreeId}
        worktree={wt}
        storeRecord={storeRecord}
        activeWorktreeId={activeWorktreeId}
        isCollapsed={collapsedWorktrees.has(wt.worktreeId)}
        onToggle={() => toggleWorktree(wt.worktreeId)}
        onNavigate={() => navigateToWorktree(wt.worktreeId)}
        onDelete={() => onDelete(wt.worktreeId)}
        onKillSession={onKillSession}
        navigateToTab={navigateToTab}
      />
    )
  }

  if (sortedRepos.length === 1) {
    return <>{sortedRepos[0].worktrees.map(renderWorktree)}</>
  }

  return (
    <>
      {sortedRepos.map((group) => {
        const repoCollapsed = collapsedRepos.has(group.repoId)
        return (
          <div key={group.repoId} className="border-border/50 border-b last:border-b-0">
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="xs"
                type="button"
                onClick={() => toggleRepo(group.repoId)}
                className="hover:bg-muted/50 focus-visible:bg-muted/50 h-auto gap-0 border-0 py-2 pr-0.5 pl-2 font-normal transition-colors"
                aria-label={
                  repoCollapsed
                    ? translate(
                        'auto.components.status.bar.ResourceUsageStatusSegment.b12e31dfcb',
                        'Expand repo'
                      )
                    : translate(
                        'auto.components.status.bar.ResourceUsageStatusSegment.73a3fd68a9',
                        'Collapse repo'
                      )
                }
              >
                {repoCollapsed ? (
                  <ChevronRight className="text-muted-foreground h-3 w-3" />
                ) : (
                  <ChevronDown className="text-muted-foreground h-3 w-3" />
                )}
              </Button>
              <div className="flex min-w-0 flex-1 items-center justify-between gap-2 py-2 pr-3">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="text-muted-foreground truncate text-[11px] font-semibold tracking-wide uppercase">
                    {group.repoName}
                  </span>
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <MetricPair cpu={group.cpu} memory={group.memory} />
                  <span className={ROW_TRAILING_GUTTER_CLS} aria-hidden />
                </div>
              </div>
            </div>

            {!repoCollapsed && (
              <div className="border-border/30 border-t">{group.worktrees.map(renderWorktree)}</div>
            )}
          </div>
        )
      })}
    </>
  )
}
