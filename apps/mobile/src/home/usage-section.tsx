import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'

import {
  getProviderRateLimits,
  getProviderResetLabel,
  getProviderUsageStatusLabel,
  getProviderUsageWindows,
  formatUsagePlanLabel,
  getUsageProviderLabel,
  hasRenderableUsage,
  USAGE_PROVIDER_KEYS,
  UsageBar,
  UsageProviderMark,
  type AccountsSnapshot
} from '~/components/account-usage'
import { MobileContentSection } from '~/components/content-section'
import type { ConnectionState, HostProfile } from '~/transport/types'

import { translate } from '../i18n/translate'
import { HostMenu } from './host-menu'

export type HomeUsageHost = {
  host: HostProfile
  snapshot: AccountsSnapshot
}

export type HomeUsageSectionProps = {
  usageHosts: readonly HomeUsageHost[]
  hostStates: Readonly<Record<string, ConnectionState>>
  hostLastConnected: Readonly<Record<string, number | null>>
  onOpenAccounts: (hostId: string) => void
  onDisconnect: (hostId: string) => void
  onEdit: (hostId: string) => void
  onOpenFallback: (host: HostProfile) => void
  onReconnect: (hostId: string) => void
  onRequestRemove: (host: HostProfile) => void
}

export function HomeUsageSection({
  usageHosts,
  hostStates,
  hostLastConnected,
  onOpenAccounts,
  onDisconnect,
  onEdit,
  onOpenFallback,
  onReconnect,
  onRequestRemove
}: HomeUsageSectionProps): React.JSX.Element | null {
  // Why: reset copy is time-sensitive even when the host has not pushed a new snapshot.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  if (usageHosts.length === 0) {
    return null
  }

  return (
    <View className="gap-3">
      <Text className="text-muted-foreground text-lg font-medium">
        {translate('mobile.home.accountUsage', 'Usage')}
      </Text>
      <MobileContentSection>
        {usageHosts.map(({ host, snapshot }, index) => {
          const showHostName = usageHosts.length > 1

          return (
            <View key={host.id}>
              {index > 0 ? <View className="bg-border h-hairline mx-3" /> : null}
              <HostMenu
                connectionState={hostStates[host.id] ?? 'connecting'}
                hasEverConnected={(hostLastConnected[host.id] ?? null) !== null}
                host={host}
                onDisconnect={() => onDisconnect(host.id)}
                onEdit={() => onEdit(host.id)}
                onOpenFallback={() => onOpenFallback(host)}
                onReconnect={() => onReconnect(host.id)}
                onRequestRemove={() => onRequestRemove(host)}
              >
                {() => (
                  <Pressable
                    className="active:bg-accent gap-3 px-3 py-3"
                    onPress={() => onOpenAccounts(host.id)}
                  >
                    {showHostName ? (
                      <Text
                        className="text-muted-foreground tracking-wide uppercase"
                        numberOfLines={1}
                      >
                        {host.name}
                      </Text>
                    ) : null}
                    {USAGE_PROVIDER_KEYS.map((provider) => {
                      const limits = getProviderRateLimits(snapshot, provider)
                      if (!hasRenderableUsage(snapshot, provider)) {
                        return null
                      }
                      const usageWindows = getProviderUsageWindows(limits, 'compact')
                      const resetText =
                        usageWindows.length > 0 ? getProviderResetLabel(limits, now) : null
                      const plan = formatUsagePlanLabel(limits?.planType)
                      return (
                        <View key={provider} className="flex-row items-start gap-2">
                          <View className="h-5 w-5 items-center justify-center">
                            <UsageProviderMark provider={provider} />
                          </View>
                          <View className="min-w-0 flex-1 gap-1">
                            <View className="flex-row items-center gap-2">
                              <Text
                                className="text-foreground text-sm font-medium"
                                numberOfLines={1}
                              >
                                {getUsageProviderLabel(provider)}
                              </Text>
                              {plan ? (
                                <Text
                                  className="text-muted-foreground min-w-0 flex-1 text-xs"
                                  numberOfLines={1}
                                >
                                  · {plan}
                                </Text>
                              ) : null}
                              {resetText ? (
                                <Text className="text-muted-foreground shrink-0 text-xs">
                                  {resetText}
                                </Text>
                              ) : null}
                            </View>
                            {usageWindows.length > 0 ? (
                              <View className="min-w-0 flex-row flex-wrap gap-x-3 gap-y-1">
                                {usageWindows.map((usageWindow) => (
                                  <UsageBar
                                    key={usageWindow.key}
                                    className="min-w-[116px]"
                                    label={usageWindow.label}
                                    usedPercent={usageWindow.window.usedPercent}
                                    unavailable={false}
                                  />
                                ))}
                              </View>
                            ) : (
                              <Text className="text-muted-foreground text-xs">
                                {getProviderUsageStatusLabel(limits)}
                              </Text>
                            )}
                          </View>
                        </View>
                      )
                    })}
                  </Pressable>
                )}
              </HostMenu>
            </View>
          )
        })}
      </MobileContentSection>
    </View>
  )
}

export function getUsageHosts(
  hosts: readonly HostProfile[],
  hostStates: Readonly<Record<string, ConnectionState>>,
  accountsByHost: Readonly<Record<string, AccountsSnapshot>>
): HomeUsageHost[] {
  const usageHosts: HomeUsageHost[] = []
  for (const host of hosts) {
    if (hostStates[host.id] !== 'connected') {
      continue
    }
    const snapshot = accountsByHost[host.id]
    if (!snapshot) {
      continue
    }
    if (USAGE_PROVIDER_KEYS.some((provider) => hasRenderableUsage(snapshot, provider))) {
      usageHosts.push({ host, snapshot })
    }
  }
  return usageHosts
}
