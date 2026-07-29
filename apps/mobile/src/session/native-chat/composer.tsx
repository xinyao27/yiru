import {
  Canvas,
  Group,
  LinearGradient,
  matchFont,
  Picture,
  Text as SkiaText,
  vec
} from '@shopify/react-native-skia'
import { useThinkingOrbPicture } from 'expo-thinking-orbs'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Pressable, ScrollView, Text, View } from 'react-native'
import {
  cancelAnimation,
  Easing,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming
} from 'react-native-reanimated'
import { useCSSVariable } from 'uniwind'

import { MobileContentSection } from '../../components/content-section'
import { useMobileLoaderStyle } from '../../loading/loader-style-context'
import { resolveCssNumber, resolveCssString } from '../../style/resolve-css-variable'
import type { MobileImageSource } from '../image-source-picker'
import { applyAutocomplete, detectAutocompleteTrigger, rankSuggestions } from './autocomplete'
import { MobileNativeChatInput } from './composer-input'

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
const WORKING_STATUS_DELAY_MS = 200
const WORKING_STATUS_FADE_DURATION_MS = 150
const WORKING_SHIMMER_DURATION_MS = 1600
const WORKING_STATUS_LABEL = 'Working'

type MobileNativeChatComposerProps = {
  value: string
  onChangeText: (text: string) => void
  onSend: (text: string) => Promise<boolean>
  onAttachImage?: (source: MobileImageSource) => void
  isAttaching?: boolean
  disabled?: boolean
  placeholder?: string
  filePaths?: string[]
  onNeedFiles?: (query: string) => void
  agentWorking?: boolean
  onStop?: () => void
  sendFailureMessage?: string | null
}

function MobileAgentWorkingGraphic(): React.JSX.Element {
  const { loaderStyle } = useMobileLoaderStyle()
  const reduceMotion = useReducedMotion()
  const values = useCSSVariable([
    '--color-foreground',
    '--color-muted-foreground',
    '--spacing-2',
    '--spacing-5',
    '--text-sm',
    '--text-sm--line-height'
  ])
  const foreground = resolveCssString(values[0])
  const mutedForeground = resolveCssString(values[1])
  const gap = resolveCssNumber(values[2])
  const orbSize = resolveCssNumber(values[3])
  const fontSize = resolveCssNumber(values[4])
  const lineHeight = resolveCssNumber(values[5])
  const font = useMemo(() => matchFont({ fontSize, fontWeight: '500' }), [fontSize])
  const labelWidth = Math.ceil(font.measureText(WORKING_STATUS_LABEL).width)
  const canvasHeight = Math.max(lineHeight, orbSize)
  const fontMetrics = font.getMetrics()
  const baseline =
    (canvasHeight - (fontMetrics.descent - fontMetrics.ascent)) / 2 - fontMetrics.ascent
  const labelOffset = orbSize + gap
  const shimmerProgress = useSharedValue(reduceMotion ? 0.5 : 0)
  const orbPicture = useThinkingOrbPicture({
    state: loaderStyle,
    size: orbSize,
    color: foreground,
    paused: reduceMotion
  })
  const shimmerStart = useDerivedValue(
    () => vec((shimmerProgress.value * 2 - 1) * labelWidth, 0),
    [labelWidth]
  )
  const shimmerEnd = useDerivedValue(
    () => vec(shimmerProgress.value * 2 * labelWidth, 0),
    [labelWidth]
  )

  useEffect(() => {
    shimmerProgress.value = reduceMotion ? 0.5 : 0
    if (!reduceMotion) {
      shimmerProgress.value = withRepeat(
        withTiming(1, { duration: WORKING_SHIMMER_DURATION_MS, easing: Easing.linear }),
        -1,
        false
      )
    }
    return () => cancelAnimation(shimmerProgress)
  }, [reduceMotion, shimmerProgress])

  return (
    <View accessibilityRole="text" accessibilityLabel={WORKING_STATUS_LABEL}>
      <Canvas style={{ width: labelOffset + labelWidth, height: canvasHeight }}>
        <Group transform={[{ translateY: (canvasHeight - orbSize) / 2 }]}>
          <Picture picture={orbPicture} />
        </Group>
        <Group transform={[{ translateX: labelOffset }]}>
          <SkiaText x={0} y={baseline} text={WORKING_STATUS_LABEL} font={font}>
            <LinearGradient
              start={shimmerStart}
              end={shimmerEnd}
              colors={
                reduceMotion
                  ? [foreground, foreground]
                  : [mutedForeground, mutedForeground, foreground, mutedForeground, mutedForeground]
              }
              positions={reduceMotion ? [0, 1] : [0, 0.35, 0.5, 0.65, 1]}
            />
          </SkiaText>
        </Group>
      </Canvas>
    </View>
  )
}

function MobileAgentWorkingStatus(): React.JSX.Element {
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const animation = Animated.timing(opacity, {
      delay: WORKING_STATUS_DELAY_MS,
      duration: WORKING_STATUS_FADE_DURATION_MS,
      toValue: 1,
      useNativeDriver: true
    })
    animation.start()
    return () => animation.stop()
  }, [opacity])

  return (
    <View className="mb-2 min-h-10 px-3">
      <Animated.View className="min-h-10 flex-row items-center" style={{ opacity }}>
        <MobileAgentWorkingGraphic />
      </Animated.View>
    </View>
  )
}

export function MobileNativeChatComposer({
  value,
  onChangeText,
  onSend,
  onAttachImage,
  isAttaching = false,
  disabled = false,
  placeholder = 'Message',
  filePaths = NO_FILE_PATHS,
  onNeedFiles,
  agentWorking = false,
  onStop,
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
  const hasMessage = trimmed.length > 0 || sending
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
    <View className="px-3 pb-2">
      {suggestions.length > 0 ? (
        <MobileContentSection className="mb-2 max-h-44">
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
        </MobileContentSection>
      ) : null}
      {agentWorking ? <MobileAgentWorkingStatus /> : null}
      {sendFailureMessage ? (
        <Text className="text-destructive mb-1 px-3 text-center text-xs font-semibold">
          {sendFailureMessage}
        </Text>
      ) : null}
      <MobileNativeChatInput
        value={value}
        onChangeText={handleChange}
        selection={pendingSelection}
        onSelectionChange={(nextCursor) => {
          setCursor(nextCursor)
          setPendingSelection(null)
        }}
        onAttachImage={onAttachImage}
        isAttaching={isAttaching}
        disabled={disabled}
        placeholder={placeholder}
        hasMessage={hasMessage}
        canSend={canSend}
        onSend={handleSend}
        agentWorking={agentWorking}
        onStop={onStop}
      />
    </View>
  )
}
