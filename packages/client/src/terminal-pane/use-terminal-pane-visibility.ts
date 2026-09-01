import type { IDisposable } from '@xterm/xterm'
import { useEffect, useRef } from 'react'

import {
  WAKE_HIBERNATED_AGENTS_WORKTREE_EVENT,
  type WakeHibernatedAgentsWorktreeDetail
} from '../constants/terminal'
import {
  getPreviousVisibleForTerminalPane,
  isTerminalPaneVisibilityResume,
  type TerminalPaneVisibilitySnapshot
} from './terminal-pane-lifecycle-decisions'
import type { UseTerminalPaneLifecycleDeps } from './terminal-pane-lifecycle-types'

type TerminalPaneVisibilityInput = Pick<
  UseTerminalPaneLifecycleDeps,
  | 'cwd'
  | 'isActive'
  | 'isVisible'
  | 'isVisibleRef'
  | 'managerRef'
  | 'panePtyBindingsRef'
  | 'tabId'
  | 'worktreeId'
>

export function useTerminalPaneVisibility({
  cwd,
  isActive,
  isVisible,
  isVisibleRef,
  managerRef,
  panePtyBindingsRef,
  tabId,
  worktreeId
}: TerminalPaneVisibilityInput): void {
  const previousVisibleRef = useRef<TerminalPaneVisibilitySnapshot | null>(null)

  useEffect(() => {
    const onWakeHibernatedAgents = (event: Event): void => {
      const detail = (event as CustomEvent<WakeHibernatedAgentsWorktreeDetail>).detail
      if (!detail || detail.worktreeId !== worktreeId) {
        return
      }
      for (const panePtyBinding of panePtyBindingsRef.current.values()) {
        const claimKey = (
          panePtyBinding as IDisposable & {
            wakeHibernatedAgentIfArmed?: (claimedProviderSessions?: Set<string>) => string | null
          }
        ).wakeHibernatedAgentIfArmed?.(detail.wokenClaimKeys)
        if (claimKey) {
          detail.wokenClaimKeys?.add(claimKey)
        }
      }
    }
    window.addEventListener(WAKE_HIBERNATED_AGENTS_WORKTREE_EVENT, onWakeHibernatedAgents)
    return () => {
      window.removeEventListener(WAKE_HIBERNATED_AGENTS_WORKTREE_EVENT, onWakeHibernatedAgents)
    }
  }, [worktreeId, panePtyBindingsRef])

  useEffect(() => {
    const previousIsVisible = getPreviousVisibleForTerminalPane({
      previous: previousVisibleRef.current,
      tabId,
      cwd
    })
    previousVisibleRef.current = { tabId, cwd, isVisible }
    isVisibleRef.current = isVisible
    const resumedFromHidden = isTerminalPaneVisibilityResume({ previousIsVisible, isVisible })
    for (const panePtyBinding of panePtyBindingsRef.current.values()) {
      const bindingWithVisibility = panePtyBinding as IDisposable & {
        syncProcessTracking?: () => void
        noteVisibilityResume?: () => void
      }
      bindingWithVisibility.syncProcessTracking?.()
      if (resumedFromHidden) {
        bindingWithVisibility.noteVisibilityResume?.()
      }
    }
  }, [cwd, isVisible, isVisibleRef, panePtyBindingsRef, tabId])

  useEffect(() => {
    if (!isActive || !isVisible || typeof window === 'undefined') {
      return
    }
    const onWindowFocus = (): void => {
      const activePane = managerRef.current?.getActivePane()
      if (!activePane) {
        return
      }
      const binding = panePtyBindingsRef.current.get(activePane.id) as
        | (IDisposable & { sampleForegroundAgentOnFocus?: () => void })
        | undefined
      binding?.sampleForegroundAgentOnFocus?.()
    }
    window.addEventListener('focus', onWindowFocus)
    return () => window.removeEventListener('focus', onWindowFocus)
  }, [isActive, isVisible, managerRef, panePtyBindingsRef])
}
