import { Host, Picker, Text } from '@expo/ui/swift-ui'
import { disabled as disabledModifier, frame, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers'
import { useMemo } from 'react'
import { useCSSVariable, useUniwind, withUniwind } from 'uniwind'

import { resolveCssString } from '~/style/resolve-css-variable'

import type { MobileSegmentedControlProps } from './segmented-control'

const UniwindHost = withUniwind(Host)

export function MobileSegmentedControl<Value extends string>({
  accessibilityLabel,
  disabled = false,
  onChange,
  options,
  value
}: MobileSegmentedControlProps<Value>): React.JSX.Element {
  const { theme } = useUniwind()
  const primaryColor = resolveCssString(useCSSVariable('--color-primary'))
  const modifiers = useMemo(
    () => [
      pickerStyle('segmented'),
      frame({ maxWidth: Infinity, minHeight: 44, alignment: 'center' }),
      disabledModifier(disabled)
    ],
    [disabled]
  )

  return (
    <UniwindHost
      className="w-full bg-transparent"
      colorScheme={theme}
      ignoreSafeArea="all"
      matchContents={{ vertical: true }}
      seedColor={primaryColor}
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
    </UniwindHost>
  )
}
