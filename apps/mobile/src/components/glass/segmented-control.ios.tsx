import { Host, Picker, Text } from '@expo/ui/swift-ui'
import {
  controlSize,
  disabled as disabledModifier,
  frame,
  pickerStyle,
  tag
} from '@expo/ui/swift-ui/modifiers'
import { useMemo } from 'react'
import { useUniwind } from 'uniwind'

import type { MobileGlassSegmentedControlProps } from './segmented-control-props'

export function MobileGlassSegmentedControl<Value extends string>({
  accessibilityLabel,
  disabled = false,
  onChange,
  options,
  size = 'regular',
  value
}: MobileGlassSegmentedControlProps<Value>): React.JSX.Element {
  const { theme } = useUniwind()
  const modifiers = useMemo(
    () => [
      pickerStyle('segmented'),
      controlSize(size),
      frame({ maxWidth: Infinity, alignment: 'center' }),
      disabledModifier(disabled)
    ],
    [disabled, size]
  )

  return (
    <Host
      colorScheme={theme}
      matchContents={{ vertical: true }}
      style={{ width: '100%', backgroundColor: 'transparent' }}
    >
      <Picker
        label={accessibilityLabel}
        selection={value}
        modifiers={modifiers}
        onSelectionChange={onChange}
      >
        {options.map((option) => (
          <Text key={option.value} modifiers={[tag(option.value)]}>
            {option.label}
          </Text>
        ))}
      </Picker>
    </Host>
  )
}
