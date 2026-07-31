import { useCallback } from 'react'

import type {
  MarkdownDocState,
  MobileSessionTab,
  SessionTabsResult,
  Terminal
} from './screen-state'
import {
  acceptSessionSnapshot,
  applyClosedTabTombstones,
  confirmsMirroredTabSelection
} from './tab-snapshot-gate'
import type { MobileTerminalDiagnostics } from './terminal/diagnostics'
import {
  getActiveTabIdForHandle,
  getTerminalRecordsFromSessionTabs,
  mergeTerminalRecordsByCurrentOrder,
  mobileSessionTabsEqual,
  terminalRecordsEqual
} from './terminal/records'
import type { MobileSessionTabsStore } from './use-session-tabs'

export type MobileSessionTabSnapshotDeps = {
  store: MobileSessionTabsStore
  worktreeId: string
  diagnosticsRef: React.RefObject<MobileTerminalDiagnostics>
  markdownDocsRef: React.RefObject<Map<string, MarkdownDocState>>
  terminalsRef: React.RefObject<Terminal[]>
  lastKnownTerminalCountRef: React.RefObject<number>
  activeHandleRef: React.RefObject<string | null>
  initializedHandlesRef: React.RefObject<Set<string>>
  // Why: a worktree that hydrated with tabs must never auto-create later —
  // otherwise closing the last tab silently resurrects a terminal.
  initialEmptySessionAutoCreateRef: React.RefObject<string | null>
  setTerminals: React.Dispatch<React.SetStateAction<Terminal[]>>
  setTerminalsLoaded: React.Dispatch<React.SetStateAction<boolean>>
  setActiveHandle: React.Dispatch<React.SetStateAction<string | null>>
  defaultTerminalHandlesToLiveInput: (handles: readonly string[]) => void
  subscribeToTerminal: (handle: string) => void
  unsubscribeTerminal: (handle: string) => void
}

// Reconciles a host-published session-tab snapshot into local state: rejects
// out-of-order snapshots, suppresses just-closed tabs, keeps phone-local drafts
// and pending activations alive, and re-points the active terminal subscription.
export function useMobileSessionTabSnapshot(
  deps: MobileSessionTabSnapshotDeps
): (result: SessionTabsResult) => void {
  const {
    store,
    worktreeId,
    diagnosticsRef,
    markdownDocsRef,
    terminalsRef,
    lastKnownTerminalCountRef,
    activeHandleRef,
    initializedHandlesRef,
    initialEmptySessionAutoCreateRef,
    setTerminals,
    setTerminalsLoaded,
    setActiveHandle,
    defaultTerminalHandlesToLiveInput,
    subscribeToTerminal,
    unsubscribeTerminal
  } = deps
  const {
    setSessionTabs,
    sessionTabsRef,
    activeSessionTabIdRef,
    activeSessionTabTypeRef,
    setActiveSessionTabId,
    appliedSnapshotMarkerRef,
    closedTabTombstonesRef,
    pendingActiveSessionTabIdRef,
    pendingActiveTerminalHandleRef
  } = store

  return useCallback(
    (result: SessionTabsResult) => {
      const diagnostics = diagnosticsRef.current
      // Reject out-of-order snapshots, then suppress just-closed tabs until the
      // publisher confirms their absence. See session-tab-snapshot-gate.
      if (!acceptSessionSnapshot(result, appliedSnapshotMarkerRef.current)) {
        return
      }
      let nextTabs = applyClosedTabTombstones(
        result.tabs,
        closedTabTombstonesRef.current,
        Date.now()
      )
      const presentTabIds = new Set(nextTabs.map((tab) => tab.id))
      const orphanedDraftTabs: MobileSessionTab[] = []
      const currentMarkdownDocs = markdownDocsRef.current
      const currentSessionTabs = sessionTabsRef.current
      for (const [tabId, doc] of currentMarkdownDocs) {
        if (doc.status !== 'ready' || !doc.isDirty || presentTabIds.has(tabId)) {
          continue
        }
        const draftTab = currentSessionTabs.find(
          (tab): tab is Extract<MobileSessionTab, { type: 'markdown' }> =>
            tab.type === 'markdown' && tab.id === tabId
        )
        if (draftTab) {
          // Why: save-only mobile edits live only on the phone until Save. If the
          // desktop tab disappears, keep every local draft reachable for copy/discard.
          orphanedDraftTabs.push({ ...draftTab, isActive: tabId === activeSessionTabIdRef.current })
        }
      }
      if (orphanedDraftTabs.length > 0) {
        nextTabs = [...orphanedDraftTabs, ...nextTabs]
      }
      sessionTabsRef.current = nextTabs
      // Why: subscribe snapshots often repeat identical tab payloads. Avoid a
      // render loop where the subscription effect tears down and replays itself.
      setSessionTabs((prev) => (mobileSessionTabsEqual(prev, nextTabs) ? prev : nextTabs))
      const terminalTabs = getTerminalRecordsFromSessionTabs(nextTabs)
      const terminalTabHandles = terminalTabs.map((terminal) => terminal.handle)
      defaultTerminalHandlesToLiveInput(terminalTabHandles)
      const mergedTerminalsForActive = mergeTerminalRecordsByCurrentOrder(
        terminalTabs,
        terminalsRef.current
      )
      terminalsRef.current = mergedTerminalsForActive
      setTerminals((prev) =>
        terminalRecordsEqual(prev, mergedTerminalsForActive) ? prev : mergedTerminalsForActive
      )
      lastKnownTerminalCountRef.current = Math.max(
        lastKnownTerminalCountRef.current,
        terminalTabs.length
      )
      setTerminalsLoaded(true)
      if (nextTabs.length > 0) {
        initialEmptySessionAutoCreateRef.current = worktreeId
      }

      const snapshotActive = nextTabs.find((tab) => tab.isActive) ?? nextTabs[0] ?? null
      const pendingActiveSessionTabId = pendingActiveSessionTabIdRef.current
      const pendingActiveTerminalHandle = pendingActiveTerminalHandleRef.current
      let active = snapshotActive
      let selectionSource = 'snapshot'
      if (pendingActiveSessionTabId) {
        if (snapshotActive?.id === pendingActiveSessionTabId) {
          if (confirmsMirroredTabSelection(result.publicationEpoch)) {
            pendingActiveSessionTabIdRef.current = null
          } else {
            selectionSource = 'pending-tab-local-ack'
          }
        } else {
          const pendingTab = nextTabs.find((tab) => tab.id === pendingActiveSessionTabId)
          if (pendingTab) {
            // Why: desktop tab snapshots can lag a mobile tap while activate RPC
            // is in flight. Keep the locally selected tab to avoid snapping back.
            active = pendingTab
            selectionSource = 'pending-tab'
          } else {
            pendingActiveSessionTabIdRef.current = null
          }
        }
      }
      if (pendingActiveTerminalHandle) {
        const pendingTerminalTab = nextTabs.find(
          (tab): tab is Extract<MobileSessionTab, { type: 'terminal' }> =>
            tab.type === 'terminal' && tab.terminal === pendingActiveTerminalHandle
        )
        const pendingTerminalExists = mergedTerminalsForActive.some(
          (terminal) => terminal.handle === pendingActiveTerminalHandle
        )
        if (
          snapshotActive?.type === 'terminal' &&
          snapshotActive.terminal === pendingActiveTerminalHandle
        ) {
          if (confirmsMirroredTabSelection(result.publicationEpoch)) {
            pendingActiveTerminalHandleRef.current = null
          } else {
            selectionSource = 'pending-handle-local-ack'
          }
        } else if (pendingTerminalTab) {
          // Why: desktop active flags can lag a mobile terminal tap. Key by
          // terminal handle too, because fallback PTY tabs may not yet have a
          // stable session tab id during new-worktree startup.
          active = pendingTerminalTab
          selectionSource = 'pending-handle-tab'
        } else if (pendingTerminalExists) {
          const nextActiveTabId = getActiveTabIdForHandle(nextTabs, pendingActiveTerminalHandle)
          activeSessionTabIdRef.current = nextActiveTabId
          setActiveSessionTabId(nextActiveTabId)
          activeSessionTabTypeRef.current = 'terminal'
          setActiveHandle(pendingActiveTerminalHandle)
          subscribeToTerminal(pendingActiveTerminalHandle)
          return
        } else {
          pendingActiveTerminalHandleRef.current = null
        }
      }
      diagnostics.tabsApplied(result, nextTabs, active, selectionSource)
      activeSessionTabTypeRef.current = active?.type ?? null
      activeSessionTabIdRef.current = active?.id ?? null
      setActiveSessionTabId(active?.id ?? null)
      if (active?.type === 'terminal') {
        if (typeof active.terminal !== 'string') {
          const previous = activeHandleRef.current
          if (previous) {
            unsubscribeTerminal(previous)
            initializedHandlesRef.current.delete(previous)
          }
          activeHandleRef.current = null
          setActiveHandle(null)
          return
        }
        const previous = activeHandleRef.current
        if (previous && previous !== active.terminal) {
          unsubscribeTerminal(previous)
          initializedHandlesRef.current.delete(previous)
        }
        activeHandleRef.current = active.terminal
        setActiveHandle(active.terminal)
        subscribeToTerminal(active.terminal)
      } else if (active) {
        const previous = activeHandleRef.current
        if (previous) {
          unsubscribeTerminal(previous)
          initializedHandlesRef.current.delete(previous)
        }
        activeHandleRef.current = null
        setActiveHandle(null)
      }
    },
    [defaultTerminalHandlesToLiveInput, subscribeToTerminal, unsubscribeTerminal, worktreeId]
  )
}
