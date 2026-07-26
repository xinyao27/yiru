import { Pressable, Text, View } from 'react-native'

import { cn } from '@/style/class-names'

const BROWSER_KEYS = ['Enter', 'Backspace', 'Tab', 'Escape'] as const

type Props = {
  disabled: boolean
  onKeypress: (key: string) => void
}

export function MobileBrowserKeyRow({ disabled, onKeypress }: Props): React.JSX.Element {
  return (
    <View className={styles.keyRow}>
      {BROWSER_KEYS.map((key) => (
        <Pressable
          key={key}
          className={cn(
            styles.keyButton,
            styles.keyButtonPressedActive,
            disabled && styles.disabled
          )}
          disabled={disabled}
          onPress={() => onKeypress(key)}
        >
          <Text className={cn(styles.keyButtonText, disabled && styles.disabledText)}>
            {key === 'Backspace' ? '⌫' : key === 'Escape' ? 'Esc' : key}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

const styles = {
  keyRow: cn('flex-row gap-1 px-2 pt-1'),
  keyButton: cn(
    'min-h-[30px] min-w-[42px] items-center justify-center rounded-none bg-secondary px-2'
  ),
  keyButtonPressedActive: cn('active:bg-border'),
  keyButtonText: cn('text-muted-foreground text-[12px] font-mono'),
  disabled: cn('opacity-[0.35]'),
  disabledText: cn('text-muted-foreground/60')
} as const
