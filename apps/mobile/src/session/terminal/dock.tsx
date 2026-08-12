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

type MobileTerminalDockProps = {
  bottomInset: number
  builtInKeys: Parameters<typeof MobileTerminalAccessoryBar>[0]['builtInKeys']
  canPaste: boolean
  canSend: boolean
  controlModeActive: boolean
  customKeys: Parameters<typeof MobileTerminalAccessoryBar>[0]['customKeys']
  isAttaching: boolean
  isPhoneDisplayMode: boolean
  keyboardOffset: number
  liveInputCapture: string
  liveInputEnabled: boolean
  liveInputRef: RefObject<TextInput | null>
  onAccessoryInput: (input: TerminalAccessoryInput) => void
  onAttachImage: (source: MobileImageSource) => void
  onChangeLiveInput: (text: string) => void
  onCustomKeyLongPress: (key: MobileTerminalDockProps['customKeys'][number]) => void
  onKeyPressLiveInput: (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => void
  onPaste: () => void
  onRepeatStart: (input: TerminalAccessoryInput) => void
  onRepeatStop: () => void
  onSubmitLiveInput: (event: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => void
  onToggleControl: () => void
  onToggleDisplayMode: () => void
}

export function MobileTerminalDock({
  bottomInset,
  builtInKeys,
  canPaste,
  canSend,
  controlModeActive,
  customKeys,
  isAttaching,
  isPhoneDisplayMode,
  keyboardOffset,
  liveInputCapture,
  liveInputEnabled,
  liveInputRef,
  onAccessoryInput,
  onAttachImage,
  onChangeLiveInput,
  onCustomKeyLongPress,
  onKeyPressLiveInput,
  onPaste,
  onRepeatStart,
  onRepeatStop,
  onSubmitLiveInput,
  onToggleControl,
  onToggleDisplayMode
}: MobileTerminalDockProps): React.JSX.Element {
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
        isPhoneDisplayMode={isPhoneDisplayMode}
        liveInputEnabled={liveInputEnabled}
        onAccessoryInput={onAccessoryInput}
        onAttachImage={onAttachImage}
        onCustomKeyLongPress={onCustomKeyLongPress}
        onPaste={onPaste}
        onRepeatStart={onRepeatStart}
        onRepeatStop={onRepeatStop}
        onToggleControl={onToggleControl}
        onToggleDisplayMode={onToggleDisplayMode}
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
