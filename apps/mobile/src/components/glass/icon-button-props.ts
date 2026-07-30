import type { PressableProps } from 'react-native'

export type MobileGlassIconName =
  | 'add-person'
  | 'back'
  | 'check'
  | 'checks'
  | 'close'
  | 'copy'
  | 'delete'
  | 'down'
  | 'edit'
  | 'external'
  | 'insights'
  | 'minus'
  | 'more'
  | 'play'
  | 'plus'
  | 'refresh'
  | 'save'
  | 'send'
  | 'settings'
  | 'sidebar'

export type MobileGlassIconButtonProps = {
  accessibilityLabel: string
  disabled?: boolean
  icon: MobileGlassIconName
  isDestructive?: boolean
  isSelected?: boolean
  onPress: NonNullable<PressableProps['onPress']>
  size?: 'large' | 'regular' | 'small'
}
