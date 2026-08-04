import ExpoSegmentedControl from '@expo/ui/community/segmented-control'
import { useMemo } from 'react'
import { View } from 'react-native'
import { useCSSVariable, useUniwind, withUniwind } from 'uniwind'

import { resolveCssString } from '~/style/resolve-css-variable'

export type MobileSegmentOption<Value extends string> = {
  label: string
  value: Value
}

export type MobileSegmentedControlProps<Value extends string> = {
  accessibilityLabel: string
  disabled?: boolean
  onChange: (value: Value) => void
  options: readonly MobileSegmentOption<Value>[]
  value: Value
}

const UniwindSegmentedControl = withUniwind(ExpoSegmentedControl)

export function MobileSegmentedControl<Value extends string>({
  accessibilityLabel,
  disabled = false,
  onChange,
  options,
  value
}: MobileSegmentedControlProps<Value>): React.JSX.Element {
  const { theme } = useUniwind()
  const primaryColor = resolveCssString(useCSSVariable('--color-primary'))
  const labels = useMemo(() => options.map((option) => option.label), [options])
  const selectedIndex = options.findIndex((option) => option.value === value)

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="tablist"
      accessibilityState={{ disabled }}
      className="min-h-11 justify-center"
    >
      <UniwindSegmentedControl
        appearance={theme}
        className="min-h-11 w-full"
        enabled={!disabled}
        onChange={({ nativeEvent }) => {
          const selectedOption = options[nativeEvent.selectedSegmentIndex]
          if (selectedOption) {
            onChange(selectedOption.value)
          }
        }}
        selectedIndex={selectedIndex >= 0 ? selectedIndex : undefined}
        tintColor={primaryColor}
        values={labels}
      />
    </View>
  )
}
