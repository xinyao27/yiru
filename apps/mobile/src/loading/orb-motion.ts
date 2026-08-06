import {
  isLatticeVariant,
  isMorphVariant,
  isRingVariant,
  type AICSSLoaderVariant
} from '@yiru/workbench-model/loader'
import { getRingAnimationDurationMs } from '@yiru/workbench-model/loader-geometry'
import { useEffect } from 'react'
import {
  cancelAnimation,
  Easing,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue
} from 'react-native-reanimated'

export function getAnimationDurationMs(variant: AICSSLoaderVariant): number {
  if (isLatticeVariant(variant)) {
    return variant === 'S4' ? 1600 : 1700
  }
  if (isRingVariant(variant)) {
    return getRingAnimationDurationMs(variant)
  }
  if (isMorphVariant(variant)) {
    if (variant === 'M5') {
      return 2800
    }
    return variant === 'M2' || variant === 'M4' ? 9600 : 4800
  }
  switch (variant) {
    case 'B1':
      return 4000
    case 'B2':
      return 3300
    case 'B3':
      return 4200
    case 'B4':
      return 3600
    case 'B5':
      return 2800
  }
}

export function useOrbProgress(durationMs: number, paused: boolean): SharedValue<number> {
  const progress = useSharedValue(0)

  useEffect(() => {
    cancelAnimation(progress)
    progress.value = 0
    if (!paused) {
      progress.value = withRepeat(
        withTiming(1, { duration: durationMs, easing: Easing.linear }),
        -1,
        false
      )
    }
    return () => cancelAnimation(progress)
  }, [durationMs, paused, progress])

  return progress
}

export function cyclePhase(value: number, offset: number): number {
  'worklet'
  const phase = value + offset
  return phase - Math.floor(phase)
}
