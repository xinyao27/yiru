import { ThinkingOrb } from 'expo-thinking-orbs'

import type { MobileLoaderStyle } from '../loading/mobile-loader-style'
import { useMobileLoaderStyle } from '../loading/mobile-loader-style-context'
import { useThemeColors } from '../theme/uniwind-theme-values'

type LoadingIndicatorProps = {
  size?: number
  loaderStyle?: MobileLoaderStyle
}

export function LoadingIndicator({
  size = 16,
  loaderStyle
}: LoadingIndicatorProps): React.JSX.Element {
  const configuredStyle = useMobileLoaderStyle().loaderStyle
  // Why: the orb ships its own grayscale ramp; tinting keeps it on the app's
  // foreground color the way the desktop loader does.
  const color = useThemeColors().textPrimary

  return <ThinkingOrb state={loaderStyle ?? configuredStyle} size={size} color={color} />
}
