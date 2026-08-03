import { Host, Text, Toggle } from '@expo/ui/swift-ui'
import {
  accessibilityHint,
  accessibilityLabel,
  disabled as disabledModifier,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  padding
} from '@expo/ui/swift-ui/modifiers'
import { useMemo } from 'react'
import { useCSSVariable, useUniwind, withUniwind } from 'uniwind'

import { resolveCssString } from '~/style/resolve-css-variable'

import type { SettingsToggleRowProps } from './settings-toggle-row-props'

const UniwindHost = withUniwind(Host)
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
  const { theme } = useUniwind()
  const primaryColor = resolveCssString(useCSSVariable('--color-primary'))
  const labelModifiers = useMemo(
    () => [font({ textStyle: 'body' }), ...(labelLines ? [lineLimit(labelLines)] : [])],
    [labelLines]
  )
  const toggleModifiers = useMemo(
    () => [
      frame({ maxWidth: Infinity, minHeight: 44, alignment: 'leading' }),
      ...(inset === 'standard' ? [padding({ horizontal: 20 })] : []),
      disabledModifier(disabled),
      accessibilityLabel(label),
      ...(supportingText ? [accessibilityHint(supportingText)] : [])
    ],
    [disabled, inset, label, supportingText]
  )
  const supportingTextModifiers = useMemo(
    () => [
      font({ textStyle: 'footnote' }),
      foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
      ...(supportingTextLines ? [lineLimit(supportingTextLines)] : [])
    ],
    [supportingTextLines]
  )

  return (
    <UniwindHost
      className="w-full bg-transparent"
      colorScheme={theme}
      ignoreSafeArea="all"
      matchContents={{ vertical: true }}
      seedColor={primaryColor}
    >
      <Toggle isOn={value} modifiers={toggleModifiers} onIsOnChange={onValueChange}>
        <Text modifiers={labelModifiers}>{label}</Text>
        {supportingText ? <Text modifiers={supportingTextModifiers}>{supportingText}</Text> : null}
      </Toggle>
    </UniwindHost>
  )
}
