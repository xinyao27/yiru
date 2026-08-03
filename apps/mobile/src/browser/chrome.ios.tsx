import {
  Button,
  GlassEffectContainer,
  Host,
  HStack,
  Picker,
  ScrollView,
  Text,
  TextField,
  type TextFieldRef,
  useNativeState,
  VStack
} from '@expo/ui/swift-ui'
import {
  accessibilityLabel,
  animation,
  Animation,
  autocorrectionDisabled,
  buttonBorderShape,
  controlSize,
  disabled as disabledModifier,
  fixedSize,
  font,
  frame,
  keyboardType,
  layoutPriority,
  onSubmit,
  padding,
  pickerStyle,
  scrollContentBackground,
  submitLabel,
  tag,
  textFieldStyle,
  textInputAutocapitalization,
  type ViewModifier
} from '@expo/ui/swift-ui/modifiers'
import { useEffect, useMemo, useRef } from 'react'
import { View } from 'react-native'
import { useCSSVariable, useUniwind } from 'uniwind'

import { useMobileGlassAvailable } from '../components/glass/availability'
import {
  mobileSwiftUiGlassButtonStyle,
  MobileSwiftUiGlassCircleButton
} from '../components/glass/swift-ui-button.ios'
import {
  mobileSwiftUiGlassEffect,
  MobileSwiftUiGlassInputShell
} from '../components/glass/swift-ui-input-shell.ios'
import { translate } from '../i18n/translate'
import { resolveCssNumber, resolveCssString } from '../style/resolve-css-variable'
import type { MobileBrowserKeyboardChromeProps, MobileBrowserTopChromeProps } from './chrome'
import { BROWSER_KEYS } from './key-row'
import { BROWSER_POINTER_MODIFIERS } from './pointer-modifiers'
import { MOBILE_BROWSER_VIEW_MODES } from './view-mode-switch'

type MobileBrowserGlassKeyButtonProps = {
  disabled: boolean
  label: string
  onPress: () => void
  selected: boolean
}

function MobileBrowserGlassKeyButton({
  disabled,
  label,
  onPress,
  selected
}: MobileBrowserGlassKeyButtonProps): React.JSX.Element {
  const isGlassAvailable = useMobileGlassAvailable()
  const buttonModifiers = useMemo<ViewModifier[]>(
    () => [
      controlSize('small'),
      mobileSwiftUiGlassButtonStyle(isGlassAvailable, selected),
      buttonBorderShape('capsule'),
      disabledModifier(disabled),
      accessibilityLabel(label)
    ],
    [disabled, isGlassAvailable, label, selected]
  )
  const textModifiers = useMemo<ViewModifier[]>(
    () => [font({ textStyle: 'caption', weight: 'regular' })],
    []
  )

  return (
    <Button modifiers={buttonModifiers} onPress={onPress}>
      <Text modifiers={textModifiers}>{label}</Text>
    </Button>
  )
}

export function MobileBrowserTopChrome({
  addressFocused,
  addressValue,
  canGoBack,
  canGoForward,
  disabled,
  onAddressChange,
  onAddressFocusChange,
  onAddressSubmit,
  onBackPress,
  onForwardPress,
  onReloadPress,
  onViewModeChange,
  viewMode
}: MobileBrowserTopChromeProps): React.JSX.Element {
  const isGlassAvailable = useMobileGlassAvailable()
  const { theme } = useUniwind()
  const addressRef = useRef<TextFieldRef>(null)
  const nativeAddress = useNativeState(addressValue)
  const nativeAddressValueRef = useRef(addressValue)
  const chromeModifiers = useMemo<ViewModifier[]>(
    () => [animation(Animation.default, addressFocused)],
    [addressFocused]
  )
  const addressModifiers = useMemo<ViewModifier[]>(
    () => [
      textFieldStyle(isGlassAvailable ? 'plain' : 'roundedBorder'),
      font({ textStyle: 'footnote' }),
      padding({ horizontal: 12, vertical: 8 }),
      frame({ minWidth: 120, maxWidth: Infinity, minHeight: 32, alignment: 'center' }),
      layoutPriority(1),
      keyboardType('url'),
      submitLabel('go'),
      autocorrectionDisabled(),
      textInputAutocapitalization('never'),
      onSubmit(onAddressSubmit),
      ...mobileSwiftUiGlassEffect(isGlassAvailable),
      disabledModifier(disabled)
    ],
    [disabled, isGlassAvailable, onAddressSubmit]
  )
  const pickerModifiers = useMemo<ViewModifier[]>(
    () => [pickerStyle('segmented'), controlSize('small'), fixedSize(), disabledModifier(disabled)],
    [disabled]
  )

  useEffect(() => {
    if (nativeAddressValueRef.current === addressValue) {
      return
    }
    nativeAddressValueRef.current = addressValue
    nativeAddress.set(addressValue)
  }, [addressValue, nativeAddress])

  return (
    <View className="px-2 pt-2">
      <Host colorScheme={theme} matchContents={{ vertical: true }} style={{ width: '100%' }}>
        <GlassEffectContainer spacing={8}>
          <HStack spacing={8} modifiers={chromeModifiers}>
            {!addressFocused ? (
              <HStack spacing={8}>
                <MobileSwiftUiGlassCircleButton
                  disabled={disabled || !canGoBack}
                  label={translate('mobile.browser.back', 'Back')}
                  onPress={onBackPress}
                  size="small"
                  systemImage="chevron.left"
                />
                <MobileSwiftUiGlassCircleButton
                  disabled={disabled || !canGoForward}
                  label={translate('mobile.browser.forward', 'Forward')}
                  onPress={onForwardPress}
                  size="small"
                  systemImage="chevron.right"
                />
                <MobileSwiftUiGlassCircleButton
                  disabled={disabled}
                  label={translate('mobile.browser.reload', 'Reload')}
                  onPress={onReloadPress}
                  size="small"
                  systemImage="arrow.clockwise"
                />
              </HStack>
            ) : null}
            <TextField
              key="browser-address"
              ref={addressRef}
              placeholder={translate('mobile.browser.address.placeholder', 'URL')}
              text={nativeAddress}
              modifiers={addressModifiers}
              onTextChange={(value) => {
                nativeAddressValueRef.current = value
                onAddressChange(value)
              }}
              onFocusChange={(focused) => {
                onAddressFocusChange(focused)
                if (focused) {
                  void addressRef.current?.setSelection(0, nativeAddressValueRef.current.length)
                }
              }}
            />
            {!addressFocused ? (
              <Picker
                selection={viewMode}
                modifiers={pickerModifiers}
                onSelectionChange={onViewModeChange}
              >
                {MOBILE_BROWSER_VIEW_MODES.map((mode) => (
                  <Text key={mode.id} modifiers={[tag(mode.id)]}>
                    {mode.label}
                  </Text>
                ))}
              </Picker>
            ) : null}
          </HStack>
        </GlassEffectContainer>
      </Host>
    </View>
  )
}

export function MobileBrowserKeyboardChrome({
  bottomInset,
  disabled,
  keyboardLift,
  keyboardValue,
  onKeyPress,
  onKeyboardValueChange,
  onModifierToggle,
  onSendPress,
  selectedModifiers
}: MobileBrowserKeyboardChromeProps): React.JSX.Element {
  const { theme } = useUniwind()
  const [foregroundValue, spacing2Value] = useCSSVariable(['--color-foreground', '--spacing-2'])
  const foregroundColor = resolveCssString(foregroundValue)
  const keyboardGap = resolveCssNumber(spacing2Value)
  const nativeKeyboardText = useNativeState(keyboardValue)
  const nativeKeyboardValueRef = useRef(keyboardValue)
  const keyScrollModifiers = useMemo<ViewModifier[]>(() => [scrollContentBackground('hidden')], [])
  const keyRowModifiers = useMemo<ViewModifier[]>(() => [padding({ vertical: 2 })], [])
  const inputModifiers = useMemo<ViewModifier[]>(
    () => [
      textFieldStyle('plain'),
      font({ textStyle: 'body' }),
      frame({ minWidth: 120, maxWidth: Infinity, minHeight: 32, alignment: 'leading' }),
      layoutPriority(1),
      submitLabel('send'),
      autocorrectionDisabled(),
      textInputAutocapitalization('never'),
      onSubmit(onSendPress),
      disabledModifier(disabled)
    ],
    [disabled, onSendPress]
  )

  useEffect(() => {
    if (nativeKeyboardValueRef.current === keyboardValue) {
      return
    }
    nativeKeyboardValueRef.current = keyboardValue
    nativeKeyboardText.set(keyboardValue)
  }, [keyboardValue, nativeKeyboardText])

  return (
    <View
      className="px-2"
      style={{
        paddingBottom: bottomInset + keyboardGap,
        transform: [{ translateY: -keyboardLift }]
      }}
    >
      <Host
        colorScheme={theme}
        ignoreSafeArea="keyboard"
        matchContents={{ vertical: true }}
        style={{ width: '100%' }}
      >
        <GlassEffectContainer spacing={8}>
          <VStack spacing={8}>
            <ScrollView axes="horizontal" showsIndicators={false} modifiers={keyScrollModifiers}>
              <HStack spacing={8} modifiers={keyRowModifiers}>
                {BROWSER_POINTER_MODIFIERS.map((modifier) => (
                  <MobileBrowserGlassKeyButton
                    key={modifier.id}
                    disabled={disabled}
                    label={modifier.label}
                    selected={selectedModifiers.includes(modifier.id)}
                    onPress={() => onModifierToggle(modifier.id)}
                  />
                ))}
                {BROWSER_KEYS.map((key) => (
                  <MobileBrowserGlassKeyButton
                    key={key}
                    disabled={disabled}
                    label={
                      key === 'Backspace'
                        ? '⌫'
                        : key === 'Escape'
                          ? translate('mobile.browser.keys.escape', 'Esc')
                          : key
                    }
                    selected={false}
                    onPress={() => onKeyPress(key)}
                  />
                ))}
              </HStack>
            </ScrollView>
            <MobileSwiftUiGlassInputShell alignment="bottom" hasTrailingAction>
              <TextField
                placeholder={translate('mobile.browser.keyboard.placeholder', 'Type on page…')}
                text={nativeKeyboardText}
                modifiers={inputModifiers}
                onTextChange={(value) => {
                  nativeKeyboardValueRef.current = value
                  onKeyboardValueChange(value)
                }}
              />
              <MobileSwiftUiGlassCircleButton
                disabled={disabled || !keyboardValue}
                isProminent
                label={translate('mobile.browser.keyboard.send', 'Send text to browser')}
                size="small"
                systemImage="arrow.up"
                tintColor={foregroundColor}
                onPress={onSendPress}
              />
            </MobileSwiftUiGlassInputShell>
          </VStack>
        </GlassEffectContainer>
      </Host>
    </View>
  )
}
