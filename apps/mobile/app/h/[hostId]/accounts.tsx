import { Stack, useLocalSearchParams } from 'expo-router'
import { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert
} from 'react-native'

import { Check, User } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import {
  type AccountsSnapshot,
  type ProviderKey,
  getActiveProviderRateLimits,
  getInactiveProviderUsage,
  getUsageBarState,
  getWindowResetLabel,
  hasActiveProviderUsage,
  UsageBar
} from '../../../src/components/account-usage'
import { ClaudeIcon, OpenAIIcon } from '../../../src/components/agent-icons'
import { useHostClient } from '../../../src/transport/client-context'
import { loadHosts } from '../../../src/transport/host-store'
import type { RpcSuccess } from '../../../src/transport/types'

const accountScreenClassNames = {
  row: 'flex-row items-center px-3.5 py-3',
  rowPressedActive: 'active:bg-accent',
  rowMain: 'flex-1 gap-1',
  // Why: fixed-width trailing slot keeps usage bars the same width whether
  // the selected row is showing a checkmark or not.
  rowTrailing: 'ml-2 w-6 items-end justify-center',
  rowTitle: 'text-sm font-medium text-foreground',
  usageRow: 'mt-1 flex-row gap-3',
  errorText: 'text-xs text-destructive',
  placeholder: 'items-center gap-2 py-12',
  placeholderText: 'text-sm text-muted-foreground'
} as const

export default function AccountsScreen() {
  const { hostId } = useLocalSearchParams<{ hostId: string }>()

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
        setError('Host not found')
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
    const unsubscribe = client.subscribe('accounts.subscribe', null, (payload) => {
      if (!payload || typeof payload !== 'object') {
        return
      }
      const evt = payload as { type?: string; snapshot?: AccountsSnapshot }
      if ((evt.type === 'ready' || evt.type === 'snapshot') && evt.snapshot) {
        setSnapshot(evt.snapshot)
        setError(null)
      }
    })
    return unsubscribe
  }, [client, connState])

  const refresh = useCallback(async () => {
    if (!client) {
      return
    }
    setRefreshing(true)
    try {
      const res = await client.sendRequest('accounts.list')
      if (res.ok) {
        setSnapshot((res as RpcSuccess).result as AccountsSnapshot)
        setError(null)
      } else {
        setError(res.error.message)
      }
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
      const method = provider === 'claude' ? 'accounts.selectClaude' : 'accounts.selectCodex'
      try {
        const res = await client.sendRequest(method, { accountId })
        if (!res.ok) {
          Alert.alert('Could not switch account', res.error.message)
        } else {
          // Why: optimistic refresh — the streaming subscription will also
          // emit, but a one-shot keeps the UI responsive even if the stream
          // is temporarily disconnected.
          await refresh()
        }
      } catch (e) {
        Alert.alert('Could not switch account', e instanceof Error ? e.message : String(e))
      } finally {
        setBusyAccountId(null)
      }
    },
    [client, refresh]
  )

  const renderProviderSection = (provider: ProviderKey, title: string) => {
    if (!snapshot) {
      return null
    }
    const state = provider === 'claude' ? snapshot.claude : snapshot.codex
    const activeUsage = getActiveProviderRateLimits(snapshot, provider)
    const activeSessionBar = getUsageBarState(activeUsage, 'session')
    const activeWeeklyBar = getUsageBarState(activeUsage, 'weekly')
    const Icon = provider === 'claude' ? ClaudeIcon : OpenAIIcon
    return (
      <View className="mb-6">
        <View className="mb-2 flex-row items-center gap-2">
          <Icon size={14} />
          <Text className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            {title}
          </Text>
        </View>
        <View className="bg-card overflow-hidden rounded-2xl">
          {/* System default row */}
          <Pressable
            className={cn(accountScreenClassNames.row, accountScreenClassNames.rowPressedActive)}
            onPress={() => selectAccount(provider, null)}
            disabled={busyAccountId !== null || connState !== 'connected'}
          >
            <View className={accountScreenClassNames.rowMain}>
              <Text className={accountScreenClassNames.rowTitle}>System default</Text>
              <Text className="text-muted-foreground text-xs">Use the agent's own login</Text>
              {/* Why: when system default is the active selection, activeUsage
                  holds the system-default login's rate limits — surface them
                  here so non-managed users still see their usage. */}
              {state.activeAccountId === null && hasActiveProviderUsage(activeUsage) ? (
                <View className={accountScreenClassNames.usageRow}>
                  <UsageBar
                    label="5h"
                    usedPercent={activeSessionBar.usedPercent}
                    unavailable={activeSessionBar.unavailable}
                    loading={activeSessionBar.loading}
                    resetText={getWindowResetLabel(activeUsage, 'session', now)}
                  />
                  <UsageBar
                    label="7d"
                    usedPercent={activeWeeklyBar.usedPercent}
                    unavailable={activeWeeklyBar.unavailable}
                    loading={activeWeeklyBar.loading}
                    resetText={getWindowResetLabel(activeUsage, 'weekly', now)}
                  />
                </View>
              ) : null}
            </View>
            <View className={accountScreenClassNames.rowTrailing}>
              {state.activeAccountId === null ? (
                <Check size={16} colorClassName="accent-primary" />
              ) : busyAccountId === `${provider}:default` ? (
                <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
              ) : null}
            </View>
          </Pressable>

          {state.accounts.map((account) => {
            const isActive = state.activeAccountId === account.id
            const inactiveEntry = !isActive
              ? getInactiveProviderUsage(snapshot, provider, account.id)
              : null
            const usage = isActive ? activeUsage : (inactiveEntry?.rateLimits ?? null)
            const isFetching =
              (isActive && usage?.status === 'fetching') ||
              (!isActive && inactiveEntry?.isFetching === true)
            const sessionBar = getUsageBarState(usage, 'session', isFetching)
            const weeklyBar = getUsageBarState(usage, 'weekly', isFetching)
            return (
              <View key={account.id}>
                <View className="h-hairline bg-border mx-3" />
                <Pressable
                  className={cn(
                    accountScreenClassNames.row,
                    accountScreenClassNames.rowPressedActive
                  )}
                  onPress={() => selectAccount(provider, account.id)}
                  disabled={busyAccountId !== null || connState !== 'connected' || isActive}
                >
                  <View className={accountScreenClassNames.rowMain}>
                    <Text className={accountScreenClassNames.rowTitle} numberOfLines={1}>
                      {account.email}
                    </Text>
                    <View className={accountScreenClassNames.usageRow}>
                      <UsageBar
                        label="5h"
                        usedPercent={sessionBar.usedPercent}
                        unavailable={sessionBar.unavailable}
                        loading={sessionBar.loading}
                        resetText={getWindowResetLabel(usage, 'session', now)}
                      />
                      <UsageBar
                        label="7d"
                        usedPercent={weeklyBar.usedPercent}
                        unavailable={weeklyBar.unavailable}
                        loading={weeklyBar.loading}
                        resetText={getWindowResetLabel(usage, 'weekly', now)}
                      />
                    </View>
                    {usage?.error ? (
                      <Text className={accountScreenClassNames.errorText} numberOfLines={1}>
                        {usage.error}
                      </Text>
                    ) : null}
                  </View>
                  <View className={accountScreenClassNames.rowTrailing}>
                    {isActive ? (
                      <Check size={16} colorClassName="accent-primary" />
                    ) : busyAccountId === account.id ? (
                      <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
                    ) : null}
                  </View>
                </Pressable>
              </View>
            )
          })}
        </View>
      </View>
    )
  }

  return (
    <View className="bg-background flex-1">
      <Stack.Screen options={{ title: hostName ? `Accounts · ${hostName}` : 'Accounts' }} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel="Refresh accounts"
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
              Connecting to {hostName || 'host'}…
            </Text>
          </View>
        ) : error && !snapshot ? (
          <View className={accountScreenClassNames.placeholder}>
            <Text className={accountScreenClassNames.errorText}>{error}</Text>
          </View>
        ) : !snapshot ? (
          <View className={accountScreenClassNames.placeholder}>
            <ActivityIndicator colorClassName="accent-muted-foreground" />
            <Text className={accountScreenClassNames.placeholderText}>Loading accounts…</Text>
          </View>
        ) : (
          <>
            {renderProviderSection('claude', 'Claude')}
            {renderProviderSection('codex', 'Codex')}
            <View className="flex-row items-start gap-2 px-2 pt-2">
              <User size={14} colorClassName="accent-muted-foreground" />
              <Text className="text-muted-foreground flex-1 text-xs leading-5">
                Add or re-authenticate accounts from desktop Settings → Accounts.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  )
}
