import { Pressable } from 'react-native'

import { ArrowSquareRight } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

type QuickCommandsTabButtonProps = {
  disabled: boolean
  onPress: () => void
}

export function QuickCommandsTabButton({
  disabled,
  onPress
}: QuickCommandsTabButtonProps): React.JSX.Element {
  return (
    <Pressable
      className={cn(
        'h-10 w-10 items-center justify-center rounded-xl active:bg-accent',
        disabled && 'opacity-50'
      )}
      disabled={disabled}
      onPress={onPress}
      accessibilityLabel="Quick commands"
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      <ArrowSquareRight size={16} colorClassName="accent-muted-foreground" />
    </Pressable>
  )
}
