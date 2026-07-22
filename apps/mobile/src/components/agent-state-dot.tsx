import { useEffect, useRef } from 'react'
import { Animated, Easing, View } from 'react-native'

import { cn } from '@/style/class-names'

import type { AgentDotState } from '../worktree/agent-row-display'

// Per-agent state indicator, 1:1 with desktop AgentStateDot
// (src/renderer/src/components/agent-state-dot.tsx): yellow spinner for 'working',
// emerald for 'done', red for blocked/waiting/interrupted (attention), neutral
// for idle. Distinct from the worktree-level AgentSpinner, which collapses the
// agent vocabulary into the 5-state rollup the sidebar dot uses.
const DOT_COLOR_CLASSES: Record<Exclude<AgentDotState, 'working'>, string> = {
  done: 'bg-emerald-500',
  blocked: 'bg-red-500',
  waiting: 'bg-red-500',
  interrupted: 'bg-red-500',
  idle: 'bg-neutral-500/40'
}

export function AgentStateDot({ state }: { state: AgentDotState }) {
  const spinValue = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (state === 'working') {
      const animation = Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true
        })
      )
      animation.start()
      return () => animation.stop()
    }
    spinValue.setValue(0)
    return undefined
  }, [state, spinValue])

  if (state === 'working') {
    const rotate = spinValue.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
    return (
      <View className={styles.wrapper}>
        <Animated.View className={styles.spinner} style={[{ transform: [{ rotate }] }]} />
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
  dot: cn('w-1.5 h-1.5 rounded-none'),
  spinner: cn('w-1.5 h-1.5 rounded-none border-[1.5px] border-yellow-500 border-t-transparent')
} as const
