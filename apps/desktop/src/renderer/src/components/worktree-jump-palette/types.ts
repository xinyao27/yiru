import type { CmdJProjectSearchResult } from '@/components/cmd-j/palette-project-results'
import type { CmdJActionResult, CmdJSettingsResult } from '@/components/cmd-j/palette-results'
import type { BrowserPaletteSearchResult } from '@/lib/browser-palette-search'
import type { SimulatorPaletteSearchResult } from '@/lib/simulator-palette-search'
import type { WorkspaceTabPaletteSearchResult } from '@/lib/workspace-tab-palette-search'
import type { CREATE_WORKTREE_ITEM_ID } from '@/lib/worktree-palette-create-action'
import type { PaletteSearchResult } from '@/lib/worktree-palette-search'

import type { Worktree } from '../../../../shared/types'

export type WorktreePaletteItem = {
  id: string
  type: 'worktree'
  match: PaletteSearchResult
  worktree: Worktree
}

export type BrowserPaletteItem = {
  id: string
  type: 'browser-page'
  result: BrowserPaletteSearchResult
}

export type SimulatorPaletteItem = {
  id: string
  type: 'simulator-tab'
  result: SimulatorPaletteSearchResult
}

export type WorkspaceTabPaletteItem = {
  id: string
  type: 'workspace-tab'
  result: WorkspaceTabPaletteSearchResult
}

export type SettingsPaletteItem = {
  id: string
  type: 'settings'
  result: CmdJSettingsResult
}

export type QuickActionPaletteItem = {
  id: string
  type: 'quick-action'
  result: CmdJActionResult
}

export type ProjectTargetPaletteItem = {
  id: string
  type: 'project-target'
  result: CmdJProjectSearchResult
}

export type SectionHeader = {
  id: string
  type: 'section-header'
  label: string
}

export type HintRow = {
  id: string
  type: 'hint'
  label: string
}

export type CreateWorktreePaletteItem = {
  id: typeof CREATE_WORKTREE_ITEM_ID
  type: 'create-worktree'
}

// Why: Cmd+J is a fast intent surface, not a dump of every setup button.
// Keep future quick actions curated; route one-time setup flows through Settings.
export type PaletteItem =
  | WorktreePaletteItem
  | ProjectTargetPaletteItem
  | SettingsPaletteItem
  | QuickActionPaletteItem
  | BrowserPaletteItem
  | SimulatorPaletteItem
  | WorkspaceTabPaletteItem

export type PaletteListEntry = PaletteItem | CreateWorktreePaletteItem | SectionHeader | HintRow
