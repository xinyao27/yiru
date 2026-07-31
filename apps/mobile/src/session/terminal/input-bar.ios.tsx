import {
  Button,
  Host,
  HStack,
  Image,
  Spacer,
  Text,
  TextField,
  useNativeState,
  VStack
} from '@expo/ui/swift-ui'
import {
  autocorrectionDisabled,
  buttonBorderShape,
  controlSize,
  disabled as disabledModifier,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  onSubmit,
  submitLabel,
  textFieldStyle,
  textInputAutocapitalization
} from '@expo/ui/swift-ui/modifiers'
import { useEffect, useMemo, useRef } from 'react'
import { useCSSVariable, useUniwind } from 'uniwind'

import { useMobileGlassAvailable } from '~/components/glass/availability'
import {
  mobileSwiftUiGlassButtonStyle,
  MobileSwiftUiGlassCircleButton,
  MobileSwiftUiGlassGroup,
  MobileSwiftUiGlassInputShell
} from '~/components/glass/swift-ui.ios'
import { resolveCssString } from '~/style/resolve-css-variable'

import { MobileAttachmentMenu } from '../attachment-menu'
import type { MobileTerminalInputBarProps } from './input-bar'

export function MobileTerminalInputBar({
  autocompleteEnabled,
  canSend,
  input,
  isAttaching,
  liveInputEnabled,
  onAttachImage,
  onChangeText,
  onFocusLiveInput,
  onSend
}: MobileTerminalInputBarProps): React.JSX.Element {
  const nativeText = useNativeState(input)
  const nativeValueRef = useRef(input)
  const { theme } = useUniwind()
  const [foregroundValue, mutedForegroundValue] = useCSSVariable([
    '--color-foreground',
    '--color-muted-foreground'
  ])
  const foregroundColor = resolveCssString(foregroundValue)
  const mutedForegroundColor = resolveCssString(mutedForegroundValue)
  const isGlassAvailable = useMobileGlassAvailable()

  useEffect(() => {
    if (nativeValueRef.current !== input) {
      nativeValueRef.current = input
      nativeText.set(input)
    }
  }, [input, nativeText])

  const fullWidthModifiers = useMemo(() => [frame({ maxWidth: Infinity })], [])
  const liveInputModifiers = useMemo(
    () => [
      frame({ minWidth: 160, maxWidth: Infinity, minHeight: 48, alignment: 'leading' }),
      controlSize('large'),
      buttonBorderShape('capsule'),
      mobileSwiftUiGlassButtonStyle(isGlassAvailable),
      disabledModifier(!canSend)
    ],
    [canSend, isGlassAvailable]
  )
  const liveInputTitleModifiers = useMemo(
    () => [
      font({ textStyle: 'subheadline', weight: 'semibold' }),
      foregroundStyle(foregroundColor),
      lineLimit(1)
    ],
    [foregroundColor]
  )
  const liveInputDetailModifiers = useMemo(
    () => [font({ textStyle: 'caption' }), foregroundStyle(mutedForegroundColor), lineLimit(1)],
    [mutedForegroundColor]
  )
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
      <MobileSwiftUiGlassGroup modifiers={fullWidthModifiers} spacing={8}>
        <HStack alignment="center" spacing={8} modifiers={fullWidthModifiers}>
          <MobileAttachmentMenu
            disabled={!canSend || isAttaching}
            pending={isAttaching}
            onSelect={onAttachImage}
          />
          {liveInputEnabled ? (
            <Button modifiers={liveInputModifiers} onPress={onFocusLiveInput}>
              <HStack spacing={10} modifiers={fullWidthModifiers}>
                <Image systemName="keyboard" size={20} color={mutedForegroundColor} />
                {isAttaching ? (
                  <VStack alignment="leading" spacing={0}>
                    <Text modifiers={liveInputTitleModifiers}>Live input</Text>
                    <Text modifiers={liveInputDetailModifiers}>Uploading image to host</Text>
                  </VStack>
                ) : (
                  <Text modifiers={liveInputTitleModifiers}>Live input</Text>
                )}
                <Spacer />
              </HStack>
            </Button>
          ) : (
            <MobileSwiftUiGlassInputShell hasTrailingAction>
              <TextField
                placeholder="Type a command…"
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
                label="Send command"
                size="small"
                systemImage="arrow.up"
                tintColor={foregroundColor}
                onPress={onSend}
              />
            </MobileSwiftUiGlassInputShell>
          )}
        </HStack>
      </MobileSwiftUiGlassGroup>
    </Host>
  )
}
