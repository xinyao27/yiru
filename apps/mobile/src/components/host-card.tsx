import { Pressable, Text, View } from 'react-native'

import { CaretRight as ChevronRight, Monitor } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import type { ConnectionVerdict } from '../transport/connection-health'
import { verdictDisplayLabel } from '../transport/connection-health'
import { mobileConnectionPathLabel } from '../transport/connection-path-label'
import type { MobileConnectionPath } from '../transport/stable-logical-rpc-client'
import type { ConnectionState, HostProfile } from '../transport/types'
import { StatusDot } from './status-dot'

export function MobileHostCard(props: {
  host: HostProfile
  state: ConnectionState
  verdict: ConnectionVerdict
  path: MobileConnectionPath
  worktreeCounts?: { total: number; active: number }
  onPress: () => void
  onLongPress: () => void
}) {
  const connected = props.state === 'connected'
  const isError = ['warning', 'unreachable', 'auth-failed'].includes(props.verdict.kind)
  const worktreeSummary = props.worktreeCounts
    ? `${props.worktreeCounts.total} worktree${props.worktreeCounts.total === 1 ? '' : 's'}${props.worktreeCounts.active > 0 ? ` · ${props.worktreeCounts.active} active` : ''}`
    : null
  return (
    <Pressable
      className="bg-card border-border active:bg-accent flex-row items-center border px-3 py-3"
      onPress={props.onPress}
      onLongPress={props.onLongPress}
      delayLongPress={400}
    >
      <View className="bg-secondary mr-3.5 h-[46px] w-[46px] items-center justify-center">
        <Monitor
          size={20}
          colorClassName={connected ? 'accent-foreground' : 'accent-muted-foreground'}
        />
      </View>
      <View className="mr-2 min-w-0 flex-1">
        <Text
          className={cn(
            'text-foreground text-sm font-semibold leading-[20px]',
            !connected && 'text-muted-foreground'
          )}
          numberOfLines={1}
        >
          {props.host.name}
        </Text>
        <View className="mt-[3px] min-w-0 flex-row items-center gap-1.5">
          <StatusDot state={props.state} verdict={props.verdict} />
          <Text
            className={cn('flex-1 text-xs text-muted-foreground', isError && 'text-destructive')}
            numberOfLines={1}
          >
            {verdictDisplayLabel(props.verdict)}
            {connected ? ` · ${mobileConnectionPathLabel(props.path)}` : ''}
          </Text>
        </View>
        {connected && worktreeSummary ? (
          <Text className="text-muted-foreground/60 mt-[2px] ml-6 text-xs" numberOfLines={1}>
            {worktreeSummary}
          </Text>
        ) : null}
        {props.verdict.kind === 'unreachable' ? (
          <Text
            className="text-muted-foreground/60 mt-1 text-[11px] leading-[15px]"
            numberOfLines={2}
          >
            Check that this phone can reach the selected LAN or private-network address
          </Text>
        ) : null}
      </View>
      <ChevronRight size={16} colorClassName="accent-muted-foreground" />
    </Pressable>
  )
}
