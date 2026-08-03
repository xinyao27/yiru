import { cn } from 'cnfast'
import { Pressable, Switch, Text, View } from 'react-native'

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
      accessible
      accessibilityHint={supportingText}
      accessibilityLabel={label}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      className={cn('min-h-11 flex-row items-center gap-2 py-2', inset === 'standard' && 'px-5')}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
    >
      <View className={cn('min-w-0 flex-1', disabled && 'opacity-50')}>
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
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
      >
        <Switch
          accessible={false}
          disabled={disabled}
          focusable={false}
          thumbColorClassName="accent-background"
          trackColorOffClassName="accent-muted"
          trackColorOnClassName="accent-primary"
          value={value}
        />
      </View>
    </Pressable>
  )
}
