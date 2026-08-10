import AsyncStorage from '@react-native-async-storage/async-storage'
import { cn } from 'cnfast'
import { Stack, useRouter, useFocusEffect } from 'expo-router'
import { useState, useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { View, Text, Alert, Platform } from 'react-native'

import { loadHomeSnapshot, saveHomeSnapshot } from '~/cache/home-snapshot-cache'
import { setCachedWorktrees, getCachedWorktrees } from '~/cache/worktree-cache'
import type { AccountsSnapshot } from '~/components/account-usage'
import { MobileGlassGroup } from '~/components/glass/group'
import { MobileGlassIconButton } from '~/components/glass/icon-button'
import { MobileGlassTextButton } from '~/components/glass/text-button'
import { HostActionsDrawer } from '~/home/host-actions-drawer'
import { HomeOverview } from '~/home/overview'
import { refreshHomeStatsForHost } from '~/home/stats-refresh'
import {
  getHomeStatsByHost,
  hydrateHomeStatsByHost,
  subscribeHomeStatsByHost
} from '~/home/stats-state'
import { translate } from '~/i18n/translate'
import { useResponsiveLayout } from '~/layout/responsive-layout'
import { shouldPresentNotificationOptIn } from '~/notifications/notification-opt-in-gate'
import { subscribeToDesktopNotifications } from '~/notifications/notifications'
import { triggerMediumImpact } from '~/platform/haptics'
import { useAllHostClients } from '~/transport/all-host-clients'
import { useCloseHost, useForceReconnect, usePrimeHosts } from '~/transport/client-context'
import { removeHostAndCloseClient } from '~/transport/host-removal-lifecycle'
import { loadHosts } from '~/transport/host-store'
import type { RpcClient } from '~/transport/rpc-client'
import { callRuntimeOrpc, subscribeRuntimeOrpc } from '~/transport/runtime-orpc-client'
import type { ConnectionState, HostProfile } from '~/transport/types'
import { scheduleWidgetSnapshotUpdate } from '~/widgets/snapshot-sync'
import { pickResumeWorktree } from '~/worktree/resume-pick'

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
  lastOutputAt?: number | null
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

  // Why: worktree.ps defaults to 200 and silently truncates; request the full
  // set so the host worktree count and active count are accurate.
  callRuntimeOrpc(client, (runtime) => runtime.worktree.ps, { limit: 10000 })
    .then((result) => {
      if (disposed()) {
        return
      }
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
  callRuntimeOrpc(client, (runtime) => runtime.accounts.list, undefined)
    .then((snapshot) => {
      if (disposed()) {
        return
      }
      setSnapshots((prev) => ({ ...prev, [hostId]: snapshot }))
    })
    .catch(() => {})
}

export default function HomeScreen(): React.JSX.Element {
  const router = useRouter()

  // Why: cap and center content on wide/tablet canvases so cards don't stretch
  // edge-to-edge on iPad; on phones isWideLayout is false and layout is unchanged.
  const { isWideLayout, contentMaxWidth } = useResponsiveLayout()
  const [hosts, setHosts] = useState<HostProfile[]>([])
  const [hasLoadedHosts, setHasLoadedHosts] = useState(false)
  const [actionTarget, setActionTarget] = useState<HostProfile | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<HostProfile | null>(null)
  const [hostStates, setHostStates] = useState<Record<string, ConnectionState>>({})
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
  // Why: depend on the host-id set AND each entry's client identity, so
  // resubscriptions don't fire on every render that produces a new array
  // reference, but DO fire when forceReconnect swaps the underlying client for a
  // host (otherwise wireUp would keep firing on a closed client and never
  // re-attach to the fresh one, leaving notifications/accounts subs broken until
  // the user navigates).
  const clientSubscriptionKey = useMemo(
    () =>
      allClients
        .map((e) => `${e.hostId}:${clientKey(e.client)}`)
        .sort()
        .join(','),
    [allClients]
  )
  useEffect(() => {
    const cleanups: (() => void)[] = []
    for (const entry of allClientsRef.current) {
      let unsubNotif: (() => void) | null = null
      let unsubAccounts: (() => void) | null = null
      let wiredState: ConnectionState | null = null
      const wireUp = (state: ConnectionState) => {
        // Why: a host can drop and come back on the SAME client instance, so
        // refetch on every transition INTO connected — a once-per-client flag
        // left the home cards stale until the screen was refocused.
        const reconnected = state === 'connected' && wiredState !== 'connected'
        wiredState = state
        if (state === 'connected') {
          if (!unsubNotif) {
            unsubNotif = subscribeToDesktopNotifications(entry.client, entry.hostId)
          }
          if (!unsubAccounts) {
            unsubAccounts = subscribeRuntimeOrpc(
              entry.client,
              (runtime) => runtime.accounts.subscribe,
              undefined,
              (event) => {
                if ((event.type === 'ready' || event.type === 'snapshot') && event.snapshot) {
                  const snapshot = event.snapshot
                  setAccountsByHost((prev) => ({ ...prev, [entry.hostId]: snapshot }))
                }
              }
            )
          }
          if (reconnected) {
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
      wireUp(entry.client.getState())
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
  }, [clientSubscriptionKey])

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
      // Why: keep the confirmation open for retry and surface the failure
      // instead of silently leaving the host listed.
      setConfirmRemove(hostToRemove)
      Alert.alert(
        translate('mobile.home.removeHostError.title', 'Could not remove host'),
        translate('mobile.common.tryAgain', 'Please try again.')
      )
    }
  }

  return (
    <View className="bg-background flex-1">
      <Stack.Screen
        options={{
          headerLeft:
            Platform.OS === 'ios'
              ? undefined
              : () => (
                  <MobileGlassIconButton
                    accessibilityLabel={translate(
                      'mobile.home.openInsights',
                      'Open activity insights'
                    )}
                    icon="insights"
                    onPress={() => router.push('/activity-insights')}
                  />
                ),
          headerRight:
            Platform.OS === 'ios'
              ? undefined
              : () => (
                  <MobileGlassGroup className="flex-row gap-2" spacing={8}>
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
        <>
          <Stack.Toolbar placement="left">
            <Stack.Toolbar.Button
              accessibilityLabel={translate('mobile.home.openInsights', 'Open activity insights')}
              icon="chart.line.uptrend.xyaxis"
              onPress={() => router.push('/activity-insights')}
            />
          </Stack.Toolbar>
          <Stack.Toolbar placement="right">
            <Stack.Toolbar.Button
              accessibilityLabel={translate('mobile.settings.title', 'Settings')}
              icon="gearshape"
              onPress={() => router.push('/settings')}
            />
          </Stack.Toolbar>
        </>
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
            <Text className="text-foreground mb-3 text-center font-bold">
              {translate('mobile.home.onboarding.connectDesktop', 'Connect your desktop')}
            </Text>
            <Text className="text-muted-foreground mb-8 text-center leading-6">
              {translate(
                'mobile.home.onboarding.description',
                'Pair with Yiru on your computer to check on your agents, jump into any terminal, and drive work from your phone.'
              )}
            </Text>
            <MobileGlassTextButton
              isProminent
              label={translate('mobile.home.pairDesktop', 'Pair Desktop')}
              onPress={() => router.push('/pair-scan')}
              size="large"
            />
          </View>

          <View className="px-6">
            <Text className="text-muted-foreground mb-2 px-1 font-semibold tracking-wide uppercase">
              {translate('mobile.home.onboarding.howItWorks', 'How it works')}
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
        <HomeOverview
          accountsByHost={accountsByHost}
          contentMaxWidth={contentMaxWidth}
          hostLastConnected={hostLastConnected}
          hostStates={hostStates}
          hosts={sortedHosts}
          onDisconnect={closeHostClient}
          onEdit={(hostId) => router.push(`/h/${hostId}/edit`)}
          onOpenFallback={(host) => {
            triggerMediumImpact()
            setActionTarget(host)
          }}
          isWideLayout={isWideLayout}
          onNewWorkspace={(hostId) => router.push(`/h/${hostId}?action=newWorktree`)}
          onOpenAccounts={(hostId) => router.push(`/h/${hostId}/accounts`)}
          onOpenHost={(hostId) => router.push(`/h/${hostId}`)}
          onOpenResume={() => {
            if (resumeWorktree) {
              router.push(
                `/h/${resumeWorktree.hostId}/session/${encodeURIComponent(resumeWorktree.worktree.worktreeId)}`
              )
            }
          }}
          onPairDesktop={() => router.push('/pair-scan')}
          onReconnect={(hostId) => void forceReconnectHost(hostId)}
          onRequestRemove={(host) => setConfirmRemove(host)}
          primaryConnectedHost={primaryConnectedHost}
          resumeWorktree={resumeWorktree}
          worktreeInfo={worktreeInfo}
        />
      )}

      <HostActionsDrawer
        actionTarget={actionTarget}
        confirmRemove={confirmRemove}
        connectionState={actionTarget ? (hostStates[actionTarget.id] ?? 'connecting') : null}
        hasEverConnected={
          actionTarget ? (hostLastConnected[actionTarget.id] ?? null) !== null : false
        }
        onActionClose={() => setActionTarget(null)}
        onCancelRemove={() => setConfirmRemove(null)}
        onConfirmRemove={() => void handleRemove()}
        onDisconnect={(hostId) => {
          setActionTarget(null)
          closeHostClient(hostId)
        }}
        onEdit={(hostId) => {
          setActionTarget(null)
          router.push(`/h/${hostId}/edit`)
        }}
        onReconnect={(hostId) => {
          setActionTarget(null)
          void forceReconnectHost(hostId)
        }}
        onRequestRemove={setConfirmRemove}
      />
    </View>
  )
}

const ONBOARDING_STEPS = [
  {
    title: translate('mobile.home.onboarding.openDesktop.title', 'Open Yiru desktop'),
    desc: translate(
      'mobile.home.onboarding.openDesktop.description',
      'Go to Settings → Mobile and generate a pairing QR code.'
    )
  },
  {
    title: translate('mobile.home.onboarding.scanCode.title', 'Scan the code'),
    desc: translate(
      'mobile.home.onboarding.scanCode.description',
      'Tap the button above to open the scanner. Point at the QR code on your screen.'
    )
  },
  {
    title: translate('mobile.home.onboarding.connected.title', "You're connected"),
    desc: translate(
      'mobile.home.onboarding.connected.description',
      'Your desktop will appear here. Everything is encrypted end-to-end.'
    )
  }
]
