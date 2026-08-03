import { cn } from 'cnfast'
import { Pressable, Text, View } from 'react-native'

import type { SettingsToggleRowProps } from './settings-toggle-row-props'

export function SettingsToggleRow({
  disabled = false,
  inset = 'standard',
  label,
  labelLines,
  onValueChange,
  supportingText,
  supportingTextLines,
  value
}: SettingsToggleRowProps): React.JSX.Element {
  return (
    <Pressable
      aria-checked={value}
      aria-disabled={disabled}
      aria-label={label}
      accessibilityHint={supportingText}
      className={cn(
        'min-h-11 flex-row items-center gap-2 py-2',
        inset === 'standard' && 'px-5',
        disabled && 'opacity-50'
      )}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      role="switch"
    >
      <View className="min-w-0 flex-1">
        <Text className="text-foreground text-base" numberOfLines={labelLines}>
          {label}
        </Text>
        {supportingText ? (
          <Text className="text-muted-foreground mt-1 text-sm" numberOfLines={supportingTextLines}>
            {supportingText}
          </Text>
        ) : null}
      </View>
      <View
        aria-hidden
        className={cn(
          'h-[31px] w-[51px] shrink-0 justify-center rounded-full p-0.5',
          value ? 'bg-primary' : 'bg-muted'
        )}
      >
        <View
          className={cn(
            'bg-background h-[27px] w-[27px] rounded-full shadow-sm transition-transform',
            value && 'translate-x-5'
          )}
        />
      </View>
    </Pressable>
  )
}
