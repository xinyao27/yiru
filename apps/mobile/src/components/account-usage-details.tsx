import { ActivityIndicator, Pressable, Text, View } from 'react-native'

import { translate } from '~/i18n/translate'

import {
  formatUsagePlanLabel,
  getProviderUsageStatusLabel,
  getProviderUsageWindows,
  getUsageWindowResetLabel,
  UsageProviderMark,
  UsageBar,
  UsageDetailBar,
  type InactiveAccountUsage,
  type ProviderKey,
  type ProviderRateLimits,
  type UsageProviderKey
} from './account-usage'
import { MobileContentSection } from './content-section'
import { Check } from './uniwind-icons'

export type AccountUsageAccount = {
  id: string
  email: string
  organizationName?: string | null
  workspaceLabel?: string | null
}

export type AccountUsageProviderSectionProps = {
  provider: UsageProviderKey
  title: string
  accounts: readonly AccountUsageAccount[]
  activeAccountId: string | null
  activeUsage: ProviderRateLimits | null
  inactiveUsage: readonly InactiveAccountUsage[]
  busyAccountId: string | null
  isConnected: boolean
  now: number
  onSelectAccount?: (accountId: string | null) => void
}

export function AccountUsageProviderSection({
  provider,
  title,
  accounts,
  activeAccountId,
  activeUsage,
  inactiveUsage,
  busyAccountId,
  isConnected,
  now,
  onSelectAccount
}: AccountUsageProviderSectionProps): React.JSX.Element {
  const usageWindows = getProviderUsageWindows(activeUsage, 'detail')
  const plan = formatUsagePlanLabel(activeUsage?.planType)
  const canSwitchAccount = isAccountProvider(provider) && onSelectAccount !== undefined

  return (
    <View className="mb-5">
      <MobileContentSection>
        <View className="gap-4 px-3 py-3">
          <View className="flex-row items-center gap-2">
            <View className="bg-secondary h-6 w-6 items-center justify-center">
              <UsageProviderMark provider={provider} />
            </View>
            <View className="min-w-0 flex-1 gap-0.5">
              <View className="flex-row items-center gap-1">
                <Text className="text-foreground text-base font-semibold" numberOfLines={1}>
                  {title}
                </Text>
                {plan ? (
                  <Text className="text-muted-foreground min-w-0 flex-1 text-xs" numberOfLines={1}>
                    · {plan}
                  </Text>
                ) : null}
              </View>
              <Text className="text-muted-foreground text-xs">
                {getUpdatedLabel(activeUsage, now)}
              </Text>
              <View className="flex-row items-center gap-2">
                <Text className="text-muted-foreground min-w-0 flex-1 text-xs" numberOfLines={1}>
                  {activeAccountId === null
                    ? isAccountProvider(provider)
                      ? translate('mobile.accounts.usingSystemDefault', 'Using system default')
                      : translate(
                          'mobile.accounts.usingDesktopCredentials',
                          'Using desktop credentials'
                        )
                    : translate('mobile.accounts.usingManagedAccount', 'Using managed account')}
                </Text>
                {activeAccountId !== null && canSwitchAccount ? (
                  <Pressable
                    className="active:bg-accent px-1 py-1"
                    disabled={busyAccountId !== null || !isConnected}
                    onPress={() => onSelectAccount?.(null)}
                  >
                    {busyAccountId === `${provider}:default` ? (
                      <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
                    ) : (
                      <Text className="text-primary text-xs font-medium">
                        {translate('mobile.accounts.useSystemDefault', 'Use default')}
                      </Text>
                    )}
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>

          {usageWindows.length > 0 ? (
            <View className="gap-4">
              {usageWindows.map((usageWindow) => (
                <UsageDetailBar
                  key={usageWindow.key}
                  label={usageWindow.label}
                  usedPercent={usageWindow.window.usedPercent}
                  unavailable={false}
                  resetText={getUsageWindowResetLabel(usageWindow.window, now)}
                />
              ))}
            </View>
          ) : (
            <Text className="text-muted-foreground text-sm">
              {getProviderUsageStatusLabel(activeUsage)}
            </Text>
          )}
          {activeUsage?.error ? (
            <Text className="text-destructive text-xs" numberOfLines={2}>
              {activeUsage.error}
            </Text>
          ) : null}
        </View>

        {accounts.length > 0 && onSelectAccount ? (
          <>
            <View className="bg-border h-hairline mx-3" />
            <View className="px-3 pt-3 pb-1">
              <Text className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                {translate('mobile.accounts.managedAccounts', 'Managed accounts')}
              </Text>
            </View>
            {accounts.map((account) => {
              const isActive = activeAccountId === account.id
              const usage = isActive
                ? null
                : (inactiveUsage.find((entry) => entry.accountId === account.id) ?? null)
              return (
                <View key={account.id}>
                  {account.id !== accounts[0]?.id ? (
                    <View className="bg-border h-hairline mx-3" />
                  ) : null}
                  <AccountRow
                    accountId={account.id}
                    busyAccountId={busyAccountId}
                    isActive={isActive}
                    isConnected={isConnected}
                    onSelectAccount={onSelectAccount}
                    subtitle={getAccountSubtitle(provider, account)}
                    title={account.email}
                    usage={usage}
                  />
                </View>
              )
            })}
          </>
        ) : null}
      </MobileContentSection>
    </View>
  )
}

function AccountRow({
  accountId,
  title,
  subtitle,
  usage,
  isActive,
  busyAccountId,
  isConnected,
  onSelectAccount
}: {
  accountId: string
  title: string
  subtitle: string | null
  usage: InactiveAccountUsage | null
  isActive: boolean
  busyAccountId: string | null
  isConnected: boolean
  onSelectAccount: (accountId: string | null) => void
}): React.JSX.Element {
  const isBusy = busyAccountId === accountId
  const usageWindows = getProviderUsageWindows(usage?.rateLimits ?? null, 'compact')
  const usageStatus = usage?.rateLimits
    ? getProviderUsageStatusLabel(usage.rateLimits)
    : usage?.isFetching
      ? translate('mobile.usage.loading', 'Loading usage…')
      : null

  return (
    <Pressable
      className="active:bg-accent min-h-11 flex-row items-center px-3 py-3"
      disabled={isActive || busyAccountId !== null || !isConnected}
      onPress={() => onSelectAccount(accountId)}
    >
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-foreground text-sm font-medium" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text className="text-muted-foreground text-xs" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {usageWindows.length > 0 ? (
          <View className="mt-1 flex-row flex-wrap gap-x-3 gap-y-1">
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
        ) : usageStatus ? (
          <Text className="text-muted-foreground text-xs" numberOfLines={1}>
            {usageStatus}
          </Text>
        ) : null}
        {usage?.rateLimits?.error ? (
          <Text className="text-destructive text-xs" numberOfLines={1}>
            {usage.rateLimits.error}
          </Text>
        ) : null}
      </View>
      <View className="ml-2 w-6 items-end justify-center">
        {isActive ? (
          <Check size={16} colorClassName="accent-primary" />
        ) : isBusy ? (
          <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
        ) : null}
      </View>
    </Pressable>
  )
}

function getAccountSubtitle(
  provider: UsageProviderKey,
  account: AccountUsageAccount
): string | null {
  const subtitle =
    provider === 'claude'
      ? account.organizationName
      : provider === 'codex'
        ? account.workspaceLabel
        : null
  const trimmed = subtitle?.trim()
  return trimmed || null
}

function isAccountProvider(provider: UsageProviderKey): provider is ProviderKey {
  return provider === 'claude' || provider === 'codex'
}

function getUpdatedLabel(limits: ProviderRateLimits | null, now: number): string {
  const updatedAt = limits?.updatedAt ?? 0
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) {
    return translate('mobile.usage.notUpdated', 'Not updated yet')
  }
  const elapsed = Math.max(0, now - updatedAt)
  if (elapsed < 60_000) {
    return translate('mobile.usage.updatedJustNow', 'Updated just now')
  }
  const minutes = Math.floor(elapsed / 60_000)
  if (minutes < 60) {
    return translate('mobile.usage.updatedMinutesAgo', 'Updated {{count}}m ago', { count: minutes })
  }
  const hours = Math.floor(minutes / 60)
  return translate('mobile.usage.updatedHoursAgo', 'Updated {{count}}h ago', { count: hours })
}
