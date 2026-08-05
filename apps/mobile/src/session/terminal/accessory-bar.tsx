import { ScrollView, View } from 'react-native'

import { MobileGlassGroup } from '~/components/glass/group'
import { translate } from '~/i18n/translate'
import type { TerminalAccessoryKey } from '~/terminal/accessory-keys'
import type { CustomKey } from '~/terminal/custom-key-modal'
import { createTerminalLiveAccessoryInput } from '~/terminal/live/accessory-input'

import type { MobileImageSource } from '../image-source-picker'
import { MobileTerminalAttachmentMenu } from './accessory-attachment'
import { MobileTerminalAccessoryKey } from './accessory-key'

export type TerminalAccessoryInput = ReturnType<typeof createTerminalLiveAccessoryInput>

type MobileTerminalAccessoryBarProps = {
  builtInKeys: readonly TerminalAccessoryKey[]
  canPaste: boolean
  canSend: boolean
  controlModeActive: boolean
  customKeys: readonly CustomKey[]
  isKeyboardVisible: boolean
  isAttaching: boolean
  isPhoneDisplayMode: boolean
  liveInputEnabled: boolean
  onAttachImage: ((source: MobileImageSource) => void) | null
  onAccessoryInput: (input: TerminalAccessoryInput) => void
  onAddCustomKey: () => void
  onCustomKeyLongPress: (key: CustomKey) => void
  onKeyboardPress: () => void
  onOpenChat: (() => void) | null
  onOpenHistory: (() => void) | null
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
  isKeyboardVisible,
  isPhoneDisplayMode,
  liveInputEnabled,
  onAccessoryInput,
  onAddCustomKey,
  onAttachImage,
  onCustomKeyLongPress,
  onKeyboardPress,
  onOpenChat,
  onOpenHistory,
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
    <MobileGlassGroup className="h-16 flex-row items-center overflow-hidden p-2" spacing={8}>
      <ScrollView
        className="min-w-0 flex-1 overflow-visible"
        contentContainerClassName="items-center gap-2"
        horizontal
        keyboardShouldPersistTaps="always"
        showsHorizontalScrollIndicator={false}
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
        {builtInKeys.filter((key) => key.id === 'escape' || key.id === 'tab').map(renderBuiltInKey)}
        <MobileTerminalAccessoryKey
          accessibilityLabel={
            isPhoneDisplayMode
              ? translate('mobile.terminal.switchToDesktopMode', 'Switch to desktop mode')
              : translate('mobile.terminal.switchToPhoneMode', 'Switch to phone mode')
          }
          disabled={!canSend}
          icon="display"
          onPress={onToggleDisplayMode}
        />
        <MobileTerminalAccessoryKey
          accessibilityLabel={
            liveInputEnabled
              ? translate(
                  'mobile.terminal.switchToBufferedInput',
                  'Switch to buffered command input'
                )
              : translate('mobile.terminal.switchToLiveInput', 'Switch to live terminal input')
          }
          disabled={!canSend}
          icon="live-input"
          isSelected={liveInputEnabled}
          onPress={onToggleLiveInput}
        />
        {canPaste ? (
          <MobileTerminalAccessoryKey
            accessibilityLabel={translate(
              'mobile.terminal.pasteFromClipboard',
              'Paste from clipboard'
            )}
            disabled={!canSend}
            icon="clipboard"
            onPress={onPaste}
          />
        ) : null}
        {onOpenHistory ? (
          <MobileTerminalAccessoryKey
            accessibilityLabel={translate('mobile.terminal.openAgentHistory', 'Open agent history')}
            icon="history"
            onPress={onOpenHistory}
          />
        ) : null}
        {onAttachImage ? (
          <MobileTerminalAttachmentMenu
            disabled={!canSend || isAttaching}
            pending={isAttaching}
            onSelect={onAttachImage}
          />
        ) : null}
        {builtInKeys.filter((key) => key.id !== 'escape' && key.id !== 'tab').map(renderBuiltInKey)}
        {customKeys.map((key) => (
          <MobileTerminalAccessoryKey
            key={key.id}
            accessibilityLabel={translate('mobile.terminal.sendAccessoryKey', 'Send {{label}}', {
              label: key.label
            })}
            delayLongPress={400}
            disabled={!canSend}
            label={key.label}
            onLongPress={() => onCustomKeyLongPress(key)}
            onPress={() => onAccessoryInput({ bytes: key.bytes })}
          />
        ))}
        <MobileTerminalAccessoryKey
          accessibilityLabel={translate('mobile.terminal.addCustomShortcut', 'Add custom shortcut')}
          icon="add"
          onPress={onAddCustomKey}
        />
      </ScrollView>
      <View className="shrink-0 flex-row items-center gap-2 pl-2">
        {onOpenChat ? (
          <MobileTerminalAccessoryKey
            accessibilityLabel={translate('mobile.terminal.openChat', 'Open chat')}
            icon="chat"
            onPress={onOpenChat}
          />
        ) : null}
        <MobileTerminalAccessoryKey
          accessibilityHint={
            isKeyboardVisible
              ? translate(
                  'mobile.terminal.dismissKeyboardHint',
                  'Hides the software keyboard and keeps the current terminal session open.'
                )
              : undefined
          }
          accessibilityLabel={
            isKeyboardVisible
              ? translate('mobile.terminal.dismissKeyboard', 'Dismiss keyboard')
              : translate('mobile.terminal.showKeyboard', 'Show keyboard')
          }
          icon={isKeyboardVisible ? 'dismiss-keyboard' : 'keyboard'}
          onPress={onKeyboardPress}
        />
      </View>
    </MobileGlassGroup>
  )
}
