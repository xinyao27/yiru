import { useCallback, useEffect, useRef, useSyncExternalStore, type RefObject } from 'react'
import {
  BACKGROUND_MOUNT_TERMINAL_WORKTREE_EVENT,
  type BackgroundMountTerminalWorktreeDetail
} from '~renderer/constants/terminal'
import { hasRegisteredRuntimeTerminalTab } from '~renderer/runtime/sync-runtime-graph'
import { useAppStore } from '~renderer/store'

import { canWatcherCoverParkedTerminalTab } from '../terminal-pane/terminal-parked-tab-watchers'
import {
  applyBackgroundMountTabRestriction,
  canDeferColdActivationTabsForHost,
  planColdActivationTabDeferral,
  pruneClosedBackgroundMountTabs,
  revealActivationDeferredTabs,
  takeAllPendingBackgroundTerminalWorktreeMounts,
  takePendingBackgroundTerminalWorktreeMount
} from '../terminal/background-terminal-worktree-mount'
import { scheduleBackgroundTerminalWorktreeMeasure } from './background-terminal-worktree-visibility'
import { terminalProviderHasAuthoritativeSnapshot } from './provider-snapshot-capability'
import { getResolvedExecutionHostIdForWorktree } from './resolved-worktree-execution-host'
import { anyMountedWorktreeHasLayout as computeAnyMountedWorktreeHasLayout } from './split-group-mount'

type WorkspaceSurface = { id: string; path: string }

type TerminalWorktreeMountingArgs = {
  workspaceSurfaces: WorkspaceSurface[]
}

export type TerminalWorktreeMounting = {
  mountedWorktreeIdsRef: RefObject<Set<string>>
  measurableBackgroundWorktreeIdsRef: RefObject<Set<string>>
  backgroundMountTabIdsByWorktreeRef: RefObject<Map<string, ReadonlySet<string>>>
  activationDeferredMountTabIdsByWorktreeRef: RefObject<Map<string, ReadonlySet<string>>>
  backgroundMountRevision: number
  anyMountedWorktreeHasLayout: boolean
}

// Why: tracks which worktrees have ever been activated (only visited
// worktrees mount a TerminalPane, preventing mass PTY spawning on session
// restore) and, for the active worktree, which of its tabs a cold activation
// defers mounting for. Cold-parking of *hidden* worktrees is a separate
// concern in `useTerminalColdParking`, which reads the refs this hook
// returns.
export function useTerminalWorktreeMounting({
  workspaceSurfaces
}: TerminalWorktreeMountingArgs): TerminalWorktreeMounting {
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const tabsByWorktree = useAppStore((s) => s.tabsByWorktree)
  const pendingStartupByTabId = useAppStore((s) => s.pendingStartupByTabId)
  const groupsByWorktree = useAppStore((s) => s.groupsByWorktree)
  const layoutByWorktree = useAppStore((s) => s.layoutByWorktree)
  const activeGroupIdByWorktree = useAppStore((s) => s.activeGroupIdByWorktree)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const activeTabIdByWorktree = useAppStore((s) => s.activeTabIdByWorktree)
  const workspaceSessionReady = useAppStore((s) => s.workspaceSessionReady)
  const terminalParkingEnabled = useAppStore((s) => s.settings?.terminalHiddenViewParking !== false)
  const terminalTitleSnapshotAuthorityEnabled = true
  const activeWorktreeDeferralHostId = useAppStore((s) =>
    getResolvedExecutionHostIdForWorktree(s, activeWorktreeId)
  )

  // Track which worktrees have been activated during this app session.
  // Only mount TerminalPanes for visited worktrees to prevent mass PTY
  // spawning when restoring a session with many saved worktree tabs.
  const mountedWorktreeIdsRef = useRef(new Set<string>())
  const measurableBackgroundWorktreeIdsRef = useRef(new Set<string>())
  const measurableBackgroundWorktreeTimersRef = useRef(new Map<string, number>())
  // Why: the revision is bumped from a mount-time replay of already-queued
  // background mounts, from the live DOM event listener, and from a
  // setTimeout — none of those are prop/state-driven renders, so the counter
  // is modeled as an external store instead of useState to avoid seeding it
  // from a mount effect.
  const backgroundMountRevisionRef = useRef(0)
  const backgroundMountRevisionListenersRef = useRef(new Set<() => void>())
  const notifyBackgroundMountRevision = useCallback((): void => {
    backgroundMountRevisionRef.current += 1
    for (const listener of backgroundMountRevisionListenersRef.current) {
      listener()
    }
  }, [])
  const subscribeToBackgroundMountRevision = useCallback((listener: () => void): (() => void) => {
    backgroundMountRevisionListenersRef.current.add(listener)
    return () => {
      backgroundMountRevisionListenersRef.current.delete(listener)
    }
  }, [])
  const getBackgroundMountRevisionSnapshot = useCallback(
    (): number => backgroundMountRevisionRef.current,
    []
  )
  const backgroundMountRevision = useSyncExternalStore(
    subscribeToBackgroundMountRevision,
    getBackgroundMountRevisionSnapshot
  )
  // Why: background-mounted worktrees restricted to specific tabs (targeted
  // wake/resume) must not instantiate a TerminalPane per saved tab. A worktree
  // absent from this map mounts all of its tabs.
  const backgroundMountTabIdsByWorktreeRef = useRef(new Map<string, ReadonlySet<string>>())
  // Why: targeted background mounts share the allowed-tab map above, but only
  // cold activation deferral should immediately create watcher coverage for
  // every unmounted tab.
  const activationDeferredMountTabIdsByWorktreeRef = useRef(new Map<string, ReadonlySet<string>>())
  // Why: the cold-activation deferral decision must run once per activation
  // transition, not on every re-render of an already-active worktree.
  const lastActivationWorktreeIdRef = useRef<string | null>(null)

  useEffect(() => {
    const timers = measurableBackgroundWorktreeTimersRef.current
    const applyBackgroundMount = (detail: BackgroundMountTerminalWorktreeDetail): void => {
      const worktreeId = detail.worktreeId
      applyBackgroundMountTabRestriction(
        backgroundMountTabIdsByWorktreeRef.current,
        mountedWorktreeIdsRef.current,
        worktreeId,
        detail.tabIds
      )
      // Why: a targeted wake can reveal a tab that was deferred by an earlier
      // user activation. Remove it from watcher ownership before its pane mounts.
      const worktreeTabIds = (useAppStore.getState().tabsByWorktree[worktreeId] ?? []).map(
        (tab) => tab.id
      )
      revealActivationDeferredTabs({
        restrictions: backgroundMountTabIdsByWorktreeRef.current,
        deferredMountTabIdsByWorktree: activationDeferredMountTabIdsByWorktreeRef.current,
        worktreeId,
        allTabIds: worktreeTabIds,
        immediateTabIds: new Set(detail.tabIds ?? worktreeTabIds)
      })
      scheduleBackgroundTerminalWorktreeMeasure({
        mountedWorktreeIds: mountedWorktreeIdsRef.current,
        measurableBackgroundWorktreeIds: measurableBackgroundWorktreeIdsRef.current,
        timers,
        worktreeId,
        onRevision: notifyBackgroundMountRevision,
        setTimeoutFn: window.setTimeout,
        clearTimeoutFn: window.clearTimeout
      })
    }
    const onBackgroundMountTerminalWorktree = (event: Event): void => {
      const customEvent = event as CustomEvent<BackgroundMountTerminalWorktreeDetail>
      const worktreeId = customEvent.detail?.worktreeId
      const pending = takePendingBackgroundTerminalWorktreeMount(worktreeId)
      const detail = pending ?? customEvent.detail
      if (detail?.worktreeId) {
        applyBackgroundMount(detail)
      }
    }
    window.addEventListener(
      BACKGROUND_MOUNT_TERMINAL_WORKTREE_EVENT,
      onBackgroundMountTerminalWorktree as EventListener
    )
    // Requests made while the lazy Terminal bundle/effect was absent stay in
    // the registry and are replayed only after the listener owns the surface.
    for (const pending of takeAllPendingBackgroundTerminalWorktreeMounts()) {
      applyBackgroundMount(pending)
    }
    return () => {
      window.removeEventListener(
        BACKGROUND_MOUNT_TERMINAL_WORKTREE_EVENT,
        onBackgroundMountTerminalWorktree as EventListener
      )
      for (const timer of timers.values()) {
        window.clearTimeout(timer)
      }
      timers.clear()
    }
  }, [notifyBackgroundMountRevision])

  // Why: gated on workspaceSessionReady to prevent TerminalPane from mounting
  // before reconnectPersistedTerminals() has finished eagerly spawning PTYs.
  // Without this gate, Phase 1 (hydrateWorkspaceSession) sets activeWorktreeId
  // with ptyId: null, and TerminalPane would call connectPanePty → pty:spawn,
  // creating a duplicate PTY for the same tab.
  if (activeWorktreeId && workspaceSessionReady) {
    // A real activation supersedes any targeted background mount, but a cold
    // activation must not mount every saved tab in one pass: each TerminalPane
    // mount replays scrollback through xterm, attaches a WebGL renderer, and
    // issues a sync-IPC snapshot read, so a whole-worktree stampede freezes
    // the renderer for the entire activation. Hidden tabs defer like
    // cold-parked tabs from birth and mount on first reveal.
    const worktreeTabs = tabsByWorktree[activeWorktreeId] ?? []
    const coldActivationDeferralEnabled =
      terminalParkingEnabled && terminalTitleSnapshotAuthorityEnabled
    const immediateTabIds = new Set<string>()
    if (activeTabId) {
      immediateTabIds.add(activeTabId)
    }
    // Why: on a fresh switch the global activeTabId can still point at the
    // previous worktree for one pass; the remembered per-worktree tab is the
    // one about to become visible.
    const rememberedActiveTabId = activeTabIdByWorktree[activeWorktreeId]
    if (rememberedActiveTabId) {
      immediateTabIds.add(rememberedActiveTabId)
    }
    // Why groups: split mode shows one tab per group at once, so every
    // group's active tab is user-visible and must not defer. group.activeTabId
    // is a unified-tab id — map it to the terminal tab's entity id, keeping
    // the raw id too in case older persisted groups stored entity ids.
    const unifiedTabById = new Map(
      (useAppStore.getState().unifiedTabsByWorktree[activeWorktreeId] ?? []).map((unifiedTab) => [
        unifiedTab.id,
        unifiedTab
      ])
    )
    for (const group of groupsByWorktree[activeWorktreeId] ?? []) {
      if (!group.activeTabId) {
        continue
      }
      immediateTabIds.add(group.activeTabId)
      const activeUnifiedTab = unifiedTabById.get(group.activeTabId)
      if (activeUnifiedTab?.contentType === 'terminal') {
        immediateTabIds.add(activeUnifiedTab.entityId)
      }
    }
    // Why: a queued startup needs a mounted pane to run its command.
    // pendingActivationSpawn is deliberately NOT immediate: session hydration
    // blanket-marks every persisted tab with it, and a deferred tab's reveal
    // consumes it exactly like an activation mount would — just later.
    for (const tab of worktreeTabs) {
      if (pendingStartupByTabId[tab.id] !== undefined) {
        immediateTabIds.add(tab.id)
      }
    }
    const activationHostSupportsDeferral = canDeferColdActivationTabsForHost({
      executionHostId: activeWorktreeDeferralHostId
    })
    if (lastActivationWorktreeIdRef.current !== activeWorktreeId) {
      lastActivationWorktreeIdRef.current = activeWorktreeId
      const tabById = new Map(worktreeTabs.map((tab) => [tab.id, tab]))
      planColdActivationTabDeferral({
        restrictions: backgroundMountTabIdsByWorktreeRef.current,
        deferredMountTabIdsByWorktree: activationDeferredMountTabIdsByWorktreeRef.current,
        worktreeId: activeWorktreeId,
        allTabIds: worktreeTabs.map((tab) => tab.id),
        isTabLive: hasRegisteredRuntimeTerminalTab,
        // Why the coverage gate: an unmounted tab's bells/titles/completions
        // are owned by parked byte watchers; a tab they cannot cover must
        // mount immediately, mirroring the cold-park eligibility rule.
        isTabDeferrable: (tabId) => {
          const tab = tabById.get(tabId)
          return (
            // Why: byte-mode watchers cannot reconstruct output emitted before
            // registration. Remote or unresolved ownership also mounts eagerly
            // because only a confirmed local daemon can provide snapshots.
            coldActivationDeferralEnabled &&
            activationHostSupportsDeferral &&
            tab !== undefined &&
            canWatcherCoverParkedTerminalTab(
              activeWorktreeId,
              tab,
              terminalProviderHasAuthoritativeSnapshot
            )
          )
        },
        immediateTabIds
      })
    } else if (!coldActivationDeferralEnabled || !activationHostSupportsDeferral) {
      // Why: kill-switch or host-ownership changes while active must restore
      // eager mounting immediately, not strand an old local-only restriction.
      backgroundMountTabIdsByWorktreeRef.current.delete(activeWorktreeId)
      activationDeferredMountTabIdsByWorktreeRef.current.delete(activeWorktreeId)
    } else {
      // Why: tabs added after activation never passed the original coverage
      // gate. Uncoverable/no-PTY tabs must mount now so they can spawn or keep
      // their non-snapshot-backed live transport.
      for (const tab of worktreeTabs) {
        if (
          !canWatcherCoverParkedTerminalTab(
            activeWorktreeId,
            tab,
            terminalProviderHasAuthoritativeSnapshot
          )
        ) {
          immediateTabIds.add(tab.id)
        }
      }
      revealActivationDeferredTabs({
        restrictions: backgroundMountTabIdsByWorktreeRef.current,
        deferredMountTabIdsByWorktree: activationDeferredMountTabIdsByWorktreeRef.current,
        worktreeId: activeWorktreeId,
        allTabIds: worktreeTabs.map((tab) => tab.id),
        immediateTabIds
      })
    }
    mountedWorktreeIdsRef.current.add(activeWorktreeId)
  } else {
    // Why: the next ready activation must re-run the deferral decision even
    // if it re-activates the same worktree the session started on.
    lastActivationWorktreeIdRef.current = null
  }
  pruneClosedBackgroundMountTabs(
    backgroundMountTabIdsByWorktreeRef.current,
    mountedWorktreeIdsRef.current,
    tabsByWorktree,
    activationDeferredMountTabIdsByWorktreeRef.current
  )
  // Prune IDs of worktrees that no longer exist (deleted/removed)
  const allWorktreeIds = new Set(workspaceSurfaces.map((workspace) => workspace.id))
  for (const id of mountedWorktreeIdsRef.current) {
    if (!allWorktreeIds.has(id)) {
      mountedWorktreeIdsRef.current.delete(id)
      backgroundMountTabIdsByWorktreeRef.current.delete(id)
      activationDeferredMountTabIdsByWorktreeRef.current.delete(id)
    }
  }
  const anyMountedWorktreeHasLayout = computeAnyMountedWorktreeHasLayout(
    workspaceSurfaces.map((workspace) => workspace.id),
    mountedWorktreeIdsRef.current,
    layoutByWorktree,
    groupsByWorktree,
    activeGroupIdByWorktree
  )

  return {
    mountedWorktreeIdsRef,
    measurableBackgroundWorktreeIdsRef,
    backgroundMountTabIdsByWorktreeRef,
    activationDeferredMountTabIdsByWorktreeRef,
    backgroundMountRevision,
    anyMountedWorktreeHasLayout
  }
}
