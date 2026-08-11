import { Button, Host, HStack, Image, ScrollView, Text, type ImageProps } from '@expo/ui/swift-ui'
import {
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  clipped,
  clipShape,
  controlSize,
  disabled as disabledModifier,
  fixedSize,
  font,
  frame,
  glassEffect,
  layoutPriority,
  onLongPressGesture,
  padding,
  scrollContentBackground,
  type ViewModifier,
  zIndex
} from '@expo/ui/swift-ui/modifiers'
import { useMemo } from 'react'
import { useCSSVariable, useUniwind } from 'uniwind'

import { useMobileGlassAvailable } from '~/components/glass/availability'
import { translate } from '~/i18n/translate'
import { resolveCssString } from '~/style/resolve-css-variable'
import type { TerminalAccessoryKey } from '~/terminal/accessory-keys'
import type { CustomKey } from '~/terminal/custom-key-modal'
import { createTerminalLiveAccessoryInput } from '~/terminal/live/accessory-input'

import type { MobileTerminalAccessoryBarProps } from './accessory-bar'
import type { MobileTerminalAccessoryIcon } from './accessory-key-props'
import { MobileTerminalToolsMenu } from './tools-menu'

export type { TerminalAccessoryInput } from './accessory-bar'

const TERMINAL_ACCESSORY_BUTTON_SIZE_PT = 40
const TERMINAL_ACCESSORY_GAP_PT = 6
const TERMINAL_ACCESSORY_HIT_SIZE_PT = 44
const TERMINAL_ACCESSORY_ROW_HEIGHT_PT = 52
const CIRCULAR_ACCESSORY_KEY_IDS = new Set([
  'arrowDown',
  'arrowLeft',
  'arrowRight',
  'arrowUp',
  'backspace'
])

function systemImageForIcon(
  icon: MobileTerminalAccessoryIcon
): NonNullable<ImageProps['systemName']> {
  switch (icon) {
    case 'dismiss-keyboard':
      return 'keyboard.chevron.compact.down'
    case 'device-mobile':
      return 'iphone'
    case 'keyboard':
      return 'keyboard'
    case 'laptop':
      return 'laptopcomputer'
  }
}

type NativeTerminalAccessoryKeyProps = {
  accessibilityLabel: string
  disabled?: boolean
  icon?: MobileTerminalAccessoryIcon
  isCircular?: boolean
  isSelected?: boolean
  label?: string
  onLongPress?: () => void
  onPress: () => void
}

function NativeTerminalAccessoryKey({
  accessibilityLabel: labelForAccessibility,
  disabled = false,
  icon,
  isCircular = false,
  isSelected = false,
  label,
  onLongPress,
  onPress
}: NativeTerminalAccessoryKeyProps): React.JSX.Element {
  const isGlassAvailable = useMobileGlassAvailable()
  const primaryColor = resolveCssString(useCSSVariable('--color-primary'))
  const buttonModifiers = useMemo<ViewModifier[]>(
    () => [
      controlSize('small'),
      buttonStyle(isGlassAvailable ? 'plain' : isSelected ? 'borderedProminent' : 'bordered'),
      buttonBorderShape(isCircular ? 'circle' : 'capsule'),
      ...(isGlassAvailable
        ? [
            glassEffect({
              glass: {
                variant: 'regular',
                interactive: true,
                ...(isSelected ? { tint: primaryColor } : {})
              },
              shape: isCircular ? 'circle' : 'capsule'
            }),
            clipShape(isCircular ? 'circle' : 'capsule')
          ]
        : []),
      frame({
        minWidth: TERMINAL_ACCESSORY_HIT_SIZE_PT,
        minHeight: TERMINAL_ACCESSORY_HIT_SIZE_PT,
        alignment: 'center'
      }),
      accessibilityLabel(labelForAccessibility),
      ...(onLongPress ? [onLongPressGesture(onLongPress, 0.4)] : []),
      disabledModifier(disabled)
    ],
    [
      disabled,
      isCircular,
      isGlassAvailable,
      isSelected,
      labelForAccessibility,
      onLongPress,
      primaryColor
    ]
  )
  const iconModifiers = useMemo<ViewModifier[]>(
    () => [
      frame({
        width: TERMINAL_ACCESSORY_BUTTON_SIZE_PT,
        height: TERMINAL_ACCESSORY_BUTTON_SIZE_PT,
        alignment: 'center'
      })
    ],
    []
  )
  const textModifiers = useMemo<ViewModifier[]>(
    () => [
      font({ size: 14, design: 'monospaced' }),
      fixedSize({ horizontal: true, vertical: false }),
      ...(isCircular
        ? [
            frame({
              width: TERMINAL_ACCESSORY_BUTTON_SIZE_PT,
              height: TERMINAL_ACCESSORY_BUTTON_SIZE_PT,
              alignment: 'center'
            })
          ]
        : [
            padding({ horizontal: 10 }),
            frame({ minHeight: TERMINAL_ACCESSORY_BUTTON_SIZE_PT, alignment: 'center' })
          ])
    ],
    [isCircular]
  )

  return (
    <Button modifiers={buttonModifiers} onPress={onPress}>
      {icon ? (
        <Image systemName={systemImageForIcon(icon)} size={18} modifiers={iconModifiers} />
      ) : (
        <Text modifiers={textModifiers}>{label}</Text>
      )}
    </Button>
  )
}

function renderNativeAccessoryKey(
  key: TerminalAccessoryKey,
  canSend: boolean,
  onAccessoryInput: MobileTerminalAccessoryBarProps['onAccessoryInput'],
  onRepeatStart: MobileTerminalAccessoryBarProps['onRepeatStart'],
  onRepeatStop: MobileTerminalAccessoryBarProps['onRepeatStop']
): React.JSX.Element {
  const input = createTerminalLiveAccessoryInput(key)

  return (
    <NativeTerminalAccessoryKey
      key={key.id}
      accessibilityLabel={
        key.accessibilityLabel ??
        translate('mobile.terminal.sendAccessoryKey', 'Send {{label}}', {
          label: key.label
        })
      }
      disabled={!canSend}
      isCircular={CIRCULAR_ACCESSORY_KEY_IDS.has(key.id)}
      label={key.label}
      onLongPress={
        key.repeatable
          ? () => {
              onAccessoryInput(input)
              onRepeatStart(input)
            }
          : undefined
      }
      onPress={() => {
        onAccessoryInput(input)
        if (key.repeatable) {
          onRepeatStop()
        }
      }}
    />
  )
}

function renderNativeCustomKey(
  key: CustomKey,
  canSend: boolean,
  onCustomKeyLongPress: MobileTerminalAccessoryBarProps['onCustomKeyLongPress'],
  onAccessoryInput: MobileTerminalAccessoryBarProps['onAccessoryInput']
): React.JSX.Element {
  return (
    <NativeTerminalAccessoryKey
      key={key.id}
      accessibilityLabel={translate('mobile.terminal.sendAccessoryKey', 'Send {{label}}', {
        label: key.label
      })}
      disabled={!canSend}
      label={key.label}
      onLongPress={() => onCustomKeyLongPress(key)}
      onPress={() => onAccessoryInput({ bytes: key.bytes })}
    />
  )
}

export function MobileTerminalAccessoryBar({
  builtInKeys,
  canPaste,
  canSend,
  controlModeActive,
  customKeys,
  isAttaching,
  isCommandInputVisible,
  isPhoneDisplayMode,
  liveInputEnabled,
  onAccessoryInput,
  onAttachImage,
  onCustomKeyLongPress,
  onToggleCommandInput,
  onPaste,
  onRepeatStart,
  onRepeatStop,
  onToggleControl,
  onToggleDisplayMode,
  onToggleLiveInput
}: MobileTerminalAccessoryBarProps): React.JSX.Element {
  const { theme } = useUniwind()
  const fullWidthModifiers = useMemo(
    () => [
      frame({
        maxWidth: Infinity,
        minHeight: TERMINAL_ACCESSORY_ROW_HEIGHT_PT,
        alignment: 'center'
      })
    ],
    []
  )
  const fixedSlotModifiers = useMemo(
    () => [
      frame({
        width: TERMINAL_ACCESSORY_HIT_SIZE_PT,
        height: TERMINAL_ACCESSORY_HIT_SIZE_PT,
        alignment: 'center'
      }),
      layoutPriority(2),
      zIndex(2)
    ],
    []
  )
  const scrollModifiers = useMemo(
    () => [
      scrollContentBackground('hidden'),
      frame({ minWidth: 0, maxWidth: Infinity, alignment: 'leading' }),
      layoutPriority(0),
      clipped(),
      zIndex(0)
    ],
    []
  )
  const renderBuiltInKey = (key: TerminalAccessoryKey): React.JSX.Element =>
    renderNativeAccessoryKey(key, canSend, onAccessoryInput, onRepeatStart, onRepeatStop)

  return (
    <Host
      colorScheme={theme}
      ignoreSafeArea="keyboard"
      matchContents={{ vertical: true }}
      style={{ width: '100%' }}
    >
      <HStack alignment="center" spacing={TERMINAL_ACCESSORY_GAP_PT} modifiers={fullWidthModifiers}>
        <HStack alignment="center" spacing={0} modifiers={fixedSlotModifiers}>
          <MobileTerminalToolsMenu
            canPaste={canPaste}
            canSend={canSend}
            isAttaching={isAttaching}
            onAttachImage={onAttachImage}
            onPaste={onPaste}
          />
        </HStack>
        <ScrollView
          axes="horizontal"
          hidesEdgeEffects
          showsIndicators={false}
          modifiers={scrollModifiers}
        >
          <HStack alignment="center" spacing={TERMINAL_ACCESSORY_GAP_PT}>
            <NativeTerminalAccessoryKey
              accessibilityLabel={translate(
                controlModeActive
                  ? 'mobile.terminal.controlModifierActive'
                  : 'mobile.terminal.controlModifier',
                controlModeActive ? 'Control modifier active' : 'Control modifier'
              )}
              disabled={!canSend || !liveInputEnabled}
              isSelected={controlModeActive}
              label={translate('mobile.terminal.controlKey', 'Ctrl')}
              onPress={onToggleControl}
            />
            {builtInKeys
              .filter((key) => key.id === 'escape' || key.id === 'tab')
              .map(renderBuiltInKey)}
            <NativeTerminalAccessoryKey
              accessibilityLabel={
                isPhoneDisplayMode
                  ? translate('mobile.terminal.switchToDesktopMode', 'Switch to desktop mode')
                  : translate('mobile.terminal.switchToPhoneMode', 'Switch to phone mode')
              }
              disabled={!canSend}
              icon={isPhoneDisplayMode ? 'laptop' : 'device-mobile'}
              isCircular
              onPress={onToggleDisplayMode}
            />
            {builtInKeys
              .filter((key) => key.id !== 'escape' && key.id !== 'tab')
              .map(renderBuiltInKey)}
            {customKeys.map((key) =>
              renderNativeCustomKey(key, canSend, onCustomKeyLongPress, onAccessoryInput)
            )}
          </HStack>
        </ScrollView>
        <HStack alignment="center" spacing={0} modifiers={fixedSlotModifiers}>
          <NativeTerminalAccessoryKey
            accessibilityLabel={
              isCommandInputVisible
                ? translate('mobile.terminal.hideCommandInput', 'Hide command input')
                : translate('mobile.terminal.showCommandInput', 'Show command input')
            }
            icon={isCommandInputVisible ? 'dismiss-keyboard' : 'keyboard'}
            isCircular
            onLongPress={onToggleLiveInput}
            onPress={onToggleCommandInput}
          />
        </HStack>
      </HStack>
    </Host>
  )
}
