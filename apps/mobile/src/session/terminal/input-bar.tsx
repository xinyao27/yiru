import { cn } from 'cnfast'
import { useEffect, type RefObject } from 'react'
import { Platform, Pressable, TextInput, View } from 'react-native'

import { MobileGlassSurface } from '~/components/glass/surface'
import { ArrowUp } from '~/components/uniwind-icons'
import { translate } from '~/i18n/translate'
import { getTerminalCommandKeyboardType } from '~/terminal/keyboard-type'

export type MobileTerminalInputBarProps = {
  autocompleteEnabled: boolean
  canSend: boolean
  commandInputRef: RefObject<TextInput | null>
  commandInputFocusRequest: number
  input: string
  onChangeText: (text: string) => void
  onSend: () => void
}

export function MobileTerminalInputBar({
  autocompleteEnabled,
  canSend,
  commandInputRef,
  commandInputFocusRequest,
  input,
  onChangeText,
  onSend
}: MobileTerminalInputBarProps): React.JSX.Element {
  useEffect(() => {
    if (commandInputFocusRequest === 0) {
      return
    }
    requestAnimationFrame(() => commandInputRef.current?.focus())
  }, [commandInputFocusRequest, commandInputRef])

  return (
    <View className="min-h-14 flex-row items-center gap-2 py-1">
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
