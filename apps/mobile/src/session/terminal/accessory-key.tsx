import type { PressableProps } from 'react-native'
import { Text, View } from 'react-native'

import { MobileGlassPressable } from '~/components/glass/pressable'
import {
  CaretDown as ChevronDown,
  CaretDoubleRight as ChevronsRight,
  Keyboard as KeyboardIcon,
  Monitor,
  Plus,
  DeviceMobile as Smartphone
} from '~/components/uniwind-icons'

export type MobileTerminalAccessoryIcon =
  | 'add'
  | 'desktop'
  | 'dismiss-keyboard'
  | 'live-input'
  | 'phone'

type MobileTerminalAccessoryKeyContent =
  | { icon: MobileTerminalAccessoryIcon; label?: never }
  | { icon?: never; label: string }

export type MobileTerminalAccessoryKeyProps = Omit<
  PressableProps,
  'children' | 'disabled' | 'onPress'
> &
  MobileTerminalAccessoryKeyContent & {
    disabled?: boolean
    isSelected?: boolean
    onPress: NonNullable<PressableProps['onPress']>
  }

function MobileTerminalAccessoryIconView({
  icon
}: {
  icon: MobileTerminalAccessoryIcon
}): React.JSX.Element {
  switch (icon) {
    case 'add':
      return <Plus size={16} colorClassName="accent-muted-foreground" />
    case 'desktop':
      return <Monitor size={14} colorClassName="accent-muted-foreground" />
    case 'dismiss-keyboard':
      return (
        <View className="relative h-5 w-5 items-center justify-start">
          <KeyboardIcon size={15} colorClassName="accent-muted-foreground" />
          <View className="absolute -bottom-1">
            <ChevronDown size={10} colorClassName="accent-muted-foreground" />
          </View>
        </View>
      )
    case 'live-input':
      return <ChevronsRight size={14} colorClassName="accent-muted-foreground" />
    case 'phone':
      return <Smartphone size={14} colorClassName="accent-muted-foreground" />
  }
}

export function MobileTerminalAccessoryKey({
  accessibilityState,
  disabled = false,
  icon,
  isSelected,
  label,
  onPress,
  ...pressableProps
}: MobileTerminalAccessoryKeyProps): React.JSX.Element {
  return (
    <MobileGlassPressable
      {...pressableProps}
      accessibilityRole="button"
      accessibilityState={{
        ...accessibilityState,
        disabled,
        ...(isSelected === undefined ? {} : { selected: isSelected })
      }}
      className="rounded-full"
      contentClassName="min-h-8 min-w-10 items-center justify-center rounded-full px-3 py-1"
      disabled={disabled}
      onPress={onPress}
      tintColorClassName={isSelected === true ? 'accent-primary' : 'accent-secondary'}
    >
      {icon ? <MobileTerminalAccessoryIconView icon={icon} /> : null}
      {label ? <Text className="text-muted-foreground font-mono text-xs">{label}</Text> : null}
    </MobileGlassPressable>
  )
}
