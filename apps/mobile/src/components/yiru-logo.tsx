import Svg, { Path } from 'react-native-svg'

import { useThemeColors } from '../theme/uniwind-theme-values'

type Props = {
  size?: number
  color?: string
}

export function YiruLogo({ size = 24, color }: Props) {
  const colors = useThemeColors()
  return (
    <Svg width={size} height={size} viewBox="0 0 612 621">
      <Path
        fill={color ?? colors.textPrimary}
        d="M0 0h118l188 192L494 0h118v62L374 304v317H241V304L0 62Z"
      />
    </Svg>
  )
}
