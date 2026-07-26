import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject
} from 'react'

import type { TabGroupLayoutNode } from '../../../../shared/types'
import { useAppStore } from '../../store'
import {
  getTerminalWorktreeColdParkRecheckDelayMs,
  selectColdParkedTerminalWorktrees,
  type TerminalWorktreeColdParkCandidate
} from '../terminal-pane/terminal-hidden-view-parking'
import {
  canWatcherCoverParkedTerminalTab,
  disposeAllParkedTerminalWatchers,
  pruneParkedTerminalWatchers,
  syncParkedTerminalTabWatchers
} from '../terminal-pane/terminal-parked-tab-watchers'
import { haveSameWorktreeIds } from './tab-model-lookup'

type WorkspaceSurface = { id: string; path: string }

type TerminalColdParkingArgs = {
  workspaceSurfaces: WorkspaceSurface[]
  mountedWorktreeIdsRef: RefObject<Set<string>>
  measurableBackgroundWorktreeIdsRef: RefObject<Set<string>>
  activationDeferredMountTabIdsByWorktreeRef: RefObject<Map<string, ReadonlySet<string>>>
  backgroundMountRevision: number
  anyMountedWorktreeHasLayout: boolean
  getEffectiveLayoutForWorktree: (worktreeId: string) => TabGroupLayoutNode | undefined
}

// Why: worktree-level cold-park policy for *hidden* worktrees — hiddenSince
// bookkeeping, parked-set selection, and byte-watcher reconciliation for the
// legacy (non-split) terminal host. Split-mode watchers are owned per
// TerminalPaneOverlayLayer; this hook only disposes/parks worktrees that
// render no overlay layer.
export function useTerminalColdParking({
  workspaceSurfaces,
  mountedWorktreeIdsRef,
  measurableBackgroundWorktreeIdsRef,
  activationDeferredMountTabIdsByWorktreeRef,
  backgroundMountRevision,
  anyMountedWorktreeHasLayout,
  getEffectiveLayoutForWorktree
}: TerminalColdParkingArgs): { parkedTerminalWorktreeIds: ReadonlySet<string> } {
  const activeView = useAppStore((s) => s.activeView)
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const tabsByWorktree = useAppStore((s) => s.tabsByWorktree)
  const pendingStartupByTabId = useAppStore((s) => s.pendingStartupByTabId)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const activeTabIdByWorktree = useAppStore((s) => s.activeTabIdByWorktree)
  const groupsByWorktree = useAppStore((s) => s.groupsByWorktree)
  const workspaceSessionReady = useAppStore((s) => s.workspaceSessionReady)
  const terminalParkingEnabled = useAppStore((s) => s.settings?.terminalHiddenViewParking !== false)

  const terminalWorktreeHiddenSinceRef = useRef(new Map<string, number>())
  const terminalWorktreeParkingTimersRef = useRef(new Map<string, number>())
  const [terminalParkingRevision, setTerminalParkingRevision] = useState(0)
  // Why: the parked-id set is published from a timer-driven reconciliation
  // effect, not from a prop/state change, so it is modeled as an external
  // store instead of useState — publishing it from the effect would otherwise
  // read as seeding state from an effect on every recheck.
  const parkedTerminalWorktreeIdsRef = useRef<ReadonlySet<string>>(new Set())
  const parkedTerminalWorktreeIdsListenersRef = useRef(new Set<() => void>())
  const subscribeToParkedTerminalWorktreeIds = useCallback((listener: () => void): (() => void) => {
    parkedTerminalWorktreeIdsListenersRef.current.add(listener)
    return () => {
      parkedTerminalWorktreeIdsListenersRef.current.delete(listener)
    }
  }, [])
  const getParkedTerminalWorktreeIdsSnapshot = useCallback(
    (): ReadonlySet<string> => parkedTerminalWorktreeIdsRef.current,
    []
  )
  const parkedTerminalWorktreeIds = useSyncExternalStore(
    subscribeToParkedTerminalWorktreeIds,
    getParkedTerminalWorktreeIdsSnapshot
  )

  useEffect(() => {
    const timers = terminalWorktreeParkingTimersRef.current
    return () => {
      for (const timer of timers.values()) {
        window.clearTimeout(timer)
      }
      timers.clear()
    }
  }, [])

  // Why: worktree-level cold-park policy — hiddenSince bookkeeping, parked-set
  // selection, and one recheck timer per still-pending deadline so React
  // re-renders exactly when the hysteresis elapses instead of polling.
  useEffect(() => {
    const parkingTimers = terminalWorktreeParkingTimersRef.current
    for (const timer of parkingTimers.values()) {
      window.clearTimeout(timer)
    }
    parkingTimers.clear()

    const nowMs = Date.now()
    const currentWorktreeIds = new Set(workspaceSurfaces.map((workspace) => workspace.id))
    for (const worktreeId of Array.from(terminalWorktreeHiddenSinceRef.current.keys())) {
      if (!currentWorktreeIds.has(worktreeId) || !mountedWorktreeIdsRef.current.has(worktreeId)) {
        terminalWorktreeHiddenSinceRef.current.delete(worktreeId)
      }
    }

    const retentionCandidates: TerminalWorktreeColdParkCandidate[] = []
    for (const workspace of workspaceSurfaces) {
      const worktreeId = workspace.id
      if (!mountedWorktreeIdsRef.current.has(worktreeId)) {
        terminalWorktreeHiddenSinceRef.current.delete(worktreeId)
        continue
      }
      const isVisible = activeView === 'terminal' && activeWorktreeId === worktreeId
      const shouldMeasureHiddenWorktree =
        !isVisible && measurableBackgroundWorktreeIdsRef.current.has(worktreeId)
      if (isVisible || shouldMeasureHiddenWorktree) {
        terminalWorktreeHiddenSinceRef.current.delete(worktreeId)
      } else if (!terminalWorktreeHiddenSinceRef.current.has(worktreeId)) {
        terminalWorktreeHiddenSinceRef.current.set(worktreeId, nowMs)
      }

      retentionCandidates.push({
        worktreeId,
        terminalTabs: tabsByWorktree[worktreeId] ?? [],
        isVisible,
        shouldMeasureHiddenWorktree,
        hiddenSinceMs: terminalWorktreeHiddenSinceRef.current.get(worktreeId) ?? null
      })
    }

    const nextParkedTerminalWorktreeIds = selectColdParkedTerminalWorktrees({
      worktrees: retentionCandidates,
      pendingStartupByTabId,
      parkingEnabled: terminalParkingEnabled,
      nowMs
    })
    // Why: a worktree with any tab the byte watchers cannot cover (no
    // capture, no layout snapshot, legacy leaf ids) must never park — it
    // would go silent for bells/titles/completions, the failure that sank
    // the first parking attempt.
    for (const worktreeId of Array.from(nextParkedTerminalWorktreeIds)) {
      const tabs = tabsByWorktree[worktreeId] ?? []
      if (!tabs.every((tab) => canWatcherCoverParkedTerminalTab(worktreeId, tab))) {
        nextParkedTerminalWorktreeIds.delete(worktreeId)
      }
    }
    if (!haveSameWorktreeIds(parkedTerminalWorktreeIdsRef.current, nextParkedTerminalWorktreeIds)) {
      parkedTerminalWorktreeIdsRef.current = nextParkedTerminalWorktreeIds
      for (const listener of parkedTerminalWorktreeIdsListenersRef.current) {
        listener()
      }
    }

    for (const candidate of retentionCandidates) {
      if (
        candidate.isVisible ||
        candidate.shouldMeasureHiddenWorktree ||
        nextParkedTerminalWorktreeIds.has(candidate.worktreeId)
      ) {
        continue
      }
      const delayMs = getTerminalWorktreeColdParkRecheckDelayMs({
        parkingEnabled: terminalParkingEnabled,
        hiddenSinceMs: candidate.hiddenSinceMs,
        nowMs
      })
      if (delayMs !== null && delayMs > 0) {
        const worktreeId = candidate.worktreeId
        const timer = window.setTimeout(() => {
          parkingTimers.delete(worktreeId)
          setTerminalParkingRevision((revision) => revision + 1)
        }, delayMs)
        parkingTimers.set(worktreeId, timer)
      }
    }
  }, [
    activeView,
    activeWorktreeId,
    backgroundMountRevision,
    measurableBackgroundWorktreeIdsRef,
    mountedWorktreeIdsRef,
    pendingStartupByTabId,
    tabsByWorktree,
    terminalParkingEnabled,
    terminalParkingRevision,
    workspaceSurfaces
  ])

  // Why: parked byte-watcher reconciliation for the legacy (non-split)
  // terminal host, which renders TerminalPanes directly. In split mode each
  // TerminalPaneOverlayLayer owns its worktree's watchers, so here we only
  // dispose worktrees that render no overlay layer (no layout / unmounted)
  // and prune watchers for deleted worktrees.
  useEffect(() => {
    pruneParkedTerminalWatchers(new Set(workspaceSurfaces.map((workspace) => workspace.id)))
    for (const workspace of workspaceSurfaces) {
      if (
        anyMountedWorktreeHasLayout &&
        mountedWorktreeIdsRef.current.has(workspace.id) &&
        getEffectiveLayoutForWorktree(workspace.id)
      ) {
        continue
      }
      const tabs = tabsByWorktree[workspace.id] ?? []
      const parkedTabIds = new Set<string>()
      let deferredTabIds: ReadonlySet<string> | null = null
      if (!anyMountedWorktreeHasLayout && mountedWorktreeIdsRef.current.has(workspace.id)) {
        const isVisible = activeView === 'terminal' && workspace.id === activeWorktreeId
        const shouldMeasureHiddenWorktree =
          !isVisible && measurableBackgroundWorktreeIdsRef.current.has(workspace.id)
        const parked =
          !isVisible && !shouldMeasureHiddenWorktree && parkedTerminalWorktreeIds.has(workspace.id)
        if (parked) {
          for (const tab of tabs) {
            parkedTabIds.add(tab.id)
          }
        }
        // Why: activation-deferred tabs are unmounted like parked ones; the
        // same byte watchers own their side effects until first reveal.
        // Targeted restrictions keep their existing delayed parking policy.
        deferredTabIds =
          activationDeferredMountTabIdsByWorktreeRef.current.get(workspace.id) ?? null
        for (const tab of tabs) {
          if (
            deferredTabIds?.has(tab.id) &&
            !parkedTabIds.has(tab.id) &&
            canWatcherCoverParkedTerminalTab(workspace.id, tab)
          ) {
            parkedTabIds.add(tab.id)
          }
        }
      }
      syncParkedTerminalTabWatchers({
        worktreeId: workspace.id,
        tabs,
        parkedTabIds,
        // Why: activation-deferred tabs never mounted a pane to restore their
        // title, unlike ordinary parked tabs whose live pane populated it.
        ...(deferredTabIds ? { restoreTitleOnStartTabIds: deferredTabIds } : {})
      })
    }
  }, [
    // Why activeTabId: revealing a deferred tab mutates the mount restriction
    // during the same render; the watcher sync must re-run in that flush so
    // the revealed tab's watcher disposes before its pane attaches.
    activeTabId,
    activeView,
    activeWorktreeId,
    activationDeferredMountTabIdsByWorktreeRef,
    activeTabIdByWorktree,
    anyMountedWorktreeHasLayout,
    backgroundMountRevision,
    getEffectiveLayoutForWorktree,
    groupsByWorktree,
    measurableBackgroundWorktreeIdsRef,
    mountedWorktreeIdsRef,
    parkedTerminalWorktreeIds,
    pendingStartupByTabId,
    tabsByWorktree,
    terminalParkingEnabled,
    workspaceSessionReady,
    workspaceSurfaces
  ])
  // Why: symmetric with the cold-parking effect's unmount cleanup — when the
  // terminal host unmounts, no reconciliation effect will run again, so
  // dispose every remaining parked watcher here (overlay-layer children have
  // already disposed theirs by the time this parent cleanup runs).
  useEffect(() => () => disposeAllParkedTerminalWatchers(), [])

  return { parkedTerminalWorktreeIds }
}
