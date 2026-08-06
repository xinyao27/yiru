import type { LatticeVariant } from '@yiru/workbench-model/loader'
import { getLatticeCells } from '@yiru/workbench-model/loader-geometry'
import type { LatticeCell } from '@yiru/workbench-model/loader-geometry'
import { View } from 'react-native'
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated'

import { cyclePhase } from './orb-motion'

const STAGE_SIZE = 28
const DOT_SIZE = 3
const LATTICE_REST = 0.2

function LatticeDot({
  cell,
  progress,
  size,
  color,
  paused,
  durationMs
}: {
  cell: LatticeCell
  progress: SharedValue<number>
  size: number
  color: string
  paused: boolean
  durationMs: number
}): React.JSX.Element {
  const scale = size / STAGE_SIZE
  const diameter = DOT_SIZE * scale
  const phaseOffset = -cell.delayMs / durationMs
  const style = useAnimatedStyle(() => {
    if (cell.still) {
      return { opacity: 0.1 }
    }
    if (paused) {
      return { opacity: cell.middle ? 1 : LATTICE_REST }
    }
    const phase = cyclePhase(progress.value, phaseOffset)
    if (phase <= 0.28) {
      return {
        opacity: interpolate(phase, [0, 0.28], [LATTICE_REST, 1]),
        transform: [{ scale: interpolate(phase, [0, 0.28], [1, 1.18]) }]
      }
    }
    if (phase <= 0.56) {
      return {
        opacity: interpolate(phase, [0.28, 0.56], [1, LATTICE_REST]),
        transform: [{ scale: interpolate(phase, [0.28, 0.56], [1.18, 1]) }]
      }
    }
    return { opacity: LATTICE_REST }
  })

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: (8 + cell.x * 6) * scale - diameter / 2,
          top: (8 + cell.y * 6) * scale - diameter / 2,
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

export function LatticeField({
  variant,
  progress,
  size,
  color,
  paused,
  durationMs
}: {
  variant: LatticeVariant
  progress: SharedValue<number>
  size: number
  color: string
  paused: boolean
  durationMs: number
}): React.JSX.Element {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
      {getLatticeCells(variant).map((cell) => (
        <LatticeDot
          key={cell.id}
          cell={cell}
          color={color}
          durationMs={durationMs}
          paused={paused}
          progress={progress}
          size={size}
        />
      ))}
    </View>
  )
}
