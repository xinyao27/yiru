import { Pressable, Text, View } from 'react-native'

import {
  getActiveProviderRateLimits,
  getUsageBarState,
  hasActiveProviderUsage,
  hasRenderableUsage,
  UsageBar,
  type AccountsSnapshot
} from '~/components/account-usage'
import { ClaudeIcon, OpenAIIcon } from '~/components/agent-icons'
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

const USAGE_PROVIDERS = ['claude', 'codex'] as const
const USAGE_WINDOWS = [
  { key: 'session', label: translate('mobile.home.usage.fiveHours', '5h') },
  { key: 'weekly', label: translate('mobile.home.usage.week', 'wk') }
] as const

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
                    {USAGE_PROVIDERS.map((provider) => {
                      const accounts =
                        provider === 'claude' ? snapshot.claude.accounts : snapshot.codex.accounts
                      const limits = getActiveProviderRateLimits(snapshot, provider)
                      if (accounts.length === 0 && !hasActiveProviderUsage(limits)) {
                        return null
                      }
                      return (
                        <View key={provider} className="flex-row items-start gap-2">
                          <View className="h-5 w-5 items-center justify-center">
                            {provider === 'claude' ? (
                              <ClaudeIcon size={16} />
                            ) : (
                              <OpenAIIcon size={16} colorClassName="accent-foreground" />
                            )}
                          </View>
                          <View className="min-w-0 flex-1 gap-1">
                            <View className="flex-row items-center gap-2">
                              <Text
                                className="text-foreground text-sm font-medium"
                                numberOfLines={1}
                              >
                                {getUsageProviderLabel(provider)}
                              </Text>
                            </View>
                            <View className="min-w-0 flex-row gap-3">
                              {USAGE_WINDOWS.map(({ key, label }) => {
                                const state = getUsageBarState(limits, key)
                                return (
                                  <UsageBar
                                    key={key}
                                    label={label}
                                    usedPercent={state.usedPercent}
                                    unavailable={state.unavailable}
                                    loading={state.loading}
                                  />
                                )
                              })}
                            </View>
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

function getUsageProviderLabel(provider: (typeof USAGE_PROVIDERS)[number]): string {
  return provider === 'claude'
    ? translate('mobile.home.usageProvider.claude', 'Claude')
    : translate('mobile.home.usageProvider.codex', 'Codex')
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
    if (hasRenderableUsage(snapshot, 'claude') || hasRenderableUsage(snapshot, 'codex')) {
      usageHosts.push({ host, snapshot })
    }
  }
  return usageHosts
}
