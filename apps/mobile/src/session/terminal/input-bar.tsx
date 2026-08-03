import { cn } from 'cnfast'
import type { RefObject } from 'react'
import { Platform, Pressable, TextInput, View } from 'react-native'

import { MobileGlassPressable } from '~/components/glass/pressable'
import { MobileGlassSurface } from '~/components/glass/surface'
import { ArrowUp, Keyboard as KeyboardIcon } from '~/components/uniwind-icons'
import { translate } from '~/i18n/translate'
import { getTerminalCommandKeyboardType } from '~/terminal/keyboard-type'

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
          accessibilityHint={translate(
            'mobile.terminal.liveInput.accessibilityHint',
            'Typed text is sent directly to the active terminal'
          )}
          accessibilityLabel={translate(
            'mobile.terminal.liveInput.accessibilityLabel',
            'Show keyboard for live terminal input'
          )}
          accessibilityRole="button"
          className="min-h-12 w-full rounded-full"
          containerClassName="flex-1"
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
        className="h-11 flex-1 overflow-hidden rounded-full"
        isFunctional
        tintColorClassName="accent-secondary"
      >
        <View className="h-11 flex-row items-center">
          <TextInput
            ref={commandInputRef}
            key={
              Platform.OS === 'android'
                ? autocompleteEnabled
                  ? 'cmd-input-ac-on'
                  : 'cmd-input-ac-off'
                : 'cmd-input'
            }
            className="text-foreground h-11 min-w-0 flex-1 py-0 pr-2 pl-4 font-mono text-sm"
            value={input}
            onChangeText={onChangeText}
            placeholder={translate('mobile.terminal.commandPlaceholder', 'Type a command…')}
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
            accessibilityRole="button"
            className={cn('h-11 w-11 items-center justify-center', canSend && 'active:opacity-70')}
            disabled={!canSend}
            onPress={onSend}
            accessibilityLabel={translate('mobile.terminal.sendCommand', 'Send command')}
          >
            <View
              className={cn(
                'bg-foreground h-8 w-8 items-center justify-center rounded-full',
                !canSend && 'opacity-40'
              )}
            >
              <ArrowUp size={16} colorClassName="accent-background" />
            </View>
          </Pressable>
        </View>
      </MobileGlassSurface>
    </View>
  )
}
