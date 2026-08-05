import type { PressableProps } from 'react-native'
import { Text, View } from 'react-native'

import { MobileGlassPressable } from '~/components/glass/pressable'
import {
  ArrowElbowDownRight as LiveInputIcon,
  ArrowsOutCardinal,
  CaretDown as ChevronDown,
  Chat,
  Clipboard,
  ClockCounterClockwise,
  Keyboard as KeyboardIcon,
  Plus
} from '~/components/uniwind-icons'

export type MobileTerminalAccessoryIcon =
  | 'add'
  | 'chat'
  | 'clipboard'
  | 'dismiss-keyboard'
  | 'display'
  | 'history'
  | 'keyboard'
  | 'live-input'

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
    case 'chat':
      return <Chat size={20} colorClassName="accent-muted-foreground" />
    case 'clipboard':
      return <Clipboard size={20} colorClassName="accent-muted-foreground" />
    case 'dismiss-keyboard':
      return (
        <View className="relative h-5 w-5 items-center justify-start">
          <KeyboardIcon size={15} colorClassName="accent-muted-foreground" />
          <View className="absolute -bottom-1">
            <ChevronDown size={10} colorClassName="accent-muted-foreground" />
          </View>
        </View>
      )
    case 'display':
      return <ArrowsOutCardinal size={20} colorClassName="accent-muted-foreground" />
    case 'history':
      return <ClockCounterClockwise size={20} colorClassName="accent-muted-foreground" />
    case 'keyboard':
      return <KeyboardIcon size={20} colorClassName="accent-muted-foreground" />
    case 'live-input':
      return <LiveInputIcon size={20} colorClassName="accent-muted-foreground" />
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
      contentClassName="min-h-9 min-w-9 items-center justify-center px-3"
      disabled={disabled}
      fallbackClassName={isSelected ? 'border-transparent' : 'border-transparent bg-secondary'}
      isSelected={isSelected === true}
      onPress={onPress}
      size="regular"
      tintColorClassName="accent-secondary"
    >
      {icon ? <MobileTerminalAccessoryIconView icon={icon} /> : null}
      {label ? <Text className="text-muted-foreground font-mono text-sm">{label}</Text> : null}
    </MobileGlassPressable>
  )
}
