import type { RefObject } from 'react'
import { Platform, Pressable, TextInput, View } from 'react-native'

import { MobileGlassPressable } from '../../components/glass/pressable'
import { MobileGlassSurface } from '../../components/glass/surface'
import { ArrowUp, Keyboard as KeyboardIcon } from '../../components/uniwind-icons'
import { cn } from '../../style/class-names'
import { getTerminalCommandKeyboardType } from '../../terminal/keyboard-type'
import { MobileAttachmentMenu } from '../attachment-menu'
import type { MobileImageSource } from '../image-source-picker'
import { MobileTerminalLiveInputStatus } from './live-input-status'

export type MobileTerminalInputBarProps = {
  autocompleteEnabled: boolean
  canSend: boolean
  commandInputRef: RefObject<TextInput | null>
  input: string
  isAttaching: boolean
  liveInputEnabled: boolean
  onAttachImage: (source: MobileImageSource) => void
  onChangeText: (text: string) => void
  onFocusLiveInput: () => void
  onSend: () => void
}

export function MobileTerminalInputBar({
  autocompleteEnabled,
  canSend,
  commandInputRef,
  input,
  isAttaching,
  liveInputEnabled,
  onAttachImage,
  onChangeText,
  onFocusLiveInput,
  onSend
}: MobileTerminalInputBarProps): React.JSX.Element {
  if (liveInputEnabled) {
    return (
      <View className="min-h-14 flex-row items-center gap-2 py-1">
        <MobileAttachmentMenu
          disabled={!canSend || isAttaching}
          pending={isAttaching}
          onSelect={onAttachImage}
        />
        <MobileGlassPressable
          accessibilityHint="Typed text is sent directly to the active terminal"
          accessibilityLabel="Show keyboard for live terminal input"
          accessibilityRole="button"
          className="min-h-12 flex-1 rounded-full"
          contentClassName="min-h-12 flex-1 flex-row items-center gap-3 rounded-full px-4"
          disabled={!canSend}
          onPress={onFocusLiveInput}
          tintColorClassName="accent-secondary"
        >
          <KeyboardIcon size={20} colorClassName="accent-muted-foreground" />
          <MobileTerminalLiveInputStatus isAttaching={isAttaching} />
        </MobileGlassPressable>
      </View>
    )
  }

  return (
    <View className="min-h-14 flex-row items-center gap-2 py-1">
      <MobileAttachmentMenu
        disabled={!canSend || isAttaching}
        pending={isAttaching}
        onSelect={onAttachImage}
      />
      <MobileGlassSurface
        className="h-10 flex-1 overflow-hidden rounded-full"
        tintColorClassName="accent-secondary"
      >
        <View className="h-10 flex-row items-center">
          <TextInput
            ref={commandInputRef}
            key={
              Platform.OS === 'android'
                ? autocompleteEnabled
                  ? 'cmd-input-ac-on'
                  : 'cmd-input-ac-off'
                : 'cmd-input'
            }
            className="text-foreground h-10 min-w-0 flex-1 py-0 pr-2 pl-4 font-mono text-sm"
            value={input}
            onChangeText={onChangeText}
            placeholder="Type a command…"
            placeholderTextColorClassName="accent-muted-foreground"
            autoCapitalize="none"
            autoCorrect={autocompleteEnabled}
            spellCheck={autocompleteEnabled}
            smartInsertDelete={false}
            autoComplete="off"
            keyboardType={getTerminalCommandKeyboardType(Platform.OS, autocompleteEnabled)}
            returnKeyType="send"
            editable={canSend}
            onSubmitEditing={onSend}
          />
          <Pressable
            className={cn(
              'bg-foreground m-1 h-8 w-8 items-center justify-center rounded-full',
              canSend ? 'active:bg-accent' : 'opacity-40'
            )}
            disabled={!canSend}
            onPress={onSend}
            accessibilityLabel="Send command"
          >
            <ArrowUp size={16} colorClassName="accent-background" />
          </Pressable>
        </View>
      </MobileGlassSurface>
    </View>
  )
}
