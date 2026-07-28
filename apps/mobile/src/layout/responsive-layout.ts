import { useWindowDimensions } from 'react-native'
import { useCSSVariable } from 'uniwind'

import { resolveCssNumber } from '../style/resolve-css-variable'
import {
  getResponsiveLayoutMetrics,
  type ResponsiveLayoutMetrics
} from './responsive-layout-metrics'

export type ResponsiveLayout = ResponsiveLayoutMetrics

export function useResponsiveLayout(): ResponsiveLayout {
  const { width, height } = useWindowDimensions()
  const [regularPadding, widePadding] = useCSSVariable(['--spacing-4', '--spacing-6'])
  return getResponsiveLayoutMetrics(
    width,
    height,
    resolveCssNumber(regularPadding),
    resolveCssNumber(widePadding)
  )
}
