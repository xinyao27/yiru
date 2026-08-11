import type { RefObject } from 'react'
import { useEffect, useRef, useState } from 'react'
import type {
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
  TextInputSubmitEditingEventData
} from 'react-native'
import { Keyboard, Platform, TextInput, View } from 'react-native'

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
  isPhoneDisplayMode: boolean
  keyboardOffset: number
  liveInputCapture: string
  liveInputEnabled: boolean
  liveInputRef: RefObject<TextInput | null>
  onAccessoryInput: (input: TerminalAccessoryInput) => void
  onAttachImage: (source: MobileImageSource) => void
  onChangeCommandText: (text: string) => void
  onChangeLiveInput: (text: string) => void
  onCustomKeyLongPress: (key: MobileTerminalDockProps['customKeys'][number]) => void
  onKeyPressLiveInput: (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => void
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
  isPhoneDisplayMode,
  keyboardOffset,
  liveInputCapture,
  liveInputEnabled,
  liveInputRef,
  onAccessoryInput,
  onAttachImage,
  onChangeCommandText,
  onChangeLiveInput,
  onCustomKeyLongPress,
  onKeyPressLiveInput,
  onPaste,
  onRepeatStart,
  onRepeatStop,
  onSendCommand,
  onSubmitLiveInput,
  onToggleControl,
  onToggleDisplayMode,
  onToggleLiveInput
}: MobileTerminalDockProps): React.JSX.Element {
  const [isCommandInputVisible, setIsCommandInputVisible] = useState(() => !liveInputEnabled)
  const [commandInputFocusRequest, setCommandInputFocusRequest] = useState(0)
  const keyboardHideSubscriptionRef = useRef<ReturnType<typeof Keyboard.addListener> | null>(null)

  useEffect(
    () => () => {
      keyboardHideSubscriptionRef.current?.remove()
    },
    []
  )

  const toggleCommandInput = (): void => {
    const nextVisible = !isCommandInputVisible
    if (nextVisible) {
      setIsCommandInputVisible(true)
      setCommandInputFocusRequest((request) => request + 1)
      return
    }
    commandInputRef.current?.blur()
    liveInputRef.current?.blur()
    keyboardHideSubscriptionRef.current?.remove()
    keyboardHideSubscriptionRef.current = null
    if (Platform.OS === 'ios' && keyboardOffset > 0) {
      keyboardHideSubscriptionRef.current = Keyboard.addListener('keyboardDidHide', () => {
        keyboardHideSubscriptionRef.current?.remove()
        keyboardHideSubscriptionRef.current = null
        setIsCommandInputVisible(false)
      })
      Keyboard.dismiss()
      return
    }
    setIsCommandInputVisible(false)
    Keyboard.dismiss()
  }

  return (
    <View
      className="z-20 px-3 pt-1"
      style={{
        paddingBottom: bottomInset,
        transform: [{ translateY: -keyboardOffset }]
      }}
    >
      <MobileTerminalAccessoryBar
        builtInKeys={builtInKeys}
        canPaste={canPaste}
        canSend={canSend}
        controlModeActive={controlModeActive}
        customKeys={customKeys}
        isAttaching={isAttaching}
        isCommandInputVisible={isCommandInputVisible}
        isPhoneDisplayMode={isPhoneDisplayMode}
        liveInputEnabled={liveInputEnabled}
        onAccessoryInput={onAccessoryInput}
        onAttachImage={onAttachImage}
        onCustomKeyLongPress={onCustomKeyLongPress}
        onToggleCommandInput={toggleCommandInput}
        onPaste={onPaste}
        onRepeatStart={onRepeatStart}
        onRepeatStop={onRepeatStop}
        onToggleControl={onToggleControl}
        onToggleDisplayMode={onToggleDisplayMode}
        onToggleLiveInput={onToggleLiveInput}
      />
      {isCommandInputVisible ? (
        <View className="mt-2">
          <MobileTerminalInputBar
            autocompleteEnabled={autocompleteEnabled}
            canSend={canSend}
            commandInputRef={commandInputRef}
            commandInputFocusRequest={commandInputFocusRequest}
            input={input}
            onChangeText={onChangeCommandText}
            onSend={onSendCommand}
          />
        </View>
      ) : null}
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
