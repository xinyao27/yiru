import { View } from 'react-native'

import { cn } from '@/style/class-names'

import { LoadingIndicator } from './loading-indicator'

type WorktreeStatus = 'working' | 'active' | 'permission' | 'done' | 'inactive'

// Why: states and sizing mirror the desktop StatusIndicator so worktree status
// reads consistently; working delegates to the user's configured loader.
const STATUS_COLOR_CLASSES: Record<WorktreeStatus, string> = {
  working: '',
  active: 'bg-emerald-500',
  done: 'bg-emerald-500',
  permission: 'bg-red-500',
  inactive: 'bg-neutral-500/40'
}

export function AgentSpinner({ status }: { status: WorktreeStatus }) {
  const colorClassName = STATUS_COLOR_CLASSES[status] ?? STATUS_COLOR_CLASSES.inactive

  if (status === 'working') {
    return (
      <View className={styles.wrapper}>
        <LoadingIndicator size={12} />
      </View>
    )
  }

  return (
    <View className={styles.wrapper}>
      <View className={cn(styles.dot, colorClassName)} />
    </View>
  )
}

const styles = {
  // Why: 12x12 wrapper centered around an 8x8 inner glyph mirrors the
  // desktop's `inline-flex h-3 w-3 ... items-center justify-center` shell
  // around `size-2` indicator — keeps row height/baseline alignment stable
  // across status transitions.
  wrapper: cn('w-3 h-3 items-center justify-center'),
  dot: cn('w-2 h-2 rounded-none')
} as const
