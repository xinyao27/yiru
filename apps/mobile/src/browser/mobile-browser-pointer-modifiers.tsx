import { Pressable, Text, View } from 'react-native'

import { cn } from '@/style/class-names'

export type BrowserPointerModifier = 'cmd' | 'ctrl' | 'alt' | 'shift'

const BROWSER_POINTER_MODIFIERS: { id: BrowserPointerModifier; label: string }[] = [
  { id: 'cmd', label: 'Cmd' },
  { id: 'ctrl', label: 'Ctrl' },
  { id: 'alt', label: 'Alt' },
  { id: 'shift', label: 'Shift' }
]

type Props = {
  disabled: boolean
  selectedModifiers: BrowserPointerModifier[]
  onToggle: (modifier: BrowserPointerModifier) => void
}

export function MobileBrowserPointerModifiers({
  disabled,
  selectedModifiers,
  onToggle
}: Props): React.JSX.Element {
  return (
    <View className={styles.modifierRow}>
      {BROWSER_POINTER_MODIFIERS.map((modifier) => {
        const selected = selectedModifiers.includes(modifier.id)
        return (
          <Pressable
            key={modifier.id}
            className={cn(
              styles.keyButton,
              selected && styles.keyButtonSelected,
              !selected && styles.keyButtonPressedActive,
              disabled && styles.disabled
            )}
            disabled={disabled}
            onPress={() => onToggle(modifier.id)}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={`${modifier.label} click modifier`}
          >
            <Text
              className={cn(
                styles.keyButtonText,
                selected && styles.keyButtonTextSelected,
                disabled && styles.disabledText
              )}
            >
              {modifier.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = {
  modifierRow: cn('flex-row gap-1 px-2 pt-1'),
  keyButton: cn(
    'min-h-[30px] min-w-[42px] items-center justify-center rounded-none bg-secondary px-2'
  ),
  keyButtonPressedActive: cn('active:bg-border'),
  keyButtonSelected: cn('bg-foreground'),
  keyButtonText: cn('text-muted-foreground text-[12px] font-mono'),
  keyButtonTextSelected: cn('text-background'),
  disabled: cn('opacity-[0.35]'),
  disabledText: cn('text-muted-foreground/60')
} as const
