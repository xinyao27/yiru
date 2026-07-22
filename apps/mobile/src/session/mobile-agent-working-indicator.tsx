import { useEffect, useRef } from 'react'
import { Animated, Text, View } from 'react-native'

import { cn } from '@/style/class-names'

/** Animated three-dot "agent is working" row, shown while the active agent is
 *  still producing a reply. Pure presentation — visibility is the caller's call. */
export function MobileAgentWorkingIndicator(): React.JSX.Element {
  const dots = [
    useRef(new Animated.Value(0.3)).current,
    useRef(new Animated.Value(0.3)).current,
    useRef(new Animated.Value(0.3)).current
  ]

  useEffect(() => {
    const animations = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(dot, { toValue: 1, duration: 320, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 320, useNativeDriver: true })
        ])
      )
    )
    animations.forEach((a) => a.start())
    return () => animations.forEach((a) => a.stop())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <View className={styles.row}>
      <Text className={styles.label}>Agent is working</Text>
      <View className={styles.dots}>
        {dots.map((dot, i) => (
          <Animated.View key={i} className={styles.dot} style={[{ opacity: dot }]} />
        ))}
      </View>
    </View>
  )
}

const styles = {
  row: cn('flex-row items-center gap-2 px-3 py-2'),
  label: cn('text-muted-foreground/60 text-[12px] italic'),
  dots: cn('flex-row gap-1'),
  dot: cn('w-[5px] h-[5px] rounded-none bg-muted-foreground')
} as const
