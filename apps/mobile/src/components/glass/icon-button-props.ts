import type { PressableProps } from 'react-native'

export type MobileGlassIconName =
  | 'back'
  | 'check'
  | 'checks'
  | 'close'
  | 'copy'
  | 'down'
  | 'external'
  | 'more'
  | 'play'
  | 'refresh'
  | 'save'
  | 'send'
  | 'settings'

export type MobileGlassIconButtonProps = {
  accessibilityLabel: string
  disabled?: boolean
  icon: MobileGlassIconName
  onPress: NonNullable<PressableProps['onPress']>
  size?: 'large' | 'regular' | 'small'
}
