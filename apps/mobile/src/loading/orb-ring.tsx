import type { RingVariant } from '@yiru/workbench-model/loader'
import { getRingAnimationDurationMs, getRingDots } from '@yiru/workbench-model/loader-geometry'
import type { RingDot } from '@yiru/workbench-model/loader-geometry'
import { View } from 'react-native'
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated'

import { cyclePhase } from './orb-motion'

const STAGE_SIZE = 28
const DOT_SIZE = 3
const RING_REST = 0.3

function RingDotView({
  dot,
  variant,
  progress,
  size,
  color,
  paused
}: {
  dot: RingDot
  variant: RingVariant
  progress: SharedValue<number>
  size: number
  color: string
  paused: boolean
}): React.JSX.Element {
  const scale = size / STAGE_SIZE
  const phaseOffset = -dot.delayMs / getRingAnimationDurationMs(variant)
  const style = useAnimatedStyle(() => {
    if (paused) {
      return { opacity: 0.7 }
    }
    const phase = cyclePhase(progress.value, phaseOffset)
    let opacity = RING_REST
    let dotScale = 1
    switch (variant) {
      case 'C1':
        opacity = phase <= 0.12 ? 1 : RING_REST
        break
      case 'C2':
        opacity = interpolate(phase, [0, 0.5, 1], [0.18, 1, 0.18])
        dotScale = interpolate(phase, [0, 0.5, 1], [0.7, 1.15, 0.7])
        break
      case 'C3':
      case 'C5':
        opacity = interpolate(phase, [0, 0.12, 0.35, 0.6, 1], [0.08, 1, 0.5, 0.12, 0.08])
        break
      case 'C4':
        opacity = interpolate(phase, [0, 0.5, 1], [1, 0.15, 1])
        break
    }
    return {
      opacity,
      transform: [{ translateX: dot.x * scale }, { translateY: dot.y * scale }, { scale: dotScale }]
    }
  })
  const diameter = DOT_SIZE * scale

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: size / 2 - diameter / 2,
          top: size / 2 - diameter / 2,
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          backgroundColor: color
        },
        style
      ]}
    />
  )
}

export function RingField({
  variant,
  progress,
  size,
  color,
  paused
}: {
  variant: RingVariant
  progress: SharedValue<number>
  size: number
  color: string
  paused: boolean
}): React.JSX.Element {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
      {getRingDots(variant).map((dot) => (
        <RingDotView
          key={dot.id}
          color={color}
          dot={dot}
          paused={paused}
          progress={progress}
          size={size}
          variant={variant}
        />
      ))}
    </View>
  )
}
