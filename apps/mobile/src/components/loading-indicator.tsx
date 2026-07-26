import { ThinkingOrb } from 'expo-thinking-orbs'
import { withUniwind } from 'uniwind'

import type { MobileLoaderStyle } from '../loading/loader-style'
import { useMobileLoaderStyle } from '../loading/loader-style-context'

const UniwindThinkingOrb = withUniwind(ThinkingOrb)

type LoadingIndicatorProps = {
  size?: number
  loaderStyle?: MobileLoaderStyle
}

export function LoadingIndicator({
  size = 16,
  loaderStyle
}: LoadingIndicatorProps): React.JSX.Element {
  const configuredStyle = useMobileLoaderStyle().loaderStyle

  return (
    <UniwindThinkingOrb
      state={loaderStyle ?? configuredStyle}
      size={size}
      colorClassName="accent-foreground"
    />
  )
}
