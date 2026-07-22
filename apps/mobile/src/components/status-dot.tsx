import { View } from 'react-native'

import { cn } from '@/style/class-names'

import type { ConnectionVerdict } from '../transport/connection-health'
import type { ConnectionState } from '../transport/types'

const stateColorClasses: Record<ConnectionState, string> = {
  connected: 'bg-green-500',
  connecting: 'bg-amber-500',
  handshaking: 'bg-amber-500',
  reconnecting: 'bg-amber-500',
  disconnected: 'bg-neutral-500/40',
  'auth-failed': 'bg-red-500'
}

// Why: when caller passes a verdict, the dot color reflects the verdict's
// severity instead of the raw transport state. This avoids the "amber dot
// next to red 'Can't reach desktop' label" mismatch — the underlying
// transport is still 'reconnecting' (amber) but the user-visible meaning
// has escalated to error (red).
export function StatusDot({
  state,
  verdict
}: {
  state: ConnectionState
  verdict?: ConnectionVerdict
}) {
  const colorClassName =
    verdict?.kind === 'unreachable' || verdict?.kind === 'auth-failed'
      ? 'bg-red-500'
      : verdict?.kind === 'warning'
        ? 'bg-amber-500'
        : (stateColorClasses[state] ?? 'bg-neutral-500/40')
  return <View className={cn(styles.dot, colorClassName)} />
}

const styles = {
  dot: cn('w-2 h-2 rounded-none mr-2')
} as const
