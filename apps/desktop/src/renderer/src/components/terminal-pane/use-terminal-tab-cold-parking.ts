/**
 * Per-tab hidden-view parking for TerminalPaneOverlayLayer.
 *
 * Why: owns the cold-park policy bookkeeping (hiddenSince tracking, recheck
 * timers, parked-set selection) and the parked byte-watcher reconciliation so
 * the overlay layer only consumes the final parked tab set when deciding to
 * render a slot as null. See docs/reference/terminal-hidden-view-parking.md.
 */
import { useEffect, useMemo, useRef, useState } from 'react'

import type { TerminalTab } from '../../../../shared/types'
import { useAppStore } from '../../store'
import {
  getTerminalTabColdParkRecheckDelayMs,
  selectColdParkedTerminalTabs,
  type TerminalTabColdParkCandidate
} from './terminal-hidden-view-parking'
import {
  canWatcherCoverParkedTerminalTab,
  disposeParkedTerminalWatchersForWorktree,
  syncParkedTerminalTabWatchers
} from './terminal-parked-tab-watchers'

type TerminalOverlayTabAssignment = {
  groupId: string
  isActiveInGroup: boolean
}

function haveSameTerminalTabIds(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size !== right.size) {
    return false
  }
  for (const id of left) {
    if (!right.has(id)) {
      return false
    }
  }
  return true
}

export function useTerminalTabColdParking(args: {
  worktreeId: string
  terminalTabs: readonly TerminalTab[]
  assignments: ReadonlyMap<string, TerminalOverlayTabAssignment>
  isWorktreeActive: boolean
  /** Worktree-level park verdict from terminal-workspace.tsx. */
  coldParkTerminalPanes: boolean
  /** Hidden-measuring startup probe from terminal-workspace.tsx — the panes must stay
   *  mounted for their first xterm fit, mirroring the worktree-level guard. */
  shouldMeasureHiddenWorktree: boolean
  /** Tabs cold activation keeps unmounted — parked-equivalent for watcher
   *  purposes. Targeted background restrictions intentionally stay bounded. */
  activationDeferredMountTabIds?: ReadonlySet<string> | null
}): ReadonlySet<string> {
  const {
    worktreeId,
    terminalTabs,
    assignments,
    isWorktreeActive,
    coldParkTerminalPanes,
    shouldMeasureHiddenWorktree,
    activationDeferredMountTabIds
  } = args
  const pendingStartupByTabId = useAppStore((state) => state.pendingStartupByTabId)
  const terminalParkingEnabled = useAppStore(
    (state) => state.settings?.terminalHiddenViewParking !== false
  )
  const terminalTabHiddenSinceRef = useRef(new Map<string, number>())
  const terminalTabParkingTimersRef = useRef(new Map<string, number>())
  const [terminalTabParkingRevision, setTerminalTabParkingRevision] = useState(0)
  const [coldParkedTerminalTabIds, setColdParkedTerminalTabIds] = useState<ReadonlySet<string>>(
    () => new Set()
  )

  useEffect(() => {
    const timers = terminalTabParkingTimersRef.current
    return () => {
      for (const timer of timers.values()) {
        window.clearTimeout(timer)
      }
      timers.clear()
    }
  }, [])

  // Why: per-tab cold-park policy — hiddenSince bookkeeping, parked-set
  // selection, and one recheck timer per still-pending deadline so React
  // re-renders exactly when the hysteresis elapses instead of polling.
  useEffect(() => {
    const timers = terminalTabParkingTimersRef.current
    for (const timer of timers.values()) {
      window.clearTimeout(timer)
    }
    timers.clear()

    const nowMs = Date.now()
    const currentTerminalTabIds = new Set(terminalTabs.map((tab) => tab.id))
    for (const tabId of Array.from(terminalTabHiddenSinceRef.current.keys())) {
      if (!currentTerminalTabIds.has(tabId)) {
        terminalTabHiddenSinceRef.current.delete(tabId)
      }
    }

    const candidates: TerminalTabColdParkCandidate[] = terminalTabs.map((terminalTab) => {
      const assignment = assignments.get(terminalTab.id)
      const isVisible = Boolean(isWorktreeActive && assignment && assignment.isActiveInGroup)
      // Why: hidden-measuring counts as visibility — the startup probe needs
      // mounted panes, so the hidden clock must not run during it.
      if (isVisible || shouldMeasureHiddenWorktree) {
        terminalTabHiddenSinceRef.current.delete(terminalTab.id)
      } else if (!terminalTabHiddenSinceRef.current.has(terminalTab.id)) {
        terminalTabHiddenSinceRef.current.set(terminalTab.id, nowMs)
      }
      return {
        id: terminalTab.id,
        ptyId: terminalTab.ptyId,
        pendingActivationSpawn: terminalTab.pendingActivationSpawn,
        isVisible,
        hiddenSinceMs: terminalTabHiddenSinceRef.current.get(terminalTab.id) ?? null
      }
    })

    const nextColdParkedTerminalTabIds = selectColdParkedTerminalTabs({
      worktreeId,
      terminalTabs: candidates,
      pendingStartupByTabId,
      parkingEnabled: terminalParkingEnabled,
      nowMs
    })
    // Why: a tab the byte watchers cannot cover (no capture, no layout
    // snapshot, legacy leaf ids) must never park — it would go silent for
    // bells/titles/completions, the failure that sank the first attempt.
    for (const terminalTab of terminalTabs) {
      if (
        nextColdParkedTerminalTabIds.has(terminalTab.id) &&
        !canWatcherCoverParkedTerminalTab(worktreeId, terminalTab)
      ) {
        nextColdParkedTerminalTabIds.delete(terminalTab.id)
      }
    }
    setColdParkedTerminalTabIds((current) =>
      haveSameTerminalTabIds(current, nextColdParkedTerminalTabIds)
        ? current
        : nextColdParkedTerminalTabIds
    )

    for (const candidate of candidates) {
      if (candidate.isVisible || nextColdParkedTerminalTabIds.has(candidate.id)) {
        continue
      }
      const delayMs = getTerminalTabColdParkRecheckDelayMs({
        parkingEnabled: terminalParkingEnabled,
        hiddenSinceMs: candidate.hiddenSinceMs,
        nowMs
      })
      if (delayMs !== null && delayMs > 0) {
        const tabId = candidate.id
        const timer = window.setTimeout(() => {
          timers.delete(tabId)
          setTerminalTabParkingRevision((revision) => revision + 1)
        }, delayMs)
        timers.set(tabId, timer)
      }
    }
  }, [
    assignments,
    isWorktreeActive,
    pendingStartupByTabId,
    shouldMeasureHiddenWorktree,
    terminalParkingEnabled,
    terminalTabParkingRevision,
    terminalTabs,
    worktreeId
  ])

  // Why: render and watcher sync must share the combined worktree/per-tab park
  // verdict so watcher lifecycle tracks committed unmounts.
  const parkedTerminalTabIds = useMemo(() => {
    const parked = new Set<string>()
    for (const terminalTab of terminalTabs) {
      const assignment = assignments.get(terminalTab.id)
      const isVisible = Boolean(isWorktreeActive && assignment && assignment.isActiveInGroup)
      if (
        (coldParkTerminalPanes || (!isVisible && coldParkedTerminalTabIds.has(terminalTab.id))) &&
        // Why: the hidden-measuring startup probe needs mounted panes; gate
        // here too so the reveal lands in the same render that starts it.
        !shouldMeasureHiddenWorktree
      ) {
        parked.add(terminalTab.id)
      }
      // Why: activation-deferred tabs render no pane regardless of the park
      // policy, so watchers must own their side effects immediately. Targeted
      // restrictions do not enter this set or add a new eager watcher burst.
      if (
        activationDeferredMountTabIds?.has(terminalTab.id) &&
        canWatcherCoverParkedTerminalTab(worktreeId, terminalTab)
      ) {
        parked.add(terminalTab.id)
      }
    }
    return parked
  }, [
    assignments,
    coldParkTerminalPanes,
    coldParkedTerminalTabIds,
    activationDeferredMountTabIds,
    isWorktreeActive,
    shouldMeasureHiddenWorktree,
    terminalTabs,
    worktreeId
  ])

  // Why: runs in the same effect flush as the commit that parked/revealed the
  // panes — watcher disposal therefore lands before any PTY data IPC can
  // reach a freshly remounted pane, and watcher start lands after the parked
  // pane's unmount capture.
  useEffect(() => {
    syncParkedTerminalTabWatchers({
      worktreeId,
      tabs: terminalTabs,
      parkedTabIds: parkedTerminalTabIds,
      // Why: activation-deferred tabs have no prior pane-owned title slot;
      // pull main's title-only snapshot when their watcher starts.
      restoreTitleOnStartTabIds: activationDeferredMountTabIds ?? undefined
    })
  }, [activationDeferredMountTabIds, parkedTerminalTabIds, terminalTabs, worktreeId])

  useEffect(() => () => disposeParkedTerminalWatchersForWorktree(worktreeId), [worktreeId])

  return parkedTerminalTabIds
}
