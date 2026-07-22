import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native'

import {
  ArrowUp,
  ImageSquare as ImagePlus,
  Microphone as Mic,
  Square
} from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import {
  applyAutocomplete,
  detectAutocompleteTrigger,
  rankSuggestions
} from './mobile-native-chat-autocomplete'

// Common agent slash commands offered as autocomplete; sending them is just text
// to the agent's terminal, so the set is intentionally provider-agnostic.
const SLASH_COMMANDS = [
  '/clear',
  '/compact',
  '/review',
  '/model',
  '/help',
  '/init',
  '/cost',
  '/diff'
]

const NO_FILE_PATHS: string[] = []

type Props = {
  /** Controlled composer text — owned by the parent so dictation can write to it. */
  value: string
  onChangeText: (text: string) => void
  onSend: (text: string) => Promise<boolean>
  onAttachImage?: () => void
  isAttaching?: boolean
  onMicPress?: () => void
  micActive?: boolean
  /** Dictation trigger style — 'hold' uses press-in/out, 'toggle' uses tap. */
  dictationMode?: 'toggle' | 'hold'
  onMicPressIn?: () => void
  onMicPressOut?: () => void
  disabled?: boolean
  placeholder?: string
  filePaths?: string[]
  onNeedFiles?: (query: string) => void
}

export function MobileNativeChatComposer({
  value,
  onChangeText,
  onSend,
  onAttachImage,
  isAttaching = false,
  onMicPress,
  micActive = false,
  dictationMode = 'toggle',
  onMicPressIn,
  onMicPressOut,
  disabled = false,
  placeholder = 'Message, @files, /commands',
  filePaths = NO_FILE_PATHS,
  onNeedFiles
}: Props): React.JSX.Element {
  const [cursor, setCursor] = useState(0)
  // Transiently drives the native caret after a mid-text autocomplete insert,
  // then released on the next selection change so manual caret placement still
  // works (a permanently controlled `selection` breaks it in React Native).
  const [pendingSelection, setPendingSelection] = useState<{ start: number; end: number } | null>(
    null
  )
  const sendingRef = useRef(false)
  const [sending, setSending] = useState(false)
  const trimmed = value.trim()
  const canSend = trimmed.length > 0 && !disabled && !sending && !isAttaching

  const trigger = useMemo(() => detectAutocompleteTrigger(value, cursor), [value, cursor])
  const suggestions = useMemo(() => {
    if (!trigger) {
      return []
    }
    if (trigger.kind === 'slash') {
      return rankSuggestions(SLASH_COMMANDS, trigger.query)
    }
    return rankSuggestions(filePaths, trigger.query).map((p) => `@${p}`)
  }, [trigger, filePaths])

  useEffect(() => {
    if (trigger?.kind === 'file') {
      onNeedFiles?.(trigger.query)
    }
  }, [onNeedFiles, trigger?.kind, trigger?.query])

  const handleChange = (next: string): void => {
    onChangeText(next)
  }

  const pickSuggestion = (suggestion: string): void => {
    if (!trigger) {
      return
    }
    const { text: nextText, cursor: nextCursor } = applyAutocomplete(value, trigger, suggestion)
    onChangeText(nextText)
    setCursor(nextCursor)
    setPendingSelection({ start: nextCursor, end: nextCursor })
  }

  const handleSend = async (): Promise<void> => {
    if (!canSend || sendingRef.current) {
      return
    }
    sendingRef.current = true
    setSending(true)
    try {
      const accepted = await onSend(trimmed)
      if (accepted) {
        setCursor(0)
      }
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  return (
    <View>
      {suggestions.length > 0 ? (
        <View className={styles.suggestions}>
          <ScrollView keyboardShouldPersistTaps="always" className={styles.suggestionScroll}>
            {suggestions.map((s) => (
              <Pressable
                key={s}
                className={cn(styles.suggestion, styles.suggestionPressedActive)}
                onPress={() => pickSuggestion(s)}
              >
                <Text className={styles.suggestionText} numberOfLines={1}>
                  {s}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
      <View className={styles.bar}>
        {onAttachImage ? (
          <Pressable
            accessibilityLabel="Attach image"
            className={cn(styles.iconButton, styles.pressedActive)}
            onPress={onAttachImage}
            disabled={isAttaching || disabled}
          >
            {isAttaching ? (
              <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
            ) : (
              <ImagePlus size={20} colorClassName="accent-muted-foreground" />
            )}
          </Pressable>
        ) : null}
        <TextInput
          className={styles.input}
          value={value}
          onChangeText={handleChange}
          // Controlled only transiently right after an autocomplete insert.
          selection={pendingSelection ?? undefined}
          onSelectionChange={(e) => {
            setCursor(e.nativeEvent.selection.end)
            setPendingSelection(null)
          }}
          placeholder={placeholder}
          placeholderTextColorClassName="accent-muted-foreground"
          selectionColorClassName="accent-primary"
          multiline
          editable={!disabled}
          textAlignVertical="top"
        />
        {onMicPress ? (
          <Pressable
            accessibilityLabel={micActive ? 'Stop dictation' : 'Dictate'}
            className={cn(styles.iconButton, styles.pressedActive)}
            // Hold mode is walkie-talkie (press-in/out); toggle mode taps.
            onPress={dictationMode === 'hold' ? undefined : onMicPress}
            onPressIn={dictationMode === 'hold' ? onMicPressIn : undefined}
            onPressOut={dictationMode === 'hold' ? onMicPressOut : undefined}
            disabled={disabled}
          >
            {micActive ? (
              <Square size={18} colorClassName="accent-destructive" />
            ) : (
              <Mic size={20} colorClassName="accent-muted-foreground" />
            )}
          </Pressable>
        ) : null}
        <Pressable
          accessibilityLabel="Send message"
          className={cn(
            styles.sendButton,
            !canSend && styles.sendButtonDisabled,
            canSend && styles.pressedActive
          )}
          onPress={handleSend}
          disabled={!canSend}
        >
          <ArrowUp
            size={20}
            colorClassName={canSend ? 'accent-primary-foreground' : 'accent-muted-foreground'}
          />
        </Pressable>
      </View>
    </View>
  )
}

const styles = {
  suggestions: cn('border-t-hairline border-t-border bg-card'),
  suggestionScroll: cn('max-h-[180px]'),
  suggestion: cn('px-3 py-2 border-b-hairline border-b-border'),
  suggestionPressedActive: cn('active:bg-secondary'),
  suggestionText: cn('text-foreground font-mono text-[12px]'),
  bar: cn('flex-row items-end gap-2 px-3 py-2 border-t-hairline border-t-border bg-card'),
  input: cn(
    'flex-1 max-h-[140px] min-h-10 text-foreground text-[15px] bg-secondary rounded-none px-3 pt-2 pb-2'
  ),
  iconButton: cn('w-10 h-10 items-center justify-center'),
  // White send affordance per design — dark arrow on a light circle.
  sendButton: cn('w-10 h-10 rounded-none items-center justify-center bg-foreground'),
  sendButtonDisabled: cn('bg-secondary'),
  pressed: cn('opacity-[0.7]'),
  pressedActive: cn('active:opacity-[0.7]')
} as const
