import { Pressable, TextInput, View } from 'react-native'

import { MobileGlassSurface } from '../../components/glass/surface'
import { ArrowUp, Square } from '../../components/uniwind-icons'
import { cn } from '../../style/class-names'
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
    <View className="min-h-10 flex-row items-end gap-2">
      {onAttachImage ? (
        <MobileAttachmentMenu
          disabled={isAttaching || disabled}
          pending={isAttaching}
          onSelect={onAttachImage}
        />
      ) : null}
      <MobileGlassSurface className="min-h-10 flex-1 overflow-hidden rounded-full" isInteractive>
        <View className="min-h-10 flex-row items-end">
          <TextInput
            className={cn(
              'text-foreground max-h-32 min-h-10 flex-1 px-4 py-2 text-base',
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
            <View className="m-1 h-8 w-8 shrink-0">
              <Pressable
                accessibilityLabel="Stop the agent"
                className="bg-foreground active:bg-accent h-full w-full items-center justify-center rounded-full"
                onPress={onStop}
              >
                <Square size={14} colorClassName="accent-background" />
              </Pressable>
            </View>
          ) : hasMessage ? (
            <View className="m-1 h-8 w-8 shrink-0">
              <Pressable
                accessibilityLabel="Send message"
                className={cn(
                  'bg-foreground h-full w-full items-center justify-center rounded-full',
                  canSend ? 'active:bg-accent' : 'opacity-40'
                )}
                onPress={onSend}
                disabled={!canSend}
              >
                <ArrowUp size={16} colorClassName="accent-background" />
              </Pressable>
            </View>
          ) : null}
        </View>
      </MobileGlassSurface>
    </View>
  )
}
