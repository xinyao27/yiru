import type { RefObject } from 'react'
import type {
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
  TextInputSubmitEditingEventData
} from 'react-native'
import { Platform, TextInput, View } from 'react-native'

import { getTerminalLiveInputKeyboardType } from '~/terminal/keyboard-type'

import type { MobileImageSource } from '../image-source-picker'
import { MobileTerminalAccessoryBar, type TerminalAccessoryInput } from './accessory-bar'
import { MobileTerminalInputBar } from './input-bar'

type MobileTerminalDockProps = {
  autocompleteEnabled: boolean
  bottomInset: number
  builtInKeys: Parameters<typeof MobileTerminalAccessoryBar>[0]['builtInKeys']
  canPaste: boolean
  canSend: boolean
  commandInputRef: RefObject<TextInput | null>
  controlModeActive: boolean
  customKeys: Parameters<typeof MobileTerminalAccessoryBar>[0]['customKeys']
  input: string
  isAttaching: boolean
  isKeyboardVisible: boolean
  isPhoneDisplayMode: boolean
  keyboardOffset: number
  liveInputCapture: string
  liveInputEnabled: boolean
  liveInputRef: RefObject<TextInput | null>
  onAccessoryInput: (input: TerminalAccessoryInput) => void
  onAddCustomKey: () => void
  onAttachImage: (source: MobileImageSource) => void
  onChangeCommandText: (text: string) => void
  onChangeLiveInput: (text: string) => void
  onCustomKeyLongPress: (key: MobileTerminalDockProps['customKeys'][number]) => void
  onKeyboardPress: () => void
  onKeyPressLiveInput: (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => void
  onOpenChat: (() => void) | null
  onOpenHistory: (() => void) | null
  onPaste: () => void
  onRepeatStart: (input: TerminalAccessoryInput) => void
  onRepeatStop: () => void
  onSendCommand: () => void
  onSubmitLiveInput: (event: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => void
  onToggleControl: () => void
  onToggleDisplayMode: () => void
  onToggleLiveInput: () => void
}

export function MobileTerminalDock({
  autocompleteEnabled,
  bottomInset,
  builtInKeys,
  canPaste,
  canSend,
  commandInputRef,
  controlModeActive,
  customKeys,
  input,
  isAttaching,
  isKeyboardVisible,
  isPhoneDisplayMode,
  keyboardOffset,
  liveInputCapture,
  liveInputEnabled,
  liveInputRef,
  onAccessoryInput,
  onAddCustomKey,
  onAttachImage,
  onChangeCommandText,
  onChangeLiveInput,
  onCustomKeyLongPress,
  onKeyboardPress,
  onKeyPressLiveInput,
  onOpenChat,
  onOpenHistory,
  onPaste,
  onRepeatStart,
  onRepeatStop,
  onSendCommand,
  onSubmitLiveInput,
  onToggleControl,
  onToggleDisplayMode,
  onToggleLiveInput
}: MobileTerminalDockProps): React.JSX.Element {
  return (
    <View
      className="z-20 px-3 pt-1"
      style={{
        paddingBottom: bottomInset,
        transform: [{ translateY: -keyboardOffset }]
      }}
    >
      {!liveInputEnabled ? (
        <MobileTerminalInputBar
          autocompleteEnabled={autocompleteEnabled}
          canSend={canSend}
          commandInputRef={commandInputRef}
          input={input}
          isAttaching={isAttaching}
          onAttachImage={onAttachImage}
          onChangeText={onChangeCommandText}
          onSend={onSendCommand}
        />
      ) : null}
      <MobileTerminalAccessoryBar
        builtInKeys={builtInKeys}
        canPaste={canPaste}
        canSend={canSend}
        controlModeActive={controlModeActive}
        customKeys={customKeys}
        isAttaching={isAttaching}
        isKeyboardVisible={isKeyboardVisible}
        isPhoneDisplayMode={isPhoneDisplayMode}
        liveInputEnabled={liveInputEnabled}
        onAccessoryInput={onAccessoryInput}
        onAddCustomKey={onAddCustomKey}
        onAttachImage={liveInputEnabled ? onAttachImage : null}
        onCustomKeyLongPress={onCustomKeyLongPress}
        onKeyboardPress={onKeyboardPress}
        onOpenChat={onOpenChat}
        onOpenHistory={onOpenHistory}
        onPaste={onPaste}
        onRepeatStart={onRepeatStart}
        onRepeatStop={onRepeatStop}
        onToggleControl={onToggleControl}
        onToggleDisplayMode={onToggleDisplayMode}
        onToggleLiveInput={onToggleLiveInput}
      />
      {liveInputEnabled ? (
        <TextInput
          ref={liveInputRef}
          className="text-foreground absolute h-px w-px opacity-0"
          value={liveInputCapture}
          onChangeText={onChangeLiveInput}
          onKeyPress={onKeyPressLiveInput}
          onSubmitEditing={onSubmitLiveInput}
          placeholder=""
          showSoftInputOnFocus
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          smartInsertDelete={false}
          // Why: iOS textContentType wins over autoComplete and can narrow the
          // keyboard surface; keep IME switching available.
          autoComplete="off"
          keyboardType={getTerminalLiveInputKeyboardType(Platform.OS)}
          returnKeyType="default"
          blurOnSubmit={false}
          editable={canSend}
          importantForAutofill="no"
        />
      ) : null}
    </View>
  )
}
