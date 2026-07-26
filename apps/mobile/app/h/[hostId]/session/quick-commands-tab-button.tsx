import { Pressable, View } from 'react-native'

import { ArrowSquareRight } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { styles } from './styles'

export function QuickCommandsTabButton({
  disabled,
  onPress
}: {
  disabled: boolean
  onPress: () => void
}) {
  return (
    <>
      <View className="w-hairline bg-border h-[18px]" />
      <Pressable
        className={cn(styles.newTerminalButton, disabled && styles.newTerminalButtonDisabled)}
        disabled={disabled}
        onPress={onPress}
        accessibilityLabel="Quick commands"
      >
        <ArrowSquareRight size={16} colorClassName="accent-muted-foreground" />
      </Pressable>
    </>
  )
}
