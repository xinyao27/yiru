import type { ComponentType } from 'react'
import { Pressable } from 'react-native'

import { cn } from '@/style/class-names'

type HeaderIconProps = {
  size?: number
  color?: string
  colorClassName?: string
}

type MobileSessionHeaderIconButtonProps = {
  active?: boolean
  accessibilityLabel: string
  icon: ComponentType<HeaderIconProps>
  onPress: () => void
}

export function MobileSessionHeaderIconButton({
  active = false,
  accessibilityLabel,
  icon: Icon,
  onPress
}: MobileSessionHeaderIconButtonProps) {
  return (
    <Pressable
      className={cn(
        'w-9 h-9 items-center justify-center ml-1',
        'active:bg-accent',
        active && 'bg-secondary'
      )}
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel={accessibilityLabel}
    >
      <Icon size={18} colorClassName="accent-muted-foreground" />
    </Pressable>
  )
}
