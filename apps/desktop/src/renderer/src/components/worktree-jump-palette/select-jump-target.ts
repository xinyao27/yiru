import type React from 'react'
import { useCallback } from 'react'
import { toast } from 'sonner'

import {
  isBlankBrowserUrl,
  type BrowserPaletteSearchResult
} from '@/components/worktree-jump-palette/browser-palette-search'
import type { SimulatorPaletteSearchResult } from '@/components/worktree-jump-palette/simulator-palette-search'
import { activateWorkspaceTabPaletteResult } from '@/components/worktree-jump-palette/workspace-tab-palette-activation'
import type { WorkspaceTabPaletteSearchResult } from '@/components/worktree-jump-palette/workspace-tab-palette-search'
import { translate } from '@/i18n/i18n'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { useAppStore } from '@/store'
import { findWorktreeById } from '@/store/slices/worktree-helpers'

import type { BrowserPage, BrowserWorkspace, Worktree } from '../../../../shared/types'
import type { PaletteStoreState } from './use-palette-store-state'

type BrowserSelection = {
  worktree: Worktree
  workspace: BrowserWorkspace
  page: BrowserPage
}

function findBrowserSelection(
  pageId: string,
  workspaceId: string,
  worktreeId: string
): BrowserSelection | null {
  const state = useAppStore.getState()
  const page = (state.browserPagesByWorkspace[workspaceId] ?? []).find((p) => p.id === pageId)
  if (!page) {
    return null
  }
  const workspace = (state.browserTabsByWorktree[worktreeId] ?? []).find(
    (w) => w.id === workspaceId
  )
  if (!workspace) {
    return null
  }
  const worktree = findWorktreeById(state.worktreesByRepo, worktreeId)
  if (!worktree) {
    return null
  }
  return { page, workspace, worktree }
}

type SelectJumpTargetInput = Pick<PaletteStoreState, 'closeModal' | 'recordFeatureInteraction'> & {
  focusFallbackSurface: (preferredTarget?: HTMLElement | null) => void
  requestBrowserFocus: (detail: { pageId: string; target: 'webview' | 'address-bar' }) => void
  skipRestoreFocusRef: React.RefObject<boolean>
  setSelectedItemId: (id: string) => void
}

// Why: selecting a worktree, browser tab, simulator tab, or workspace tab all
// follow the same shape — validate the target still exists, activate it, then
// close the palette without restoring focus to the pre-open surface. Grouping
// these "jump to an open surface" handlers keeps that shape in one place.
export function useSelectJumpTargetHandlers(input: SelectJumpTargetInput) {
  const {
    closeModal,
    recordFeatureInteraction,
    focusFallbackSurface,
    requestBrowserFocus,
    skipRestoreFocusRef,
    setSelectedItemId
  } = input

  const handleSelectWorktree = useCallback(
    (worktreeId: string) => {
      const worktree = findWorktreeById(useAppStore.getState().worktreesByRepo, worktreeId)
      if (!worktree) {
        toast.error(
          translate('auto.components.WorktreeJumpPalette.2c38630a01', 'Workspace no longer exists')
        )
        return
      }
      activateAndRevealWorktree(worktreeId)
      recordFeatureInteraction('cmd-j-workspace-open')
      skipRestoreFocusRef.current = true
      closeModal()
      setSelectedItemId('')
      focusFallbackSurface()
    },
    [
      closeModal,
      focusFallbackSurface,
      recordFeatureInteraction,
      setSelectedItemId,
      skipRestoreFocusRef
    ]
  )

  const handleSelectBrowserPage = useCallback(
    (result: BrowserPaletteSearchResult) => {
      const { pageId, workspaceId, worktreeId } = result
      const selection = findBrowserSelection(pageId, workspaceId, worktreeId)
      if (!selection) {
        toast.error(
          translate(
            'auto.components.WorktreeJumpPalette.d7d496a451',
            'Browser page no longer exists'
          )
        )
        return
      }
      // Why: capture the workspace and page info before activateAndRevealWorktree
      // mutates store state. Store cascades during worktree activation can remap
      // browser workspace state, making a second findBrowserSelection unreliable.
      const { worktree, workspace, page } = selection
      const activated = activateAndRevealWorktree(worktree.id)
      if (!activated) {
        toast.error(
          translate('auto.components.WorktreeJumpPalette.2c38630a01', 'Workspace no longer exists')
        )
        return
      }

      const state = useAppStore.getState()
      state.setActiveBrowserTab(workspace.id)
      state.setActiveBrowserPage(workspace.id, pageId)
      recordFeatureInteraction('cmd-j-browser-page-open')
      skipRestoreFocusRef.current = true
      closeModal()
      setSelectedItemId('')
      requestBrowserFocus({
        pageId,
        target: isBlankBrowserUrl(page.url) ? 'address-bar' : 'webview'
      })
    },
    [
      closeModal,
      recordFeatureInteraction,
      requestBrowserFocus,
      setSelectedItemId,
      skipRestoreFocusRef
    ]
  )

  const handleSelectSimulatorTab = useCallback(
    (result: SimulatorPaletteSearchResult) => {
      const state = useAppStore.getState()
      const tab = (state.unifiedTabsByWorktree[result.worktreeId] ?? []).find(
        (candidate) => candidate.id === result.tabId && candidate.contentType === 'simulator'
      )
      if (!tab) {
        toast.error(
          translate(
            'auto.components.WorktreeJumpPalette.7726ce9970',
            'Mobile emulator tab no longer exists'
          )
        )
        return
      }
      const activated = activateAndRevealWorktree(result.worktreeId)
      if (!activated) {
        toast.error(
          translate('auto.components.WorktreeJumpPalette.2c38630a01', 'Workspace no longer exists')
        )
        return
      }

      const nextState = useAppStore.getState()
      nextState.focusGroup(result.worktreeId, tab.groupId)
      nextState.activateTab(tab.id)
      nextState.setActiveTab(tab.id)
      nextState.setActiveTabType('simulator')
      skipRestoreFocusRef.current = true
      closeModal()
      setSelectedItemId('')
    },
    [closeModal, setSelectedItemId, skipRestoreFocusRef]
  )

  const handleSelectWorkspaceTab = useCallback(
    (result: WorkspaceTabPaletteSearchResult) => {
      const activation = activateWorkspaceTabPaletteResult(result)
      if (activation.status === 'failed') {
        toast.error(
          activation.reason === 'missing-worktree'
            ? translate(
                'auto.components.WorktreeJumpPalette.2c38630a01',
                'Workspace no longer exists'
              )
            : translate(
                'auto.components.WorktreeJumpPalette.workspaceTabMissing',
                'Tab no longer exists'
              )
        )
        return
      }

      skipRestoreFocusRef.current = true
      closeModal()
      setSelectedItemId('')
    },
    [closeModal, setSelectedItemId, skipRestoreFocusRef]
  )

  return {
    handleSelectWorktree,
    handleSelectBrowserPage,
    handleSelectSimulatorTab,
    handleSelectWorkspaceTab
  }
}
