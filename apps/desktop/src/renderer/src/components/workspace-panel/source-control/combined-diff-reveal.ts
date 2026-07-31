import {
  COMBINED_DIFF_REVEAL_SECTION_EVENT,
  getCombinedDiffEntrySectionKey,
  type CombinedDiffRevealSectionRequest
} from '~renderer/components/editor/combined-diff/section-model'
import type { DiffSource, OpenFile } from '~renderer/components/editor/state'
import type { GitBranchChangeEntry, GitStatusEntry } from '~shared/types'

/** The branch-compare identity a `combined-branch` view must still be showing. */
export type CombinedDiffRevealCompare = {
  baseRef: string
  baseOid: string | null
  headOid: string | null
  mergeBase: string | null
}

export type CombinedDiffRevealRow =
  | { kind: 'uncommitted'; entry: GitStatusEntry }
  | { kind: 'branch'; entry: GitBranchChangeEntry; compare: CombinedDiffRevealCompare }

/** The subset of an open editor tab a reveal decision reads. */
export type CombinedDiffRevealOpenFile = Pick<
  OpenFile,
  | 'id'
  | 'mode'
  | 'worktreeId'
  | 'diffSource'
  | 'combinedAreaFilter'
  | 'branchCompare'
  | 'branchEntriesSnapshot'
  | 'uncommittedEntriesSnapshot'
  | 'skippedConflicts'
>

export type CombinedDiffRevealTarget = { fileId: string; tabId?: string }

type CombinedDiffSource =
  | 'combined-all'
  | 'combined-uncommitted'
  | 'combined-branch'
  | 'combined-commit'

/**
 * Decide whether a source-control row click can be answered by revealing the
 * row's section inside an already-open combined diff instead of opening a
 * dedicated single-file diff. Returns the open file to focus (plus the pane-group
 * tab that hosts it, when it is not the embedded workspace-panel editor), or
 * `null` when the caller must fall back to its normal open path.
 */
export function resolveCombinedDiffRevealTarget({
  worktreeId,
  row,
  openFiles,
  workspacePanelFileId,
  findGroupTabIdForFile
}: {
  worktreeId: string
  row: CombinedDiffRevealRow
  openFiles: readonly CombinedDiffRevealOpenFile[]
  workspacePanelFileId?: string
  findGroupTabIdForFile: (fileId: string) => string | null
}): CombinedDiffRevealTarget | null {
  // Why: conflict rows route to the conflict editor and are excluded from
  // combined sections entirely, so they must never be answered by a reveal.
  if (row.kind === 'uncommitted' && row.entry.conflictKind && row.entry.conflictStatus) {
    return null
  }
  const candidates = openFiles.filter(
    (file) =>
      file.worktreeId === worktreeId && file.mode === 'diff' && combinedViewContainsRow(file, row)
  )
  // Why: the embedded workspace-panel editor is the surface the user is looking
  // at while clicking, so it wins over a tab in the pane group.
  const embedded = workspacePanelFileId
    ? candidates.find((file) => file.id === workspacePanelFileId)
    : undefined
  if (embedded) {
    return { fileId: embedded.id }
  }
  for (const file of candidates) {
    const tabId = findGroupTabIdForFile(file.id)
    if (tabId) {
      return { fileId: file.id, tabId }
    }
  }
  return null
}

/**
 * Row key (`${area}::${path}`) the source-control list highlights after a
 * reveal, or `null` for rows the list does not highlight.
 */
export function toRevealedSourceControlRowKey(row: CombinedDiffRevealRow): string | null {
  if (row.kind !== 'uncommitted') {
    return null
  }
  // Why: combined-diff section keys separate area and path with one colon while
  // source-control row keys use two, so the highlight needs the converted form.
  const sectionKey = getCombinedDiffEntrySectionKey('uncommitted', row.entry)
  const separatorIndex = sectionKey.indexOf(':')
  if (separatorIndex === -1) {
    return null
  }
  return `${sectionKey.slice(0, separatorIndex)}::${sectionKey.slice(separatorIndex + 1)}`
}

export function dispatchCombinedDiffSectionReveal(
  row: CombinedDiffRevealRow,
  worktreeId: string
): void {
  const detail: CombinedDiffRevealSectionRequest = { worktreeId, entry: row.entry }
  window.dispatchEvent(new CustomEvent(COMBINED_DIFF_REVEAL_SECTION_EVENT, { detail }))
}

function combinedViewContainsRow(
  file: CombinedDiffRevealOpenFile,
  row: CombinedDiffRevealRow
): boolean {
  const source = toCombinedDiffSource(file.diffSource)
  if (source === null) {
    return false
  }
  if (file.skippedConflicts?.some((conflict) => conflict.path === row.entry.path) === true) {
    return false
  }
  switch (source) {
    case 'combined-all':
      return row.kind === 'uncommitted'
        ? hasUncommittedSection(file, row.entry)
        : file.branchCompare !== undefined && hasBranchSection(file, row.entry)
    case 'combined-uncommitted':
      return row.kind === 'uncommitted' && hasUncommittedSection(file, row.entry)
    case 'combined-branch':
      return (
        row.kind === 'branch' &&
        matchesBranchCompare(file, row.compare) &&
        hasBranchSection(file, row.entry)
      )
    // Why: commit section keys carry no commit oid, so a working-tree or
    // branch-compare row cannot be identified inside a commit view.
    case 'combined-commit':
      return false
  }
}

function toCombinedDiffSource(source: DiffSource | undefined): CombinedDiffSource | null {
  switch (source) {
    case 'combined-all':
    case 'combined-uncommitted':
    case 'combined-branch':
    case 'combined-commit':
      return source
    case 'unstaged':
    case 'staged':
    case 'branch':
    case 'commit':
    case undefined:
      return null
  }
}

function hasUncommittedSection(file: CombinedDiffRevealOpenFile, entry: GitStatusEntry): boolean {
  if (file.combinedAreaFilter !== undefined && file.combinedAreaFilter !== entry.area) {
    return false
  }
  return (
    file.uncommittedEntriesSnapshot?.some(
      (snapshot) => snapshot.area === entry.area && snapshot.path === entry.path
    ) === true
  )
}

function hasBranchSection(file: CombinedDiffRevealOpenFile, entry: GitBranchChangeEntry): boolean {
  return file.branchEntriesSnapshot?.some((snapshot) => snapshot.path === entry.path) === true
}

function matchesBranchCompare(
  file: CombinedDiffRevealOpenFile,
  compare: CombinedDiffRevealCompare
): boolean {
  const openCompare = file.branchCompare
  if (!openCompare) {
    return false
  }
  return (
    openCompare.baseRef === compare.baseRef &&
    openCompare.baseOid === compare.baseOid &&
    openCompare.headOid === compare.headOid &&
    openCompare.mergeBase === compare.mergeBase
  )
}
