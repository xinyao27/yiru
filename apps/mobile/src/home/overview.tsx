import { Pressable, ScrollView, Text, View } from 'react-native'

import type { AccountsSnapshot } from '~/components/account-usage'
import { MobileContentSection } from '~/components/content-section'
import {
  ClockCounterClockwise,
  Monitor,
  Plus,
  Pulse,
  Stack,
  Warning,
  type Icon
} from '~/components/uniwind-icons'
import type { ConnectionState, HostProfile } from '~/transport/types'

import { translate } from '../i18n/translate'
import { HomePrimaryActionButton } from './primary-action-button'
import { getUsageHosts, HomeUsageSection } from './usage-section'

type HomeWorktreeInfo = {
  totalWorktrees: number
  activeCount: number
  attentionCount?: number
}

type HomeResumeWorktree = {
  hostId: string
  worktree: {
    worktreeId: string
    repo: string
    branch: string
    displayName: string
  }
}

type HomeOverviewProps = {
  hosts: readonly HostProfile[]
  hostStates: Readonly<Record<string, ConnectionState>>
  hostLastConnected: Readonly<Record<string, number | null>>
  accountsByHost: Readonly<Record<string, AccountsSnapshot>>
  worktreeInfo: Readonly<Record<string, HomeWorktreeInfo>>
  resumeWorktree: HomeResumeWorktree | null
  primaryConnectedHost: HostProfile | null
  isWideLayout: boolean
  contentMaxWidth: number
  onOpenHost: (hostId: string) => void
  onOpenResume: () => void
  onOpenAccounts: (hostId: string) => void
  onDisconnect: (hostId: string) => void
  onEdit: (hostId: string) => void
  onOpenFallback: (host: HostProfile) => void
  onReconnect: (hostId: string) => void
  onRequestRemove: (host: HostProfile) => void
  onNewWorkspace: (hostId: string) => void
  onPairDesktop: () => void
}

export function HomeOverview({
  hosts,
  hostStates,
  hostLastConnected,
  accountsByHost,
  worktreeInfo,
  resumeWorktree,
  primaryConnectedHost,
  isWideLayout,
  contentMaxWidth,
  onOpenHost,
  onOpenResume,
  onOpenAccounts,
  onDisconnect,
  onEdit,
  onOpenFallback,
  onReconnect,
  onRequestRemove,
  onNewWorkspace,
  onPairDesktop
}: HomeOverviewProps): React.JSX.Element {
  const summary = summarizeWorkspaces(hosts, worktreeInfo)
  const usageHosts = getUsageHosts(hosts, hostStates, accountsByHost)
  const openPrimaryHost = primaryConnectedHost
    ? () => onOpenHost(primaryConnectedHost.id)
    : undefined
  const actionLabel = primaryConnectedHost
    ? translate('mobile.home.newWorkspace', 'New workspace')
    : translate('mobile.home.pairDesktop', 'Pair desktop')
  const ActionIcon = primaryConnectedHost ? Plus : Monitor
  const actionPress = primaryConnectedHost
    ? () => onNewWorkspace(primaryConnectedHost.id)
    : onPairDesktop

  return (
    <View className="flex-1">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 px-4 pt-5 pb-safe-offset-20"
        contentContainerStyle={
          isWideLayout
            ? { maxWidth: contentMaxWidth, width: '100%', alignSelf: 'center' }
            : undefined
        }
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-foreground text-xl font-semibold">
          {translate('mobile.home.title', 'Home')}
        </Text>

        <HomeMetricGrid
          workspaceCount={summary.workspaceCount}
          working={summary.working}
          needsAttention={summary.needsAttention}
          recent={resumeWorktree ? 1 : 0}
          onOpenWorkspace={openPrimaryHost}
          onOpenWorking={openPrimaryHost}
          onOpenAttention={openPrimaryHost}
          onOpenRecent={resumeWorktree ? onOpenResume : undefined}
        />

        <HomeUsageSection
          hostLastConnected={hostLastConnected}
          hostStates={hostStates}
          onDisconnect={onDisconnect}
          onEdit={onEdit}
          onOpenAccounts={onOpenAccounts}
          onOpenFallback={onOpenFallback}
          onReconnect={onReconnect}
          onRequestRemove={onRequestRemove}
          usageHosts={usageHosts}
        />
      </ScrollView>

      <View className="pb-safe-offset-2 absolute right-0 bottom-0 left-0 px-4 pt-2">
        <View
          className="self-center"
          style={isWideLayout ? { maxWidth: contentMaxWidth, width: '100%' } : undefined}
        >
          <HomePrimaryActionButton
            className="self-stretch rounded-full"
            containerClassName="self-stretch"
            contentClassName="min-h-11 flex-row items-center justify-center gap-2 rounded-full px-5"
            icon={ActionIcon}
            label={actionLabel}
            onPress={actionPress}
            systemImage={primaryConnectedHost ? 'plus' : 'desktopcomputer'}
          />
        </View>
      </View>
    </View>
  )
}

type HomeMetricGridProps = {
  workspaceCount: number
  working: number
  needsAttention: number
  recent: number
  onOpenWorkspace?: () => void
  onOpenWorking?: () => void
  onOpenAttention?: () => void
  onOpenRecent?: () => void
}

function HomeMetricGrid({
  workspaceCount,
  working,
  needsAttention,
  recent,
  onOpenWorkspace,
  onOpenWorking,
  onOpenAttention,
  onOpenRecent
}: HomeMetricGridProps): React.JSX.Element {
  return (
    <View className="gap-3">
      <View className="flex-row gap-3">
        <HomeMetricTile
          icon={Stack}
          iconColorClassName="accent-primary"
          label={translate('mobile.home.workspace', 'Workspace')}
          value={workspaceCount}
          onPress={onOpenWorkspace}
        />
        <HomeMetricTile
          icon={Pulse}
          iconColorClassName="accent-green-500"
          label={translate('mobile.home.working', 'Working')}
          value={working}
          onPress={onOpenWorking}
        />
      </View>
      <View className="flex-row gap-3">
        <HomeMetricTile
          icon={Warning}
          iconColorClassName="accent-amber-500"
          label={translate('mobile.home.needsAttention', 'Needs attention')}
          value={needsAttention}
          onPress={onOpenAttention}
        />
        <HomeMetricTile
          icon={ClockCounterClockwise}
          iconColorClassName="accent-violet-400"
          label={translate('mobile.home.recent', 'Recent')}
          value={recent}
          onPress={onOpenRecent}
        />
      </View>
    </View>
  )
}

type HomeMetricTileProps = {
  icon: Icon
  iconColorClassName: string
  label: string
  value: number
  onPress?: () => void
}

function HomeMetricTile({
  icon: Icon,
  iconColorClassName,
  label,
  value,
  onPress
}: HomeMetricTileProps): React.JSX.Element {
  return (
    <MobileContentSection className="flex-1 rounded-2xl">
      <Pressable
        accessibilityLabel={`${label}: ${value}`}
        accessibilityRole="button"
        accessibilityState={{ disabled: !onPress }}
        className="active:bg-accent min-h-32 flex-col items-start justify-end gap-3 rounded-2xl p-4"
        disabled={!onPress}
        onPress={onPress}
      >
        <Icon size={24} colorClassName={iconColorClassName} />
        <Text className="text-foreground text-base">
          {label} <Text className="text-muted-foreground/70 text-sm tabular-nums">{value}</Text>
        </Text>
      </Pressable>
    </MobileContentSection>
  )
}

function summarizeWorkspaces(
  hosts: readonly HostProfile[],
  worktreeInfo: Readonly<Record<string, HomeWorktreeInfo>>
): { workspaceCount: number; working: number; needsAttention: number } {
  return hosts.reduce(
    (summary, host) => {
      const info = worktreeInfo[host.id]
      if (!info) {
        return summary
      }
      const needsAttention = info.attentionCount ?? 0
      return {
        workspaceCount: summary.workspaceCount + info.totalWorktrees,
        working: summary.working + Math.max(0, info.activeCount - needsAttention),
        needsAttention: summary.needsAttention + needsAttention
      }
    },
    { workspaceCount: 0, working: 0, needsAttention: 0 }
  )
}
