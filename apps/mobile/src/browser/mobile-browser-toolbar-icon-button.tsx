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
        styles.button,
        !disabled && styles.buttonPressedActive,
        disabled && styles.disabled
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

const styles = {
  button: cn('w-[26px] h-[26px] rounded-none items-center justify-center'),
  buttonPressedActive: cn('active:bg-secondary'),
  disabled: cn('opacity-[0.35]')
} as const
