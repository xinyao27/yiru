import { useEffect, useMemo, useState } from 'react'

import type { SourceControlHostedReviewStateController } from './source-control-controller-hosted-review-state'
import type { GitStatusSourceControlTreeNode } from './source-control-directory-action-paths'
import { compareGitStatusEntries } from './source-control-empty-state'
import {
  filterSourceControlGroupedPathEntries,
  filterSourceControlPathEntries,
  getSourceControlFileFilterState
} from './source-control-file-filter'
import { SUBMODULE_EMPTY_LABEL, SUBMODULE_LOADING_LABEL } from './source-control-panel-constants'
import { deriveSourceControlPushRecovery } from './source-control-push-recovery'
import {
  buildSourceControlDisplaySections,
  SOURCE_CONTROL_AREAS,
  type SourceControlDisplaySectionId,
  type SourceControlEntryGroups
} from './source-control-section-order'
import {
  collectListSelectionEntries,
  injectExpandedSubmoduleEntries,
  injectExpandedSubmoduleRows,
  type RenderableSourceControlNode,
  type RenderableSubmoduleListItem
} from './source-control-submodule-expansion'
import {
  buildGitStatusSourceControlTree,
  buildSourceControlTree,
  applyGitStatusEntryAreasToSourceControlTree,
  compactSourceControlTree,
  flattenSourceControlTree,
  namespaceSourceControlTreeDirectoryKeys
} from './source-control-tree'
import type { FlatEntry } from './use-source-control-selection'

export function useSourceControlFileModel(scope: SourceControlHostedReviewStateController) {
  const {
    activeRemoteActionSequence,
    activeRepo,
    activeWorktreeId,
    branchEntries,
    branchName,
    collapsedSections,
    collapsedTreeDirs,
    enqueueGitHubPRRefresh,
    entries,
    expandedSubmoduleKeys,
    fallbackGitHubPRNumber,
    fetchHostedReviewForBranch,
    filterQuery,
    isBranchVisible,
    isFolder,
    linkedAzureDevOpsPR,
    linkedBitbucketPR,
    linkedGitHubPR,
    linkedGitLabMR,
    linkedGiteaPR,
    remoteActionError,
    sourceControlGroupOrder,
    sourceControlViewMode,
    submoduleStatusByKey,
    worktreePath
  } = scope
  useEffect(() => {
    if (
      !isBranchVisible ||
      !activeRepo ||
      isFolder ||
      !branchName ||
      branchName === 'HEAD' ||
      !activeWorktreeId
    ) {
      return
    }
    // Why: terminal checkouts must immediately refresh the displayed review;
    // retain a known number because fork/deleted-head branch lookup is lossy.
    void fetchHostedReviewForBranch(activeRepo.path, branchName, {
      repoId: activeRepo.id,
      linkedGitHubPR,
      fallbackGitHubPR: fallbackGitHubPRNumber,
      linkedGitLabMR,
      linkedBitbucketPR,
      linkedAzureDevOpsPR,
      linkedGiteaPR,
      staleWhileRevalidate: true
    })
    // Why: the GitHub-specific cache powers grouping/check panels; keep that
    // refresh behind the coordinator so Source Control does not bypass pacing.
    enqueueGitHubPRRefresh(activeWorktreeId, 'swr', 30)
  }, [
    activeRepo,
    activeWorktreeId,
    branchName,
    enqueueGitHubPRRefresh,
    fetchHostedReviewForBranch,
    isBranchVisible,
    isFolder,
    linkedGitHubPR,
    fallbackGitHubPRNumber,
    linkedGitLabMR,
    linkedBitbucketPR,
    linkedAzureDevOpsPR,
    linkedGiteaPR
  ])
  const grouped = useMemo(() => {
    const groups: SourceControlEntryGroups = { staged: [], unstaged: [], untracked: [] }
    for (const entry of entries) {
      groups[entry.area].push(entry)
    }
    for (const area of SOURCE_CONTROL_AREAS) {
      groups[area].sort(compareGitStatusEntries)
    }
    return groups
  }, [entries])
  const fileFilterState = useMemo(() => getSourceControlFileFilterState(filterQuery), [filterQuery])
  const normalizedFilter = fileFilterState.normalizedFilter
  const isGitHistoryVisible =
    !normalizedFilter &&
    !fileFilterState.tooLarge &&
    Boolean(activeWorktreeId && worktreePath && !isFolder)
  const filteredGrouped = useMemo(
    () => filterSourceControlGroupedPathEntries(grouped, fileFilterState),
    [fileFilterState, grouped]
  )
  const displaySections = useMemo(
    () => buildSourceControlDisplaySections(filteredGrouped, sourceControlGroupOrder),
    [filteredGrouped, sourceControlGroupOrder]
  )
  const unfilteredDisplaySections = useMemo(
    () => buildSourceControlDisplaySections(grouped, sourceControlGroupOrder),
    [grouped, sourceControlGroupOrder]
  )
  const unfilteredDisplaySectionsById = useMemo(
    () => new Map(unfilteredDisplaySections.map((section) => [section.id, section])),
    [unfilteredDisplaySections]
  )
  const filteredBranchEntries = useMemo(
    () => filterSourceControlPathEntries(branchEntries, fileFilterState),
    [branchEntries, fileFilterState]
  )
  const treeRootsBySection = useMemo(() => {
    const roots: Partial<Record<SourceControlDisplaySectionId, GitStatusSourceControlTreeNode[]>> =
      {}
    for (const section of displaySections) {
      const sectionRoots = compactSourceControlTree(
        buildGitStatusSourceControlTree(section.area, section.items)
      )
      roots[section.id] =
        section.id === 'conflicts'
          ? applyGitStatusEntryAreasToSourceControlTree(
              // Why: conflict rows can mirror normal paths, so their folder
              // collapse keys must not share state with normal area sections.
              namespaceSourceControlTreeDirectoryKeys(sectionRoots, 'conflicts')
            )
          : sectionRoots
    }
    return roots
  }, [displaySections])
  const visibleTreeRowsBySection = useMemo(() => {
    const rows: Partial<Record<SourceControlDisplaySectionId, RenderableSourceControlNode[]>> = {}
    for (const section of displaySections) {
      rows[section.id] = injectExpandedSubmoduleRows(
        flattenSourceControlTree(treeRootsBySection[section.id] ?? [], collapsedTreeDirs),
        expandedSubmoduleKeys,
        submoduleStatusByKey,
        SUBMODULE_LOADING_LABEL,
        SUBMODULE_EMPTY_LABEL
      )
    }
    return rows
  }, [
    collapsedTreeDirs,
    displaySections,
    treeRootsBySection,
    expandedSubmoduleKeys,
    submoduleStatusByKey
  ])
  const visibleListRowsBySection = useMemo(() => {
    const rows: Partial<Record<SourceControlDisplaySectionId, RenderableSubmoduleListItem[]>> = {}
    for (const section of displaySections) {
      rows[section.id] = injectExpandedSubmoduleEntries(
        section.items,
        expandedSubmoduleKeys,
        submoduleStatusByKey,
        SUBMODULE_LOADING_LABEL,
        SUBMODULE_EMPTY_LABEL
      )
    }
    return rows
  }, [displaySections, expandedSubmoduleKeys, submoduleStatusByKey])
  const branchTreeRoots = useMemo(
    () => compactSourceControlTree(buildSourceControlTree('branch', filteredBranchEntries)),
    [filteredBranchEntries]
  )
  const visibleBranchTreeRows = useMemo(
    () => flattenSourceControlTree(branchTreeRoots, collapsedTreeDirs),
    [branchTreeRoots, collapsedTreeDirs]
  )
  const visibleSelectionEntries = useMemo(() => {
    const arr: FlatEntry[] = []
    // Why: selection and open-key bookkeeping must use the same injected
    // submodule rows that list view renders.
    if (sourceControlViewMode === 'list') {
      for (const section of displaySections) {
        if (collapsedSections.has(section.id)) {
          continue
        }
        arr.push(...collectListSelectionEntries(visibleListRowsBySection[section.id] ?? []))
      }
      return arr
    }

    for (const section of displaySections) {
      if (collapsedSections.has(section.id)) {
        continue
      }
      for (const node of visibleTreeRowsBySection[section.id] ?? []) {
        if (node.type === 'file') {
          arr.push({ key: node.key, entry: node.entry, area: node.area })
        }
      }
    }
    return arr
  }, [
    collapsedSections,
    displaySections,
    sourceControlViewMode,
    visibleListRowsBySection,
    visibleTreeRowsBySection
  ])
  const [isExecutingBulk, setIsExecutingBulk] = useState(false)
  const unresolvedConflicts = useMemo(
    () => entries.filter((entry) => entry.conflictStatus === 'unresolved' && entry.conflictKind),
    [entries]
  )
  const unresolvedConflictReviewEntries = useMemo(
    () =>
      unresolvedConflicts.map((entry) => ({
        path: entry.path,
        conflictKind: entry.conflictKind!
      })),
    [unresolvedConflicts]
  )
  const pushRecovery = useMemo(
    () =>
      deriveSourceControlPushRecovery({
        actionError: remoteActionError,
        currentBranchName: branchName || null,
        currentSequence: activeRemoteActionSequence
      }),
    [activeRemoteActionSequence, branchName, remoteActionError]
  )
  return {
    ...scope,
    grouped,
    fileFilterState,
    normalizedFilter,
    isGitHistoryVisible,
    filteredGrouped,
    displaySections,
    unfilteredDisplaySections,
    unfilteredDisplaySectionsById,
    filteredBranchEntries,
    treeRootsBySection,
    visibleTreeRowsBySection,
    visibleListRowsBySection,
    branchTreeRoots,
    visibleBranchTreeRows,
    visibleSelectionEntries,
    isExecutingBulk,
    setIsExecutingBulk,
    unresolvedConflicts,
    unresolvedConflictReviewEntries,
    pushRecovery
  }
}

export type SourceControlFileModelController = ReturnType<typeof useSourceControlFileModel>
