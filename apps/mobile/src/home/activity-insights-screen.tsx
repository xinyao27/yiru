import { Stack, useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { AppState, Platform, RefreshControl, ScrollView, View } from 'react-native'
import { useCSSVariable } from 'uniwind'

import { loadHomeSnapshot } from '../cache/home-snapshot-cache'
import { MobileGlassIconButton } from '../components/glass/icon-button'
import { translate } from '../i18n/translate'
import { resolveCssString } from '../style/resolve-css-variable'
import { useAllHostClients } from '../transport/all-host-clients'
import { usePrimeHosts } from '../transport/client-context'
import { loadHosts } from '../transport/host-store'
import { MobileActivityInsightsDashboard } from './dashboard'
import { refreshHomeStatsForHost } from './stats-refresh'
import { getHomeStatsByHost, hydrateHomeStatsByHost, subscribeHomeStatsByHost } from './stats-state'
import { aggregateHomeStats } from './stats-summary'

const ACTIVITY_STATS_REFRESH_INTERVAL_MS = 60_000

export function MobileActivityInsightsScreen(): React.JSX.Element {
  const router = useRouter()
  const primeHosts = usePrimeHosts()
  const [foregroundValue] = useCSSVariable(['--color-foreground'])
  const foregroundColor = resolveCssString(foregroundValue)
  const [hostIds, setHostIds] = useState<string[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const hostClients = useAllHostClients(hostIds)
  const connectedClients = useMemo(
    () => hostClients.filter((entry) => entry.state === 'connected'),
    [hostClients]
  )
  const statsByHost = useSyncExternalStore(
    subscribeHomeStatsByHost,
    getHomeStatsByHost,
    getHomeStatsByHost
  )
  const summary = useMemo(() => aggregateHomeStats(statsByHost), [statsByHost])
  const close = useCallback(() => router.back(), [router])
  const refreshStats = useCallback(
    async (isDisposed: () => boolean = () => false): Promise<void> => {
      await Promise.all(
        connectedClients.map((entry) =>
          refreshHomeStatsForHost(entry.client, entry.hostId, isDisposed)
        )
      )
    },
    [connectedClients]
  )
  const refreshManually = useCallback(() => {
    setIsRefreshing(true)
    void refreshStats().finally(() => setIsRefreshing(false))
  }, [refreshStats])

  useEffect(() => {
    let cancelled = false
    void loadHomeSnapshot().then((snapshot) => {
      if (!cancelled && snapshot) {
        hydrateHomeStatsByHost(snapshot.statsByHost ?? {})
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void loadHosts()
      .then((hosts) => {
        if (cancelled) {
          return
        }
        primeHosts(hosts)
        setHostIds(hosts.map((host) => host.id))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [primeHosts])

  useFocusEffect(
    useCallback(() => {
      let disposed = false
      const refresh = () => refreshStats(() => disposed)
      void refresh()
      const interval = setInterval(() => void refresh(), ACTIVITY_STATS_REFRESH_INTERVAL_MS)
      return () => {
        disposed = true
        clearInterval(interval)
      }
    }, [refreshStats])
  )

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshStats()
      }
    })
    return () => subscription.remove()
  }, [refreshStats])

  return (
    <View className="bg-background flex-1">
      <Stack.Screen
        options={{
          title: translate('mobile.home.insightsTitle', 'Activity insights'),
          headerLeft:
            Platform.OS === 'android'
              ? () => (
                  <MobileGlassIconButton
                    accessibilityLabel={translate(
                      'mobile.home.closeInsights',
                      'Close activity insights'
                    )}
                    icon="close"
                    onPress={close}
                  />
                )
              : undefined
        }}
      />
      {Platform.OS === 'ios' ? (
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Button
            accessibilityLabel={translate('mobile.home.closeInsights', 'Close activity insights')}
            icon="xmark"
            onPress={close}
            tintColor={foregroundColor}
          />
        </Stack.Toolbar>
      ) : null}
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pt-4 pb-safe-offset-6"
        refreshControl={
          <RefreshControl
            colors={[foregroundColor]}
            onRefresh={refreshManually}
            refreshing={isRefreshing}
            tintColor={foregroundColor}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <MobileActivityInsightsDashboard summary={summary} />
      </ScrollView>
    </View>
  )
}
