import type React from 'react'
import { useCallback } from 'react'
import { toast } from 'sonner'

import type { CmdJProjectSearchResult } from '@/components/cmd-j/palette-project-results'
import type { CmdJActionResult, CmdJSettingsResult } from '@/components/cmd-j/palette-results'
import {
  getUnavailableQuickActionMessage,
  type CmdJQuickActionContext
} from '@/components/cmd-j/quick-action-context'
import type { SettingsNavTarget } from '@/lib/settings-navigation-types'

import type { PaletteStoreState } from './use-palette-store-state'

function getSettingsTargetFromSectionId(sectionId: string): {
  pane: SettingsNavTarget
  repoId: string | null
  sectionId?: string
} {
  if (sectionId.startsWith('repo-')) {
    return { pane: 'repo', repoId: sectionId.slice('repo-'.length) }
  }
  return { pane: sectionId as SettingsNavTarget, repoId: null }
}

type SelectSecondaryTargetInput = Pick<
  PaletteStoreState,
  | 'closeModal'
  | 'openSettingsPage'
  | 'openSettingsTarget'
  | 'recordFeatureInteraction'
  | 'revealSidebarRow'
> & {
  setSelectedItemId: (id: string) => void
  skipRestoreFocusRef: React.RefObject<boolean>
  buildQuickActionContext: () => CmdJQuickActionContext
  focusFallbackSurface: (preferredTarget?: HTMLElement | null) => void
  requestBrowserFocus: (detail: { pageId: string; target: 'webview' | 'address-bar' }) => void
  previousActiveTabTypeRef: React.RefObject<'browser' | 'editor' | 'terminal' | 'simulator'>
  previousBrowserPageIdRef: React.RefObject<string | null>
  previousBrowserFocusTargetRef: React.RefObject<'webview' | 'address-bar'>
  previousWorktreeIdRef: React.RefObject<string | null>
}

// Why: settings, quick actions, and project/group jumps are the non-"open
// surface" palette results — each closes the palette and either navigates to
// Settings, runs an action, or reveals a sidebar row rather than activating a
// worktree. Grouped together since they share the "restore prior focus unless
// a browser page was active" tail behavior.
export function useSelectSecondaryTargetHandlers(input: SelectSecondaryTargetInput) {
  const {
    closeModal,
    openSettingsPage,
    openSettingsTarget,
    recordFeatureInteraction,
    revealSidebarRow,
    setSelectedItemId,
    skipRestoreFocusRef,
    buildQuickActionContext,
    focusFallbackSurface,
    requestBrowserFocus,
    previousActiveTabTypeRef,
    previousBrowserPageIdRef,
    previousBrowserFocusTargetRef,
    previousWorktreeIdRef
  } = input

  const handleSelectSettings = useCallback(
    (result: CmdJSettingsResult) => {
      const target = getSettingsTargetFromSectionId(result.sectionId)
      if (result.targetSectionId) {
        target.sectionId = result.targetSectionId
      }
      skipRestoreFocusRef.current = true
      closeModal()
      setSelectedItemId('')
      openSettingsTarget(target)
      openSettingsPage()
      recordFeatureInteraction('cmd-j-settings-open')
    },
    [
      closeModal,
      openSettingsPage,
      openSettingsTarget,
      recordFeatureInteraction,
      setSelectedItemId,
      skipRestoreFocusRef
    ]
  )

  const handleSelectQuickAction = useCallback(
    (action: CmdJActionResult) => {
      skipRestoreFocusRef.current = true
      closeModal()
      setSelectedItemId('')
      const ctx = buildQuickActionContext()
      void action.run(ctx).then((result) => {
        if (result.status === 'unavailable') {
          toast.error(getUnavailableQuickActionMessage(action.title, result.reason))
          return
        }
        if (action.id === 'create-workspace') {
          recordFeatureInteraction('cmd-j-create-workspace')
          return
        }
        recordFeatureInteraction('cmd-j-quick-action')
      })
    },
    [
      buildQuickActionContext,
      closeModal,
      recordFeatureInteraction,
      setSelectedItemId,
      skipRestoreFocusRef
    ]
  )

  const handleSelectProjectTarget = useCallback(
    (result: CmdJProjectSearchResult) => {
      skipRestoreFocusRef.current = true
      // Why: selecting a project or repo group is a sidebar navigation action;
      // it should reveal the grouping row without activating an arbitrary workspace.
      revealSidebarRow(result.rowKey, { behavior: 'smooth', highlight: true })
      recordFeatureInteraction('cmd-j')
      closeModal()
      setSelectedItemId('')
      if (previousActiveTabTypeRef.current === 'browser' && previousBrowserPageIdRef.current) {
        requestBrowserFocus({
          pageId: previousBrowserPageIdRef.current,
          target: previousBrowserFocusTargetRef.current
        })
        return
      }
      if (previousWorktreeIdRef.current) {
        focusFallbackSurface()
      }
    },
    [
      closeModal,
      focusFallbackSurface,
      previousActiveTabTypeRef,
      previousBrowserFocusTargetRef,
      previousBrowserPageIdRef,
      previousWorktreeIdRef,
      recordFeatureInteraction,
      requestBrowserFocus,
      revealSidebarRow,
      setSelectedItemId,
      skipRestoreFocusRef
    ]
  )

  return { handleSelectSettings, handleSelectQuickAction, handleSelectProjectTarget }
}
