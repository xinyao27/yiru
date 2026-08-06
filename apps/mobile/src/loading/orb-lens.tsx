import type { LensVariant } from '@yiru/workbench-model/loader'
import { View } from 'react-native'
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated'

import { cyclePhase } from './orb-motion'

const STAGE_SIZE = 28

function lensPhaseOffset(variant: LensVariant, index: number): number {
  switch (variant) {
    case 'B1':
      return [0, 0.75, 0.5, 0.25][index] ?? 0
    case 'B2':
    case 'B3':
      return index / 3
    case 'B4':
      return 0
    case 'B5':
      return index === 2 ? 0.5 : 0
  }
}

function LensDot({
  variant,
  index,
  progress,
  size,
  color,
  paused
}: {
  variant: LensVariant
  index: number
  progress: SharedValue<number>
  size: number
  color: string
  paused: boolean
}): React.JSX.Element {
  const scale = size / STAGE_SIZE
  const dotSize = (variant === 'B1' ? 6 : 7) * scale
  const phaseOffset = lensPhaseOffset(variant, index)
  const style = useAnimatedStyle(() => {
    if (paused) {
      return {
        opacity: index === 0 ? 1 : 0.3,
        transform: [{ scale: 1 }]
      }
    }
    const phase = cyclePhase(progress.value, phaseOffset)
    let opacity = 1
    let dotScale = 1
    let translateX = 0
    let translateY = 0
    switch (variant) {
      case 'B1':
        opacity = interpolate(
          phase,
          [0, 0.12, 0.22, 0.38, 0.58, 0.82, 1],
          [0.05, 1, 1, 0.3, 0.1, 0.05, 0.05]
        )
        dotScale = interpolate(
          phase,
          [0, 0.12, 0.22, 0.38, 0.58, 0.82, 1],
          [1.12, 1, 1, 1.06, 1.1, 1.12, 1.12]
        )
        translateX = [-4.5, 4.5, 4.5, -4.5][index] ?? 0
        translateY = [-4.5, -4.5, 4.5, 4.5][index] ?? 0
        break
      case 'B2': {
        const angle = phase * Math.PI * 2
        opacity = interpolate(phase, [0, 0.25, 0.5, 0.75, 1], [1, 0.55, 0.28, 0.55, 1])
        dotScale = interpolate(phase, [0, 0.25, 0.5, 0.75, 1], [1, 0.82, 0.66, 0.82, 1])
        translateX = Math.sin(angle) * 6.5
        translateY = Math.cos(angle) * 6.5
        break
      }
      case 'B3':
        opacity = interpolate(phase, [0, 0.08, 0.24, 0.42, 0.62, 1], [0, 1, 1, 0.1, 0, 0])
        dotScale = interpolate(
          phase,
          [0, 0.08, 0.24, 0.42, 0.62, 1],
          [0.35, 0.55, 0.72, 1.5, 2.4, 2.4]
        )
        break
      case 'B4':
        if (index === 0) {
          const input = [0, 0.1, 0.22, 0.33, 0.43, 0.55, 0.66, 0.77, 0.88, 1]
          translateX = interpolate(phase, input, [0, 0, 2.15, 4.3, 4.3, 0, -4.3, -4.3, -2.15, 0])
          translateY = interpolate(
            phase,
            input,
            [-5, -5, -1.25, 2.5, 2.5, 2.5, 2.5, 2.5, -1.25, -5]
          )
          dotScale = interpolate(phase, input, [1, 1, 0.72, 1, 1, 0.72, 1, 1, 0.72, 1])
        } else {
          opacity = interpolate(phase, [0, 0.5, 1], [0.16, 0.32, 0.16])
          dotScale = interpolate(phase, [0, 0.5, 1], [1.2, 0.98, 1.2])
        }
        break
      case 'B5':
        if (index === 1) {
          const breathePhase = cyclePhase(progress.value * (2800 / 3600), 0)
          opacity = interpolate(breathePhase, [0, 0.5, 1], [0.16, 0.32, 0.16])
          dotScale = interpolate(breathePhase, [0, 0.5, 1], [1.2, 0.98, 1.2])
        } else {
          const input = [0, 0.22, 0.37, 0.52, 0.7, 1]
          translateX = interpolate(phase, input, [-11, -1, 0, 1, 11, 11])
          opacity = interpolate(phase, input, [0, 1, 1, 1, 0, 0])
          dotScale = interpolate(phase, input, [0.55, 1, 1, 1, 0.55, 0.55])
        }
        break
    }
    return {
      opacity,
      transform: [
        { translateX: translateX * scale },
        { translateY: translateY * scale },
        { scale: dotScale }
      ]
    }
  })

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: size / 2 - dotSize / 2,
          top: size / 2 - dotSize / 2,
          width: dotSize,
          height: dotSize,
          borderRadius: dotSize / 2,
          backgroundColor: color
        },
        style
      ]}
    />
  )
}

export function LensField({
  variant,
  progress,
  size,
  color,
  paused
}: {
  variant: LensVariant
  progress: SharedValue<number>
  size: number
  color: string
  paused: boolean
}): React.JSX.Element {
  const count = variant === 'B1' ? 4 : variant === 'B4' ? 2 : 3
  return (
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
      {Array.from({ length: count }, (_, index) => (
        <LensDot
          key={index}
          color={color}
          index={index}
          paused={paused}
          progress={progress}
          size={size}
          variant={variant}
        />
      ))}
    </View>
  )
}
