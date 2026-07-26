import { Pressable, Text, View } from 'react-native'

import { cn } from '@/style/class-names'

const BROWSER_KEYS = ['Enter', 'Backspace', 'Tab', 'Escape'] as const

type Props = {
  disabled: boolean
  onKeypress: (key: string) => void
}

export function MobileBrowserKeyRow({ disabled, onKeypress }: Props): React.JSX.Element {
  return (
    <View className="flex-row gap-1 px-2 pt-1">
      {BROWSER_KEYS.map((key) => (
        <Pressable
          key={key}
          className={cn(
            'min-h-8 min-w-11 items-center justify-center rounded-lg bg-secondary px-2',
            'active:bg-accent',
            disabled && 'opacity-40'
          )}
          disabled={disabled}
          onPress={() => onKeypress(key)}
        >
          <Text
            className={cn(
              'text-muted-foreground text-xs font-mono',
              disabled && 'text-muted-foreground'
            )}
          >
            {key === 'Backspace' ? '⌫' : key === 'Escape' ? 'Esc' : key}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}
