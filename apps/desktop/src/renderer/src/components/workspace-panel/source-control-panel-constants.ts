import type { GitBranchChangeEntry, GitStatusEntry } from '../../../../shared/types'
import type { GitHistoryPanelState } from './git-history-panel'
import type { SourceControlSectionArea } from './source-control-section-order'

export const EMPTY_GIT_STATUS_ENTRIES: GitStatusEntry[] = []
export const EMPTY_BRANCH_CHANGE_ENTRIES: GitBranchChangeEntry[] = []

export const SECTION_LABELS: Record<SourceControlSectionArea, { key: string; fallback: string }> = {
  staged: {
    key: 'auto.components.right.sidebar.SourceControl.48a003c1b1',
    fallback: 'Staged Changes'
  },
  unstaged: {
    key: 'auto.components.right.sidebar.SourceControl.d4ef4bafc5',
    fallback: 'Changes'
  },
  untracked: {
    key: 'auto.components.right.sidebar.SourceControl.522f44dce5',
    fallback: 'Untracked Files'
  }
}

export const CONFLICTS_SECTION_LABEL = {
  key: 'auto.components.right.sidebar.SourceControl.conflictsSection',
  fallback: 'Conflicts'
}

// Why: explicit mutation paths refresh immediately; polling can stay conservative.
export const BRANCH_REFRESH_INTERVAL_MS = 30_000

// Why: tooltip triggers must remain measurable while row actions fade in.
export const SOURCE_CONTROL_ROW_ACTION_OVERLAY_CLASS =
  'absolute right-0 top-0 bottom-0 flex shrink-0 items-center gap-1.5 bg-accent pr-3 pl-2 opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto'

export const SOURCE_CONTROL_TREE_INDENT_PX = 12
export const SOURCE_CONTROL_TREE_DIRECTORY_PADDING_PX = 8
export const SOURCE_CONTROL_TREE_FILE_PADDING_PX = 20
export const EMPTY_GIT_HISTORY_STATE: GitHistoryPanelState = { status: 'idle' }
export const SUBMODULE_WORKTREE_ONLY_LABEL = 'Stage inside submodule'
export const SUBMODULE_WORKTREE_ONLY_TOOLTIP =
  'The parent repo (including Stage All) cannot stage file changes inside a submodule'
export const SUBMODULE_LOADING_LABEL = 'Loading submodule changes…'
export const SUBMODULE_EMPTY_LABEL = 'No changes in submodule'
export const SUBMODULE_ERROR_LABEL = 'Failed to load submodule changes'

const DEFAULT_COLLAPSED_SECTIONS = ['history'] as const

export function createDefaultCollapsedSections(): Set<string> {
  return new Set(DEFAULT_COLLAPSED_SECTIONS)
}
