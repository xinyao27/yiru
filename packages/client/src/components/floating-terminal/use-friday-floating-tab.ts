import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react'
import { toast } from 'sonner'
import { useMountedRef } from '~renderer/hooks/use-mounted-ref'
import { translate } from '~renderer/i18n/i18n'
import { focusNativeChatTabSurface } from '~renderer/lib/focus-terminal-tab-surface'
import {
  getFridayRequestMode,
  TOGGLE_FRIDAY_EVENT,
  type FridayRequestMode
} from '~renderer/lib/friday'
import { extractIpcErrorMessage } from '~renderer/lib/ipc-error'
import { shellClient } from '~renderer/runtime/shell-client'
import { useAppStore } from '~renderer/store'
import type { AppState } from '~renderer/store/types'
import { FLOATING_TERMINAL_WORKTREE_ID } from '~shared/constants'

type UseFridayFloatingTabArgs = {
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

export function useFridayFloatingTab({
  floatingWorkspaceOpen,
  setFloatingWorkspaceOpen
}: UseFridayFloatingTabArgs): {
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
    (mode: FridayRequestMode): void => {
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
        mode === 'restart' ? shellClient.friday.restart() : shellClient.friday.getOrCreate()
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
              translate('components.friday.startError', 'Friday could not start.')
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
      const mode = getFridayRequestMode(event)
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
    window.addEventListener(TOGGLE_FRIDAY_EVENT, handleAssistantRequest)
    return () => window.removeEventListener(TOGGLE_FRIDAY_EVENT, handleAssistantRequest)
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
