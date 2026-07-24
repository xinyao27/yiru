import { View } from 'react-native'

import { cn } from '@/style/class-names'

import type { AgentDotState } from '../worktree/agent-row-display'
import { LoadingIndicator } from './loading-indicator'

// Per-agent state indicator, 1:1 with desktop AgentStateDot
// (src/renderer/src/components/agent-state-dot.tsx): the configured loader for
// 'working', emerald for 'done', red for attention, and neutral for idle.
const DOT_COLOR_CLASSES: Record<Exclude<AgentDotState, 'working'>, string> = {
  done: 'bg-emerald-500',
  blocked: 'bg-red-500',
  waiting: 'bg-red-500',
  interrupted: 'bg-red-500',
  idle: 'bg-neutral-500/40'
}

export function AgentStateDot({ state }: { state: AgentDotState }) {
  if (state === 'working') {
    return (
      <View className={styles.wrapper}>
        <LoadingIndicator size={10} />
      </View>
    )
  }

  return (
    <View className={styles.wrapper}>
      <View className={cn(styles.dot, DOT_COLOR_CLASSES[state])} />
    </View>
  )
}

const styles = {
  wrapper: cn('w-2.5 h-2.5 items-center justify-center'),
  dot: cn('w-1.5 h-1.5 rounded-none')
} as const
