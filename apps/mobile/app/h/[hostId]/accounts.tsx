import { cn } from 'cnfast'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  View
} from 'react-native'

import {
  type AccountsSnapshot,
  type ProviderKey,
  type UsageProviderKey,
  getProviderRateLimits,
  getUsageProviderLabel,
  USAGE_PROVIDER_KEYS
} from '~/components/account-usage'
import { AccountUsageProviderSection } from '~/components/account-usage-details'
import { MobileGlassIconButton } from '~/components/glass/icon-button'
import { translate } from '~/i18n/translate'
import { useHostClient } from '~/transport/client-context'
import { loadHosts } from '~/transport/host-store'
import { callRuntimeOrpc, subscribeRuntimeOrpc } from '~/transport/runtime-orpc-client'

const accountScreenClassNames = {
  errorText: 'text-xs text-destructive',
  placeholder: 'items-center gap-2 py-12',
  placeholderText: 'text-sm text-muted-foreground'
} as const

export default function AccountsScreen() {
  const { hostId } = useLocalSearchParams<{ hostId: string }>()
  const router = useRouter()

  // Why: shared client per host. See docs/mobile-shared-client-per-host.md.
  const { client, state: connState } = useHostClient(hostId)
  const [hostName, setHostName] = useState<string>('')
  const [snapshot, setSnapshot] = useState<AccountsSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null)

  // Why: the reset countdown must stay fresh while the screen sits open —
  // snapshot pushes only arrive when the desktop's rate-limit poll completes.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!hostId) {
      return
    }
    let stale = false
    void loadHosts().then((hosts) => {
      if (stale) {
        return
      }
      const host = hosts.find((h) => h.id === hostId)
      if (!host) {
        setError(translate('mobile.host.notFound', 'Host not found'))
        return
      }
      setHostName(host.name)
    })
    return () => {
      stale = true
    }
  }, [hostId])

  // Why: subscribe to streaming snapshot updates so usage bars refresh in
  // place when the desktop's rate-limit poll completes (every 5 min) or
  // when the user switches accounts. Falls back to a one-shot accounts.list
  // if the subscription stream errors.
  useEffect(() => {
    if (!client || connState !== 'connected') {
      return
    }
    const unsubscribe = subscribeRuntimeOrpc(
      client,
      (runtime) => runtime.accounts.subscribe,
      undefined,
      (event) => {
        if ((event.type === 'ready' || event.type === 'snapshot') && event.snapshot) {
          setSnapshot(event.snapshot)
          setError(null)
        }
      }
    )
    return unsubscribe
  }, [client, connState])

  const refresh = useCallback(async () => {
    if (!client) {
      return
    }
    setRefreshing(true)
    try {
      setSnapshot(await callRuntimeOrpc(client, (runtime) => runtime.accounts.list, undefined))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRefreshing(false)
    }
  }, [client])

  const selectAccount = useCallback(
    async (provider: ProviderKey, accountId: string | null) => {
      if (!client) {
        return
      }
      setBusyAccountId(accountId ?? `${provider}:default`)
      try {
        await (provider === 'claude'
          ? callRuntimeOrpc(client, (runtime) => runtime.accounts.selectClaude, { accountId })
          : callRuntimeOrpc(client, (runtime) => runtime.accounts.selectCodex, { accountId }))
        // Why: optimistic refresh — the streaming subscription will also
        // emit, but a one-shot keeps the UI responsive even if the stream
        // is temporarily disconnected.
        await refresh()
      } catch (e) {
        Alert.alert(
          translate('mobile.accounts.switchError', 'Could not switch account'),
          e instanceof Error ? e.message : String(e)
        )
      } finally {
        setBusyAccountId(null)
      }
    },
    [client, refresh]
  )

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back()
      return
    }
    router.replace(`/h/${hostId}`)
  }, [hostId, router])

  const renderProviderSection = (
    provider: UsageProviderKey,
    title: string
  ): React.JSX.Element | null => {
    if (!snapshot) {
      return null
    }
    const accounts =
      provider === 'claude'
        ? snapshot.claude.accounts
        : provider === 'codex'
          ? snapshot.codex.accounts
          : []
    const activeAccountId =
      provider === 'claude'
        ? snapshot.claude.activeAccountId
        : provider === 'codex'
          ? snapshot.codex.activeAccountId
          : null
    const activeUsage = getProviderRateLimits(snapshot, provider)
    if (accounts.length === 0 && (activeUsage === null || activeUsage.status === 'unavailable')) {
      return null
    }
    const inactiveUsage =
      provider === 'claude'
        ? snapshot.rateLimits.inactiveClaudeAccounts
        : provider === 'codex'
          ? snapshot.rateLimits.inactiveCodexAccounts
          : []
    const isAccountProvider = provider === 'claude' || provider === 'codex'
    return (
      <AccountUsageProviderSection
        accounts={accounts}
        activeAccountId={activeAccountId}
        activeUsage={activeUsage}
        busyAccountId={busyAccountId}
        inactiveUsage={inactiveUsage}
        isConnected={connState === 'connected'}
        now={now}
        onSelectAccount={
          isAccountProvider ? (accountId) => void selectAccount(provider, accountId) : undefined
        }
        provider={provider}
        title={title}
      />
    )
  }

  return (
    <View className="bg-background flex-1">
      <Stack.Screen
        options={{
          headerBackVisible: false,
          headerLeft:
            Platform.OS !== 'ios'
              ? () => (
                  <MobileGlassIconButton
                    accessibilityLabel={translate('mobile.accounts.back', 'Back')}
                    icon="back"
                    onPress={goBack}
                  />
                )
              : undefined,
          title: hostName
            ? `${translate('mobile.accounts.title', 'Accounts')} · ${hostName}`
            : translate('mobile.accounts.title', 'Accounts')
        }}
      />
      {Platform.OS === 'ios' ? (
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Button
            accessibilityLabel={translate('mobile.accounts.back', 'Back')}
            icon="chevron.left"
            onPress={goBack}
          />
        </Stack.Toolbar>
      ) : null}
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel={translate('mobile.accounts.refresh', 'Refresh accounts')}
          disabled={!client || refreshing || connState !== 'connected'}
          icon="arrow.clockwise"
          onPress={refresh}
        />
      </Stack.Toolbar>

      <ScrollView
        contentContainerClassName={cn('px-4 pt-2', 'pb-safe-offset-6')}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColorClassName="accent-muted-foreground"
          />
        }
      >
        {connState !== 'connected' && !snapshot ? (
          <View className={accountScreenClassNames.placeholder}>
            <ActivityIndicator colorClassName="accent-muted-foreground" />
            <Text className={accountScreenClassNames.placeholderText}>
              {translate('mobile.accounts.connecting', 'Connecting to {{host}}…', {
                host: hostName || translate('mobile.host.host', 'host')
              })}
            </Text>
          </View>
        ) : error && !snapshot ? (
          <View className={accountScreenClassNames.placeholder}>
            <Text className={accountScreenClassNames.errorText}>{error}</Text>
          </View>
        ) : !snapshot ? (
          <View className={accountScreenClassNames.placeholder}>
            <ActivityIndicator colorClassName="accent-muted-foreground" />
            <Text className={accountScreenClassNames.placeholderText}>
              {translate('mobile.accounts.loading', 'Loading accounts…')}
            </Text>
          </View>
        ) : (
          <>
            {USAGE_PROVIDER_KEYS.map((provider) =>
              renderProviderSection(provider, getUsageProviderLabel(provider))
            )}
            <View className="px-2 pt-2">
              <Text className="text-muted-foreground flex-1 text-xs leading-5">
                {translate(
                  'mobile.accounts.manageFromDesktop',
                  'Add or re-authenticate accounts from desktop Settings → Accounts.'
                )}
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  )
}
