import { GlassEffectContainer, Host, Image, TextField, useNativeState } from '@expo/ui/swift-ui'
import {
  autocorrectionDisabled,
  frame,
  submitLabel,
  textFieldStyle,
  textInputAutocapitalization,
  type ViewModifier
} from '@expo/ui/swift-ui/modifiers'
import { useEffect, useMemo, useRef } from 'react'
import { useCSSVariable, useUniwind } from 'uniwind'

import { MobileSwiftUiGlassInputShell } from '~/components/glass/swift-ui-input-shell.ios'
import { translate } from '~/i18n/translate'
import { resolveCssString } from '~/style/resolve-css-variable'

import type { MobileAgentHistorySearchControlProps } from './search-control-props'

export function MobileAgentHistorySearchControl({
  onChangeText,
  value
}: MobileAgentHistorySearchControlProps): React.JSX.Element {
  const nativeText = useNativeState(value)
  const nativeValueRef = useRef(value)
  const { theme } = useUniwind()
  const mutedForegroundColor = resolveCssString(useCSSVariable('--color-muted-foreground'))
  const inputModifiers = useMemo<ViewModifier[]>(
    () => [
      textFieldStyle('plain'),
      frame({ minWidth: 120, maxWidth: Infinity, minHeight: 32, alignment: 'leading' }),
      submitLabel('search'),
      autocorrectionDisabled(),
      textInputAutocapitalization('never')
    ],
    []
  )

  useEffect(() => {
    if (nativeValueRef.current !== value) {
      nativeValueRef.current = value
      nativeText.set(value)
    }
  }, [nativeText, value])

  return (
    <Host
      colorScheme={theme}
      matchContents={{ vertical: true }}
      style={{ width: '100%', backgroundColor: 'transparent' }}
    >
      <GlassEffectContainer spacing={8}>
        <MobileSwiftUiGlassInputShell hasTrailingAction={false}>
          <Image systemName="magnifyingglass" size={16} color={mutedForegroundColor} />
          <TextField
            modifiers={inputModifiers}
            onTextChange={(nextValue) => {
              nativeValueRef.current = nextValue
              onChangeText(nextValue)
            }}
            placeholder={translate(
              'mobile.agentHistory.search.placeholder',
              'Search sessions, repo:, path:'
            )}
            text={nativeText}
          />
        </MobileSwiftUiGlassInputShell>
      </GlassEffectContainer>
    </Host>
  )
}
