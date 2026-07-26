import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native'

import { ArrowUp, ImageSquare as ImagePlus } from '../../components/uniwind-icons'
import { cn } from '../../style/class-names'
import { applyAutocomplete, detectAutocompleteTrigger, rankSuggestions } from './autocomplete'

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
  value: string
  onChangeText: (text: string) => void
  onSend: (text: string) => Promise<boolean>
  onAttachImage?: () => void
  isAttaching?: boolean
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
        <View className="border-t-hairline border-t-border bg-card">
          <ScrollView keyboardShouldPersistTaps="always" className="max-h-[180px]">
            {suggestions.map((s) => (
              <Pressable
                key={s}
                className="border-b-hairline border-b-border active:bg-accent px-3 py-2"
                onPress={() => pickSuggestion(s)}
              >
                <Text className="text-foreground font-mono text-xs" numberOfLines={1}>
                  {s}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
      <View className="border-t-hairline border-t-border bg-card flex-row items-end gap-2 px-3 py-2">
        {onAttachImage ? (
          <Pressable
            accessibilityLabel="Attach image"
            className={cn('h-10 w-10 items-center justify-center', styles.pressedActive)}
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
          className="text-foreground bg-secondary max-h-[140px] min-h-10 flex-1 px-3 py-2.5 text-sm leading-5"
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
          textAlignVertical="center"
        />
        {/* Why: the light send surface keeps its dark arrow distinct from muted controls. */}
        <Pressable
          accessibilityLabel="Send message"
          className={cn(
            'w-10 h-10 items-center justify-center bg-primary',
            !canSend && 'bg-secondary',
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
  pressedActive: cn('active:bg-accent')
} as const
