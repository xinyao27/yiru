import { Stack, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { Platform, ScrollView, View } from 'react-native'

import { loadHomeSnapshot } from '../cache/home-snapshot-cache'
import { MobileGlassIconButton } from '../components/glass/icon-button'
import { translate } from '../i18n/translate'
import { MobileActivityInsightsDashboard } from './dashboard'
import { getHomeStatsByHost, hydrateHomeStatsByHost, subscribeHomeStatsByHost } from './stats-state'
import { aggregateHomeStats } from './stats-summary'

export function MobileActivityInsightsScreen(): React.JSX.Element {
  const router = useRouter()
  const statsByHost = useSyncExternalStore(
    subscribeHomeStatsByHost,
    getHomeStatsByHost,
    getHomeStatsByHost
  )
  const summary = useMemo(() => aggregateHomeStats(statsByHost), [statsByHost])
  const close = useCallback(() => router.back(), [router])

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
          />
        </Stack.Toolbar>
      ) : null}
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pt-4 pb-safe-offset-6"
        showsVerticalScrollIndicator={false}
      >
        <MobileActivityInsightsDashboard summary={summary} />
      </ScrollView>
    </View>
  )
}
