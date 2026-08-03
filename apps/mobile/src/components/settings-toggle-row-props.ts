export type SettingsToggleRowProps = {
  disabled?: boolean
  inset?: 'none' | 'standard'
  label: string
  labelLines?: 1 | 2
  onValueChange: (value: boolean) => void
  supportingText?: string
  supportingTextLines?: 1 | 2
  value: boolean
}
