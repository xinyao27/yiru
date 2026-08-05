import type { PressableProps } from 'react-native'

export type MobileTerminalAccessoryIcon =
  | 'device-mobile'
  | 'dismiss-keyboard'
  | 'keyboard'
  | 'laptop'

type MobileTerminalAccessoryKeyContent =
  | { icon: MobileTerminalAccessoryIcon; label?: never }
  | { icon?: never; label: string }

export type MobileTerminalAccessoryKeyProps = Omit<
  PressableProps,
  'children' | 'disabled' | 'onPress'
> &
  MobileTerminalAccessoryKeyContent & {
    disabled?: boolean
    isCircular?: boolean
    isSelected?: boolean
    onPress: NonNullable<PressableProps['onPress']>
  }
