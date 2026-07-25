import { useMemo } from 'react'

import {
  hasCmdJProjectSearchCandidates,
  searchCmdJProjectResults
} from '@/components/cmd-j/palette-project-results'
import { buildImportedWorktreesCardCandidates } from '@/components/sidebar/imported-worktrees-card-candidates'

import type { ProjectTargetPaletteItem } from './types'
import type { PaletteStoreState } from './use-palette-store-state'

type ProjectTargetItemsInput = Pick<
  PaletteStoreState,
  | 'allWorktrees'
  | 'repos'
  | 'worktreesByRepo'
  | 'detectedWorktreesByRepo'
  | 'pendingWorktreeCreations'
  | 'projectGroups'
  | 'projects'
  | 'projectHostSetups'
> & { hasQuery: boolean; deferredQuery: string }

// Why: project/group jump targets only search on a typed query — they're kept
// out of the empty-query switcher rows to keep that list a pure worktree list.
export function useProjectTargetItems(input: ProjectTargetItemsInput) {
  const {
    allWorktrees,
    repos,
    worktreesByRepo,
    detectedWorktreesByRepo,
    pendingWorktreeCreations,
    projectGroups,
    projects,
    projectHostSetups,
    hasQuery,
    deferredQuery
  } = input

  // Why: Cmd+J should only offer project jumps the sidebar can actually reveal;
  // archived-only repos are intentionally left out of this navigation surface.
  const renderableProjectRepoIds = useMemo(() => {
    const ids = new Set<string>()
    for (const worktree of allWorktrees) {
      if (!worktree.isArchived) {
        ids.add(worktree.repoId)
      }
    }
    for (const repo of repos) {
      if ((worktreesByRepo[repo.id]?.length ?? 0) === 0) {
        ids.add(repo.id)
      }
    }
    for (const repoId of buildImportedWorktreesCardCandidates({
      repos,
      detectedWorktreesByRepo
    }).keys()) {
      ids.add(repoId)
    }
    for (const creation of Object.values(pendingWorktreeCreations)) {
      ids.add(creation.request.repoId)
    }
    return ids
  }, [allWorktrees, detectedWorktreesByRepo, pendingWorktreeCreations, repos, worktreesByRepo])

  const hasAnyProjectSearchCandidates = useMemo(
    () =>
      hasCmdJProjectSearchCandidates({
        projectGroups,
        repos,
        projects,
        projectHostSetups,
        renderableRepoIds: renderableProjectRepoIds
      }),
    [projectGroups, projectHostSetups, projects, renderableProjectRepoIds, repos]
  )

  const projectTargetItems = useMemo<ProjectTargetPaletteItem[]>(
    () =>
      hasQuery
        ? searchCmdJProjectResults({
            query: deferredQuery,
            projectGroups,
            repos,
            projects,
            projectHostSetups,
            renderableRepoIds: renderableProjectRepoIds
          }).map((result) => ({
            id: result.id,
            type: 'project-target' as const,
            result
          }))
        : [],
    [
      deferredQuery,
      hasQuery,
      projectGroups,
      projectHostSetups,
      projects,
      renderableProjectRepoIds,
      repos
    ]
  )

  return { projectTargetItems, hasAnyProjectSearchCandidates }
}
