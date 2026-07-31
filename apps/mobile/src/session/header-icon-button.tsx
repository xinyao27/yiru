import type { ComponentType } from 'react'

import { MobileGlassPressable } from '~/components/glass/pressable'

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
    <MobileGlassPressable
      accessibilityLabel={accessibilityLabel}
      className="h-9 w-9 rounded-full"
      contentClassName="h-full w-full items-center justify-center rounded-full"
      hitSlop={4}
      onPress={onPress}
      tintColorClassName={active ? 'accent-secondary' : undefined}
    >
      <Icon size={18} colorClassName="accent-muted-foreground" />
    </MobileGlassPressable>
  )
}
