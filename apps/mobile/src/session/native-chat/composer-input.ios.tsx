import { Host, HStack, TextField, type TextFieldRef, useNativeState } from '@expo/ui/swift-ui'
import {
  disabled as disabledModifier,
  fixedSize,
  frame,
  lineLimit,
  textFieldStyle
} from '@expo/ui/swift-ui/modifiers'
import { useEffect, useMemo, useRef } from 'react'
import { useCSSVariable, useUniwind } from 'uniwind'

import {
  MobileSwiftUiGlassCircleButton,
  MobileSwiftUiGlassGroup,
  MobileSwiftUiGlassInputShell
} from '~/components/glass/swift-ui.ios'
import { resolveCssString } from '~/style/resolve-css-variable'

import { MobileAttachmentMenu } from '../attachment-menu'
import type { MobileNativeChatInputProps } from './composer-input'

export function MobileNativeChatInput({
  value,
  onChangeText,
  selection,
  onSelectionChange,
  onAttachImage,
  isAttaching,
  disabled,
  placeholder,
  hasMessage,
  canSend,
  onSend,
  agentWorking,
  onStop
}: MobileNativeChatInputProps): React.JSX.Element {
  const inputRef = useRef<TextFieldRef>(null)
  const nativeText = useNativeState(value)
  const nativeValueRef = useRef(value)
  const { theme } = useUniwind()
  const foregroundValue = useCSSVariable('--color-foreground')
  const foregroundColor = resolveCssString(foregroundValue)
  const showAction = (agentWorking && onStop !== undefined) || hasMessage

  useEffect(() => {
    let active = true
    const reconcileNativeInput = async (): Promise<void> => {
      if (nativeValueRef.current !== value) {
        nativeValueRef.current = value
        nativeText.set(value)
      }
      if (active && selection) {
        await inputRef.current?.setSelection(selection.start, selection.end)
      }
    }
    void reconcileNativeInput()
    return () => {
      active = false
    }
  }, [nativeText, selection, value])

  const inputModifiers = useMemo(
    () => [
      textFieldStyle('plain'),
      lineLimit({ min: 1, max: 5 }),
      fixedSize({ horizontal: false, vertical: true }),
      frame({ minWidth: 120, maxWidth: Infinity, minHeight: 32, alignment: 'leading' }),
      disabledModifier(disabled)
    ],
    [disabled]
  )
  return (
    <Host
      colorScheme={theme}
      ignoreSafeArea="keyboard"
      matchContents={{ vertical: true }}
      style={{ width: '100%' }}
    >
      <MobileSwiftUiGlassGroup spacing={8}>
        <HStack alignment="bottom" spacing={8}>
          {onAttachImage ? (
            <MobileAttachmentMenu
              disabled={isAttaching || disabled}
              pending={isAttaching}
              onSelect={onAttachImage}
            />
          ) : null}
          <MobileSwiftUiGlassInputShell alignment="bottom" hasTrailingAction={showAction}>
            <TextField
              ref={inputRef}
              axis="vertical"
              placeholder={placeholder}
              modifiers={inputModifiers}
              text={nativeText}
              onTextChange={(nextValue) => {
                nativeValueRef.current = nextValue
                onChangeText(nextValue)
              }}
              onSelectionChange={({ end }) => onSelectionChange(end)}
            />
            {agentWorking && onStop ? (
              <MobileSwiftUiGlassCircleButton
                isProminent
                label="Stop the agent"
                size="small"
                systemImage="stop"
                tintColor={foregroundColor}
                onPress={onStop}
              />
            ) : hasMessage ? (
              <MobileSwiftUiGlassCircleButton
                disabled={!canSend}
                isProminent
                label="Send message"
                size="small"
                systemImage="arrow.up"
                tintColor={foregroundColor}
                onPress={onSend}
              />
            ) : null}
          </MobileSwiftUiGlassInputShell>
        </HStack>
      </MobileSwiftUiGlassGroup>
    </Host>
  )
}
