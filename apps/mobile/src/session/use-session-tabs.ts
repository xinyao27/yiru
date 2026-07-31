import { useCallback, useRef, useState } from 'react'

import type { MobileSessionTab, MobileSessionTabType } from './screen-state'
import type { AppliedSnapshotMarker } from './tab-snapshot-gate'

export type MobileSessionTabsStore = {
  sessionTabs: MobileSessionTab[]
  setSessionTabs: React.Dispatch<React.SetStateAction<MobileSessionTab[]>>
  sessionTabsRef: React.RefObject<MobileSessionTab[]>
  activeSessionTab: MobileSessionTab | null
  activeSessionTabId: string | null
  setActiveSessionTabId: React.Dispatch<React.SetStateAction<string | null>>
  activeSessionTabIdRef: React.RefObject<string | null>
  activeSessionTabTypeRef: React.RefObject<MobileSessionTabType | null>
  appliedSnapshotMarkerRef: React.RefObject<AppliedSnapshotMarker>
  closedTabTombstonesRef: React.RefObject<Map<string, number>>
  pendingActiveSessionTabIdRef: React.RefObject<string | null>
  pendingActiveTerminalHandleRef: React.RefObject<string | null>
  releasePendingTabSelection: (tabId: string, handle?: string) => void
  resetForRoute: () => void
}

// Owns the session-tab snapshot state for one route: the tab list, the local
// selection, the out-of-order/tombstone gates, and the pending-activation
// markers. Everything here is written by the snapshot reconciler
// (use-session-tab-snapshot) and by explicit tab mutations on the screen.
export function useMobileSessionTabsStore(): MobileSessionTabsStore {
  const [sessionTabs, setSessionTabs] = useState<MobileSessionTab[]>([])
  const sessionTabsRef = useRef<MobileSessionTab[]>([])
  const [activeSessionTabId, setActiveSessionTabId] = useState<string | null>(null)
  const activeSessionTabIdRef = useRef<string | null>(null)
  const activeSessionTabTypeRef = useRef<MobileSessionTabType | null>(null)
  // Why: subscription, 2s polling, and post-mutation refetch race to apply tab
  // snapshots. Track the last applied (publicationEpoch, snapshotVersion) so a
  // late-arriving older snapshot from the same publisher can't overwrite (and
  // resurrect closed tabs in) a newer one. See session-tab-snapshot-gate.
  const appliedSnapshotMarkerRef = useRef<AppliedSnapshotMarker>({ epoch: null, version: -1 })
  // Why: after an optimistic local close, suppress the tab until the publisher
  // confirms its absence, so an in-flight snapshot generated before the close
  // propagated (and thus newer by version) can't flash the tab back. Maps tab id
  // to an expiry timestamp so a failed host-side close can't hide a tab forever.
  const closedTabTombstonesRef = useRef<Map<string, number>>(new Map())
  const pendingActiveSessionTabIdRef = useRef<string | null>(null)
  const pendingActiveTerminalHandleRef = useRef<string | null>(null)

  const activeSessionTab = sessionTabs.find((tab) => tab.id === activeSessionTabId) ?? null

  // Why: terminal gesture/input callbacks are intentionally stable and
  // imperative; keep their refs current before commit instead of one effect later.
  sessionTabsRef.current = sessionTabs
  activeSessionTabIdRef.current = activeSessionTabId
  activeSessionTabTypeRef.current = activeSessionTab?.type ?? null

  // Why: a failed activate RPC must not latch the local selection, or every later
  // snapshot keeps the stale pending tab and ignores desktop-driven tab changes.
  const releasePendingTabSelection = useCallback((tabId: string, handle?: string) => {
    if (pendingActiveSessionTabIdRef.current === tabId) {
      pendingActiveSessionTabIdRef.current = null
    }
    if (handle && pendingActiveTerminalHandleRef.current === handle) {
      pendingActiveTerminalHandleRef.current = null
    }
  }, [])

  // Why: Expo can reuse this screen across worktrees. Drop pending activation
  // markers, the snapshot floor, and tombstones so prior route state cannot
  // reject the next worktree's first snapshot or hide its tabs.
  const resetForRoute = useCallback(() => {
    activeSessionTabTypeRef.current = null
    pendingActiveSessionTabIdRef.current = null
    pendingActiveTerminalHandleRef.current = null
    appliedSnapshotMarkerRef.current = { epoch: null, version: -1 }
    closedTabTombstonesRef.current.clear()
    setSessionTabs([])
    setActiveSessionTabId(null)
  }, [])

  return {
    sessionTabs,
    setSessionTabs,
    sessionTabsRef,
    activeSessionTab,
    activeSessionTabId,
    setActiveSessionTabId,
    activeSessionTabIdRef,
    activeSessionTabTypeRef,
    appliedSnapshotMarkerRef,
    closedTabTombstonesRef,
    pendingActiveSessionTabIdRef,
    pendingActiveTerminalHandleRef,
    releasePendingTabSelection,
    resetForRoute
  }
}
