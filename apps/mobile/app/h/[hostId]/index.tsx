import type { RepoIcon } from '@yiru/workbench-model/workspace'
import type { WorkspaceStatusDefinition } from '@yiru/workbench-model/workspace'
import { useFocusEffect, useLocalSearchParams, usePathname, useRouter } from 'expo-router'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  View,
  Text,
  SectionList,
  Pressable,
  ActivityIndicator,
  Alert,
  RefreshControl
} from 'react-native'

import { buildWorktreeNavigationActions } from '~/agent-history/worktree-navigation-actions'
import { setCachedRepos } from '~/cache/repo-cache'
import { getCachedWorktrees, setCachedWorktrees } from '~/cache/worktree-cache'
import { ActionSheetContent } from '~/components/action-sheet-modal'
import { AuthFailedBanner } from '~/components/auth-failed-banner'
import { BottomDrawer } from '~/components/bottom-drawer'
import { ConfirmModal } from '~/components/confirm-modal'
import { MobileGlassGroup } from '~/components/glass/group'
import { MobileGlassTextButton } from '~/components/glass/text-button'
import { NewWorkspaceFab } from '~/components/new-workspace-fab'
import { NewWorkspaceModalController } from '~/components/new-workspace-modal-controller'
import { ProtocolBlockScreen } from '~/components/protocol-block-screen'
import { MobileRepoIcon } from '~/components/repo-icon'
import {
  PushPin as Pin,
  CaretDown as ChevronDown,
  CaretRight as ChevronRight,
  Moon
} from '~/components/uniwind-icons'
import { WorkspaceDetailPlaceholder } from '~/components/workspace-detail-placeholder'
import { WorkspaceListRow } from '~/components/workspace-list-row'
import {
  createInitialHostRouteActionState,
  resolveHostRouteActionState,
  setHostRouteNewWorktreeVisible
} from '~/host-route/action-state'
import { leaveHostRoute } from '~/host-route/exit'
import { useResponsiveLayout } from '~/layout/responsive-layout'
import { floatingWorkspaceSessionPath } from '~/session/floating-workspace'
import { loadPinnedIds, savePinnedIds } from '~/storage/preferences'
import { cn } from '~/style/class-names'
import { useHostClient, useCloseHost, useForceReconnect } from '~/transport/client-context'
import {
  useLastConnectedAt,
  useReconnectAttempt
} from '~/transport/client-context-connection-metrics'
import { classifyConnection, type ConnectionVerdict } from '~/transport/connection-health'
import { removeHostAndCloseClient } from '~/transport/host-removal-lifecycle'
import type { RepoSummary } from '~/transport/host-rpc-types'
import { useHostStatusGates } from '~/transport/host-status-gates'
import { loadHosts, updateLastConnected } from '~/transport/host-store'
import type { RpcClient } from '~/transport/rpc-client'
import type { RpcSuccess } from '~/transport/types'
import { useWorktreeResync } from '~/transport/use-worktree-resync'
import { getMobileWorkspaceLineageGroupKey } from '~/workspace/lineage'
import { MobileWorkspaceListChrome } from '~/workspace/list-chrome'
import {
  getWorktreeStatus,
  isWorktreePinned,
  type FilterState,
  type Worktree
} from '~/workspace/list-sections'
import { areWorktreeListsEqual } from '~/workspace/list-snapshot'
import { MobileWorkspaceListToolbar } from '~/workspace/list-toolbar'
import { repoColor } from '~/workspace/repo-color'
import { DEFAULT_MOBILE_WORKSPACE_STATUSES } from '~/workspace/statuses'
import { useActiveWorktreeScroll } from '~/workspace/use-active-scroll'
import { useWorkspaceSections } from '~/workspace/use-list-sections'
import { useNow } from '~/workspace/use-now'
import {
  applyDesktopViewSettings,
  type MobileSortMode,
  type MobileViewState,
  type WorkspaceViewSettings
} from '~/workspace/view-settings'

function isErrorVerdict(v: ConnectionVerdict): boolean {
  return v.kind === 'warning' || v.kind === 'unreachable' || v.kind === 'auth-failed'
}

const REPO_METADATA_REFRESH_MS = 60_000

// Why: a worktree.ps snapshot in flight predates a pin/unpin the user just made,
// so pending intents win until their worktree.set RPC settles.
function applyPendingPinChanges(
  worktrees: Worktree[],
  pending: ReadonlyMap<string, boolean>
): Worktree[] {
  if (pending.size === 0) {
    return worktrees
  }
  return worktrees.map((w) => {
    const isPinned = pending.get(w.worktreeId)
    return isPinned === undefined || isPinned === w.isPinned ? w : { ...w, isPinned }
  })
}

type HostScreenProps = {
  // Why: when true, this worktree list is rendered as the persistent tablet
  // sidebar by the host layout rather than as its own routed screen. That
  // swaps the back button for a hide-sidebar control, drives data fetching
  // from a plain mount effect (the sidebar is never the "focused" route), and
  // opens sessions into the detail pane instead of pushing a new full screen.
  embedded?: boolean
  // Route params aren't in scope when rendered from the layout, so the caller
  // passes hostId/action explicitly; falls back to the local route params.
  hostId?: string
  action?: string
  onHideSidebar?: () => void
}

export function HostScreen({
  embedded = false,
  hostId: hostIdProp,
  action: actionProp,
  onHideSidebar
}: HostScreenProps = {}) {
  const params = useLocalSearchParams<{ hostId: string; action?: string; uiLabName?: string }>()
  const hostId = hostIdProp ?? params.hostId
  const action = actionProp ?? params.action
  const uiLabName = __DEV__ && typeof params.uiLabName === 'string' ? params.uiLabName : ''
  const router = useRouter()
  const pathname = usePathname()

  // Why: cap and center the worktree list on wide/tablet canvases; on phones
  // isWideLayout is false so the list stays edge-to-edge as before. When
  // embedded as the sidebar the list already lives in a narrow pane, so the
  // cap is skipped (see the SectionList contentContainerStyle below).

  const { isWideLayout, contentMaxWidth } = useResponsiveLayout()
  const [initialCache] = useState(() =>
    hostId ? (getCachedWorktrees(hostId) as Worktree[] | null) : null
  )
  // Why: shared client per host owned by RpcClientProvider. See
  // docs/mobile-shared-client-per-host.md.
  const { client, state: connState } = useHostClient(hostId)
  const reconnectAttempts = useReconnectAttempt(hostId)
  const lastConnectedAt = useLastConnectedAt(hostId)
  const clientRef = useRef<RpcClient | null>(null)
  const fetchWorktreesInFlightRef = useRef(false)
  const fetchRepoMetadataInFlightRef = useRef(false)
  const repoMetadataFetchedAtRef = useRef(0)
  const newWorktreeModalRef = useRef<{ open: () => void }>(null)
  const newWorktreeModalVisibleRef = useRef(false)
  const closeHostClient = useCloseHost()
  const forceReconnectHost = useForceReconnect()
  const [worktrees, setWorktrees] = useState<Worktree[]>(initialCache ?? [])
  const [worktreesLoaded, setWorktreesLoaded] = useState(initialCache != null)
  // Why: opening a worktree activates it on the host, but the active-row
  // highlight otherwise waits for the next worktree.ps poll to reflect it.
  // Track the locally-opened worktree so the highlight moves instantly.
  const [optimisticActiveWorktreeId, setOptimisticActiveWorktreeId] = useState<string | null>(null)
  // One tick drives every visible agent row's relative timestamp.
  const now = useNow(30_000)
  const [repoColorsByName, setRepoColorsByName] = useState<Map<string, string>>(new Map())
  const [repoIconsByName, setRepoIconsByName] = useState<Map<string, RepoIcon>>(new Map())
  const [hostName, setHostName] = useState('')
  const [error, setError] = useState('')
  const [lastKnownWorktrees, setLastKnownWorktrees] = useState<Worktree[]>(initialCache ?? [])
  const [search, setSearch] = useState('')
  const [sortMode, setSortMode] = useState<MobileSortMode>('recent')
  const [filters, setFilters] = useState<FilterState>({
    filterRepoIds: new Set(),
    hideSleeping: false,
    hideDefaultBranch: false
  })
  const groupMode = 'repo'
  const [workspaceStatuses, setWorkspaceStatuses] = useState<readonly WorkspaceStatusDefinition[]>(
    DEFAULT_MOBILE_WORKSPACE_STATUSES
  )
  // displayName → repo id, populated from repo.list. The filter model keys on
  // repo ids (desktop's PersistedUIState), but the section headers/rows key on
  // displayName, so we bridge the two here.
  const [repoIdsByName, setRepoIdsByName] = useState<Map<string, string>>(new Map())
  const [actionTarget, setActionTarget] = useState<Worktree | null>(null)
  const { hostCapabilities, floatingWorkspaceEnabled, compatVerdict } = useHostStatusGates({
    hostId,
    client,
    connState
  })
  const [confirmDelete, setConfirmDelete] = useState<Worktree | null>(null)
  const [confirmRemoveHost, setConfirmRemoveHost] = useState(false)
  const [routeActionState, setRouteActionState] = useState(() =>
    createInitialHostRouteActionState(action)
  )
  const [sleptIds, setSleptIds] = useState<Set<string>>(new Set())

  const leaveHost = useCallback(() => {
    leaveHostRoute(router)
  }, [router])
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set())
  // Why: the 3s worktree.ps poll overwrites pinnedIds (and persists it) from the
  // server snapshot, which would undo an optimistic pin/unpin still in flight.
  // Holds worktreeId → intended isPinned until the worktree.set RPC settles.
  const pendingPinChangesRef = useRef<Map<string, boolean>>(new Map())
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  // Why: snapshot of the synced view settings so the focus-effect ui.get merge
  // and the optimistic ui.set writes read the latest values without forcing the
  // callbacks to re-create on every state change.
  const viewStateRef = useRef<MobileViewState>({
    groupMode: 'repo',
    sortMode: 'recent',
    hideSleeping: false,
    hideDefaultBranch: false,
    filterRepoIds: [],
    collapsedGroups: [],
    workspaceStatuses: DEFAULT_MOBILE_WORKSPACE_STATUSES
  })

  useEffect(() => {
    viewStateRef.current = {
      groupMode,
      sortMode,
      hideSleeping: filters.hideSleeping,
      hideDefaultBranch: filters.hideDefaultBranch,
      filterRepoIds: [...filters.filterRepoIds],
      collapsedGroups: [...collapsedGroups],
      workspaceStatuses
    }
  }, [sortMode, filters, collapsedGroups, workspaceStatuses])

  // Apply a MobileViewState (e.g. from a desktop ui.get) onto the individual
  // states and the snapshot ref in one shot.
  const applyViewState = useCallback((next: MobileViewState) => {
    viewStateRef.current = next
    setSortMode(next.sortMode)
    setWorkspaceStatuses(next.workspaceStatuses)
    setCollapsedGroups(new Set(next.collapsedGroups))
    setFilters({
      filterRepoIds: new Set(next.filterRepoIds),
      hideSleeping: next.hideSleeping,
      hideDefaultBranch: next.hideDefaultBranch
    })
  }, [])

  // Optimistically apply a partial change locally, then push the full mapped
  // settings to the desktop's shared store via ui.set so both apps stay in sync.
  const persistViewSettings = useCallback(
    (patch: Partial<MobileViewState>) => {
      const next: MobileViewState = { ...viewStateRef.current, ...patch }
      applyViewState(next)
      if (!client) {
        return
      }
      const payload: WorkspaceViewSettings = {
        groupBy: 'repo',
        sortBy: next.sortMode,
        hideSleepingWorkspaces: next.hideSleeping,
        hideDefaultBranchWorkspace: next.hideDefaultBranch,
        filterRepoIds: next.filterRepoIds,
        collapsedGroups: next.collapsedGroups
      }
      void client.sendRequest('ui.set', payload).catch(() => {
        // Best-effort: view settings are a convenience preference.
      })
    },
    [client, applyViewState]
  )

  const openNewWorkspaceModal = useCallback(() => {
    const modal = newWorktreeModalRef.current
    if (!modal) {
      return
    }
    newWorktreeModalVisibleRef.current = true
    modal.open()
  }, [])

  const resolvedRouteActionState = resolveHostRouteActionState(routeActionState, action)
  // Why: `action=newWorktree` is a route-derived open edge. Resolve it before
  // commit, but don't reopen after the user closes while the same URL remains.
  if (resolvedRouteActionState !== routeActionState) {
    setRouteActionState(resolvedRouteActionState)
  }
  const showNewWorktree = resolvedRouteActionState.showNewWorktree
  const setShowNewWorktreeVisible = useCallback((visible: boolean) => {
    setRouteActionState((current) => setHostRouteNewWorktreeVisible(current, visible))
  }, [])

  // Load persisted pins from the local cache. View settings are no longer
  // stored locally — they sync from the desktop's shared store via ui.get.
  useEffect(() => {
    if (!hostId) {
      return
    }
    if (uiLabName) {
      setHostName(uiLabName)
      return
    }
    let stale = false
    void (async () => {
      const pins = await loadPinnedIds(hostId)
      if (stale) {
        return
      }
      setPinnedIds(pins)
    })()
    return () => {
      stale = true
    }
  }, [hostId, uiLabName])

  // Read the desktop's shared view settings (PersistedUIState) and merge them
  // onto local state. Runs on connect and on screen focus so changes made on
  // desktop appear on the phone.
  const syncViewSettingsFromDesktop = useCallback(async () => {
    if (!client || connState !== 'connected') {
      return
    }
    const requestClient = client
    const requestHostId = hostId
    try {
      const response = await requestClient.sendRequest('ui.get')
      if (clientRef.current !== requestClient || hostId !== requestHostId || !response.ok) {
        return
      }
      const ui = ((response as RpcSuccess).result as { ui?: WorkspaceViewSettings }).ui
      if (!ui) {
        return
      }
      applyViewState(applyDesktopViewSettings(viewStateRef.current, ui))
    } catch {
      // Transient transport failure; retry on the next focus/connect.
    }
  }, [client, connState, hostId, applyViewState])

  // Why: keep clientRef in sync so existing imperative call sites work
  // unchanged. Also re-seed the cached worktree list on hostId change
  // since the useState initializer only runs on first mount.
  useEffect(() => {
    clientRef.current = client
  }, [client])

  useEffect(() => {
    setHostName('')
    setError('')
    setRepoColorsByName(new Map())
    setRepoIconsByName(new Map())
    repoMetadataFetchedAtRef.current = 0
    // Why: re-seed from the current host's cache on every hostId change.
    // The useState initializer only runs on first mount, so if Expo Router
    // reuses this screen with a different hostId, we must reset here.
    const freshCache = hostId ? (getCachedWorktrees(hostId) as Worktree[] | null) : null
    if (freshCache) {
      setWorktrees(freshCache)
      setLastKnownWorktrees(freshCache)
      setWorktreesLoaded(true)
    } else {
      setWorktreesLoaded(false)
      setWorktrees([])
      setLastKnownWorktrees([])
    }
    if (!hostId) {
      return
    }
    if (uiLabName) {
      setHostName(uiLabName)
      return
    }
    let stale = false
    void loadHosts().then((hosts) => {
      if (stale) {
        return
      }
      const host = hosts.find((h) => h.id === hostId)
      if (!host) {
        setError('Host not found')
        return
      }
      setHostName(host.name)
      void updateLastConnected(host.id)
    })
    return () => {
      stale = true
    }
  }, [hostId, uiLabName])

  const fetchRepoMetadata = useCallback(
    async (options: { force?: boolean } = {}) => {
      if (!client || connState !== 'connected' || !hostId) {
        return
      }
      if (fetchRepoMetadataInFlightRef.current) {
        return
      }
      const now = Date.now()
      if (!options.force && now - repoMetadataFetchedAtRef.current < REPO_METADATA_REFRESH_MS) {
        return
      }
      fetchRepoMetadataInFlightRef.current = true
      const requestClient = client,
        requestHostId = hostId
      try {
        const repoResponse = await requestClient.sendRequest('repo.list')
        if (clientRef.current !== requestClient || hostId !== requestHostId || !repoResponse.ok) {
          return
        }
        const repoResult = (repoResponse as RpcSuccess).result as { repos: RepoSummary[] }
        repoMetadataFetchedAtRef.current = Date.now()
        setCachedRepos(requestHostId, repoResult.repos)
        setRepoColorsByName(
          new Map(
            repoResult.repos.map((repo) => [
              repo.displayName,
              repo.badgeColor || repoColor(repo.displayName)
            ])
          )
        )
        setRepoIconsByName(
          new Map(
            repoResult.repos.flatMap((repo) =>
              repo.repoIcon ? [[repo.displayName, repo.repoIcon] as const] : []
            )
          )
        )
        setRepoIdsByName(new Map(repoResult.repos.map((repo) => [repo.displayName, repo.id])))
      } catch {
        // Repo metadata is decorative; the next throttled refresh can retry.
      } finally {
        fetchRepoMetadataInFlightRef.current = false
      }
    },
    [client, connState, hostId]
  )

  const fetchWorktrees = useCallback(
    async (options: { allowDuringModal?: boolean } = {}) => {
      if (!client || connState !== 'connected') {
        return
      }
      if (!options.allowDuringModal && newWorktreeModalVisibleRef.current) {
        return
      }
      // The embedded sidebar polls for the whole split-view session; keep slow
      // remote hosts from stacking overlapping expensive list requests.
      if (fetchWorktreesInFlightRef.current) {
        return
      }
      fetchWorktreesInFlightRef.current = true
      const requestClient = client
      const requestHostId = hostId

      try {
        // Why: worktree.ps defaults to 200 and silently truncates; match the
        // desktop's high cap so large hosts don't drop workspaces on mobile.
        const response = await requestClient.sendRequest('worktree.ps', { limit: 10000 })
        if (clientRef.current !== requestClient || hostId !== requestHostId) {
          return
        }
        if (!options.allowDuringModal && newWorktreeModalVisibleRef.current) {
          return
        }
        if (response.ok) {
          const result = (response as RpcSuccess).result as { worktrees: Worktree[] }
          const worktreeSnapshot = applyPendingPinChanges(
            result.worktrees,
            pendingPinChangesRef.current
          )
          // Why: large hosts can return identical worktree.ps snapshots every
          // poll. Preserving the existing array keeps SectionList/sort rebuilds
          // off the JS tap path unless something actually changed.
          setWorktrees((current) =>
            areWorktreeListsEqual(current, worktreeSnapshot) ? current : worktreeSnapshot
          )
          setLastKnownWorktrees((current) =>
            areWorktreeListsEqual(current, worktreeSnapshot) ? current : worktreeSnapshot
          )
          setWorktreesLoaded(true)
          // Why (#8498): the host detail screen seeds its list from the
          // home-written cache, so a partial home fetch could poison it until a
          // focus poll corrected it. Write the confirmed snapshot back through
          // the same cache so a reconnect refetch (or a remount) can't serve a
          // stale worktree list.
          if (hostId) {
            setCachedWorktrees(hostId, worktreeSnapshot)
          }
          // Drop the optimistic active override once the host confirms it (the
          // activate RPC has landed and worktree.ps now reports it active), so we
          // stop overriding and respect any later desktop-driven change.
          setOptimisticActiveWorktreeId((pending) =>
            pending && worktreeSnapshot.some((w) => w.worktreeId === pending && w.isActive)
              ? null
              : pending
          )

          // Clear optimistic sleep overrides once the server confirms the
          // worktree is actually inactive (liveTerminalCount dropped to 0).
          setSleptIds((prev) => {
            if (prev.size === 0) {
              return prev
            }
            const still = new Set<string>()
            for (const id of prev) {
              const wt = worktreeSnapshot.find((w) => w.worktreeId === id)
              if (wt && wt.liveTerminalCount > 0) {
                still.add(id)
              }
            }
            return still.size === prev.size ? prev : still
          })

          // Sync local pin state from server so desktop-initiated pins/unpins
          // are reflected without relying on stale AsyncStorage.
          const serverPinned = new Set(
            worktreeSnapshot.filter((w) => w.isPinned).map((w) => w.worktreeId)
          )
          setPinnedIds((prev) => {
            if (serverPinned.size === prev.size && [...serverPinned].every((id) => prev.has(id))) {
              return prev
            }
            if (hostId) {
              void savePinnedIds(hostId, serverPinned)
            }
            return serverPinned
          })
        }
      } catch {
        // Will retry on reconnect
      } finally {
        fetchWorktreesInFlightRef.current = false
      }
    },
    [client, connState, hostId]
  )

  useFocusEffect(
    useCallback(() => {
      // Why: opening the host is a strong user signal — reset a backed-off or
      // trickling reconnect loop (and probe a possibly half-open socket)
      // immediately instead of waiting out its timer. Deps stay empty so this
      // fires per focus transition, not per connection-state change; nudging
      // on every reconnecting↔connecting flip would defeat the backoff.
      clientRef.current?.notifyForeground()
    }, [])
  )

  useFocusEffect(
    useCallback(() => {
      // The embedded sidebar drives its own polling below; focus never fires
      // for it since it isn't a routed screen.
      if (embedded || connState !== 'connected') {
        return
      }
      void fetchWorktrees()
      void fetchRepoMetadata()
      // Pull desktop's shared view settings on focus so desktop-side changes
      // show up here without a manual refresh.
      void syncViewSettingsFromDesktop()
      // Why: React Navigation keeps previous stack screens mounted; only
      // poll the host list while this route is visible.
      const interval = setInterval(() => {
        void fetchWorktrees()
        void fetchRepoMetadata()
      }, 3000)
      return () => clearInterval(interval)
    }, [embedded, connState, fetchWorktrees, fetchRepoMetadata, syncViewSettingsFromDesktop])
  )

  // Why: as the persistent tablet sidebar this list is never the focused
  // route, so useFocusEffect won't fetch/poll. Mirror that behavior from a
  // plain mount effect while connected instead.
  useEffect(() => {
    if (!embedded || connState !== 'connected') {
      return
    }
    void fetchWorktrees()
    void fetchRepoMetadata()
    void syncViewSettingsFromDesktop()
    const interval = setInterval(() => {
      void fetchWorktrees()
      void fetchRepoMetadata()
    }, 3000)
    return () => clearInterval(interval)
  }, [embedded, connState, fetchWorktrees, fetchRepoMetadata, syncViewSettingsFromDesktop])

  // Why (#8498): reconnect refetch + manual pull-to-refresh, extracted to
  // useWorktreeResync so this screen stays under its max-lines budget. The
  // steady-state focus/embedded polls don't cover the transition INTO
  // 'connected' after a background/sleep, which is when the cache is stalest.
  const { refreshing, onRefresh } = useWorktreeResync({
    client,
    connState,
    fetchWorktrees,
    fetchRepoMetadata
  })

  const updateLocalPins = useCallback(
    (worktreeId: string, pinned: boolean) => {
      setPinnedIds((prev) => {
        const next = new Set(prev)
        if (pinned) {
          next.add(worktreeId)
        } else {
          next.delete(worktreeId)
        }
        if (hostId) {
          void savePinnedIds(hostId, next)
        }
        return next
      })
    },
    [hostId]
  )

  const togglePin = useCallback(
    (worktreeId: string) => {
      const worktree = worktrees.find((w) => w.worktreeId === worktreeId)
      const currentlyPinned = worktree
        ? isWorktreePinned(worktree, pinnedIds)
        : pinnedIds.has(worktreeId)
      const newPinned = !currentlyPinned

      setWorktrees((prev) =>
        prev.map((w) => (w.worktreeId === worktreeId ? { ...w, isPinned: newPinned } : w))
      )
      setLastKnownWorktrees((prev) =>
        prev.map((w) => (w.worktreeId === worktreeId ? { ...w, isPinned: newPinned } : w))
      )

      updateLocalPins(worktreeId, newPinned)

      if (client) {
        pendingPinChangesRef.current.set(worktreeId, newPinned)
        const clearPending = () => {
          if (pendingPinChangesRef.current.get(worktreeId) === newPinned) {
            pendingPinChangesRef.current.delete(worktreeId)
          }
        }
        client
          .sendRequest('worktree.set', {
            worktree: `id:${worktreeId}`,
            isPinned: newPinned
          })
          .then(clearPending)
          .catch(clearPending)
      }
    },
    [client, worktrees, pinnedIds, updateLocalPins]
  )

  const handleDeleteWorktree = useCallback(
    async (item: Worktree) => {
      if (!client) {
        return
      }

      const removeFromList = (list: Worktree[]) =>
        list.filter((w) => w.worktreeId !== item.worktreeId)
      setWorktrees(removeFromList)
      setLastKnownWorktrees(removeFromList)

      // Why: a poll can land between the optimistic removal and the failure
      // path and re-add the row from the server, so a blind append would
      // duplicate worktreeId — the SectionList key — and break the render.
      const restoreToList = (list: Worktree[]) =>
        list.some((w) => w.worktreeId === item.worktreeId) ? list : [...list, item]

      try {
        const response = await client.sendRequest('worktree.rm', {
          worktree: `id:${item.worktreeId}`,
          force: true
        })
        if (!response.ok) {
          setWorktrees(restoreToList)
          setLastKnownWorktrees(restoreToList)
          return
        }
        void fetchWorktrees()
      } catch {
        setWorktrees(restoreToList)
        setLastKnownWorktrees(restoreToList)
      }
    },
    [client, fetchWorktrees]
  )

  const handleRemoveHost = useCallback(async () => {
    if (!hostId) {
      return
    }
    try {
      await removeHostAndCloseClient(hostId, closeHostClient)
      leaveHost()
    } catch {
      // Why: metadata commit can fail while the host is still paired; keep the
      // screen mounted and re-open confirm (ConfirmModal closes on confirm).
      setConfirmRemoveHost(true)
      Alert.alert('Could not remove host', 'Please try again.')
    }
  }, [hostId, leaveHost, closeHostClient])

  const navigateFromHostList = useCallback(
    (target: string) => {
      if (!embedded) {
        router.push(target)
        return
      }
      const targetPath = target.split('?')[0] ?? target
      if (pathname === targetPath) {
        return
      }
      if (pathname === `/h/${hostId}`) {
        router.push(target)
        return
      }
      router.replace(target)
    },
    [embedded, hostId, pathname, router]
  )

  const openAccounts = useCallback(() => {
    navigateFromHostList(`/h/${hostId}/accounts`)
  }, [hostId, navigateFromHostList])

  const reconnectHost = useCallback(() => {
    if (hostId) {
      void forceReconnectHost(hostId)
    }
  }, [forceReconnectHost, hostId])

  const openFloatingWorkspace = useCallback(() => {
    // Why: the sentinel has no worktree record; session.tabs.list hydrates its host-owned tabs.
    navigateFromHostList(floatingWorkspaceSessionPath(hostId))
  }, [hostId, navigateFromHostList])

  const openWorktreeSession = useCallback(
    (item: Worktree) => {
      // Highlight the row immediately; the next worktree.ps poll confirms it.
      setOptimisticActiveWorktreeId(item.worktreeId)
      if (client && connState === 'connected') {
        // Why: opening a mobile session should hydrate host-owned tabs without
        // pulling other paired clients, especially desktop, into this worktree.
        void client
          .sendRequest('worktree.activate', {
            worktree: `id:${item.worktreeId}`,
            notifyClients: false
          })
          .catch(() => null)
      }
      const target = `/h/${hostId}/session/${encodeURIComponent(item.worktreeId)}?name=${encodeURIComponent(item.displayName || item.repo)}`
      navigateFromHostList(target)
    },
    [client, connState, hostId, navigateFromHostList]
  )

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (filters.hideSleeping) {
      count++
    }
    if (filters.hideDefaultBranch) {
      count++
    }
    count += filters.filterRepoIds.size
    return count
  }, [filters])
  const displayWorktrees = useMemo(() => {
    const base =
      connState === 'disconnected' || connState === 'reconnecting' || connState === 'auth-failed'
        ? lastKnownWorktrees
        : worktrees
    if (sleptIds.size === 0 && optimisticActiveWorktreeId === null) {
      return base
    }
    return base.map((w) => {
      const slept = sleptIds.has(w.worktreeId)
        ? { liveTerminalCount: 0, hasAttachedPty: false, status: 'inactive' as const }
        : null
      // Force the just-opened worktree active (and the rest inactive) until the
      // next poll confirms it, so the highlight doesn't lag the navigation.
      const active =
        optimisticActiveWorktreeId !== null
          ? { isActive: w.worktreeId === optimisticActiveWorktreeId }
          : null
      return slept || active ? { ...w, ...slept, ...active } : w
    })
  }, [connState, worktrees, lastKnownWorktrees, sleptIds, optimisticActiveWorktreeId])

  const toggleCollapsed = useCallback(
    (key: string) => {
      const next = new Set(viewStateRef.current.collapsedGroups)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      persistViewSettings({ collapsedGroups: [...next] })
    },
    [persistViewSettings]
  )
  const { sections } = useWorkspaceSections({
    displayWorktrees,
    sortMode,
    filters,
    search,
    groupMode,
    pinnedIds,
    repoIdsByName,
    repoColorsByName,
    collapsedGroups,
    workspaceStatuses
  })
  const existingWorktreePaths = useMemo(() => worktrees.map((w) => w.path), [worktrees])

  const { sectionListRef, onScrollToIndexFailed } = useActiveWorktreeScroll(sections)

  const isReadOnly = connState === 'auth-failed'
  const headerVerdict = classifyConnection({
    state: connState,
    reconnectAttempts,
    lastConnectedAt
  })
  const showReconnectButton =
    connState !== 'connected' &&
    isErrorVerdict(headerVerdict) &&
    !!hostId &&
    headerVerdict.kind !== 'auth-failed'
  if (error) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-destructive text-sm">{error}</Text>
      </View>
    )
  }

  if (compatVerdict.kind === 'blocked') {
    return <ProtocolBlockScreen verdict={compatVerdict} />
  }

  return (
    <View className="bg-background flex-1">
      <MobileWorkspaceListChrome
        canUseHost={connState === 'connected'}
        embedded={embedded}
        hostName={hostName}
        onAccounts={openAccounts}
        onBack={leaveHost}
        onHideSidebar={onHideSidebar}
        onReconnect={reconnectHost}
        showReconnect={showReconnectButton}
      >
        <MobileWorkspaceListToolbar
          canUseHost={connState === 'connected'}
          embedded={embedded}
          floatingWorkspaceEnabled={floatingWorkspaceEnabled}
          search={search}
          onAccounts={openAccounts}
          onFloatingWorkspace={openFloatingWorkspace}
          onNewWorkspace={openNewWorkspaceModal}
          onSearchChange={setSearch}
        />
      </MobileWorkspaceListChrome>

      {connState === 'auth-failed' && (
        <AuthFailedBanner
          canRetry={!!hostId}
          onRetry={() => hostId && void forceReconnectHost(hostId)}
          onRepair={() => router.push('/pair-scan')}
          onRemove={() => setConfirmRemoveHost(true)}
        />
      )}

      {((connState === 'connecting' || connState === 'reconnecting') &&
        displayWorktrees.length === 0) ||
      (connState === 'connected' && !worktreesLoaded && displayWorktrees.length === 0) ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
        </View>
      ) : null}

      {connState === 'connected' && worktreesLoaded && sections.length === 0 && (
        <View className="flex-1 items-center justify-center">
          <Text className="text-muted-foreground text-sm">
            {search
              ? 'No matching workspaces'
              : activeFilterCount > 0
                ? 'No workspaces match filters'
                : 'No workspaces'}
          </Text>
        </View>
      )}

      {sections.length > 0 && (
        <SectionList
          ref={sectionListRef}
          sections={sections}
          keyExtractor={(w) => w.sectionListKey ?? w.worktreeId}
          stickySectionHeadersEnabled={false}
          // Why: keep the search IME up while tapping clear / scrolling results.
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScrollToIndexFailed={onScrollToIndexFailed}
          // Why: edge-to-edge — the list scrolls under the system nav bar
          // while reserving insets.bottom keeps the last worktree row reachable
          // above the Samsung 3-button nav / iOS home indicator.
          contentContainerClassName={cn(
            'pb-4',
            embedded ? 'pb-safe-offset-4' : 'pb-safe-offset-18'
          )}
          contentContainerStyle={
            isWideLayout && !embedded
              ? { maxWidth: contentMaxWidth, width: '100%', alignSelf: 'center' }
              : undefined
          }
          renderSectionHeader={({ section }) => {
            if (!section.title) {
              return null
            }
            const isCollapsed = collapsedGroups.has(section.key)
            const isProjectSection = section.icon !== 'pin'
            const repoSectionIcon = isProjectSection ? repoIconsByName.get(section.title) : null
            const hasVisibleWorkspaces = isProjectSection && section.data.length > 0
            return (
              <Pressable
                accessibilityRole="button"
                className="active:bg-accent mt-1 h-11 flex-row items-center gap-1.5 pr-2 pl-2.5"
                onPress={() => toggleCollapsed(section.key)}
              >
                <View className="relative h-11 w-5 items-center justify-center">
                  {hasVisibleWorkspaces ? (
                    <View
                      pointerEvents="none"
                      className="absolute inset-x-0 top-8 bottom-0 items-center"
                    >
                      <View className="bg-border w-hairline h-full" />
                    </View>
                  ) : null}
                  {section.icon === 'pin' ? (
                    <Pin size={16} colorClassName="accent-muted-foreground" />
                  ) : null}
                  {isProjectSection ? (
                    <MobileRepoIcon repoIcon={repoSectionIcon} size={20} />
                  ) : null}
                </View>
                <View className="min-w-0 flex-1">
                  <Text
                    className="text-foreground shrink text-base leading-none font-semibold"
                    numberOfLines={1}
                  >
                    {section.title}
                  </Text>
                </View>
                <View className="h-9 w-5 items-center justify-center">
                  {isCollapsed ? (
                    <ChevronRight size={16} colorClassName="accent-muted-foreground" />
                  ) : (
                    <ChevronDown size={16} colorClassName="accent-muted-foreground" />
                  )}
                </View>
              </Pressable>
            )
          }}
          // Why (#8498): manual pull-to-refresh forces a fresh worktree
          // snapshot after a reconnect or whenever the cache looks stale.
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColorClassName="accent-muted-foreground"
              colorsClassName="accent-muted-foreground"
            />
          }
          renderItem={({ item, section, index }) => (
            <WorkspaceListRow
              item={item}
              isReadOnly={isReadOnly}
              now={now}
              status={getWorktreeStatus(item)}
              repoIcon={repoIconsByName.get(item.repo) ?? null}
              hideRepo={section.icon !== 'pin'}
              nestedUnderProject={section.icon !== 'pin'}
              endsProjectRail={section.icon !== 'pin' && index === section.data.length - 1}
              onPress={openWorktreeSession}
              onLongPress={item.workspaceKind === 'folder-workspace' ? undefined : setActionTarget}
              onToggleLineage={(row) =>
                toggleCollapsed(getMobileWorkspaceLineageGroupKey(row.worktreeId))
              }
            />
          )}
        />
      )}

      {!embedded && (
        <NewWorkspaceFab onPress={openNewWorkspaceModal} disabled={connState !== 'connected'} />
      )}

      {/* Worktree long-press action sheet (inline confirm to avoid double-Modal lag) */}
      <BottomDrawer
        visible={actionTarget != null}
        onClose={() => {
          setConfirmDelete(null)
          setActionTarget(null)
        }}
      >
        {confirmDelete ? (
          <View>
            <View className="pb-4">
              <Text className="text-foreground text-sm">Delete Worktree</Text>
              <Text className="text-muted-foreground mt-1 text-sm leading-5">
                Delete "{confirmDelete.displayName || confirmDelete.repo}" ({confirmDelete.branch})?
              </Text>
            </View>
            <MobileGlassGroup className="flex-row gap-2" spacing={8}>
              <MobileGlassTextButton
                className="flex-1"
                isFullWidth
                label="Cancel"
                onPress={() => setConfirmDelete(null)}
              />
              <MobileGlassTextButton
                className="flex-1"
                isDestructive
                isFullWidth
                label="Delete"
                onPress={() => {
                  if (confirmDelete) {
                    void handleDeleteWorktree(confirmDelete)
                  }
                  setConfirmDelete(null)
                  setActionTarget(null)
                }}
              />
            </MobileGlassGroup>
          </View>
        ) : (
          <ActionSheetContent
            title={actionTarget ? actionTarget.displayName || actionTarget.repo : undefined}
            message={actionTarget?.branch}
            actions={
              actionTarget
                ? [
                    ...buildWorktreeNavigationActions({
                      hostId,
                      worktreeId: actionTarget.worktreeId,
                      worktreeName: actionTarget.displayName || actionTarget.repo,
                      hostCapabilities: hostCapabilities ?? [],
                      navigate: navigateFromHostList,
                      onDone: () => setActionTarget(null)
                    }),
                    {
                      label: 'Sleep',
                      icon: Moon,
                      onPress: () => {
                        if (client) {
                          setSleptIds((prev) => new Set(prev).add(actionTarget.worktreeId))
                          void client
                            .sendRequest('worktree.sleep', {
                              worktree: `id:${actionTarget.worktreeId}`
                            })
                            .catch(() => null)
                        }
                        setActionTarget(null)
                      }
                    },
                    {
                      label: isWorktreePinned(actionTarget, pinnedIds) ? 'Unpin' : 'Pin',
                      onPress: () => {
                        togglePin(actionTarget.worktreeId)
                        setActionTarget(null)
                      }
                    },
                    {
                      label: 'Delete',
                      destructive: true,
                      onPress: () => setConfirmDelete(actionTarget)
                    }
                  ]
                : []
            }
          />
        )}
      </BottomDrawer>

      {/* Host remove confirmation */}
      <ConfirmModal
        visible={confirmRemoveHost}
        title="Remove Host"
        message={`Remove "${hostName}"? You can re-pair later.`}
        confirmLabel="Remove"
        destructive
        onConfirm={() => void handleRemoveHost()}
        onCancel={() => setConfirmRemoveHost(false)}
      />

      <NewWorkspaceModalController
        ref={newWorktreeModalRef}
        routeVisible={showNewWorktree}
        client={client}
        hostId={hostId}
        hostCapabilities={hostCapabilities}
        existingWorktreePaths={existingWorktreePaths}
        existingWorktrees={worktrees}
        onVisibleChange={(visible) => {
          newWorktreeModalVisibleRef.current = visible
        }}
        onCreated={(worktreeId, worktreeName) => {
          void fetchWorktrees({ allowDuringModal: true })
          const params = new URLSearchParams({ name: worktreeName, created: '1' })
          navigateFromHostList(
            `/h/${hostId}/session/${encodeURIComponent(worktreeId)}?${params.toString()}`
          )
        }}
        onRouteVisibleChange={setShowNewWorktreeVisible}
      />
    </View>
  )
}

// Default route export. On wide tablet/foldable canvases the worktree list is
// rendered as a persistent sidebar by the host layout, so the route itself
// becomes the empty detail pane until a workspace is opened. On phones it is
// the full-screen worktree list as before.
export default function HostWorktreeRoute() {
  const { isWideLayout } = useResponsiveLayout()
  if (isWideLayout) {
    return <WorkspaceDetailPlaceholder />
  }
  return <HostScreen />
}
