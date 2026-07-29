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
}): React.JSX.Element {
  const connected = props.state === 'connected'
  const isError = ['warning', 'unreachable', 'auth-failed'].includes(props.verdict.kind)
  const worktreeSummary = props.worktreeCounts
    ? `${props.worktreeCounts.total} worktree${props.worktreeCounts.total === 1 ? '' : 's'}${props.worktreeCounts.active > 0 ? ` · ${props.worktreeCounts.active} active` : ''}`
    : null
  return (
    <Pressable
      accessibilityRole="button"
      className="active:bg-accent flex-row items-start gap-2 rounded-xl px-2 py-3"
      delayLongPress={400}
      onLongPress={props.onLongPress}
      onPress={props.onPress}
    >
      <View className="h-6 w-5 items-center justify-center">
        <Monitor
          size={20}
          colorClassName={connected ? 'accent-foreground' : 'accent-muted-foreground'}
        />
      </View>
      <View className="min-w-0 flex-1">
        <Text
          className={cn('text-foreground leading-5', !connected && 'text-muted-foreground')}
          numberOfLines={1}
        >
          {props.host.name}
        </Text>
        <View className="mt-1 min-w-0 flex-row items-center gap-2">
          <StatusDot state={props.state} verdict={props.verdict} />
          <Text
            className={cn('text-muted-foreground flex-1', isError && 'text-destructive')}
            numberOfLines={1}
          >
            {verdictDisplayLabel(props.verdict)}
            {connected ? ` · ${mobileConnectionPathLabel(props.path)}` : ''}
          </Text>
        </View>
        {connected && worktreeSummary ? (
          <Text className="text-muted-foreground mt-1" numberOfLines={1}>
            {worktreeSummary}
          </Text>
        ) : null}
        {props.verdict.kind === 'unreachable' ? (
          <Text className="text-muted-foreground mt-1 leading-4" numberOfLines={2}>
            Check that this phone can reach the selected LAN or private-network address
          </Text>
        ) : null}
      </View>
      <View className="h-6 w-5 items-center justify-center">
        <ChevronRight size={18} colorClassName="accent-muted-foreground" />
      </View>
    </Pressable>
  )
}
