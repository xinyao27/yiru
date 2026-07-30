import AsyncStorage from '@react-native-async-storage/async-storage'
import { Stack, useRouter, useFocusEffect } from 'expo-router'
import { useState, useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { View, Text, FlatList, Alert, Platform, Pressable } from 'react-native'

import {
  CaretRight as ChevronRight,
  Terminal,
  ArrowClockwise as RefreshCw,
  Power as PowerOff,
  PencilSimple as Edit3
} from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { loadHomeSnapshot, saveHomeSnapshot } from '../src/cache/home-snapshot-cache'
import { setCachedWorktrees, getCachedWorktrees } from '../src/cache/worktree-cache'
import {
  type AccountsSnapshot,
  type ProviderKey,
  getActiveProviderRateLimits,
  getUsageBarState,
  hasActiveProviderUsage,
  hasRenderableUsage,
  UsageBar
} from '../src/components/account-usage'
import { ActionSheetModal, type ActionSheetAction } from '../src/components/action-sheet-modal'
import { ClaudeIcon, OpenAIIcon } from '../src/components/agent-icons'
import { ConfirmModal } from '../src/components/confirm-modal'
import { MobileContentSection } from '../src/components/content-section'
import { MobileGlassGroup } from '../src/components/glass/group'
import { MobileGlassIconButton } from '../src/components/glass/icon-button'
import { MobileGlassTextButton } from '../src/components/glass/text-button'
import { MobileHostCard } from '../src/components/host-card'
import { refreshHomeStatsForHost } from '../src/home/stats-refresh'
import {
  getHomeStatsByHost,
  hydrateHomeStatsByHost,
  subscribeHomeStatsByHost
} from '../src/home/stats-state'
import { translate } from '../src/i18n/translate'
import { useResponsiveLayout } from '../src/layout/responsive-layout'
import { shouldPresentNotificationOptIn } from '../src/notifications/notification-opt-in-gate'
import { subscribeToDesktopNotifications } from '../src/notifications/notifications'
import { triggerMediumImpact } from '../src/platform/haptics'
import { useAllHostClients } from '../src/transport/all-host-clients'
import { useCloseHost, useForceReconnect, usePrimeHosts } from '../src/transport/client-context'
import { classifyConnection } from '../src/transport/connection-health'
import { removeHostAndCloseClient } from '../src/transport/host-removal-lifecycle'
import { loadHosts } from '../src/transport/host-store'
import type { RpcClient } from '../src/transport/rpc-client'
import type { ConnectionState, HostProfile } from '../src/transport/types'
import { scheduleWidgetSnapshotUpdate } from '../src/widgets/snapshot-sync'
import { repoColor } from '../src/worktree/repo-color'
import { pickResumeWorktree } from '../src/worktree/resume-worktree'

function endpointLabel(endpoint: string): string {
  try {
    const url = new URL(endpoint)
    return `${url.hostname}${url.port ? `:${url.port}` : ''}`
  } catch {
    return endpoint
  }
}

type WorktreeSummary = {
  worktreeId: string
  repo: string
  branch: string
  displayName: string
  liveTerminalCount: number
  status?: 'working' | 'active' | 'permission' | 'done' | 'inactive'
  // The worktree the desktop currently has focused (exactly one is true).
  isActive?: boolean
  // Last terminal-output time (ms); breaks ties when nothing is focused.
  lastOutputAt?: number
}

type HostWorktreeInfo = {
  hostId: string
  totalWorktrees: number
  activeCount: number
  activeWorktrees?: WorktreeSummary[]
  attentionCount?: number
  lastActiveWorktree: WorktreeSummary | null
}

// Why: derive a stable per-instance identity for RpcClient so the wireUp
// effect's dep key changes when forceReconnect swaps the underlying client
// for a host (without this, listeners stay attached to the closed client
// and notifications/accounts subs never re-attach).
const clientIdentities = new WeakMap<RpcClient, number>()
let nextClientIdentity = 1
function clientKey(client: RpcClient): number {
  let id = clientIdentities.get(client)
  if (id == null) {
    id = nextClientIdentity++
    clientIdentities.set(client, id)
  }
  return id
}

function fetchWorktreeInfo(
  client: RpcClient,
  hostId: string,
  setInfo: (
    updater: (prev: Record<string, HostWorktreeInfo>) => Record<string, HostWorktreeInfo>
  ) => void,
  disposed: () => boolean
) {
  // Why: only seed an empty zeroed entry when this host has no prior info
  // at all (e.g., first ever load before any cache hydration). On a
  // transient failure for a host that already has cached data, leave the
  // cached entry alone so the Resume card and host-meta line don't
  // momentarily flip to "0 worktrees" / disappear during reconnects.
  const markLoadedIfMissing = () => {
    setInfo((prev) => {
      if (prev[hostId]) {
        return prev
      }
      return {
        ...prev,
        [hostId]: {
          hostId,
          totalWorktrees: 0,
          activeCount: 0,
          activeWorktrees: [],
          attentionCount: 0,
          lastActiveWorktree: null
        }
      }
    })
  }

  client
    // Why: worktree.ps defaults to 200 and silently truncates; request the full
    // set so the host worktree count and active count are accurate.
    .sendRequest('worktree.ps', { limit: 10000 })
    .then((response) => {
      if (disposed()) {
        return
      }
      if (response.ok) {
        const result = response.result as { worktrees: WorktreeSummary[] }
        const worktrees = result.worktrees ?? []
        setCachedWorktrees(hostId, worktrees)
        const activeStatuses = new Set(['working', 'active', 'permission'])
        const active = worktrees.filter((w) => w.status && activeStatuses.has(w.status))
        // Mirror the desktop's focused workspace (see pickResumeWorktree).
        const lastActive = pickResumeWorktree(worktrees)
        const orderedActive =
          lastActive && active.some((worktree) => worktree.worktreeId === lastActive.worktreeId)
            ? [
                lastActive,
                ...active.filter((worktree) => worktree.worktreeId !== lastActive.worktreeId)
              ]
            : active
        setInfo((prev) => ({
          ...prev,
          [hostId]: {
            hostId,
            totalWorktrees: worktrees.length,
            activeCount: active.length,
            activeWorktrees: orderedActive.slice(0, 2),
            attentionCount: active.filter((worktree) => worktree.status === 'permission').length,
            lastActiveWorktree: lastActive
          }
        }))
      } else {
        markLoadedIfMissing()
      }
    })
    .catch(() => {
      if (!disposed()) {
        markLoadedIfMissing()
      }
    })
}

function fetchAccountsSnapshot(
  client: RpcClient,
  hostId: string,
  setSnapshots: (
    updater: (prev: Record<string, AccountsSnapshot>) => Record<string, AccountsSnapshot>
  ) => void,
  disposed: () => boolean
) {
  client
    .sendRequest('accounts.list')
    .then((response) => {
      if (disposed()) {
        return
      }
      if (response.ok) {
        const snapshot = response.result as AccountsSnapshot
        setSnapshots((prev) => ({ ...prev, [hostId]: snapshot }))
      }
    })
    .catch(() => {})
}

export default function HomeScreen() {
  const router = useRouter()

  // Why: cap and center content on wide/tablet canvases so cards don't stretch
  // edge-to-edge on iPad; on phones isWideLayout is false and layout is unchanged.
  const { isWideLayout, contentMaxWidth } = useResponsiveLayout()
  const [hosts, setHosts] = useState<HostProfile[]>([])
  const [hasLoadedHosts, setHasLoadedHosts] = useState(false)
  const [actionTarget, setActionTarget] = useState<HostProfile | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<HostProfile | null>(null)
  const [hostStates, setHostStates] = useState<Record<string, ConnectionState>>({})
  const [hostAttempts, setHostAttempts] = useState<Record<string, number>>({})
  const [hostLastConnected, setHostLastConnected] = useState<Record<string, number | null>>({})
  const statsByHost = useSyncExternalStore(
    subscribeHomeStatsByHost,
    getHomeStatsByHost,
    getHomeStatsByHost
  )
  const [worktreeInfo, setWorktreeInfo] = useState<Record<string, HostWorktreeInfo>>({})
  const [accountsByHost, setAccountsByHost] = useState<Record<string, AccountsSnapshot>>({})
  const [lastVisited, setLastVisited] = useState<{ hostId: string; worktreeId: string } | null>(
    null
  )
  const notificationOptInCheckedRef = useRef(false)

  // Why: read shared clients from the per-host store. Replaces the prior
  // pattern of opening N independent WebSockets here. See
  // docs/mobile-shared-client-per-host.md.
  const hostIds = useMemo(() => hosts.map((h) => h.id), [hosts])
  const allClients = useAllHostClients(hostIds)
  const hostPaths = useMemo(
    () => Object.fromEntries(allClients.map(({ hostId, path }) => [hostId, path])),
    [allClients]
  )
  const closeHostClient = useCloseHost()
  const forceReconnectHost = useForceReconnect()
  const primeHosts = usePrimeHosts()
  // Why: feed the loaded HostProfiles into the provider's prime cache as
  // soon as we have them. This avoids a second Keychain pass inside
  // openEntry on cold start (which serialised behind the first one and
  // showed up as multi-second connect latency).
  useEffect(() => {
    if (hosts.length > 0) {
      primeHosts(hosts)
    }
  }, [hosts, primeHosts])
  const allClientsRef = useRef<{ hostId: string; client: RpcClient }[]>([])
  // Why: the focus callback stays stable to avoid refetching on every
  // client-store render, but it still needs the latest host clients.
  allClientsRef.current = allClients.map((entry) => ({
    hostId: entry.hostId,
    client: entry.client
  }))

  // Why: hydrate the home page from a persisted snapshot on cold-start so
  // Resume + Account-usage cards paint immediately with last-known data
  // instead of flashing empty for ~1s while the WebSocket reconnects.
  // Stream/list responses overwrite this seed in place when they arrive.
  const hydratedRef = useRef(false)
  useEffect(() => {
    if (hydratedRef.current) {
      return
    }
    hydratedRef.current = true
    let cancelled = false
    void loadHomeSnapshot().then((snap) => {
      if (cancelled || !snap) {
        return
      }
      setWorktreeInfo((prev) => (Object.keys(prev).length > 0 ? prev : snap.worktreeInfo))
      setAccountsByHost((prev) => (Object.keys(prev).length > 0 ? prev : snap.accountsByHost))
      hydrateHomeStatsByHost(snap.statsByHost ?? {})
      for (const [hostId, info] of Object.entries(snap.worktreeInfo)) {
        const wt = info.lastActiveWorktree
        if (wt) {
          // Why: also seed the in-memory worktree cache so resumeWorktree's
          // lastVisited fast-path can find the cached worktree object.
          setCachedWorktrees(hostId, [wt])
        }
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Why: persist the merged snapshot whenever any home-page data updates so the
  // next cold-start has fresh seed data. The cache module debounces writes
  // internally so a flurry of streamed updates doesn't hammer disk.
  useEffect(() => {
    const snapshot = {
      worktreeInfo,
      accountsByHost,
      statsByHost,
      savedAt: Date.now()
    }
    scheduleWidgetSnapshotUpdate(snapshot)
    if (
      Object.keys(worktreeInfo).length === 0 &&
      Object.keys(accountsByHost).length === 0 &&
      Object.keys(statsByHost).length === 0
    ) {
      return
    }
    saveHomeSnapshot(snapshot)
  }, [worktreeInfo, accountsByHost, statsByHost])

  useFocusEffect(
    useCallback(() => {
      let stale = false
      void loadHosts()
        .then(async (h) => {
          if (stale) {
            return
          }
          setHosts(h)
          setHasLoadedHosts(true)
          if (h.length === 0 || notificationOptInCheckedRef.current) {
            return
          }
          notificationOptInCheckedRef.current = true
          const showNotificationOptIn = await shouldPresentNotificationOptIn()
          if (!stale && showNotificationOptIn) {
            router.replace('/notification-opt-in')
          }
        })
        .catch(() => {
          if (!stale) {
            setHasLoadedHosts(true)
          }
        })
      void AsyncStorage.getItem('yiru:last-visited-worktree').then((raw) => {
        if (stale || !raw) {
          return
        }
        try {
          setLastVisited(JSON.parse(raw))
        } catch {}
      })
      for (const entry of allClientsRef.current) {
        if (entry.client.getState() === 'connected') {
          void refreshHomeStatsForHost(entry.client, entry.hostId, () => stale)
          fetchWorktreeInfo(entry.client, entry.hostId, setWorktreeInfo, () => stale)
          fetchAccountsSnapshot(entry.client, entry.hostId, setAccountsByHost, () => stale)
        }
      }
      return () => {
        stale = true
      }
    }, [router])
  )

  const sortedHosts = useMemo(
    () => [...hosts].sort((a, b) => b.lastConnected - a.lastConnected),
    [hosts]
  )
  // Why: mirror per-host connection state into hostStates so existing
  // render code (status dots, connecting indicators) keeps working.
  useEffect(() => {
    setHostAttempts((prev) => {
      const next: Record<string, number> = { ...prev }
      let changed = false
      for (const entry of allClients) {
        const a = entry.client.getReconnectAttempt()
        if (next[entry.hostId] !== a) {
          next[entry.hostId] = a
          changed = true
        }
      }
      return changed ? next : prev
    })
    setHostLastConnected((prev) => {
      const next: Record<string, number | null> = { ...prev }
      let changed = false
      for (const entry of allClients) {
        const t = entry.client.getLastConnectedAt()
        if (next[entry.hostId] !== t) {
          next[entry.hostId] = t
          changed = true
        }
      }
      return changed ? next : prev
    })
    setHostStates((prev) => {
      const next: Record<string, ConnectionState> = { ...prev }
      let changed = false
      const liveIds = new Set(allClients.map((e) => e.hostId))
      for (const entry of allClients) {
        if (next[entry.hostId] !== entry.state) {
          next[entry.hostId] = entry.state
          changed = true
        }
      }
      // Why: when a paired host disappears from allClients (because the
      // user tapped Disconnect, or the host record was invalid) the card
      // must reflect that. We only force-update hosts whose state was
      // already tracked — otherwise the initial-acquire frame (entry not
      // yet materialised) would briefly flip every host to 'disconnected'.
      for (const host of hosts) {
        if (liveIds.has(host.id)) {
          continue
        }
        if (!host.publicKeyB64 || !host.deviceToken) {
          if (next[host.id] !== 'auth-failed') {
            next[host.id] = 'auth-failed'
            changed = true
          }
          continue
        }
        const prevState = next[host.id]
        if (prevState && prevState !== 'disconnected' && prevState !== 'auth-failed') {
          next[host.id] = 'disconnected'
          changed = true
        }
      }
      // Drop entries for hosts we no longer track at all.
      for (const id of Object.keys(next)) {
        if (!liveIds.has(id) && hosts.some((h) => h.id === id) === false) {
          delete next[id]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [allClients, hosts])

  // Why: per-host streaming subscriptions (notifications + accounts) and
  // one-shot stats fetches when each host transitions to 'connected'.
  // Runs once per (hostId, client) pair and tears down when that pair
  // changes. The provider keeps the underlying socket open across
  // resubscription cycles so this is cheap.
  useEffect(() => {
    const cleanups: (() => void)[] = []
    for (const entry of allClients) {
      let unsubNotif: (() => void) | null = null
      let unsubAccounts: (() => void) | null = null
      let statsFetched = false
      const wireUp = (state: ConnectionState) => {
        if (state === 'connected') {
          if (!unsubNotif) {
            unsubNotif = subscribeToDesktopNotifications(entry.client, entry.hostId)
          }
          if (!unsubAccounts) {
            unsubAccounts = entry.client.subscribe('accounts.subscribe', null, (payload) => {
              if (!payload || typeof payload !== 'object') {
                return
              }
              const evt = payload as { type?: string; snapshot?: AccountsSnapshot }
              if ((evt.type === 'ready' || evt.type === 'snapshot') && evt.snapshot) {
                setAccountsByHost((prev) => ({ ...prev, [entry.hostId]: evt.snapshot! }))
              }
            })
          }
          if (!statsFetched) {
            statsFetched = true
            void refreshHomeStatsForHost(entry.client, entry.hostId)
            fetchWorktreeInfo(entry.client, entry.hostId, setWorktreeInfo, () => false)
          }
        } else {
          if (unsubNotif) {
            unsubNotif()
            unsubNotif = null
          }
          if (unsubAccounts) {
            unsubAccounts()
            unsubAccounts = null
          }
        }
      }
      wireUp(entry.state)
      const unsubState = entry.client.onStateChange(wireUp)
      cleanups.push(() => {
        unsubState()
        unsubNotif?.()
        unsubAccounts?.()
      })
    }
    return () => {
      for (const c of cleanups) {
        c()
      }
    }
    // Why: depend on the host-id set AND each entry's client identity, so
    // resubscriptions don't fire on every render that produces a new
    // array reference, but DO fire when forceReconnect swaps the
    // underlying client for a host (otherwise wireUp would keep firing
    // on a closed client and never re-attach to the fresh one, leaving
    // notifications/accounts subs broken until the user navigates).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    allClients
      .map((e) => `${e.hostId}:${clientKey(e.client)}`)
      .sort()
      .join(',')
  ])

  // Why: prefer the worktree the user last opened on this device so the
  // "Resume" card reflects their mobile session history, not just the
  // desktop's most-recently-outputting worktree.
  // Why: rendering used to be gated on hostStates === 'connected', which
  // caused the Resume card to vanish for ~1s on every cold-start /
  // resume-from-background while the WebSocket reconnected, even though we
  // had perfectly good cached worktree data. Now the card stays visible as
  // long as we have a cached lastActiveWorktree for any known host; the
  // tap target is still the same and a fresher snapshot from the live RPC
  // overwrites the card's contents in place when it lands.
  const resumeWorktree = useMemo(() => {
    // Why: only surface Resume for hosts that are currently connected.
    // Showing a stale cached worktree for a disconnected host is
    // misleading — the user would tap into a session route that can't
    // load anything until the host reconnects. Once the host reconnects,
    // the card reappears with fresh data.
    if (lastVisited && hostStates[lastVisited.hostId] === 'connected') {
      const cached = getCachedWorktrees(lastVisited.hostId) as WorktreeSummary[] | null
      const match = cached?.find((w) => w.worktreeId === lastVisited.worktreeId)
      if (match) {
        return { hostId: lastVisited.hostId, worktree: match }
      }
    }
    for (const host of sortedHosts) {
      if (hostStates[host.id] !== 'connected') {
        continue
      }
      const info = worktreeInfo[host.id]
      if (info?.lastActiveWorktree) {
        return { hostId: host.id, worktree: info.lastActiveWorktree }
      }
    }
    return null
  }, [sortedHosts, hostStates, worktreeInfo, lastVisited])

  // Why: only show the Account usage section for hosts that are currently
  // connected. Showing stale cached usage for a disconnected host implies
  // live data; better to hide until the host reconnects and we can refresh.
  const accountsHosts = useMemo(() => {
    const items: { host: HostProfile; snapshot: AccountsSnapshot }[] = []
    for (const host of sortedHosts) {
      if (hostStates[host.id] !== 'connected') {
        continue
      }
      const snap = accountsByHost[host.id]
      if (!snap) {
        continue
      }
      // Why: also show hosts whose only usage is the system-default login
      // (no Yiru-managed accounts but live rate-limit data for the active
      // target), otherwise system-default users see no usage section at all.
      if (hasRenderableUsage(snap, 'claude') || hasRenderableUsage(snap, 'codex')) {
        items.push({ host, snapshot: snap })
      }
    }
    return items
  }, [sortedHosts, hostStates, accountsByHost])

  const primaryConnectedHost = useMemo(
    () => sortedHosts.find((host) => hostStates[host.id] === 'connected') ?? null,
    [sortedHosts, hostStates]
  )
  async function handleRemove() {
    if (!confirmRemove) {
      return
    }
    const hostToRemove = confirmRemove
    try {
      await removeHostAndCloseClient(hostToRemove.id, closeHostClient)
      setConfirmRemove(null)
      setHosts(await loadHosts())
    } catch {
      // Why: ConfirmModal closes on confirm; re-open for retry and surface the
      // failure instead of silently leaving the host listed.
      setConfirmRemove(hostToRemove)
      Alert.alert('Could not remove host', 'Please try again.')
    }
  }

  return (
    <View className="bg-background flex-1">
      <Stack.Screen
        options={{
          headerRight:
            Platform.OS === 'ios'
              ? undefined
              : () => (
                  <MobileGlassGroup className="flex-row gap-2" spacing={8}>
                    <MobileGlassIconButton
                      accessibilityLabel={translate(
                        'mobile.home.openInsights',
                        'Open activity insights'
                      )}
                      icon="insights"
                      onPress={() => router.push('/activity-insights')}
                    />
                    <MobileGlassIconButton
                      accessibilityLabel={translate('mobile.settings.title', 'Settings')}
                      icon="settings"
                      onPress={() => router.push('/settings')}
                    />
                  </MobileGlassGroup>
                )
        }}
      />
      {Platform.OS === 'ios' ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            accessibilityLabel={translate('mobile.home.openInsights', 'Open activity insights')}
            icon="chart.line.uptrend.xyaxis"
            onPress={() => router.push('/activity-insights')}
          />
          <Stack.Toolbar.Button
            accessibilityLabel={translate('mobile.settings.title', 'Settings')}
            icon="gearshape"
            onPress={() => router.push('/settings')}
          />
        </Stack.Toolbar>
      ) : null}

      {hasLoadedHosts && hosts.length === 0 ? (
        /* ─── Empty state: onboarding ─── */
        <View
          className="pb-safe flex-1"
          style={
            isWideLayout
              ? { maxWidth: contentMaxWidth, width: '100%', alignSelf: 'center' }
              : undefined
          }
        >
          <View className="flex-1 items-center justify-center px-8 pb-10">
            <Text className="text-foreground mb-3 text-center font-bold">Connect your desktop</Text>
            <Text className="text-muted-foreground mb-8 text-center leading-6">
              Pair with Yiru on your computer to check on your agents, jump into any terminal, and
              drive work from your phone.
            </Text>
            <MobileGlassTextButton
              isProminent
              label="Pair Desktop"
              onPress={() => router.push('/pair-scan')}
              size="large"
            />
          </View>

          <View className="px-6">
            <Text className="text-muted-foreground mb-2 px-1 font-semibold tracking-wide uppercase">
              How it works
            </Text>
            {ONBOARDING_STEPS.map((step, i) => (
              <View
                key={step.title}
                className={cn(
                  'flex-row items-start gap-3 py-4',
                  i > 0 && 'border-t border-t-border'
                )}
              >
                <Text className="text-muted-foreground w-7 text-center">{i + 1}</Text>
                <View className="flex-1">
                  <Text className="text-foreground mb-1 font-semibold">{step.title}</Text>
                  <Text className="text-muted-foreground leading-5">{step.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : (
        /* ─── Populated state ─── */
        <FlatList
          data={sortedHosts}
          keyExtractor={(h) => h.id}
          // Why: edge-to-edge — let the list scroll under the system nav bar
          // but reserve insets.bottom so the last row stays reachable above
          // the Samsung 3-button nav / iOS home indicator.
          contentContainerClassName="px-4 pb-6 pb-safe-offset-6"
          contentContainerStyle={
            isWideLayout
              ? { maxWidth: contentMaxWidth, width: '100%', alignSelf: 'center' }
              : undefined
          }
          ListHeaderComponent={
            <View className="pt-2 pb-2">
              <SectionHeading>Desktops</SectionHeading>
            </View>
          }
          ItemSeparatorComponent={CardGap}
          renderItem={({ item }) => {
            const state = hostStates[item.id] ?? 'connecting'
            const attempts = hostAttempts[item.id] ?? 0
            const lastConnectedAt = hostLastConnected[item.id] ?? null
            const info = worktreeInfo[item.id]
            const verdict = classifyConnection({
              state,
              reconnectAttempts: attempts,
              lastConnectedAt,
              endpoint: item.endpoint
            })
            return (
              <MobileContentSection>
                <MobileHostCard
                  host={item}
                  state={state}
                  verdict={verdict}
                  path={hostPaths[item.id] ?? 'lan'}
                  worktreeCounts={
                    info ? { total: info.totalWorktrees, active: info.activeCount } : undefined
                  }
                  onPress={() => router.push(`/h/${item.id}`)}
                  onLongPress={() => {
                    triggerMediumImpact()
                    setActionTarget(item)
                  }}
                />
              </MobileContentSection>
            )
          }}
          ListFooterComponent={
            <View className="gap-6 pt-6">
              {/* ─── Resume card ─── */}
              {resumeWorktree ? (
                <View className="gap-2">
                  <SectionHeading>Resume</SectionHeading>
                  <MobileContentSection>
                    <Pressable
                      accessibilityRole="button"
                      className="active:bg-accent flex-row items-center gap-2 px-3 py-3"
                      onPress={() =>
                        router.push(
                          `/h/${resumeWorktree.hostId}/session/${encodeURIComponent(resumeWorktree.worktree.worktreeId)}`
                        )
                      }
                    >
                      <View className="h-8 w-5 items-center justify-center">
                        <Terminal size={20} colorClassName="accent-muted-foreground" />
                      </View>
                      <View className="min-w-0 flex-1">
                        <Text className="text-foreground" numberOfLines={1}>
                          {resumeWorktree.worktree.displayName}
                        </Text>
                        <View className="mt-1 flex-row items-center gap-2">
                          <View
                            className="h-2 w-2"
                            style={[{ backgroundColor: repoColor(resumeWorktree.worktree.repo) }]}
                          />
                          <Text className="text-muted-foreground flex-1" numberOfLines={1}>
                            {resumeWorktree.worktree.repo}
                            {'  ·  '}
                            {resumeWorktree.worktree.branch}
                          </Text>
                        </View>
                      </View>
                      <View className="h-6 w-5 items-center justify-center">
                        <ChevronRight size={18} colorClassName="accent-muted-foreground" />
                      </View>
                    </Pressable>
                  </MobileContentSection>
                </View>
              ) : null}

              {/* ─── Quick actions ─── */}
              <View className="gap-2">
                <SectionHeading>Quick Actions</SectionHeading>
                <MobileContentSection className="p-3">
                  <MobileGlassGroup className="flex-row gap-2" spacing={8}>
                    <MobileGlassTextButton
                      label="Pair Desktop"
                      onPress={() => router.push('/pair-scan')}
                    />
                    <MobileGlassTextButton
                      disabled={!primaryConnectedHost}
                      isProminent
                      label="New Workspace"
                      onPress={() => {
                        if (primaryConnectedHost) {
                          router.push(`/h/${primaryConnectedHost.id}?action=newWorktree`)
                        }
                      }}
                    />
                  </MobileGlassGroup>
                </MobileContentSection>
              </View>

              {/* ─── Account usage ─── */}
              {accountsHosts.length > 0 ? (
                <View className="gap-2">
                  <SectionHeading>Account usage</SectionHeading>
                  <MobileContentSection>
                    {accountsHosts.map(({ host, snapshot }, index) => {
                      const claudeActiveId = snapshot.claude.activeAccountId
                      const claudeActive =
                        snapshot.claude.accounts.find((a) => a.id === claudeActiveId) ?? null
                      const codexActiveId = snapshot.codex.activeAccountId
                      const codexActive =
                        snapshot.codex.accounts.find((a) => a.id === codexActiveId) ?? null
                      const showHostName = accountsHosts.length > 1
                      return (
                        <Pressable
                          key={host.id}
                          accessibilityRole="button"
                          className={cn(
                            'active:bg-accent gap-3 px-3 py-3',
                            index > 0 && 'border-t-hairline border-border'
                          )}
                          onPress={() => router.push(`/h/${host.id}/accounts`)}
                        >
                          {showHostName ? (
                            <Text
                              className="text-muted-foreground tracking-wide uppercase"
                              numberOfLines={1}
                            >
                              {host.name}
                            </Text>
                          ) : null}
                          {(['claude', 'codex'] as ProviderKey[]).map((provider) => {
                            const active = provider === 'claude' ? claudeActive : codexActive
                            const accounts =
                              provider === 'claude'
                                ? snapshot.claude.accounts
                                : snapshot.codex.accounts
                            const limits = getActiveProviderRateLimits(snapshot, provider)
                            // Why: with no managed accounts, still render a
                            // "System default" row when the active target has
                            // live usage data; the row label already falls back
                            // to "System default" below.
                            if (accounts.length === 0 && !hasActiveProviderUsage(limits)) {
                              return null
                            }
                            const sessionBar = getUsageBarState(limits, 'session')
                            const weeklyBar = getUsageBarState(limits, 'weekly')
                            return (
                              <View key={provider} className="flex-row items-start gap-3">
                                <View className="h-6 w-8 items-center justify-center">
                                  {provider === 'claude' ? (
                                    <ClaudeIcon size={18} />
                                  ) : (
                                    <OpenAIIcon size={18} colorClassName="accent-foreground" />
                                  )}
                                </View>
                                <View className="min-w-0 flex-1 gap-1">
                                  <Text className="text-foreground" numberOfLines={1}>
                                    {active?.email ?? 'System default'}
                                  </Text>
                                  <View className="gap-1">
                                    <UsageBar
                                      label="5h"
                                      usedPercent={sessionBar.usedPercent}
                                      unavailable={sessionBar.unavailable}
                                      loading={sessionBar.loading}
                                    />
                                    <UsageBar
                                      label="7d"
                                      usedPercent={weeklyBar.usedPercent}
                                      unavailable={weeklyBar.unavailable}
                                      loading={weeklyBar.loading}
                                    />
                                  </View>
                                </View>
                              </View>
                            )
                          })}
                        </Pressable>
                      )
                    })}
                  </MobileContentSection>
                </View>
              ) : null}
            </View>
          }
        />
      )}

      {/* ─── Action sheets (shared by both states) ─── */}
      <ActionSheetModal
        visible={actionTarget != null}
        title={actionTarget?.name}
        message={actionTarget ? endpointLabel(actionTarget.endpoint) : undefined}
        actions={(() => {
          const host = actionTarget
          if (!host) {
            return []
          }
          const state = hostStates[host.id] ?? 'connecting'
          const isLive =
            state === 'connected' ||
            state === 'connecting' ||
            state === 'handshaking' ||
            state === 'reconnecting'
          // Why: "Reconnect" implies "you were connected, try again". If
          // the client has never reached 'connected' this session (cold
          // start, unreachable host, or after Disconnect) the action is
          // functionally a fresh Connect — using the right verb makes
          // the affordance match what tapping it actually does.
          const hasEverConnected = (hostLastConnected[host.id] ?? null) != null
          const items: ActionSheetAction[] = []
          items.push({
            label: hasEverConnected && isLive ? 'Reconnect' : 'Connect',
            icon: RefreshCw,
            onPress: () => {
              setActionTarget(null)
              void forceReconnectHost(host.id)
            }
          })
          if (isLive) {
            items.push({
              label: 'Disconnect',
              icon: PowerOff,
              onPress: () => {
                setActionTarget(null)
                closeHostClient(host.id)
              }
            })
          }
          items.push({
            label: 'Edit host',
            icon: Edit3,
            closeBeforePress: true,
            onPress: () => {
              setActionTarget(null)
              router.push(`/h/${host.id}/edit`)
            }
          })
          items.push({
            label: 'Remove',
            destructive: true,
            closeBeforePress: true,
            onPress: () => {
              setConfirmRemove(host)
            }
          })
          return items
        })()}
        onClose={() => setActionTarget(null)}
      />

      <ConfirmModal
        visible={confirmRemove != null}
        title="Remove Host"
        message={`Remove "${confirmRemove?.name}"? You can re-pair later.`}
        confirmLabel="Remove"
        destructive
        onConfirm={() => void handleRemove()}
        onCancel={() => setConfirmRemove(null)}
      />
    </View>
  )
}

function CardGap() {
  return <View className="h-1" />
}

function SectionHeading({ children }: { children: string }): React.JSX.Element {
  return (
    <Text className="text-muted-foreground px-1 text-xs font-semibold tracking-wide uppercase">
      {children}
    </Text>
  )
}

const ONBOARDING_STEPS = [
  {
    title: 'Open Yiru desktop',
    desc: 'Go to Settings → Mobile and generate a pairing QR code.'
  },
  {
    title: 'Scan the code',
    desc: 'Tap the button above to open the scanner. Point at the QR code on your screen.'
  },
  {
    title: "You're connected",
    desc: 'Your desktop will appear here. Everything is encrypted end-to-end.'
  }
]
