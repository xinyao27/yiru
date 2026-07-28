import { Pressable, Text } from 'react-native'

import { cn } from '../../style/class-names'
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
      className={cn('flex-row overflow-hidden rounded-full', size === 'regular' ? 'p-1' : 'p-0.5')}
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
              'min-h-7 flex-1 items-center justify-center rounded-full px-3',
              isSelected ? 'bg-accent' : 'active:bg-accent',
              disabled && 'opacity-40'
            )}
            disabled={disabled}
            hitSlop={size === 'regular' ? 4 : 8}
            onPress={() => onChange(option.value)}
          >
            <Text
              className={cn('text-sm', isSelected ? 'text-foreground' : 'text-muted-foreground')}
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
