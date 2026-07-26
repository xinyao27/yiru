import { Pressable, Text, View } from 'react-native'

import { cn } from '@/style/class-names'

import type { MobileBrowserViewMode } from './screencast-request'

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
    <View className="bg-secondary min-h-7 flex-row items-center p-[2px]">
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
        'min-h-6 min-w-[52px] items-center justify-center px-2',
        selected && 'bg-accent',
        !disabled && !selected && 'active:bg-accent',
        disabled && 'opacity-[0.35]'
      )}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={`Show ${label.toLowerCase()} website view`}
    >
      <Text
        className={cn(
          'text-muted-foreground text-xs font-semibold',
          selected && 'text-accent-foreground'
        )}
      >
        {label}
      </Text>
    </Pressable>
  )
}
