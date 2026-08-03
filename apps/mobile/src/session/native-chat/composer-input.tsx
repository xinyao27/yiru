import { cn } from 'cnfast'
import { Pressable, TextInput, View } from 'react-native'

import { MobileGlassSurface } from '~/components/glass/surface'
import { ArrowUp, Square } from '~/components/uniwind-icons'
import { translate } from '~/i18n/translate'

import { MobileAttachmentMenu } from '../attachment-menu'
import type { MobileImageSource } from '../image-source-picker'

export type MobileNativeChatInputProps = {
  value: string
  onChangeText: (text: string) => void
  selection: { start: number; end: number } | null
  onSelectionChange: (cursor: number) => void
  onAttachImage?: (source: MobileImageSource) => void
  isAttaching: boolean
  disabled: boolean
  placeholder: string
  hasMessage: boolean
  canSend: boolean
  onSend: () => Promise<void>
  agentWorking: boolean
  onStop?: () => void
}

export function MobileNativeChatInput({
  value,
  onChangeText,
  selection,
  onSelectionChange,
  onAttachImage,
  isAttaching,
  disabled,
  placeholder,
  hasMessage,
  canSend,
  onSend,
  agentWorking,
  onStop
}: MobileNativeChatInputProps): React.JSX.Element {
  return (
    <View className="min-h-11 flex-row items-end gap-2">
      {onAttachImage ? (
        <MobileAttachmentMenu
          disabled={isAttaching || disabled}
          pending={isAttaching}
          onSelect={onAttachImage}
        />
      ) : null}
      <MobileGlassSurface className="min-h-11 flex-1 overflow-hidden rounded-full" isInteractive>
        <View className="min-h-11 flex-row items-end">
          <TextInput
            className={cn(
              'text-foreground max-h-32 min-h-11 flex-1 px-4 py-2 text-base',
              (agentWorking && onStop) || hasMessage ? 'pr-2' : 'pr-4'
            )}
            value={value}
            onChangeText={onChangeText}
            selection={selection ?? undefined}
            onSelectionChange={(event) => onSelectionChange(event.nativeEvent.selection.end)}
            placeholder={placeholder}
            placeholderTextColorClassName="accent-muted-foreground"
            selectionColorClassName="accent-primary"
            multiline
            editable={!disabled}
            scrollEnabled
            submitBehavior="newline"
            textAlignVertical="center"
          />
          {agentWorking && onStop ? (
            <View className="h-11 w-11 shrink-0">
              <Pressable
                accessibilityLabel={translate('mobile.session.chat.stopAgent', 'Stop the agent')}
                className="h-full w-full items-center justify-center active:opacity-70"
                onPress={onStop}
              >
                <View className="bg-foreground h-8 w-8 items-center justify-center rounded-full">
                  <Square size={14} colorClassName="accent-background" />
                </View>
              </Pressable>
            </View>
          ) : hasMessage ? (
            <View className="h-11 w-11 shrink-0">
              <Pressable
                accessibilityLabel={translate('mobile.session.chat.sendMessage', 'Send message')}
                className="h-full w-full items-center justify-center active:opacity-70"
                onPress={onSend}
                disabled={!canSend}
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
          ) : null}
        </View>
      </MobileGlassSurface>
    </View>
  )
}
