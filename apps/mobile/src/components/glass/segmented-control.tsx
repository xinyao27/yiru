import { Pressable, Text } from 'react-native'

import { cn } from '~/style/class-names'

import type { MobileGlassSegmentedControlProps } from './segmented-control-props'
import { MobileGlassSurface } from './surface'

export function MobileGlassSegmentedControl<Value extends string>({
  accessibilityLabel,
  disabled = false,
  onChange,
  options,
  size = 'regular',
  value
}: MobileGlassSegmentedControlProps<Value>): React.JSX.Element {
  return (
    <MobileGlassSurface
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="tablist"
      className="flex-row overflow-hidden rounded-full p-1"
      isFunctional
      isInteractive={!disabled}
    >
      {options.map((option) => {
        const isSelected = option.value === value
        return (
          <Pressable
            key={option.value}
            accessibilityLabel={option.label}
            accessibilityRole="tab"
            accessibilityState={{ disabled, selected: isSelected }}
            className={cn(
              'flex-1 items-center justify-center rounded-full px-3',
              size === 'regular' ? 'min-h-7' : 'min-h-6',
              isSelected ? 'bg-accent' : 'active:bg-accent',
              disabled && 'opacity-40'
            )}
            disabled={disabled}
            hitSlop={size === 'regular' ? 4 : 8}
            onPress={() => onChange(option.value)}
          >
            <Text
              className={cn(
                size === 'regular' ? 'text-sm' : 'text-xs',
                isSelected ? 'text-foreground' : 'text-muted-foreground'
              )}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </MobileGlassSurface>
  )
}
