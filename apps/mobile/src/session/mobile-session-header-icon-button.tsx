import type { ComponentType } from 'react'
import { Pressable } from 'react-native'

import { cn } from '@/style/class-names'

import { styles } from '../../app/h/[hostId]/session/mobile-session-styles'

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
      className={cn(styles.filesButton, 'active:bg-secondary', active && styles.filesButtonActive)}
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel={accessibilityLabel}
    >
      <Icon size={18} colorClassName="accent-muted-foreground" />
    </Pressable>
  )
}
