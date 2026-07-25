import { useMemo } from 'react'

import { translate } from '@/i18n/i18n'
import {
  CREATE_WORKTREE_ITEM_ID,
  getWorktreePaletteCreateActionState,
  getWorktreePaletteSelectionItemIds
} from '@/lib/worktree-palette-create-action'

import type {
  PaletteItem,
  PaletteListEntry,
  ProjectTargetPaletteItem,
  QuickActionPaletteItem,
  SettingsPaletteItem,
  WorktreePaletteItem
} from './types'

type PaletteListInput = {
  hasQuery: boolean
  deferredQuery: string
  canCreateWorktree: boolean
  worktreeItems: WorktreePaletteItem[]
  projectTargetItems: ProjectTargetPaletteItem[]
  middleItems: (SettingsPaletteItem | QuickActionPaletteItem)[]
  openTabItems: PaletteItem[]
}

// Why: query mode can expose generated-size workspace/tab result lists.
// Avoid the function argument limit from `push(...source)`.
function appendPaletteListEntries(
  target: PaletteListEntry[],
  source: readonly PaletteItem[]
): void {
  for (const entry of source) {
    target.push(entry)
  }
}

// Why: on empty query we cap the worktree section (not open tabs) so the
// OPEN TABS header + ≥1 tab row stays visible above the fold — users
// with 30+ worktrees would otherwise never see open tabs. The cap is
// paired with a "Type to see all N worktrees" hint row so the full list is
// one keystroke away. Typing lifts both caps. Cap size is tied to the
// palette's max-h-[min(460px,62vh)] viewport math: ~60px/row, ~32px/header,
// leaves room for OPEN TABS header + one tab row at default window size.
// Revisit if row heights or max-h change.
const EMPTY_QUERY_WORKTREE_CAP = 5
const EMPTY_QUERY_OPEN_TAB_CAP = 5

// Why: assembling the final section order, headers, caps, and the flattened
// keyboard-selectable id list is one cohesive "how the list looks" concern —
// keeping it in one hook means the render layer just maps over listEntries.
export function usePaletteList(input: PaletteListInput) {
  const {
    hasQuery,
    deferredQuery,
    canCreateWorktree,
    worktreeItems,
    projectTargetItems,
    middleItems,
    openTabItems
  } = input

  const paletteSections = useMemo(() => {
    // Why: the worktree cap only earns its keep when there are open tabs to
    // protect above-the-fold. With zero open tabs, capping would force
    // the user to type for no reason — uncap so the recent list fills the
    // viewport naturally.
    const worktreeCap = !hasQuery && openTabItems.length > 0 ? EMPTY_QUERY_WORKTREE_CAP : Infinity
    const visibleWorktreeItems = hasQuery ? worktreeItems : worktreeItems.slice(0, worktreeCap)
    const visibleProjectTargetItems = hasQuery ? projectTargetItems : []
    const visibleMiddleItems = hasQuery ? middleItems : []
    const visibleOpenTabItems = hasQuery
      ? openTabItems
      : openTabItems.slice(0, EMPTY_QUERY_OPEN_TAB_CAP)
    const showWorktreeHint = !hasQuery && worktreeItems.length > worktreeCap

    return {
      visibleWorktreeItems,
      visibleProjectTargetItems,
      visibleMiddleItems,
      visibleOpenTabItems,
      showWorktreeHint
    }
  }, [worktreeItems, projectTargetItems, middleItems, openTabItems, hasQuery])

  const selectableItems = useMemo<PaletteItem[]>(
    () => [
      ...paletteSections.visibleWorktreeItems,
      ...paletteSections.visibleProjectTargetItems,
      ...paletteSections.visibleMiddleItems,
      ...paletteSections.visibleOpenTabItems
    ],
    [paletteSections]
  )

  const { createWorktreeName, showCreateAction } = useMemo(
    () =>
      getWorktreePaletteCreateActionState({
        canCreateWorktree,
        query: deferredQuery
      }),
    [canCreateWorktree, deferredQuery]
  )

  const listEntries = useMemo<PaletteListEntry[]>(() => {
    const entries: PaletteListEntry[] = []
    const {
      visibleWorktreeItems,
      visibleProjectTargetItems,
      visibleMiddleItems,
      visibleOpenTabItems,
      showWorktreeHint
    } = paletteSections
    const visibleWorkspaceItemCount = visibleWorktreeItems.length + (showCreateAction ? 1 : 0)
    const populatedSectionCount = [
      visibleWorkspaceItemCount,
      visibleProjectTargetItems.length,
      visibleMiddleItems.length,
      visibleOpenTabItems.length
    ].filter((count) => count > 0).length

    // Header rule: on empty query each section is categorically distinct
    // (worktrees vs. open tabs), so a lone header is a useful signpost. On query,
    // suppress headers unless both sections are populated — otherwise a lone
    // header above one list is noise.
    const showWorktreeHeader = hasQuery
      ? visibleWorkspaceItemCount > 0 && populatedSectionCount > 1
      : visibleWorktreeItems.length > 0
    const showOpenTabsHeader = hasQuery
      ? visibleOpenTabItems.length > 0 && populatedSectionCount > 1
      : visibleOpenTabItems.length > 0
    const showProjectTargetHeader =
      hasQuery && visibleProjectTargetItems.length > 0 && populatedSectionCount > 1
    const showMiddleHeader = hasQuery && visibleMiddleItems.length > 0 && populatedSectionCount > 1

    if (visibleWorkspaceItemCount > 0) {
      if (showWorktreeHeader) {
        entries.push({
          id: '__header_worktrees__',
          type: 'section-header',
          label: hasQuery
            ? translate('auto.components.WorktreeJumpPalette.worktreesHeader', 'Worktrees')
            : translate(
                'auto.components.WorktreeJumpPalette.recentWorktreesHeader',
                'Recent Worktrees'
              )
        })
      }
      appendPaletteListEntries(entries, visibleWorktreeItems)
      if (showWorktreeHint) {
        entries.push({
          id: '__hint_worktree_cap__',
          type: 'hint',
          label: translate(
            'auto.components.WorktreeJumpPalette.dabd819ca1',
            'Type to see all {{value0}} worktrees',
            { value0: worktreeItems.length }
          )
        })
      }
    }
    if (visibleProjectTargetItems.length > 0) {
      if (showProjectTargetHeader) {
        entries.push({
          id: '__header_projects_groups__',
          type: 'section-header',
          label: translate(
            'auto.components.WorktreeJumpPalette.projectsGroupsHeader',
            'Projects & Groups'
          )
        })
      }
      appendPaletteListEntries(entries, visibleProjectTargetItems)
    }
    if (showCreateAction) {
      // Why: project/group jump targets are navigation results; keep them
      // directly after worktree matches before the creation fallback.
      entries.push({ id: CREATE_WORKTREE_ITEM_ID, type: 'create-worktree' })
    }
    if (visibleMiddleItems.length > 0) {
      if (showMiddleHeader) {
        entries.push({
          id: '__header_actions_settings__',
          type: 'section-header',
          label: translate('auto.components.WorktreeJumpPalette.088d66d980', 'Actions & Settings')
        })
      }
      appendPaletteListEntries(entries, visibleMiddleItems)
    }
    if (visibleOpenTabItems.length > 0) {
      if (showOpenTabsHeader) {
        entries.push({
          id: '__header_open_tabs__',
          type: 'section-header',
          label: translate('auto.components.WorktreeJumpPalette.50a1d11d5b', 'Open Tabs')
        })
      }
      appendPaletteListEntries(entries, visibleOpenTabItems)
    }
    return entries
  }, [hasQuery, paletteSections, showCreateAction, worktreeItems.length])

  const selectionItemIds = useMemo(
    () => getWorktreePaletteSelectionItemIds(listEntries),
    [listEntries]
  )

  return { selectableItems, createWorktreeName, showCreateAction, listEntries, selectionItemIds }
}
