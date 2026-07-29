export type MobileGlassSegmentOption<Value extends string> = {
  label: string
  value: Value
}

export type MobileGlassSegmentedControlProps<Value extends string> = {
  accessibilityLabel: string
  disabled?: boolean
  onChange: (value: Value) => void
  options: readonly MobileGlassSegmentOption<Value>[]
  size?: 'regular' | 'small'
  value: Value
}
