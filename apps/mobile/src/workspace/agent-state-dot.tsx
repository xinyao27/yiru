import { cn } from 'cnfast'
import { View } from 'react-native'

import { LoadingIndicator } from '~/components/loading-indicator'

import type { AgentDotState } from './agent-row-display'

// Per-agent state indicator, 1:1 with desktop AgentStateDot
// (src/renderer/components/agent-state-dot.tsx): the configured loader for
// 'working', emerald for 'done', red for attention, and neutral for idle.
const DOT_COLOR_CLASSES: Record<Exclude<AgentDotState, 'working'>, string> = {
  done: 'bg-emerald-500',
  blocked: 'bg-red-500',
  waiting: 'bg-red-500',
  interrupted: 'bg-red-500',
  idle: 'bg-status-neutral'
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
      <View className={cn('w-1.5 h-1.5', DOT_COLOR_CLASSES[state])} />
    </View>
  )
}

const styles = {
  wrapper: cn('w-2.5 h-2.5 items-center justify-center')
} as const
