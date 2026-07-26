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
    <View className="flex-row gap-1 px-2 pt-1">
      {BROWSER_POINTER_MODIFIERS.map((modifier) => {
        const selected = selectedModifiers.includes(modifier.id)
        return (
          <Pressable
            key={modifier.id}
            className={cn(
              'min-h-[30px] min-w-[42px] items-center justify-center bg-secondary px-2',
              selected && 'bg-accent',
              !selected && 'active:bg-accent',
              disabled && 'opacity-[0.35]'
            )}
            disabled={disabled}
            onPress={() => onToggle(modifier.id)}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={`${modifier.label} click modifier`}
          >
            <Text
              className={cn(
                'text-muted-foreground text-xs font-mono',
                selected && 'text-accent-foreground',
                disabled && 'text-muted-foreground/60'
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
