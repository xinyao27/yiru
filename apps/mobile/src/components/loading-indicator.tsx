import { isAICSSLoaderVariant } from '@yiru/workbench-model/loader'
import { ThinkingOrb } from 'expo-thinking-orbs'
import { withUniwind } from 'uniwind'

import type { MobileLoaderStyle } from '../loading/loader-style'
import { useMobileLoaderStyle } from '../loading/loader-style-context'
import { MobileOrb } from '../loading/orb'

const UniwindThinkingOrb = withUniwind(ThinkingOrb)

type LoadingIndicatorProps = {
  size?: number
  loaderStyle?: MobileLoaderStyle
  color?: string
}

export function LoadingIndicator({
  size = 16,
  loaderStyle,
  color
}: LoadingIndicatorProps): React.JSX.Element {
  const configuredStyle = useMobileLoaderStyle().loaderStyle
  const selectedStyle = loaderStyle ?? configuredStyle

  if (!isAICSSLoaderVariant(selectedStyle)) {
    return color ? (
      <ThinkingOrb color={color} size={size} state={selectedStyle} />
    ) : (
      <UniwindThinkingOrb colorClassName="accent-foreground" size={size} state={selectedStyle} />
    )
  }

  return <MobileOrb color={color} size={size} variant={selectedStyle} />
}
