import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter, useFocusEffect } from 'expo-router'
import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { View, Text, Pressable, FlatList, Alert } from 'react-native'

import {
  QrCode,
  Gear as Settings,
  CaretRight as ChevronRight,
  Terminal,
  Plus,
  ArrowClockwise as RefreshCw,
  Power as PowerOff,
  PencilSimple as Edit3
} from '@/components/uniwind-icons'
import { SafeAreaView } from '@/components/uniwind-native-components'
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
import { MobileHostCard } from '../src/components/mobile-host-card'
import { YiruLogo } from '../src/components/yiru-logo'
import { useResponsiveLayout } from '../src/layout/responsive-layout'
import { subscribeToDesktopNotifications } from '../src/notifications/mobile-notifications'
import { shouldPresentNotificationOptIn } from '../src/notifications/notification-opt-in-gate'
import { triggerMediumImpact } from '../src/platform/haptics'
import {
  useAllHostClients,
  useCloseHost,
  useForceReconnect,
  usePrimeHosts
} from '../src/transport/client-context'
import { classifyConnection } from '../src/transport/connection-health'
import { removeHostAndCloseClient } from '../src/transport/host-removal-lifecycle'
import { loadHosts } from '../src/transport/host-store'
import type { RpcClient } from '../src/transport/rpc-client'
import type { ConnectionState, HostProfile } from '../src/transport/types'
import { pickResumeWorktree } from '../src/worktree/resume-worktree'

function endpointLabel(endpoint: string): string {
  try {
    const url = new URL(endpoint)
    return `${url.hostname}${url.port ? `:${url.port}` : ''}`
  } catch {
    return endpoint
  }
}

type StatsSummary = {
  totalAgentsSpawned: number
  totalPRsCreated: number
  totalAgentTimeMs: number
  firstEventAt: number | null
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
  lastActiveWorktree: WorktreeSummary | null
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000)
  const totalHours = Math.floor(totalMinutes / 60)
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  if (days > 0) {
    return `${days}d ${hours}h`
  }
  const minutes = totalMinutes % 60
  if (totalHours > 0) {
    return `${totalHours}h ${minutes}m`
  }
  return `${totalMinutes}m`
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

function fetchStats(
  client: RpcClient,
  setStats: (s: StatsSummary) => void,
  disposed: () => boolean
) {
  client
    .sendRequest('stats.summary')
    .then((response) => {
      if (disposed()) {
        return
      }
      if (response.ok) {
        setStats(response.result as StatsSummary)
      }
    })
    .catch(() => {})
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
        setInfo((prev) => ({
          ...prev,
          [hostId]: {
            hostId,
            totalWorktrees: worktrees.length,
            activeCount: active.length,
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

// Why: repo names get a stable color derived from hashing, matching the
// host detail page's colored dots for visual consistency.
const REPO_COLORS = ['#8b5cf6', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4']
function repoColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0
  }
  return REPO_COLORS[Math.abs(hash) % REPO_COLORS.length]
}

export default function HomeScreen() {
  const router = useRouter()

  // Why: cap and center content on wide/tablet canvases so cards don't stretch
  // edge-to-edge on iPad; on phones isWideLayout is false and layout is unchanged.
  const { isWideLayout, contentMaxWidth } = useResponsiveLayout()
  const [hosts, setHosts] = useState<HostProfile[]>([])
  const [actionTarget, setActionTarget] = useState<HostProfile | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<HostProfile | null>(null)
  const [hostStates, setHostStates] = useState<Record<string, ConnectionState>>({})
  const [hostAttempts, setHostAttempts] = useState<Record<string, number>>({})
  const [hostLastConnected, setHostLastConnected] = useState<Record<string, number | null>>({})
  const [stats, setStats] = useState<StatsSummary | null>(null)
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

  // Why: persist the merged snapshot whenever either piece updates so the
  // next cold-start has fresh seed data. The cache module debounces writes
  // internally so a flurry of streamed updates doesn't hammer disk.
  useEffect(() => {
    if (Object.keys(worktreeInfo).length === 0 && Object.keys(accountsByHost).length === 0) {
      return
    }
    saveHomeSnapshot({
      worktreeInfo,
      accountsByHost,
      savedAt: Date.now()
    })
  }, [worktreeInfo, accountsByHost])

  useFocusEffect(
    useCallback(() => {
      let stale = false
      void loadHosts().then(async (h) => {
        if (stale) {
          return
        }
        setHosts(h)
        if (h.length === 0 || notificationOptInCheckedRef.current) {
          return
        }
        notificationOptInCheckedRef.current = true
        const showNotificationOptIn = await shouldPresentNotificationOptIn()
        if (!stale && showNotificationOptIn) {
          router.replace('/notification-opt-in')
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
          fetchStats(entry.client, setStats, () => stale)
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
            fetchStats(entry.client, setStats, () => false)
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
    <SafeAreaView className={styles.container} edges={['top']}>
      {/* ─── Top bar ─── */}
      <View className={styles.topBar}>
        <View className={styles.brandLockup}>
          <View className={styles.logoMark}>
            <YiruLogo size={18} />
          </View>
          <Text className={styles.brandName}>Yiru</Text>
        </View>
        <Pressable
          className={cn(styles.iconButton, styles.iconButtonPressedActive)}
          onPress={() => router.push('/settings')}
        >
          <Settings size={18} colorClassName="accent-muted-foreground" />
        </Pressable>
      </View>

      {hosts.length === 0 ? (
        /* ─── Empty state: onboarding ─── */
        <View
          className={cn(styles.emptyContainer, 'pb-safe')}
          style={
            isWideLayout
              ? { maxWidth: contentMaxWidth, width: '100%', alignSelf: 'center' }
              : undefined
          }
        >
          <View className={styles.emptyHero}>
            <Text className={styles.emptyTitle}>Connect your desktop</Text>
            <Text className={styles.emptyBody}>
              Pair with Yiru on your computer to check on your agents, jump into any terminal, and
              drive work from your phone.
            </Text>
            <Pressable className={styles.primaryButton} onPress={() => router.push('/pair-scan')}>
              <QrCode size={17} colorClassName="accent-primary-foreground" />
              <Text className={styles.primaryButtonText}>Pair Desktop</Text>
            </Pressable>
          </View>

          <View className={styles.stepsSection}>
            <Text className={styles.sectionHeading}>How it works</Text>
            {ONBOARDING_STEPS.map((step, i) => (
              <View key={step.title} className={cn(styles.stepRow, i > 0 && styles.stepRowBorder)}>
                <View className={styles.stepNum}>
                  <Text className={styles.stepNumText}>{i + 1}</Text>
                </View>
                <View className={styles.stepText}>
                  <Text className={styles.stepTitle}>{step.title}</Text>
                  <Text className={styles.stepDesc}>{step.desc}</Text>
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
          contentContainerClassName={cn(styles.list, 'pb-safe-offset-6')}
          contentContainerStyle={
            isWideLayout
              ? { maxWidth: contentMaxWidth, width: '100%', alignSelf: 'center' }
              : undefined
          }
          ListHeaderComponent={
            <View>
              <View className={styles.hero}>
                <Text className={styles.heroTitle}>Welcome back</Text>
              </View>

              {stats && (
                <View className={styles.statsRow}>
                  <View className={styles.statCard}>
                    <Text className={styles.statValue}>
                      {stats.totalAgentsSpawned.toLocaleString()}
                    </Text>
                    <Text className={styles.statLabel}>Agents spawned</Text>
                  </View>
                  <View className={styles.statCard}>
                    <Text className={styles.statValue}>
                      {formatDuration(stats.totalAgentTimeMs)}
                    </Text>
                    <Text className={styles.statLabel}>Agent time</Text>
                  </View>
                  <View className={styles.statCard}>
                    <Text className={styles.statValue}>
                      {stats.totalPRsCreated.toLocaleString()}
                    </Text>
                    <Text className={styles.statLabel}>PRs created</Text>
                  </View>
                </View>
              )}

              <Text className={styles.sectionHeading}>Desktops</Text>
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
            )
          }}
          ListFooterComponent={
            <View>
              {/* ─── Resume card ─── */}
              {resumeWorktree ? (
                <>
                  <Text className={cn(styles.sectionHeading, styles.sectionHeadingTightTop)}>
                    Resume
                  </Text>
                  <Pressable
                    className={cn(styles.resumeCard, styles.hostCardPressedActive)}
                    onPress={() =>
                      router.push(
                        `/h/${resumeWorktree.hostId}/session/${encodeURIComponent(resumeWorktree.worktree.worktreeId)}`
                      )
                    }
                  >
                    <View className={styles.resumeIcon}>
                      <Terminal size={18} colorClassName="accent-muted-foreground" />
                    </View>
                    <View className={styles.resumeMain}>
                      <Text className={styles.resumeTitle} numberOfLines={1}>
                        {resumeWorktree.worktree.displayName}
                      </Text>
                      <View className={styles.resumeSub}>
                        <View
                          className={styles.repoDot}
                          style={[{ backgroundColor: repoColor(resumeWorktree.worktree.repo) }]}
                        />
                        <Text className={styles.resumeSubText} numberOfLines={1}>
                          {resumeWorktree.worktree.repo}
                          {'  ·  '}
                          {resumeWorktree.worktree.branch}
                        </Text>
                      </View>
                    </View>
                    <ChevronRight size={16} colorClassName="accent-muted-foreground" />
                  </Pressable>
                </>
              ) : null}

              {/* ─── Quick actions ─── */}
              <Text className={cn(styles.sectionHeading, 'mt-6')}>Quick Actions</Text>
              <View className={styles.quickActions}>
                <Pressable
                  className={cn(styles.quickAction, styles.hostCardPressedActive)}
                  onPress={() => router.push('/pair-scan')}
                >
                  <View className={styles.quickActionIcon}>
                    <QrCode size={16} colorClassName="accent-muted-foreground" />
                  </View>
                  <Text className={styles.quickActionLabel}>Pair Desktop</Text>
                </Pressable>
                <Pressable
                  disabled={!primaryConnectedHost}
                  className={cn(
                    styles.quickAction,
                    !primaryConnectedHost && styles.quickActionDisabled,
                    styles.hostCardPressedActive
                  )}
                  onPress={() => {
                    if (primaryConnectedHost) {
                      router.push(`/h/${primaryConnectedHost.id}?action=newWorktree`)
                    }
                  }}
                >
                  <View className={styles.quickActionIcon}>
                    <Plus size={16} weight="regular" colorClassName="accent-muted-foreground" />
                  </View>
                  <Text className={styles.quickActionLabel}>New Workspace</Text>
                </Pressable>
              </View>

              {/* ─── Account usage ─── */}
              {accountsHosts.length > 0 ? (
                <>
                  <Text className={cn(styles.sectionHeading, 'mt-6')}>Account usage</Text>
                  {accountsHosts.map(({ host, snapshot }) => {
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
                        className={cn(styles.accountsCard, styles.hostCardPressedActive)}
                        onPress={() => router.push(`/h/${host.id}/accounts`)}
                      >
                        {showHostName ? (
                          <Text className={styles.accountsHostLabel} numberOfLines={1}>
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
                            <View key={provider} className={styles.accountsRow}>
                              <View className={styles.accountsIcon}>
                                {provider === 'claude' ? (
                                  <ClaudeIcon size={18} />
                                ) : (
                                  <OpenAIIcon size={18} colorClassName="accent-foreground" />
                                )}
                              </View>
                              <View className={styles.accountsInfo}>
                                <Text className={styles.accountsEmail} numberOfLines={1}>
                                  {active?.email ?? 'System default'}
                                </Text>
                                <View className={styles.accountsBars}>
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
                </>
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
    </SafeAreaView>
  )
}

function CardGap() {
  return <View className={styles.cardGap} />
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

const styles = {
  container: cn('flex-1 bg-background'),
  /* ─── Top bar ─── */
  topBar: cn('flex-row items-center justify-between px-4 pt-2 pb-3'),
  brandLockup: cn('flex-row items-center min-w-0'),
  logoMark: cn('mr-2'),
  brandName: cn('text-foreground text-[17px] font-bold'),
  iconButton: cn('w-9 h-9 rounded-none items-center justify-center'),
  iconButtonPressedActive: cn('active:bg-secondary'),
  /* ─── Hero / greeting ─── */
  hero: cn('pt-1 pb-3'),
  heroTitle: cn('text-foreground text-[24px] font-extrabold tracking-[-0.3px]'),
  /* ─── Stat cards ─── */
  statsRow: cn('flex-row gap-2.5 mb-4'),
  statCard: cn('flex-1 bg-card/60 border border-border rounded-none py-2 px-3'),
  statValue: cn('text-foreground text-[18px] font-bold tracking-[-0.3px]'),
  statLabel: cn('text-muted-foreground/60 text-[11px] font-medium mt-[2px]'),
  /* ─── Section heading ─── */
  sectionHeading: cn(
    'text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-[0.6px] mb-2 px-1'
  ),
  sectionHeadingTightTop: cn('mt-4'),
  /* ─── List ─── */
  list: cn('px-4 pb-6'),
  cardGap: cn('h-2'),
  /* ─── Host cards ─── */
  hostCardPressedActive: cn('active:bg-secondary'),
  /* ─── Resume card ─── */
  resumeCard: cn('flex-row items-center bg-card border border-border rounded-none pl-3 pr-3 py-3'),
  resumeIcon: cn('w-[46px] h-[46px] rounded-none bg-secondary items-center justify-center mr-3.5'),
  resumeMain: cn('flex-1 min-w-0'),
  resumeTitle: cn('text-[13px] font-semibold text-foreground'),
  resumeSub: cn('flex-row items-center gap-1.5 mt-[3px]'),
  repoDot: cn('w-[7px] h-[7px] rounded-none'),
  resumeSubText: cn('text-[12px] text-muted-foreground flex-1'),
  /* ─── Account usage ─── */
  accountsCard: cn('bg-card border border-border rounded-none px-3 py-2.5 gap-2 mb-2'),
  accountsHostLabel: cn(
    'text-[11px] text-muted-foreground/60 font-medium uppercase tracking-[0.4px]'
  ),
  accountsRow: cn('flex-row items-center gap-2.5'),
  accountsIcon: cn('w-8 h-8 rounded-none bg-secondary items-center justify-center'),
  accountsInfo: cn('flex-1 min-w-0 gap-[2px]'),
  accountsEmail: cn('text-[13px] font-semibold text-foreground'),
  accountsBars: cn('flex-row gap-3 mt-1'),
  /* ─── Quick actions ─── */
  quickActions: cn('flex-row gap-2'),
  quickAction: cn(
    'flex-1 flex-row bg-card border border-border rounded-none py-2.5 px-3 items-center gap-2.5'
  ),
  quickActionDisabled: cn('opacity-[0.45]'),
  quickActionIcon: cn('w-7 h-7 rounded-none bg-white/[0.04] items-center justify-center'),
  quickActionLabel: cn('text-[12px] font-semibold text-muted-foreground'),
  /* ─── Empty state ─── */
  emptyContainer: cn('flex-1'),
  emptyGreeting: cn('px-4 pt-3 pb-2'),
  emptyHero: cn('flex-1 items-center justify-center px-8 pb-10'),
  emptyTitle: cn('text-[22px] font-bold text-foreground text-center mb-2.5'),
  emptyBody: cn('text-[15px] text-muted-foreground text-center leading-[22px] mb-8'),
  primaryButton: cn('flex-row items-center gap-2.5 bg-foreground px-7 py-3.5 rounded-none'),
  primaryButtonText: cn('text-background text-[15px] font-bold'),
  /* ─── Onboarding steps ─── */
  stepsSection: cn('px-6'),
  stepRow: cn('flex-row items-start gap-3.5 py-4'),
  stepRowBorder: cn('border-t border-t-border'),
  stepNum: cn(
    'w-7 h-7 rounded-none bg-white/[0.04] border border-border items-center justify-center mt-[1px]'
  ),
  stepNumText: cn('text-[12px] font-bold text-muted-foreground'),
  stepText: cn('flex-1'),
  stepTitle: cn('text-[14px] font-semibold text-foreground mb-[3px]'),
  stepDesc: cn('text-[12px] text-muted-foreground/60 leading-[17px]')
} as const
