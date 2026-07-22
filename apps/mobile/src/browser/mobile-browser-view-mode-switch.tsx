import { Pressable, Text, View } from 'react-native'

import { cn } from '@/style/class-names'

import type { MobileBrowserViewMode } from './browser-screencast-request'

type Props = {
  disabled: boolean
  value: MobileBrowserViewMode
  onChange: (mode: MobileBrowserViewMode) => void
}

const VIEW_MODES: { id: MobileBrowserViewMode; label: string }[] = [
  { id: 'web', label: 'Web' },
  { id: 'mobile', label: 'Mobile' }
]

export function MobileBrowserViewModeSwitch({
  disabled,
  value,
  onChange
}: Props): React.JSX.Element {
  return (
    <View className={styles.switch}>
      {VIEW_MODES.map((mode) => (
        <ViewModeButton
          key={mode.id}
          label={mode.label}
          selected={value === mode.id}
          disabled={disabled}
          onPress={() => onChange(mode.id)}
        />
      ))}
    </View>
  )
}

function ViewModeButton({
  disabled,
  label,
  onPress,
  selected
}: {
  disabled?: boolean
  label: string
  onPress: () => void
  selected: boolean
}) {
  return (
    <Pressable
      className={cn(
        styles.button,
        selected && styles.buttonSelected,
        !disabled && !selected && styles.buttonPressedActive,
        disabled && styles.disabled
      )}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={`Show ${label.toLowerCase()} website view`}
    >
      <Text className={cn(styles.buttonText, selected && styles.buttonTextSelected)}>{label}</Text>
    </Pressable>
  )
}

const styles = {
  switch: cn('min-h-7 flex-row items-center rounded-none bg-secondary p-[2px]'),
  button: cn('min-h-6 min-w-[52px] items-center justify-center rounded-none px-2'),
  buttonPressedActive: cn('active:bg-border'),
  buttonSelected: cn('bg-foreground'),
  buttonText: cn('text-muted-foreground text-[12px] font-semibold'),
  buttonTextSelected: cn('text-background'),
  disabled: cn('opacity-[0.35]')
} as const
