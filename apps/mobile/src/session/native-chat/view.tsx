import type { NativeChatMessage } from '@yiru/workbench-model/agent'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  Text,
  View
} from 'react-native'
import { useCSSVariable } from 'uniwind'

import { MobileGlassIconButton } from '../../components/glass/icon-button'
import { GestureDetector, GestureHandlerRootView } from '../../components/uniwind-native-components'
import { useSafeAreaInsets } from '../../components/uniwind-native-components'
import { resolveCssNumber } from '../../style/resolve-css-variable'
import type { MobileImageSource } from '../image-source-picker'
import type { AskAnswerSelection, AskPrompt } from './ask'
import { MobileNativeChatAsk } from './ask-wizard'
import { MobileNativeChatComposer } from './composer'
import { MobileNativeChatMessage } from './message'
import type { MobileChatPermission } from './permission'
import { MobileNativeChatPermission } from './permission-card'
import { mobileChatQuestionKey, type MobileChatQuestion } from './question'
import { MobileNativeChatQuestion } from './question-card'
import {
  buildMobileNativeChatTransientData,
  foldMobileNativeChatMessages,
  mobileNativeChatEmptyState
} from './render-data'
import { useMobileNativeChatAskDismiss } from './use-ask-dismiss'
import { useMobileNativeChatPinchGesture } from './use-pinch-gesture'
import type { MobileNativeChatStatus } from './use-session'

/** Why the composer input is locked: the transport is disconnected, or the
 *  terminal subscription has not acknowledged its input lease yet. */
export type MobileNativeChatInputLockReason = 'disconnected' | 'waiting'

type MobileNativeChatViewProps = {
  messages: NativeChatMessage[]
  status: MobileNativeChatStatus
  error?: string
  /** Resolved agent for this chat; names the empty-state copy (desktop parity). */
  agent?: string | null
  agentWorking?: boolean
  /** Interrupt the agent mid-turn (shown as a Stop button on the working bar). */
  onStop?: () => void
  /** Live partial assistant text while a turn is still streaming (from the agent
   *  status hook). Shown as an in-progress bubble until the transcript catches up. */
  streamingText?: string
  hasMore?: boolean
  loadingEarlier?: boolean
  onLoadEarlier?: () => void
  onSend: (text: string) => Promise<boolean>
  /** Optimistic queued sends (owned by the route so they survive view switches). */
  pending: { id: string; text: string }[]
  composerText: string
  onComposerTextChange: (text: string) => void
  onAttachImage?: (source: MobileImageSource) => void
  isAttaching?: boolean
  inputLockReason?: MobileNativeChatInputLockReason | null
  filePaths?: string[]
  onNeedFiles?: (query: string) => void
  /** A pending agent question/permission detected from live status, shown as a
   *  native card above the composer; answering sends text to the agent. */
  /** Structured AskUserQuestion prompt parsed from the transcript (preferred over
   *  the heuristic question card). */
  ask?: AskPrompt | null
  /** Deliver the ask answer as per-question selections; the send hook turns them
   *  into selector keystrokes (Claude) or pasted label text (other agents). */
  onAnswerAsk?: (prompt: AskPrompt, selections: AskAnswerSelection[]) => Promise<boolean>
  onCancelAsk?: () => Promise<boolean>
  question?: MobileChatQuestion | null
  onAnswerQuestion?: (text: string) => Promise<boolean>
  permission?: MobileChatPermission | null
  onRespondPermission?: (send: string) => Promise<boolean>
  /** Open a worktree file tapped in agent markdown. */
  onOpenFile?: (relativePath: string) => void
  /** Pixels to lift the composer by when the soft keyboard is open. The route
   *  owns keyboard tracking (the app uses manual lift, not KeyboardAvoidingView). */
  keyboardInset?: number
}

export function MobileNativeChatView({
  messages,
  status,
  error,
  agent,
  agentWorking,
  onStop,
  streamingText,
  hasMore,
  loadingEarlier,
  onLoadEarlier,
  onSend,
  pending,
  composerText,
  onComposerTextChange,
  onAttachImage,
  isAttaching,
  inputLockReason,
  filePaths,
  onNeedFiles,
  ask,
  onAnswerAsk,
  onCancelAsk,
  question,
  onAnswerQuestion,
  permission,
  onRespondPermission,
  onOpenFile,
  keyboardInset = 0
}: MobileNativeChatViewProps): React.JSX.Element {
  const insets = useSafeAreaInsets()
  const [transcriptClearanceValue, jumpButtonGapValue] = useCSSVariable([
    '--spacing-6',
    '--spacing-2'
  ])
  const transcriptClearance = resolveCssNumber(transcriptClearanceValue)
  const jumpButtonGap = resolveCssNumber(jumpButtonGapValue)
  const listRef = useRef<FlatList<NativeChatMessage>>(null)
  // Dismiss the question card as soon as it's answered; the live status lingers
  // briefly (the agent emits a post-tool event with the same prompt), so hide it
  // until a genuinely different question arrives.
  const { askKey, showAsk, dismissAsk } = useMobileNativeChatAskDismiss(ask)
  // Lift the composer clear of the keyboard, plus the bottom safe-area so it
  // never sits under the home indicator / nav bar (mirrors the terminal dock).
  const bottomPad = keyboardInset > 0 ? keyboardInset + insets.bottom : insets.bottom
  const [bottomChromeHeight, setBottomChromeHeight] = useState(88)
  const bottomChromeHeightRef = useRef(bottomChromeHeight)
  const hasMeasuredBottomChromeRef = useRef(false)
  const [atBottom, setAtBottom] = useState(true)
  const atBottomRef = useRef(true)
  const hasUserScrolledRef = useRef(false)
  const sendScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { fontScale, pinchGesture } = useMobileNativeChatPinchGesture()
  // Surface a rejected send inline above the composer — a bottom toast gets hidden
  // behind the keyboard (the case that prompted this). Auto-dismisses after a beat.
  const [sendFailed, setSendFailed] = useState(false)
  useEffect(() => {
    if (!sendFailed) {
      return
    }
    const t = setTimeout(() => setSendFailed(false), 4000)
    return () => clearTimeout(t)
  }, [sendFailed])

  useEffect(
    () => () => {
      if (sendScrollTimerRef.current) {
        clearTimeout(sendScrollTimerRef.current)
      }
    },
    []
  )

  const pendingIds = useMemo(() => new Set(pending.map((p) => p.id)), [pending])
  // `data` is the list source: folded transcript + synthetic streaming bubble +
  // route-owned optimistic queued messages. Memoize on the same deps so the
  // downstream autoscroll effects/`renderItem` keep referential stability.
  const foldedMessages = useMemo(() => foldMobileNativeChatMessages(messages), [messages])
  const { data } = useMemo(
    () => buildMobileNativeChatTransientData({ folded: foldedMessages, streamingText, pending }),
    [foldedMessages, streamingText, pending]
  )

  // Follow the tail as the conversation grows and keep the newest message above
  // the keyboard when it opens — but only when already pinned to the bottom, so
  // we don't yank the user away while they read history. (Also fires on keyboard
  // close, which is harmless while atBottom.)
  useEffect(() => {
    if (data.length === 0 || (hasUserScrolledRef.current && !atBottom)) {
      return
    }
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60)
    return () => clearTimeout(t)
  }, [data.length, atBottom, keyboardInset, bottomChromeHeight])

  const handleSend = useCallback(
    async (text: string): Promise<boolean> => {
      const accepted = await onSend(text)
      if (!accepted) {
        setSendFailed(true)
        return false
      }
      setSendFailed(false)
      // Always jump to the newest message when the user sends.
      hasUserScrolledRef.current = false
      atBottomRef.current = true
      setAtBottom(true)
      if (sendScrollTimerRef.current) {
        clearTimeout(sendScrollTimerRef.current)
      }
      sendScrollTimerRef.current = setTimeout(() => {
        sendScrollTimerRef.current = null
        listRef.current?.scrollToEnd({ animated: true })
      }, 60)
      return true
    },
    [onSend]
  )

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent
      const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height)
      const isAtBottom = distanceFromBottom < 80
      atBottomRef.current = isAtBottom
      setAtBottom(isAtBottom)
      // Near the top — page in older history.
      if (contentOffset.y < 60 && hasMore && !loadingEarlier) {
        onLoadEarlier?.()
      }
    },
    [hasMore, loadingEarlier, onLoadEarlier]
  )

  const handleJumpToLatest = useCallback(() => {
    hasUserScrolledRef.current = false
    atBottomRef.current = true
    setAtBottom(true)
    listRef.current?.scrollToEnd({ animated: true })
  }, [])

  const renderItem = useCallback(
    ({ item }: { item: NativeChatMessage }) => (
      <MobileNativeChatMessage
        message={item}
        queued={pendingIds.has(item.id)}
        fontScale={fontScale}
        onOpenFile={onOpenFile}
      />
    ),
    [pendingIds, fontScale, onOpenFile]
  )

  const emptyState = mobileNativeChatEmptyState(status, agent ?? null, error)
  const showLoading = status === 'loading' && messages.length === 0

  // Composer-lock flicker guard: on a remote link, brief connState blips or lease
  // hand-offs would otherwise toggle the lock placeholder on and off. Only surface
  // a lock once it has held ~600ms; drop it instantly so unlocking stays snappy.
  const rawLockReason = inputLockReason ?? null
  const [lockHeld, setLockHeld] = useState(false)
  useEffect(() => {
    if (rawLockReason === null) {
      setLockHeld(false)
      return
    }
    const timer = setTimeout(() => setLockHeld(true), 600)
    return () => clearTimeout(timer)
  }, [rawLockReason])
  const lockReason = lockHeld ? rawLockReason : null
  const transcriptFooterStyle = useMemo(
    () => ({ height: bottomChromeHeight + bottomPad + transcriptClearance }),
    [bottomChromeHeight, bottomPad, transcriptClearance]
  )
  const handleBottomChromeLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height)
    const shouldFollowTail =
      !hasMeasuredBottomChromeRef.current || !hasUserScrolledRef.current || atBottomRef.current
    hasMeasuredBottomChromeRef.current = true
    if (bottomChromeHeightRef.current === nextHeight) {
      if (shouldFollowTail) {
        requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }))
      }
      return
    }
    bottomChromeHeightRef.current = nextHeight
    setBottomChromeHeight(nextHeight)
    if (shouldFollowTail) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }))
    }
  }, [])
  return (
    <View className="bg-background relative flex-1">
      {showLoading ? (
        <View className="flex-1 items-center justify-center p-6">
          <ActivityIndicator colorClassName="accent-muted-foreground" />
        </View>
      ) : (
        <GestureHandlerRootView className="relative flex-1">
          <GestureDetector gesture={pinchGesture}>
            <FlatList
              ref={listRef}
              data={data}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              contentContainerClassName="grow pt-2"
              ListFooterComponent={data.length > 0 ? <View style={transcriptFooterStyle} /> : null}
              onScroll={onScroll}
              onScrollBeginDrag={() => {
                hasUserScrolledRef.current = true
              }}
              scrollEventThrottle={32}
              onContentSizeChange={() => {
                if (data.length > 0 && (!hasUserScrolledRef.current || atBottomRef.current)) {
                  listRef.current?.scrollToEnd({ animated: false })
                }
              }}
              ListHeaderComponent={
                hasMore ? (
                  <Pressable
                    className="min-h-9 items-center justify-center py-3"
                    onPress={onLoadEarlier}
                    disabled={loadingEarlier}
                  >
                    {loadingEarlier ? (
                      <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
                    ) : (
                      <Text className="text-muted-foreground text-xs font-semibold">
                        Load earlier messages
                      </Text>
                    )}
                  </Pressable>
                ) : null
              }
              ListEmptyComponent={
                emptyState ? (
                  <View className="flex-1 items-center justify-center p-6">
                    <Text className="text-muted-foreground mb-1 text-center text-sm font-semibold">
                      {emptyState.title}
                    </Text>
                    <Text className="text-muted-foreground text-center text-xs">
                      {emptyState.subtitle}
                    </Text>
                  </View>
                ) : null
              }
            />
          </GestureDetector>
          {!atBottom ? (
            <View
              className="absolute right-0 left-0 items-center"
              pointerEvents="box-none"
              style={{ bottom: bottomChromeHeight + bottomPad + jumpButtonGap }}
            >
              <MobileGlassIconButton
                accessibilityLabel="Scroll to latest"
                icon="down"
                onPress={handleJumpToLatest}
              />
            </View>
          ) : null}
        </GestureHandlerRootView>
      )}
      <View
        className="absolute right-0 left-0"
        onLayout={handleBottomChromeLayout}
        style={{ bottom: bottomPad }}
      >
        {/* Pending agent prompt: a structured AskUserQuestion wins, then a
            heuristic permission, then a heuristic question. */}
        {showAsk && ask ? (
          <MobileNativeChatAsk
            key={askKey ?? 'ask'}
            prompt={ask}
            onAnswer={async (selections) => {
              const accepted = (await onAnswerAsk?.(ask, selections)) ?? false
              if (accepted) {
                dismissAsk()
              }
              return accepted
            }}
            onCancel={async () => {
              const accepted = (await onCancelAsk?.()) ?? false
              if (accepted) {
                dismissAsk()
              }
              return accepted
            }}
          />
        ) : permission ? (
          <MobileNativeChatPermission
            key={JSON.stringify(permission)}
            permission={permission}
            onRespond={async (send) => (await onRespondPermission?.(send)) ?? false}
          />
        ) : question ? (
          <MobileNativeChatQuestion
            key={mobileChatQuestionKey(question)}
            question={question}
            onAnswer={async (text) => (await onAnswerQuestion?.(text)) ?? false}
          />
        ) : null}
        <MobileNativeChatComposer
          value={composerText}
          onChangeText={onComposerTextChange}
          onSend={handleSend}
          onAttachImage={onAttachImage}
          isAttaching={isAttaching}
          disabled={lockReason !== null}
          placeholder={
            lockReason === 'disconnected'
              ? 'Reconnecting…'
              : lockReason === 'waiting'
                ? 'Waiting for terminal…'
                : 'Message'
          }
          filePaths={filePaths}
          onNeedFiles={onNeedFiles}
          agentWorking={agentWorking}
          onStop={onStop}
          sendFailureMessage={
            sendFailed
              ? rawLockReason === 'disconnected'
                ? 'Message not sent — reconnecting…'
                : 'Message not sent'
              : null
          }
        />
      </View>
    </View>
  )
}
