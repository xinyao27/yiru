import { ScrollView, View } from 'react-native'

import { MobileGlassSurface } from '~/components/glass/surface'
import { translate } from '~/i18n/translate'
import type { TerminalAccessoryKey } from '~/terminal/accessory-keys'
import type { CustomKey } from '~/terminal/custom-key-modal'
import { createTerminalLiveAccessoryInput } from '~/terminal/live/accessory-input'

import type { MobileImageSource } from '../image-source-picker'
import { MobileTerminalAccessoryKey } from './accessory-key'
import { MobileTerminalToolsMenu } from './tools-menu'

export type TerminalAccessoryInput = ReturnType<typeof createTerminalLiveAccessoryInput>

export type MobileTerminalAccessoryBarProps = {
  builtInKeys: readonly TerminalAccessoryKey[]
  canPaste: boolean
  canSend: boolean
  controlModeActive: boolean
  customKeys: readonly CustomKey[]
  isCommandInputVisible: boolean
  isAttaching: boolean
  isPhoneDisplayMode: boolean
  liveInputEnabled: boolean
  onAttachImage: ((source: MobileImageSource) => void) | null
  onAccessoryInput: (input: TerminalAccessoryInput) => void
  onCustomKeyLongPress: (key: CustomKey) => void
  onToggleCommandInput: () => void
  onOpenChat: (() => void) | null
  onPaste: () => void
  onRepeatStart: (input: TerminalAccessoryInput) => void
  onRepeatStop: () => void
  onToggleControl: () => void
  onToggleDisplayMode: () => void
  onToggleLiveInput: () => void
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
  onOpenChat,
  onPaste,
  onRepeatStart,
  onRepeatStop,
  onToggleControl,
  onToggleDisplayMode,
  onToggleLiveInput
}: MobileTerminalAccessoryBarProps): React.JSX.Element {
  const renderBuiltInKey = (key: TerminalAccessoryKey): React.JSX.Element => (
    <MobileTerminalAccessoryKey
      key={key.id}
      accessibilityLabel={
        key.accessibilityLabel ??
        translate('mobile.terminal.sendAccessoryKey', 'Send {{label}}', {
          label: key.label
        })
      }
      disabled={!canSend}
      label={key.label}
      onPress={() => {
        if (!key.repeatable) {
          onAccessoryInput(createTerminalLiveAccessoryInput(key))
        }
      }}
      onPressIn={() => {
        if (key.repeatable) {
          const input = createTerminalLiveAccessoryInput(key)
          onAccessoryInput(input)
          onRepeatStart(input)
        }
      }}
      onPressOut={() => {
        if (key.repeatable) {
          onRepeatStop()
        }
      }}
    />
  )

  return (
    <View className="relative h-14 overflow-hidden rounded-full">
      <MobileGlassSurface
        className="bg-secondary absolute top-0 right-0 bottom-0 left-0 overflow-hidden rounded-full"
        isFunctional
        pointerEvents="none"
        tintColorClassName="accent-secondary"
      />
      <View className="h-14 flex-row items-center gap-2 px-1">
        <View className="h-11 w-11 shrink-0 items-center justify-center">
          <MobileTerminalToolsMenu
            canPaste={canPaste}
            canSend={canSend}
            isAttaching={isAttaching}
            onAttachImage={onAttachImage}
            onOpenChat={onOpenChat}
            onPaste={onPaste}
          />
        </View>
        <View className="min-w-0 flex-1 overflow-hidden">
          <ScrollView
            className="w-full"
            contentContainerClassName="items-center gap-2"
            horizontal
            keyboardShouldPersistTaps="always"
            showsHorizontalScrollIndicator={false}
            style={{ backgroundColor: 'transparent' }}
          >
            <MobileTerminalAccessoryKey
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
            <MobileTerminalAccessoryKey
              accessibilityLabel={
                isPhoneDisplayMode
                  ? translate('mobile.terminal.switchToDesktopMode', 'Switch to desktop mode')
                  : translate('mobile.terminal.switchToPhoneMode', 'Switch to phone mode')
              }
              disabled={!canSend}
              icon={isPhoneDisplayMode ? 'laptop' : 'device-mobile'}
              onPress={onToggleDisplayMode}
            />
            {builtInKeys
              .filter((key) => key.id !== 'escape' && key.id !== 'tab')
              .map(renderBuiltInKey)}
            {customKeys.map((key) => (
              <MobileTerminalAccessoryKey
                key={key.id}
                accessibilityLabel={translate(
                  'mobile.terminal.sendAccessoryKey',
                  'Send {{label}}',
                  {
                    label: key.label
                  }
                )}
                delayLongPress={400}
                disabled={!canSend}
                label={key.label}
                onLongPress={() => onCustomKeyLongPress(key)}
                onPress={() => onAccessoryInput({ bytes: key.bytes })}
              />
            ))}
          </ScrollView>
        </View>
        <View className="h-11 w-11 shrink-0 items-center justify-center">
          <MobileTerminalAccessoryKey
            accessibilityHint={translate(
              'mobile.terminal.commandInputToggleHint',
              'Tap to show or hide the command input. Long press to switch input mode.'
            )}
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
        </View>
      </View>
    </View>
  )
}
