import type { ReactNode } from 'react'
import { Pressable, type StyleProp, type ViewStyle } from 'react-native'

import { cn } from '@/style/class-names'

type Props = {
  children: ReactNode
  disabled?: boolean
  label: string
  onPress: () => void
  style?: StyleProp<ViewStyle>
}

export function MobileBrowserToolbarIconButton({
  children,
  disabled,
  label,
  onPress,
  style
}: Props): React.JSX.Element {
  return (
    <Pressable
      className={cn(
        'h-7 w-7 items-center justify-center rounded-full',
        !disabled && 'active:bg-accent',
        disabled && 'opacity-40'
      )}
      style={style}
      disabled={disabled}
      onPress={onPress}
      accessibilityLabel={label}
    >
      {children}
    </Pressable>
  )
}
