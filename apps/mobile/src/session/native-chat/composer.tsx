import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native'

import { MobileGlassSurface } from '../../components/glass/surface'
import {
  ArrowUp,
  ArrowsInLineVertical as ChevronsDownUp,
  ArrowsOutLineVertical as ChevronsUpDown,
  ImageSquare as ImagePlus,
  Square
} from '../../components/uniwind-icons'
import { MobileAgentWorkingIndicator } from '../agent-working-indicator'
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

type MobileNativeChatComposerProps = {
  value: string
  onChangeText: (text: string) => void
  onSend: (text: string) => Promise<boolean>
  onAttachImage?: () => void
  isAttaching?: boolean
  disabled?: boolean
  placeholder?: string
  filePaths?: string[]
  onNeedFiles?: (query: string) => void
  agentWorking?: boolean
  onStop?: () => void
  toolsExpanded: boolean
  onToggleToolsExpanded: () => void
  sendFailureMessage?: string | null
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
  onNeedFiles,
  agentWorking = false,
  onStop,
  toolsExpanded,
  onToggleToolsExpanded,
  sendFailureMessage
}: MobileNativeChatComposerProps): React.JSX.Element {
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
    <View className="px-2 pb-2">
      {suggestions.length > 0 ? (
        <View className="border-border bg-popover mb-2 max-h-44 overflow-hidden rounded-2xl border">
          <ScrollView keyboardShouldPersistTaps="always" className="max-h-44">
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
      {/* Why: Expo Glass can disappear during navigation (expo/expo#41024), exposing
          transcript text; this dense control keeps the geometry with an opaque fallback. */}
      <MobileGlassSurface className="overflow-hidden rounded-3xl" forceFallback>
        <View className="min-h-7 flex-row items-center justify-between px-3 pt-1">
          <View className="flex-1 flex-row items-center gap-2">
            {agentWorking ? <MobileAgentWorkingIndicator /> : null}
            <Pressable
              className="active:bg-accent flex-row items-center gap-1 px-1 py-1"
              onPress={onToggleToolsExpanded}
              hitSlop={8}
            >
              {toolsExpanded ? (
                <ChevronsDownUp size={14} colorClassName="accent-muted-foreground" />
              ) : (
                <ChevronsUpDown size={14} colorClassName="accent-muted-foreground" />
              )}
              <Text className="text-muted-foreground text-xs font-semibold">
                {toolsExpanded ? 'Collapse' : 'Tools'}
              </Text>
            </Pressable>
          </View>
          {agentWorking ? (
            <Pressable
              className="active:bg-accent flex-row items-center gap-1"
              onPress={onStop}
              hitSlop={8}
              accessibilityLabel="Stop the agent"
            >
              <Square size={13} colorClassName="accent-destructive" />
              <Text className="text-destructive text-xs font-bold">Stop</Text>
            </Pressable>
          ) : null}
        </View>
        {sendFailureMessage ? (
          <View className="items-center px-3 pb-1">
            <Text className="text-destructive text-xs font-semibold">{sendFailureMessage}</Text>
          </View>
        ) : null}
        <View className="flex-row items-end gap-1.5 p-1.5">
          {onAttachImage ? (
            <Pressable
              accessibilityLabel="Attach image"
              className="active:bg-accent h-11 w-11 items-center justify-center rounded-full"
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
            className="text-foreground max-h-36 min-h-11 flex-1 rounded-2xl px-2.5 py-3 text-sm leading-5"
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
          <Pressable
            accessibilityLabel="Send message"
            className={
              canSend
                ? 'bg-primary active:bg-accent h-11 w-11 items-center justify-center rounded-full'
                : 'bg-secondary h-11 w-11 items-center justify-center rounded-full'
            }
            onPress={handleSend}
            disabled={!canSend}
          >
            <ArrowUp
              size={20}
              colorClassName={canSend ? 'accent-primary-foreground' : 'accent-muted-foreground'}
            />
          </Pressable>
        </View>
      </MobileGlassSurface>
    </View>
  )
}
