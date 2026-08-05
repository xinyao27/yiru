import { Text, View } from 'react-native'

import { MobileGlassPressable } from '~/components/glass/pressable'
import {
  CaretDown as ChevronDown,
  DeviceMobile,
  Keyboard as KeyboardIcon,
  Laptop
} from '~/components/uniwind-icons'

import type {
  MobileTerminalAccessoryIcon,
  MobileTerminalAccessoryKeyProps
} from './accessory-key-props'

export type {
  MobileTerminalAccessoryIcon,
  MobileTerminalAccessoryKeyProps
} from './accessory-key-props'

function MobileTerminalAccessoryIconView({
  icon
}: {
  icon: MobileTerminalAccessoryIcon
}): React.JSX.Element {
  switch (icon) {
    case 'dismiss-keyboard':
      return (
        <View className="relative h-5 w-5 items-center justify-start">
          <KeyboardIcon size={15} colorClassName="accent-muted-foreground" />
          <View className="absolute -bottom-1">
            <ChevronDown size={10} colorClassName="accent-muted-foreground" />
          </View>
        </View>
      )
    case 'device-mobile':
      return <DeviceMobile size={20} colorClassName="accent-muted-foreground" />
    case 'keyboard':
      return <KeyboardIcon size={20} colorClassName="accent-muted-foreground" />
    case 'laptop':
      return <Laptop size={20} colorClassName="accent-muted-foreground" />
  }
}

export function MobileTerminalAccessoryKey({
  accessibilityState,
  disabled = false,
  icon,
  isCircular = false,
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
      className={
        isCircular ? 'bg-card h-9 w-9 overflow-hidden rounded-full' : 'bg-card rounded-full'
      }
      contentClassName={
        isCircular
          ? 'h-9 w-9 items-center justify-center rounded-full px-0'
          : 'min-h-9 min-w-9 items-center justify-center rounded-full px-3'
      }
      disabled={disabled}
      fallbackClassName={isSelected ? 'border-transparent' : 'border-transparent bg-secondary'}
      onPress={onPress}
      size="regular"
    >
      {icon ? <MobileTerminalAccessoryIconView icon={icon} /> : null}
      {label ? <Text className="text-foreground font-mono text-sm">{label}</Text> : null}
    </MobileGlassPressable>
  )
}
