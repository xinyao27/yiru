import { Image } from 'react-native'
import { withUniwind } from 'uniwind'

type Props = {
  size?: number
  color?: string
}

function YiruLogoBase({ size = 24, color }: Props) {
  return (
    <Image
      source={require('../../assets/wordmark.png')}
      resizeMode="contain"
      style={{ width: size * 1.6, height: size, tintColor: color }}
    />
  )
}

export const YiruLogo = withUniwind(YiruLogoBase)
