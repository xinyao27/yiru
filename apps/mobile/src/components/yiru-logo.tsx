import Svg, { Path } from 'react-native-svg'
import { withUniwind } from 'uniwind'

type Props = {
  size?: number
  color?: string
}

function YiruLogoBase({ size = 24, color }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 612 621">
      <Path fill={color} d="M0 0h118l188 192L494 0h118v62L374 304v317H241V304L0 62Z" />
    </Svg>
  )
}

export const YiruLogo = withUniwind(YiruLogoBase)
