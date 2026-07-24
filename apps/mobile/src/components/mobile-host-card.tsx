import { Pressable, Text, View } from 'react-native'

import { CaretRight as ChevronRight, Monitor } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import type { ConnectionVerdict } from '../transport/connection-health'
import { verdictDisplayLabel } from '../transport/connection-health'
import { mobileConnectionPathLabel } from '../transport/mobile-connection-path-label'
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
      className={cn(styles.card, styles.cardPressedActive)}
      onPress={props.onPress}
      onLongPress={props.onLongPress}
      delayLongPress={400}
    >
      <View className={styles.icon}>
        <Monitor
          size={20}
          colorClassName={connected ? 'accent-foreground' : 'accent-muted-foreground'}
        />
      </View>
      <View className={styles.main}>
        <Text className={cn(styles.name, !connected && 'text-muted-foreground')} numberOfLines={1}>
          {props.host.name}
        </Text>
        <View className={styles.meta}>
          <StatusDot state={props.state} verdict={props.verdict} />
          <Text className={cn(styles.metaText, isError && 'text-destructive')} numberOfLines={1}>
            {verdictDisplayLabel(props.verdict)}
            {connected ? ` · ${mobileConnectionPathLabel(props.path)}` : ''}
          </Text>
        </View>
        {connected && worktreeSummary ? (
          <Text className={styles.worktreeMetaText} numberOfLines={1}>
            {worktreeSummary}
          </Text>
        ) : null}
        {props.verdict.kind === 'unreachable' ? (
          <Text className={styles.discoveryHint} numberOfLines={2}>
            Check that this phone can reach the selected LAN or private-network address
          </Text>
        ) : null}
      </View>
      <ChevronRight size={16} colorClassName="accent-muted-foreground" />
    </Pressable>
  )
}

const styles = {
  card: cn('flex-row items-center px-3 py-3 rounded-none bg-card border border-border'),
  cardPressedActive: cn('active:bg-secondary'),
  icon: cn('w-[46px] h-[46px] rounded-none items-center justify-center bg-secondary mr-3.5'),
  main: cn('flex-1 min-w-0 mr-2'),
  name: cn('text-foreground text-[15px] font-semibold leading-[20px]'),
  meta: cn('flex-row items-center gap-1.5 mt-[3px] min-w-0'),
  metaText: cn('flex-1 text-[12px] text-muted-foreground'),
  worktreeMetaText: cn('mt-[2px] ml-6 text-[12px] text-muted-foreground/60'),
  discoveryHint: cn('mt-1 text-[11px] leading-[15px] text-muted-foreground/60')
} as const
