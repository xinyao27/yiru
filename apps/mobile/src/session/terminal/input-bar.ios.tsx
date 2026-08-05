import { GlassEffectContainer, Host, HStack, TextField, useNativeState } from '@expo/ui/swift-ui'
import {
  autocorrectionDisabled,
  disabled as disabledModifier,
  frame,
  onSubmit,
  submitLabel,
  textFieldStyle,
  textInputAutocapitalization
} from '@expo/ui/swift-ui/modifiers'
import { useEffect, useMemo, useRef } from 'react'
import { useCSSVariable, useUniwind } from 'uniwind'

import { MobileSwiftUiGlassCircleButton } from '~/components/glass/swift-ui-button.ios'
import { MobileSwiftUiGlassInputShell } from '~/components/glass/swift-ui-input-shell.ios'
import { translate } from '~/i18n/translate'
import { resolveCssString } from '~/style/resolve-css-variable'

import { MobileAttachmentMenu } from '../attachment-menu'
import type { MobileTerminalInputBarProps } from './input-bar'

export function MobileTerminalInputBar({
  autocompleteEnabled,
  canSend,
  input,
  isAttaching,
  onAttachImage,
  onChangeText,
  onSend
}: MobileTerminalInputBarProps): React.JSX.Element {
  const nativeText = useNativeState(input)
  const nativeValueRef = useRef(input)
  const { theme } = useUniwind()
  const foregroundValue = useCSSVariable('--color-foreground')
  const foregroundColor = resolveCssString(foregroundValue)

  useEffect(() => {
    if (nativeValueRef.current !== input) {
      nativeValueRef.current = input
      nativeText.set(input)
    }
  }, [input, nativeText])

  const fullWidthModifiers = useMemo(() => [frame({ maxWidth: Infinity })], [])
  const inputModifiers = useMemo(
    () => [
      textFieldStyle('plain'),
      frame({ minWidth: 120, maxWidth: Infinity, minHeight: 32, alignment: 'leading' }),
      textInputAutocapitalization('never'),
      autocorrectionDisabled(!autocompleteEnabled),
      submitLabel('send'),
      onSubmit(onSend),
      disabledModifier(!canSend)
    ],
    [autocompleteEnabled, canSend, onSend]
  )

  return (
    <Host
      colorScheme={theme}
      ignoreSafeArea="keyboard"
      matchContents={{ vertical: true }}
      style={{ width: '100%' }}
    >
      <GlassEffectContainer modifiers={fullWidthModifiers} spacing={8}>
        <HStack alignment="center" spacing={8} modifiers={fullWidthModifiers}>
          <MobileAttachmentMenu
            disabled={!canSend || isAttaching}
            pending={isAttaching}
            onSelect={onAttachImage}
          />
          <MobileSwiftUiGlassInputShell hasTrailingAction>
            <TextField
              placeholder={translate(
                'mobile.session.terminal.commandPlaceholder',
                'Type a command…'
              )}
              modifiers={inputModifiers}
              text={nativeText}
              onTextChange={(nextValue) => {
                nativeValueRef.current = nextValue
                onChangeText(nextValue)
              }}
            />
            <MobileSwiftUiGlassCircleButton
              disabled={!canSend}
              isProminent
              label={translate('mobile.session.terminal.sendCommand', 'Send command')}
              size="small"
              systemImage="arrow.up"
              tintColor={foregroundColor}
              onPress={onSend}
            />
          </MobileSwiftUiGlassInputShell>
        </HStack>
      </GlassEffectContainer>
    </Host>
  )
}
