import { appendProjectGroupTree } from '../project-group-tree'
import { withRepoSectionDisplayLabels } from '../project-row-order'
import { buildOrderedWorktreeGroups } from '../worktree-group-collection'
import {
  appendUngroupedWorktrees,
  createWorktreeRowContext,
  getPinnedWorktreeDisplayPolicy
} from '../worktree-row-context'
import { appendOrderedGroups } from '../worktree-section-emission'
import type { BuildRowsOptions, Row } from './rows'

export { branchName } from '~renderer/source-control/branch-name'
export { getGroupKeyForWorktree, getGroupKeysForWorktree } from '../worktree-group-keys'
export {
  ALL_GROUP_KEY,
  ALL_GROUP_META,
  getLineageGroupKey,
  getLineageRenderInfo,
  getPRGroupKey,
  getProjectGroupHeaderKey,
  LINEAGE_GROUP_PREFIX,
  PINNED_GROUP_KEY,
  PINNED_GROUP_META,
  PR_GROUP_META,
  PR_GROUP_ORDER,
  PROJECT_GROUP_META
} from '../worktree-group-metadata'
export type { LineageRenderInfo, PRGroupKey } from '../worktree-group-metadata'
export type {
  BuildRowsOptions,
  FolderWorkspaceRow,
  GroupHeaderRow,
  ImportedWorktreesCardCandidate,
  ImportedWorktreesCardRow,
  NewExternalWorktreesInboxCandidate,
  NewExternalWorktreesInboxRow,
  PendingCreationRef,
  PendingCreationRow,
  PinnedWorktreeDisplayPolicy,
  ProjectGroupingModel,
  Row,
  WorktreeGroupBy,
  WorktreeRow
} from './rows'
export { getProjectHeaderRevealTarget } from '../worktree-project-grouping'
export type { ProjectHeaderRevealTarget } from '../worktree-project-grouping'
export { getPinnedWorktreeDisplayPolicy }

export function buildRows(options: BuildRowsOptions): Row[] {
  const context = createWorktreeRowContext(options)
  if (appendUngroupedWorktrees(context)) {
    return context.result
  }
  const orderedGroups = buildOrderedWorktreeGroups(context)
  if (appendProjectGroupTree(context, orderedGroups)) {
    return context.result
  }
  appendOrderedGroups(
    context,
    context.groupBy === 'repo' ? withRepoSectionDisplayLabels(orderedGroups) : orderedGroups
  )
  return context.result
}
