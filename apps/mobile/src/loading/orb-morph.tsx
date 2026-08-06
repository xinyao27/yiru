import type { MorphVariant } from '@yiru/workbench-model/loader'
import { getMorphDots } from '@yiru/workbench-model/loader-geometry'
import type { MorphDot } from '@yiru/workbench-model/loader-geometry'
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue
} from 'react-native-reanimated'

import { cyclePhase } from './orb-motion'

const STAGE_SIZE = 28
const DOT_SIZE = 3

function morphPoint(phase: number, points: MorphDot['points']): readonly [number, number] {
  'worklet'
  const input = [0, 0.05, 0.25, 0.3, 0.5, 0.55, 0.75, 0.8, 1]
  const x = interpolate(
    phase,
    input,
    [
      points[0][0],
      points[0][0],
      points[1][0],
      points[1][0],
      points[2][0],
      points[2][0],
      points[3][0],
      points[3][0],
      points[0][0]
    ],
    Extrapolation.CLAMP
  )
  const y = interpolate(
    phase,
    input,
    [
      points[0][1],
      points[0][1],
      points[1][1],
      points[1][1],
      points[2][1],
      points[2][1],
      points[3][1],
      points[3][1],
      points[0][1]
    ],
    Extrapolation.CLAMP
  )
  return [x, y]
}

function MorphDotView({
  dot,
  progress,
  size,
  color,
  variant,
  paused,
  durationMs
}: {
  dot: MorphDot
  progress: SharedValue<number>
  size: number
  color: string
  variant: MorphVariant
  paused: boolean
  durationMs: number
}): React.JSX.Element {
  const scale = size / STAGE_SIZE
  const diameter = DOT_SIZE * scale
  const style = useAnimatedStyle(() => {
    if (paused) {
      return { opacity: 1 }
    }
    const phase = cyclePhase(
      progress.value * (variant === 'M2' || variant === 'M4' ? 2 : 1),
      -dot.delayMs / durationMs
    )
    const point =
      variant === 'M5'
        ? morphPoint(phase, [dot.points[0], dot.points[0], dot.points[1], dot.points[1]])
        : morphPoint(phase, dot.points)
    const opacity =
      variant === 'M5'
        ? interpolate(
            phase,
            [0, 0.12, 0.38, 0.62, 0.88, 1],
            [1, 1, 1 - 0.6 * dot.depth, 1 - 0.6 * dot.depth, 1, 1]
          )
        : 1
    return {
      opacity,
      transform: [{ translateX: point[0] * scale }, { translateY: point[1] * scale }]
    }
  })

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

export function MorphField({
  variant,
  progress,
  size,
  color,
  paused,
  durationMs
}: {
  variant: MorphVariant
  progress: SharedValue<number>
  size: number
  color: string
  paused: boolean
  durationMs: number
}): React.JSX.Element {
  const rotationStyle = useAnimatedStyle(() => ({
    transform:
      variant === 'M2' || variant === 'M4' ? [{ rotate: `${progress.value * 360}deg` }] : undefined
  }))
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', inset: 0 }, rotationStyle]}>
      {getMorphDots(variant).map((dot) => (
        <MorphDotView
          key={dot.id}
          color={color}
          durationMs={durationMs}
          dot={dot}
          paused={paused}
          progress={progress}
          size={size}
          variant={variant}
        />
      ))}
    </Animated.View>
  )
}
