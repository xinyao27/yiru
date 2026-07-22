import { useEffect, useRef } from 'react'
import { Animated, Easing, View } from 'react-native'

import { cn } from '@/style/class-names'

type WorktreeStatus = 'working' | 'active' | 'permission' | 'done' | 'inactive'

// Why: colors and sizing are 1:1 with the desktop StatusIndicator
// (src/renderer/src/components/sidebar/status-indicator.tsx) so the mobile
// worktree list reads identically to the sidebar — same yellow spinner for
// 'working', same emerald dot for 'active'/'done', same neutral-500 @ 40%
// for 'inactive', same red for 'permission'. Diverging palettes here lose
// the design intent ('moving' vs 'alive' vs 'completed') the desktop encodes.
const STATUS_COLOR_CLASSES: Record<WorktreeStatus, string> = {
  working: 'border-yellow-500',
  active: 'bg-emerald-500',
  done: 'bg-emerald-500',
  permission: 'bg-red-500',
  inactive: 'bg-neutral-500/40'
}

export function AgentSpinner({ status }: { status: WorktreeStatus }) {
  const spinValue = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (status === 'working') {
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
  }, [status, spinValue])

  const colorClassName = STATUS_COLOR_CLASSES[status] ?? STATUS_COLOR_CLASSES.inactive

  if (status === 'working') {
    const rotate = spinValue.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '360deg']
    })
    return (
      <View className={styles.wrapper}>
        <Animated.View
          className={cn(styles.spinner, colorClassName)}
          style={[{ transform: [{ rotate }] }]}
        />
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
  dot: cn('w-2 h-2 rounded-none'),
  spinner: cn('w-2 h-2 rounded-none border-2 border-t-transparent')
} as const
