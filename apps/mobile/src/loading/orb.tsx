import {
  isLatticeVariant,
  isMorphVariant,
  isRingVariant,
  type AICSSLoaderVariant
} from '@yiru/workbench-model/loader'
import { View } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import { useCSSVariable } from 'uniwind'

import { resolveCssString } from '../style/resolve-css-variable'
import { LatticeField } from './orb-lattice'
import { LensField } from './orb-lens'
import { MorphField } from './orb-morph'
import { getAnimationDurationMs, useOrbProgress } from './orb-motion'
import { RingField } from './orb-ring'

type MobileOrbProps = {
  variant: AICSSLoaderVariant
  size: number
  color?: string
}

export function MobileOrb({ variant, size, color }: MobileOrbProps): React.JSX.Element {
  const foreground = resolveCssString(useCSSVariable('--color-foreground'))
  const paused = useReducedMotion()
  const durationMs = getAnimationDurationMs(variant)
  const progress = useOrbProgress(durationMs, paused)
  const ink = color ?? foreground

  return (
    <View pointerEvents="none" style={{ width: size, height: size, position: 'relative' }}>
      {isLatticeVariant(variant) ? (
        <LatticeField
          color={ink}
          durationMs={durationMs}
          paused={paused}
          progress={progress}
          size={size}
          variant={variant}
        />
      ) : isRingVariant(variant) ? (
        <RingField color={ink} paused={paused} progress={progress} size={size} variant={variant} />
      ) : isMorphVariant(variant) ? (
        <MorphField
          color={ink}
          durationMs={durationMs}
          paused={paused}
          progress={progress}
          size={size}
          variant={variant}
        />
      ) : (
        <LensField color={ink} paused={paused} progress={progress} size={size} variant={variant} />
      )}
    </View>
  )
}
