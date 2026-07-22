import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react'
import { toast } from 'sonner'

import { useMountedRef } from '@/hooks/use-mounted-ref'
import { translate } from '@/i18n/i18n'
import { focusNativeChatTabSurface } from '@/lib/focus-terminal-tab-surface'
import {
  getGlobalAssistantRequestMode,
  TOGGLE_GLOBAL_ASSISTANT_EVENT,
  type GlobalAssistantRequestMode
} from '@/lib/global-assistant'
import { extractIpcErrorMessage } from '@/lib/ipc-error'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'

import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../shared/constants'

type UseGlobalAssistantFloatingTabArgs = {
  floatingWorkspaceOpen: boolean
  setFloatingWorkspaceOpen: (nextOpen: SetStateAction<boolean>) => void
}

function isActiveFloatingAssistantTab(state: AppState, terminalTabId: string): boolean {
  const groupId = state.activeGroupIdByWorktree[FLOATING_TERMINAL_WORKTREE_ID]
  const group = state.groupsByWorktree[FLOATING_TERMINAL_WORKTREE_ID]?.find(
    (candidate) => candidate.id === groupId
  )
  const activeTab = state.unifiedTabsByWorktree[FLOATING_TERMINAL_WORKTREE_ID]?.find(
    (candidate) => candidate.id === group?.activeTabId
  )
  return activeTab?.contentType === 'terminal' && activeTab.entityId === terminalTabId
}

export function useGlobalAssistantFloatingTab({
  floatingWorkspaceOpen,
  setFloatingWorkspaceOpen
}: UseGlobalAssistantFloatingTabArgs): {
  assistantPending: boolean
  assistantLoadingVisible: boolean
  openAssistant: () => void
} {
  const [assistantPending, setAssistantPending] = useState(false)
  const [assistantLoadingVisible, setAssistantLoadingVisible] = useState(false)
  const assistantTabIdRef = useRef<string | null>(null)
  const requestRef = useRef<Promise<unknown> | null>(null)
  const loadingTimerRef = useRef<number | null>(null)
  const mountedRef = useMountedRef()

  const requestAssistant = useCallback(
    (mode: GlobalAssistantRequestMode): void => {
      if (requestRef.current) {
        return
      }
      setFloatingWorkspaceOpen(true)
      setAssistantPending(true)
      setAssistantLoadingVisible(false)
      loadingTimerRef.current = window.setTimeout(() => {
        loadingTimerRef.current = null
        if (mountedRef.current) {
          setAssistantLoadingVisible(true)
        }
      }, 200)

      const request =
        mode === 'restart'
          ? window.api.globalAssistant.restart()
          : window.api.globalAssistant.getOrCreate()
      requestRef.current = request
      void request
        .then((session) => {
          if (!mountedRef.current) {
            return
          }
          assistantTabIdRef.current = session.tabId
          const store = useAppStore.getState()
          store.activateTab(session.tabId)
          store.setActiveTab(session.tabId)
          focusNativeChatTabSurface(session.tabId)
        })
        .catch((error) => {
          if (!mountedRef.current) {
            return
          }
          toast.error(
            extractIpcErrorMessage(
              error,
              translate(
                'components.global-assistant.startError',
                'Global Assistant could not start.'
              )
            )
          )
        })
        .finally(() => {
          if (loadingTimerRef.current !== null) {
            window.clearTimeout(loadingTimerRef.current)
            loadingTimerRef.current = null
          }
          requestRef.current = null
          if (mountedRef.current) {
            setAssistantPending(false)
            setAssistantLoadingVisible(false)
          }
        })
    },
    [mountedRef, setFloatingWorkspaceOpen]
  )

  const openAssistant = useCallback(() => requestAssistant('reuse'), [requestAssistant])

  useEffect(() => {
    const handleAssistantRequest = (event: Event): void => {
      const mode = getGlobalAssistantRequestMode(event)
      const assistantTabId = assistantTabIdRef.current
      if (
        mode === 'reuse' &&
        floatingWorkspaceOpen &&
        assistantTabId &&
        isActiveFloatingAssistantTab(useAppStore.getState(), assistantTabId)
      ) {
        setFloatingWorkspaceOpen(false)
        return
      }
      requestAssistant(mode)
    }
    window.addEventListener(TOGGLE_GLOBAL_ASSISTANT_EVENT, handleAssistantRequest)
    return () => window.removeEventListener(TOGGLE_GLOBAL_ASSISTANT_EVENT, handleAssistantRequest)
  }, [floatingWorkspaceOpen, requestAssistant, setFloatingWorkspaceOpen])

  useEffect(
    () => () => {
      if (loadingTimerRef.current !== null) {
        window.clearTimeout(loadingTimerRef.current)
      }
    },
    []
  )

  return { assistantPending, assistantLoadingVisible, openAssistant }
}
