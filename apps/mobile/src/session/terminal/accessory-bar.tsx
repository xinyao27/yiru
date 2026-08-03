import { ScrollView } from 'react-native'

import { MobileGlassGroup } from '~/components/glass/group'
import { translate } from '~/i18n/translate'
import type { TerminalAccessoryKey } from '~/terminal/accessory-keys'
import type { CustomKey } from '~/terminal/custom-key-modal'
import { createTerminalLiveAccessoryInput } from '~/terminal/live/accessory-input'

import { MobileTerminalAccessoryKey } from './accessory-key'

type TerminalAccessoryInput = ReturnType<typeof createTerminalLiveAccessoryInput>

type MobileTerminalAccessoryBarProps = {
  builtInKeys: readonly TerminalAccessoryKey[]
  canPaste: boolean
  canSend: boolean
  customKeys: readonly CustomKey[]
  isKeyboardVisible: boolean
  isPhoneDisplayMode: boolean
  liveInputEnabled: boolean
  onAccessoryInput: (input: TerminalAccessoryInput) => void
  onAddCustomKey: () => void
  onCustomKeyLongPress: (key: CustomKey) => void
  onDismissKeyboard: () => void
  onPaste: () => void
  onRepeatStart: (input: TerminalAccessoryInput) => void
  onRepeatStop: () => void
  onToggleDisplayMode: () => void
  onToggleLiveInput: () => void
}

export function MobileTerminalAccessoryBar({
  builtInKeys,
  canPaste,
  canSend,
  customKeys,
  isKeyboardVisible,
  isPhoneDisplayMode,
  liveInputEnabled,
  onAccessoryInput,
  onAddCustomKey,
  onCustomKeyLongPress,
  onDismissKeyboard,
  onPaste,
  onRepeatStart,
  onRepeatStop,
  onToggleDisplayMode,
  onToggleLiveInput
}: MobileTerminalAccessoryBarProps): React.JSX.Element {
  return (
    <MobileGlassGroup className="flex-row items-center gap-2" spacing={8}>
      {/* Why: this fixed escape hatch must not scroll away or enter the terminal-byte path. */}
      {isKeyboardVisible ? (
        <MobileTerminalAccessoryKey
          accessibilityHint={translate(
            'mobile.terminal.dismissKeyboardHint',
            'Hides the software keyboard and keeps the current terminal session open.'
          )}
          accessibilityLabel={translate('mobile.terminal.dismissKeyboard', 'Dismiss keyboard')}
          hitSlop={8}
          icon="dismiss-keyboard"
          onPress={onDismissKeyboard}
        />
      ) : null}
      {/* Why: preserving taps keeps the keyboard open when Esc, Tab, or another key is sent. */}
      <ScrollView
        className="min-w-0 flex-1 overflow-visible"
        contentContainerClassName="gap-2 py-2"
        horizontal
        keyboardShouldPersistTaps="always"
        showsHorizontalScrollIndicator={false}
      >
        <MobileTerminalAccessoryKey
          accessibilityLabel={
            isPhoneDisplayMode
              ? translate('mobile.terminal.switchToDesktopMode', 'Switch to desktop mode')
              : translate('mobile.terminal.switchToPhoneMode', 'Switch to phone mode')
          }
          disabled={!canSend}
          icon={isPhoneDisplayMode ? 'desktop' : 'phone'}
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
            label={translate('mobile.common.paste', 'Paste')}
            onPress={onPaste}
          />
        ) : null}
        {builtInKeys.map((key) => (
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
        ))}
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
    </MobileGlassGroup>
  )
}
