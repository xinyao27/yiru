import { useEffect, useRef } from 'react'
import { Animated, Text, View } from 'react-native'

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
    <View className="flex-row items-center gap-2 px-3 py-2">
      <Text className="text-muted-foreground/60 text-xs italic">Agent is working</Text>
      <View className="flex-row gap-1">
        {dots.map((dot, i) => (
          <Animated.View
            key={i}
            className="bg-muted-foreground h-[5px] w-[5px]"
            style={[{ opacity: dot }]}
          />
        ))}
      </View>
    </View>
  )
}
