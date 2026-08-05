import AsyncStorage from '@react-native-async-storage/async-storage'
import type { TerminalQuickCommand } from '@yiru/workbench-model/ui'
import * as Clipboard from 'expo-clipboard'
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Animated, AppState, Linking, type AppStateStatus } from 'react-native'
import {
  BackHandler,
  View,
  Text,
  TextInput,
  Pressable,
  Keyboard,
  Platform,
  ActivityIndicator,
  type KeyboardEvent,
  type LayoutChangeEvent
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useCSSVariable } from 'uniwind'

import { MobileBrowserPane } from '~/browser/pane'
import { normalizeBrowserUrl } from '~/browser/url'
import { ActionSheetModal } from '~/components/action-sheet-modal'
import { BottomDrawerModalHost } from '~/components/bottom-drawer'
import { ConfirmModal } from '~/components/confirm-modal'
import { MobileGlassGroup } from '~/components/glass/group'
import { MobileGlassHeader } from '~/components/glass/header'
import { MobileGlassIconButton } from '~/components/glass/icon-button'
import { MobileGlassSurface } from '~/components/glass/surface'
import { StatusDot } from '~/components/status-dot'
import { TextInputModal } from '~/components/text-input-modal'
import {
  Copy,
  FileText,
  ArrowClockwise as RefreshCw,
  Trash as Trash2,
  X
} from '~/components/uniwind-icons'
import { isFileExistsErrorMessage } from '~/files/file-exists-error'
import { resolveMobileFileTabDoc } from '~/files/file-tab-doc'
import { translate } from '~/i18n/translate'
import { useResponsiveLayout } from '~/layout/responsive-layout'
import {
  triggerMediumImpact,
  triggerSelection,
  triggerSuccess,
  triggerError,
  triggerEdgeBump
} from '~/platform/haptics'
import { headlessActivationNeedsHostRenderer } from '~/session/activation-result'
import { MobileBrowserTabActionSheet } from '~/session/browser-tab-action-sheet'
import { sendMobileBufferedTerminalInput } from '~/session/buffered-terminal-send'
import { resolveMobileSessionConnectionHealth } from '~/session/connection-health'
import { CreateTabDrawers } from '~/session/create-tab-drawers'
import {
  createMobileSessionCreateWarningState,
  dismissMobileSessionCreateWarningState,
  reconcileMobileSessionCreateWarningState
} from '~/session/create-warning-state'
import {
  MobileSessionCreationPlaceholder,
  MobileSessionCreationWarning
} from '~/session/creation-status'
import { SessionDockColumn } from '~/session/dock-column'
import { FileReader } from '~/session/file-reader'
import { isFloatingWorkspaceWorktreeId } from '~/session/floating-workspace'
import { shouldUseNativeSessionHeader } from '~/session/header-mode'
import { MobileSessionHeaderMoreActionsSheet } from '~/session/header-more-actions-sheet'
import { MarkdownReader } from '~/session/markdown-reader'
import { canShowMobileNativeChat } from '~/session/native-chat/eligibility'
import { MobileNativeChatOverlay } from '~/session/native-chat/overlay'
import { useMobileNativeChatController } from '~/session/native-chat/use-controller'
import { useMobileNativeChatInputLease } from '~/session/native-chat/use-input-lease'
import { useMobileNativeChatReadability } from '~/session/native-chat/use-readability'
import { useMobileNativeChatTerminalStream } from '~/session/native-chat/use-terminal-stream'
import {
  buildCreateTabAgentActions,
  buildSendReviewNotesAgentActions
} from '~/session/new-tab-agent-actions'
import { loadMobileNewTabAgentOptions } from '~/session/new-tab-agent-loader'
import type { MobileNewTabAgentOption } from '~/session/new-tab-agent-options'
import { activateOpenedSourceControlDiffTab } from '~/session/opened-mobile-session-tab'
import {
  type ActivePanel,
  canDockSessionPanel,
  resolvePanelAction,
  shouldShowSessionHeaderChecksAction,
  panelRouteDescriptor
} from '~/session/panel-host'
import { useMobilePrBranchContext } from '~/session/pr/use-branch-context'
import { QuickCommandsSheet } from '~/session/quick-commands-sheet'
import { sessionScreenClassNames as styles } from '~/session/screen-class-names'
import type {
  DirtyMarkdownDraft,
  FileDocState,
  MobileDisplayMode,
  MobileNewTabAgentLoadState,
  MobileSessionTab,
  SessionTabsResult,
  Terminal,
  TerminalCreateResult,
  TerminalGestureInputBucket,
  TerminalGestureInputQueue
} from '~/session/screen-state'
import { activateMobileSessionTab, focusMobileTerminal } from '~/session/tab-activation'
import { MobileSessionTabStrip } from '~/session/tab-strip'
import { getMobileTerminalActionSheetActions } from '~/session/terminal/action-sheet-actions'
import { useMobileTerminalControlMode } from '~/session/terminal/control-mode'
import { MobileTerminalDock } from '~/session/terminal/dock'
import { openMobileTerminalFileTap } from '~/session/terminal/file-tap-open'
import { TerminalPaneView } from '~/session/terminal/pane-view'
import { mergeTerminalListWithKnownRecords, terminalRecordsEqual } from '~/session/terminal/records'
import { useMobileTerminalForegroundRecovery } from '~/session/terminal/use-foreground-recovery'
import { useTerminalLiveInputModePreference } from '~/session/terminal/use-live-input-mode-preference'
import { useMobileTerminalPaste } from '~/session/terminal/use-paste'
import { useMobileTerminalStreams } from '~/session/terminal/use-terminal-streams'
import { useMobileAttachmentInputLeaseGate } from '~/session/use-attachment-input-lease-gate'
import { useMobileDiffComments } from '~/session/use-diff-comments'
import { useMobileHostCapabilities } from '~/session/use-host-capabilities'
import { useMobileImageAttachment } from '~/session/use-image-attachment'
import { useLiveWorktreeName } from '~/session/use-live-worktree-name'
import { useMobileMarkdownDocs } from '~/session/use-markdown-docs'
import { useMobileSessionTabSnapshot } from '~/session/use-session-tab-snapshot'
import { useMobileSessionTabsStore } from '~/session/use-session-tabs'
import {
  loadTerminalAutocompleteEnabled,
  loadTerminalLinkOpenMode,
  loadTerminalTextScale,
  HOST_DOCK_MIN_WIDTH,
  saveTerminalTextScale,
  type MobileTerminalLinkOpenMode
} from '~/storage/preferences'
import { resolveCssNumber, resolveCssString } from '~/style/resolve-css-variable'
import {
  getDefaultTerminalAccessoryBuiltInIds,
  getVisibleTerminalAccessoryKeys,
  loadTerminalAccessoryLayout
} from '~/terminal/accessory-layout'
import {
  CustomKeyModal,
  loadCustomKeys,
  saveCustomKeys,
  type CustomKey
} from '~/terminal/custom-key-modal'
import {
  countTerminalGestureInputSequences,
  isGestureMouseTrackingMode,
  TERMINAL_GESTURE_INPUT_BUCKET_CAPACITY,
  TERMINAL_GESTURE_INPUT_FLUSH_DELAY_MS,
  TERMINAL_GESTURE_INPUT_MAX_PENDING_SEQUENCES,
  TERMINAL_GESTURE_INPUT_MAX_QUEUE_AGE_MS,
  TERMINAL_GESTURE_INPUT_REFILL_PER_SECOND
} from '~/terminal/gesture-input'
import { createTerminalLiveAccessoryInput } from '~/terminal/live/accessory-input'
import { getTerminalLiveAccessoryRawSendTarget } from '~/terminal/live/accessory-raw-send-target'
import {
  clearTerminalLiveInputFocusTimer,
  focusTerminalLiveInputTarget,
  isTerminalLiveInputWithinByteLimit,
  scheduleTerminalLiveInputFocus
} from '~/terminal/live/input'
import type { TerminalLiveInputSender } from '~/terminal/live/input-sender'
import { useTerminalLiveInputCommit } from '~/terminal/live/use-input-commit'
import { sendMobileTerminalQueryReply } from '~/terminal/query-reply'
import {
  buildMobileQuickCommandLaunch,
  shouldShowMobileQuickCommandsAction,
  type MobileQuickCommandLaunch
} from '~/terminal/quick-commands'
import { isTerminalSendRpcAccepted } from '~/terminal/send-rpc-response'
import { normalizeTerminalTextInput } from '~/terminal/text-input-normalization'
import { useTerminalViewportRefit } from '~/terminal/viewport-refit'
import type {
  TerminalKeyboardAvoidanceMetrics,
  TerminalModes,
  TerminalWebViewHandle
} from '~/terminal/webview/contract'
import { useHostClient, useForceReconnect } from '~/transport/client-context'
import {
  useLastConnectedAt,
  useReconnectAttempt
} from '~/transport/client-context-connection-metrics'
import { loadHosts } from '~/transport/host-store'
import type { RpcClient } from '~/transport/rpc-client'
import type { ConnectionState, RpcFailure, RpcSuccess } from '~/transport/types'
import { getRepoIdFromMobileWorktreeId } from '~/worktree/id'

const BROWSER_STREAMING_UNAVAILABLE_MESSAGE = translate(
  'mobile.session.browserStreamingUnavailable',
  'Desktop update required for mobile browser streaming'
)
const TERMINAL_KEYBOARD_DISMISS_ACTION_SHEET_FALLBACK_MS = 450

export default function SessionScreen(): React.JSX.Element {
  const {
    hostId,
    worktreeId,
    name: routeWorktreeName,
    created,
    warning: createdWarning
  } = useLocalSearchParams<{
    hostId: string
    worktreeId: string
    name?: string
    created?: string
    warning?: string
  }>()
  const isFolderWorkspaceRoute = worktreeId.startsWith('folder:') // Synthetic ids have no repo scope.
  // Why: the floating sentinel has no repo/worktree, so repo-backed surfaces must stay hidden.
  const isFloatingWorkspaceRoute = isFloatingWorkspaceWorktreeId(worktreeId)
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [backgroundValue, spacing2Value] = useCSSVariable(['--color-background', '--spacing-2'])
  const backgroundColor = resolveCssString(backgroundValue)
  const keyboardComposerGap = resolveCssNumber(spacing2Value)
  // Why: shared client per host owned by RpcClientProvider. See
  // docs/mobile-shared-client-per-host.md.
  const { client, state: connState } = useHostClient(hostId)
  const reconnectAttempts = useReconnectAttempt(hostId)
  const lastConnectedAt = useLastConnectedAt(hostId)
  const forceReconnectHost = useForceReconnect()
  const worktreeName = useLiveWorktreeName({
    client,
    connState,
    routeName: routeWorktreeName,
    worktreeId
  })
  // Master-detail host state (U5/KTD2): on wide layouts a tapped panel docks beside the
  // session content; on narrow it stays null and the icons push full-screen routes.
  const { isWideLayout } = useResponsiveLayout()
  const [activePanel, setActivePanel] = useState<ActivePanel>(null)
  const [sessionContentRowWidth, setSessionContentRowWidth] = useState(0)
  const canDockPanel =
    !isFloatingWorkspaceRoute &&
    canDockSessionPanel({
      isWideLayout,
      availableWidth: sessionContentRowWidth,
      dockWidth: HOST_DOCK_MIN_WIDTH
    })
  // Why: docking needs enough measured row width. If rotation/split-screen makes
  // the session row too narrow while a panel is docked, clear activePanel so the
  // icon state and live mounted panel do not survive into overlay/push mode.
  useEffect(() => {
    if (!canDockPanel && activePanel !== null) {
      setActivePanel(null)
    }
  }, [canDockPanel, activePanel])
  // Session-level GitHub remote probe gates the PR dock icon so non-GitHub
  // providers do not open the hosted-review surface. Branch/head/status for the
  // hub are loaded inside MobileSourceControlPanel — skip the unused identity RPCs.
  const { isGithubRepo: prIsGithubRepo, repoLoaded: prRepoContextLoaded } =
    useMobilePrBranchContext({
      // Why: a null client parks the hook without probing a repo the sentinel cannot own.
      client: isFloatingWorkspaceRoute ? null : client,
      connState,
      worktreeId,
      includeBranchIdentity: false
    })
  useEffect(() => {
    if (prRepoContextLoaded && !prIsGithubRepo && activePanel === 'pr') {
      setActivePanel(null)
    }
  }, [activePanel, prRepoContextLoaded, prIsGithubRepo])
  const initialCreateWarning = typeof createdWarning === 'string' ? createdWarning.trim() : ''
  const [terminals, setTerminals] = useState<Terminal[]>([])
  const terminalsRef = useRef<Terminal[]>([])
  const sessionTabsStore = useMobileSessionTabsStore()
  const {
    activeSessionTab,
    activeSessionTabId,
    activeSessionTabIdRef,
    activeSessionTabTypeRef,
    closedTabTombstonesRef,
    pendingActiveSessionTabIdRef,
    pendingActiveTerminalHandleRef,
    releasePendingTabSelection,
    resetForRoute: resetSessionTabsForRoute,
    sessionTabs,
    sessionTabsRef,
    setActiveSessionTabId,
    setSessionTabs
  } = sessionTabsStore
  const [terminalsLoaded, setTerminalsLoaded] = useState(false)
  const [input, setInput] = useState('')
  // Why: baseline terminal zoom, reloaded on focus so a Settings → Terminal change
  // applies in place (the terminal panes stay mounted).
  const [terminalTextScale, setTerminalTextScale] = useState(1)
  // Why: local opt-in for keyboard autocomplete/autocorrect on the terminal
  // command bar; reloaded on focus so a Settings → Terminal toggle takes effect on return.
  const [autocompleteEnabled, setAutocompleteEnabled] = useState(false)
  const [terminalLinkOpenMode, setTerminalLinkOpenMode] =
    useState<MobileTerminalLinkOpenMode>('yiru-browser')
  const {
    clearTerminalLiveInputDefault,
    defaultTerminalHandlesToLiveInput,
    liveInputTerminalHandles,
    liveInputTerminalHandlesRef,
    pruneTerminalHandlesFromLiveInput,
    toggleTerminalLiveInput
  } = useTerminalLiveInputModePreference({ hostId, worktreeId })
  const [activeHandle, setActiveHandle] = useState<string | null>(null)
  const [fileDocs, setFileDocs] = useState<Map<string, FileDocState>>(new Map())
  const [creating, setCreating] = useState(false)
  // Why: React state isn't a synchronous lock — a fast double-tap can fire two
  // creates before `creating` re-renders. This ref blocks the second one in the
  // same tick (server idempotency only dedupes identical clientMutationIds).
  const creatingTerminalRef = useRef(false)
  const [creatingBrowser, setCreatingBrowser] = useState(false)
  const [creatingMarkdown, setCreatingMarkdown] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createWarningState, setCreateWarningState] = useState(() =>
    createMobileSessionCreateWarningState(initialCreateWarning)
  )
  const [showCreateTabDrawer, setShowCreateTabDrawer] = useState(false)
  const [showQuickCommands, setShowQuickCommands] = useState(false)
  const [createTabAgentLoadState, setCreateTabAgentLoadState] =
    useState<MobileNewTabAgentLoadState>('idle')
  const [createTabAgentOptions, setCreateTabAgentOptions] = useState<MobileNewTabAgentOption[]>([])
  const [showCreateBrowserModal, setShowCreateBrowserModal] = useState(false)
  const [showHeaderMoreActions, setShowHeaderMoreActions] = useState(false)
  const [actionTarget, setActionTarget] = useState<Terminal | null>(null)
  const [markdownActionTarget, setMarkdownActionTarget] = useState<Extract<
    MobileSessionTab,
    { type: 'markdown' }
  > | null>(null)
  const [fileActionTarget, setFileActionTarget] = useState<Extract<
    MobileSessionTab,
    { type: 'file' }
  > | null>(null)
  const [browserActionTarget, setBrowserActionTarget] = useState<Extract<
    MobileSessionTab,
    { type: 'browser' }
  > | null>(null)
  const [leaveDrafts, setLeaveDrafts] = useState<DirtyMarkdownDraft[] | null>(null)
  const [renameTarget, setRenameTarget] = useState<Terminal | null>(null)
  const [customKeys, setCustomKeys] = useState<CustomKey[]>([])
  const [visibleBuiltInIds, setVisibleBuiltInIds] = useState<string[]>(
    getDefaultTerminalAccessoryBuiltInIds
  )
  const [showCustomKeyModal, setShowCustomKeyModal] = useState(false)
  const [deleteKeyTarget, setDeleteKeyTarget] = useState<CustomKey | null>(null)
  const visibleBuiltInAccessoryKeys = useMemo(
    () => getVisibleTerminalAccessoryKeys(visibleBuiltInIds),
    [visibleBuiltInIds]
  )
  // Why: in Expo SDK 55 edge-to-edge mode the OS does NOT resize the window when
  // the IME opens — the keyboard draws on top of the app. We track the keyboard
  // height ourselves and translate the input/accessory area above the IME without
  // changing the terminal frame height, so keyboard open/close does not resize
  // the desktop PTY.
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  // Why: server-authoritative display mode per terminal. The runtime is the
  // single source of truth — this state is populated from subscribe responses.
  const [terminalModes, setTerminalModes] = useState<Map<string, MobileDisplayMode>>(new Map())
  const [terminalKeyboardMetrics, setTerminalKeyboardMetrics] = useState<
    Map<string, TerminalKeyboardAvoidanceMetrics>
  >(new Map())
  const [selectModeActive, setSelectModeActive] = useState(false)
  const [canPaste, setCanPaste] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const toastOpacityRef = useRef(new Animated.Value(0))
  const toastHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastSeqRef = useRef(0)
  // Why: WebView pushes terminal modes (bracketed-paste, alt-screen) on every
  // change so paste reads a synchronous snapshot — no round-trip required.
  const ptyModesRef = useRef<Map<string, TerminalModes>>(new Map())
  const terminalGestureInputBucketsRef = useRef<Map<string, TerminalGestureInputBucket>>(new Map())
  const terminalGestureInputQueuesRef = useRef<Map<string, TerminalGestureInputQueue>>(new Map())
  const terminalGestureInputInFlightRef = useRef<Set<string>>(new Set())
  const initialModesSeenRef = useRef<Set<string>>(new Set())
  const deviceTokenRef = useRef<string | null>(null)
  // Why: state (not a ref) — the connection verdict needs a re-render once
  // the endpoint loads so the Tailscale hint can appear.
  const [hostEndpoint, setHostEndpoint] = useState<string | null>(null)
  const clientRef = useRef<RpcClient | null>(null)
  const connStateRef = useRef<ConnectionState>(connState)
  const liveInputRef = useRef<TextInput>(null)
  const commandInputRef = useRef<TextInput>(null)
  const liveInputFocusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sendLiveTerminalInputRef = useRef<TerminalLiveInputSender>(async () => false)
  const sessionTabActionSheetKeyboardHideSubRef = useRef<ReturnType<
    typeof Keyboard.addListener
  > | null>(null)
  const sessionTabActionSheetRequestSeqRef = useRef(0)
  const activeHandleRef = useRef<string | null>(null)
  const controlModeSenderRef = useRef<(bytes: string) => void>(() => {})
  // Why: a browser tab opened from a terminal-tapped HTML must be focused as an
  // Yiru session tab (bridge auto-activate only flags the live webContents, not
  // the app-level active tab). We remember the page id and, once its session tab
  // syncs, activate it through the normal switchSessionTab path (which also makes
  // switching back to the terminal work). A ref breaks the callback dep cycle.
  const pendingBrowserFocusPageIdRef = useRef<string | null>(null)
  const switchSessionTabRef = useRef<((tab: MobileSessionTab) => void) | null>(null)
  const pendingTerminalActivationAttemptRef = useRef<string | null>(null)
  // Why: handleTerminalOpenUrl is memoized on terminalLinkOpenMode, but
  // handleCreateBrowser is a per-render closure that captures the live `client`.
  // A terminal URL tap must run the CURRENT closure (the memoized one can hold a
  // render where client was still null/connecting, silently no-opping the
  // in-app-browser open). Route through a ref kept current every render.
  const handleCreateBrowserRef = useRef<((rawUrl?: string) => Promise<boolean>) | null>(null)

  const initialEmptySessionAutoCreateRef = useRef<string | null>(null)
  // Why: post-RPC refresh timers capture this screen and must not survive
  // route reuse or unmount.
  const delayedActionTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())
  const sendingRef = useRef(false)
  // Why: the terminal frame's width changes when EITHER sidebar is resized (the
  // left worktree sidebar shrinks the detail pane; the right dock takes a slice of
  // the row) without any window-dim change. Tracking the measured width lets the
  // refit hook re-fit the PTY on those resizes — see terminal-viewport-refit.ts.
  const [terminalFrameWidth, setTerminalFrameWidth] = useState(0)
  const {
    controlModeActive,
    handleInputChange: handleControlModeInputChange,
    liveInputCapture,
    reset: resetControlMode,
    setLiveInputCapture,
    toggle: toggleControlMode
  } = useMobileTerminalControlMode({
    activeHandleRef,
    onSendControlByte: (bytes) => controlModeSenderRef.current(bytes)
  })
  const {
    clearPendingLiveInputCommit,
    flushPendingLiveInputBeforeExternalSend,
    handleLiveInputAccessoryBytes,
    handleLiveInputChange,
    handleLiveInputKeyPress,
    handleLiveInputSubmit
  } = useTerminalLiveInputCommit({
    activeHandle,
    activeHandleRef,
    activeSessionTabType: activeSessionTab?.type,
    activeSessionTabTypeRef,
    liveInputRef,
    liveInputTerminalHandles,
    liveInputTerminalHandlesRef,
    sendLiveTerminalInputRef,
    setLiveInputCapture
  })
  const handleTerminalLiveInputChange = useCallback(
    (text: string) => handleControlModeInputChange(text, handleLiveInputChange),
    [handleControlModeInputChange, handleLiveInputChange]
  )
  const canSend =
    connState === 'connected' &&
    activeHandle != null &&
    activeSessionTab?.type !== 'markdown' &&
    activeSessionTab?.type !== 'file' &&
    activeSessionTab?.type !== 'browser'
  const liveInputEnabled = activeHandle ? liveInputTerminalHandles.has(activeHandle) : false
  const closeQuickCommands = useCallback(() => setShowQuickCommands(false), [])
  const {
    agentSessionHistorySupported,
    browserScreencastSupported,
    browserScreencastSupportedRef,
    hostQueryReplyInputSupportedRef,
    quickCommandsSupported
  } = useMobileHostCapabilities({ client, connState, onCapabilitiesReset: closeQuickCommands })
  // Why: terminal gesture/input callbacks are intentionally stable and
  // imperative; keep their refs current before commit instead of one effect later.
  clientRef.current = client
  connStateRef.current = connState
  const reconciledCreateWarningState = reconcileMobileSessionCreateWarningState(
    createWarningState,
    initialCreateWarning
  )
  // Why: Expo can reuse this screen for a new route. Reconcile before paint
  // so a dismissed old creation warning never flashes for the next session.
  if (reconciledCreateWarningState !== createWarningState) {
    setCreateWarningState(reconciledCreateWarningState)
  }
  const createWarning = reconciledCreateWarningState.visible

  const clearDelayedActionTimers = useCallback(() => {
    for (const timer of delayedActionTimersRef.current) {
      clearTimeout(timer)
    }
    delayedActionTimersRef.current.clear()
  }, [])

  const scheduleDelayedAction = useCallback((fn: () => void, ms: number) => {
    const timer = setTimeout(() => {
      delayedActionTimersRef.current.delete(timer)
      fn()
    }, ms)
    delayedActionTimersRef.current.add(timer)
  }, [])

  const clearToastHideTimer = useCallback(() => {
    if (!toastHideTimerRef.current) {
      return
    }
    clearTimeout(toastHideTimerRef.current)
    toastHideTimerRef.current = null
  }, [])

  const showToast = useCallback(
    (message: string, durationMs = 1200) => {
      const seq = toastSeqRef.current + 1
      toastSeqRef.current = seq
      clearToastHideTimer()
      setToastMessage(message)
      Animated.timing(toastOpacityRef.current, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true
      }).start(({ finished }) => {
        if (!finished || toastSeqRef.current !== seq) {
          return
        }
        toastHideTimerRef.current = setTimeout(() => {
          toastHideTimerRef.current = null
          Animated.timing(toastOpacityRef.current, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true
          }).start((result) => {
            if (result.finished && toastSeqRef.current === seq) {
              setToastMessage(null)
            }
          })
        }, durationMs)
      })
    },
    [clearToastHideTimer]
  )
  const showNativeChatSendError = useCallback(
    (message: string) => showToast(message, 1600),
    [showToast]
  )
  const {
    confirmDiscardMarkdown,
    copyMarkdownLocalContent,
    discardMarkdownLocalContent,
    discardMarkdownTarget,
    getDirtyMarkdownDrafts,
    markdownDocs,
    markdownDocsRef,
    markMarkdownTabStale,
    readMarkdownTab,
    saveMarkdownTab,
    setDiscardMarkdownTarget,
    setMarkdownDocs,
    updateMarkdownLocalContent
  } = useMobileMarkdownDocs({ client, worktreeId, sessionTabs, showToast })
  const {
    addDiffCommentForFile,
    clearDeliveredDiffComments,
    copyDiffCommentsToClipboard,
    deleteDiffCommentForFile,
    diffCommentBusy,
    diffComments,
    pendingDiffNotesDelivery,
    sendDiffCommentsToAgent,
    setDiffComments,
    setPendingDiffNotesDelivery
  } = useMobileDiffComments({
    client,
    connState,
    worktreeId,
    isFloatingWorkspaceRoute,
    showToast
  })
  const nativeChatTranscriptIsLocalReadable = useMobileNativeChatReadability(client, worktreeId)
  const {
    ready: nativeChatInputLeaseReady,
    readyRef: nativeChatInputLeaseReadyRef,
    lockReason: nativeChatInputLockReason,
    markReady: markNativeChatInputLeaseReady,
    clear: clearNativeChatInputLease
  } = useMobileNativeChatInputLease({
    activeHandle,
    connected: connState === 'connected'
  })
  const nativeChatController = useMobileNativeChatController({
    client,
    hostId,
    worktreeId,
    activeSessionTab,
    activeSessionTabId,
    activeHandleRef,
    deviceTokenRef,
    nativeChatTranscriptIsLocalReadable,
    nativeChatInputLeaseReady,
    onSendError: showNativeChatSendError
  })
  const { toggleTabChatView, showNativeChat, showNativeChatRef } = nativeChatController
  const showTerminalChatAction =
    activeSessionTab?.type === 'terminal' &&
    canShowMobileNativeChat(activeSessionTab, nativeChatTranscriptIsLocalReadable)

  const {
    clearTerminalCache,
    getTerminalRef,
    initializedHandlesRef,
    measureViewportOnce,
    subscribeToTerminal,
    subscribingHandlesRef,
    terminalCwdRef,
    terminalDiagnosticsRef,
    terminalFrameHeightRef,
    terminalRefs,
    terminalUnsubsRef,
    unsubscribeTerminal,
    viewportMeasuredRef,
    viewportRef,
    webReadyHandlesRef
  } = useMobileTerminalStreams({
    client,
    activeHandleRef,
    deviceTokenRef,
    showNativeChatRef,
    markNativeChatInputLeaseReady,
    clearNativeChatInputLease,
    scheduleDelayedAction,
    setTerminalModes,
    setTerminalKeyboardMetrics
  })

  const notifyTerminalWebReady = useMobileNativeChatTerminalStream({
    showNativeChat,
    activeHandle,
    activeTabType: activeSessionTab?.type ?? null,
    subscriptionsRef: terminalUnsubsRef,
    subscribingRef: subscribingHandlesRef,
    webReadyRef: webReadyHandlesRef,
    initializedRef: initializedHandlesRef,
    subscribe: subscribeToTerminal,
    unsubscribe: unsubscribeTerminal
  })

  // Why: update the affordance immediately, then reconcile it with the server
  // response and the existing resize stream. Waiting only for the stream makes
  // a successful toggle look inert when no resize is needed.
  const toggleInFlightRef = useRef<Set<string>>(new Set())
  const toggleDisplayMode = useCallback(
    async (handle: string) => {
      if (!client) {
        return
      }
      if (toggleInFlightRef.current.has(handle)) {
        return
      }
      const current = terminalModes.get(handle) ?? 'auto'
      const hadCurrentMode = terminalModes.has(handle)
      // Why: 'phone' on the wire is an observation ("currently phone-fitted"),
      // not a setting. The toggle only ever requests 'auto' or 'desktop'.
      const next: 'auto' | 'desktop' =
        current === 'auto' || current === 'phone' ? 'desktop' : 'auto'
      toggleInFlightRef.current.add(handle)
      setTerminalModes((previous) => new Map(previous).set(handle, next))
      const restorePreviousMode = (): void => {
        setTerminalModes((previous) => {
          const restored = new Map(previous)
          if (hadCurrentMode) {
            restored.set(handle, current)
          } else {
            restored.delete(handle)
          }
          return restored
        })
      }
      try {
        const response = await client.sendRequest('terminal.setDisplayMode', {
          terminal: handle,
          mode: next,
          // Why: presence-lock take-floor signal — requesting 'auto' is the
          // explicit "I want to drive at phone dims" gesture.
          ...(deviceTokenRef.current
            ? { client: { id: deviceTokenRef.current, type: 'mobile' as const } }
            : {}),
          // Why: late-bind viewport for terminals whose subscribe record
          // was registered before measurement landed. Without this the
          // server's stored viewport is null and auto toggles no-op.
          ...(viewportRef.current && next === 'auto' ? { viewport: viewportRef.current } : {})
        })
        if (!response.ok) {
          restorePreviousMode()
          return
        }
        const responseMode =
          typeof response.result === 'object' && response.result !== null
            ? Reflect.get(response.result, 'mode')
            : undefined
        if (responseMode === 'auto' || responseMode === 'phone' || responseMode === 'desktop') {
          setTerminalModes((previous) => new Map(previous).set(handle, responseMode))
        }
      } catch {
        restorePreviousMode()
      } finally {
        toggleInFlightRef.current.delete(handle)
      }
    },
    [client, terminalModes]
  )

  const lastKnownTerminalCountRef = useRef(0)
  const fetchTerminalsInFlightRef = useRef(false)

  const fetchTerminals = useCallback(
    async (opts: { allowEmptyLoaded?: boolean } = {}) => {
      if (!client) {
        return
      }
      if (fetchTerminalsInFlightRef.current) {
        return
      }
      fetchTerminalsInFlightRef.current = true
      const allowEmptyLoaded = opts.allowEmptyLoaded ?? true

      try {
        const response = await client.sendRequest('terminal.list', {
          worktree: `id:${worktreeId}`
        })
        if (response.ok) {
          const result = (response as RpcSuccess).result as { terminals: Terminal[] }

          if (result.terminals.length === 0 && !allowEmptyLoaded) {
            return
          }
          // Why: protect against transient empty responses from the server
          // during rapid tab switching or RPC timing. If we previously had
          // terminals and the server now says 0, require a second consecutive
          // empty to confirm. This prevents the UI from flashing empty during
          // rapid interactions while still allowing genuine cleanup.
          if (result.terminals.length === 0 && lastKnownTerminalCountRef.current > 0) {
            lastKnownTerminalCountRef.current = 0
            return
          }

          const liveHandles = new Set(result.terminals.map((terminal) => terminal.handle))
          // Why: terminal.list is the lifetime signal; session-tab snapshots can lag
          // mobile-created tabs and must not erase a user's buffered-mode opt-out.
          pruneTerminalHandlesFromLiveInput(liveHandles)
          defaultTerminalHandlesToLiveInput([...liveHandles])
          for (const handle of Array.from(terminalUnsubsRef.current.keys())) {
            if (!liveHandles.has(handle)) {
              unsubscribeTerminal(handle)
              terminalRefs.current.delete(handle)
              initializedHandlesRef.current.delete(handle)
              clearTerminalLiveInputDefault(handle)
              setTerminalKeyboardMetrics((prev) => {
                if (!prev.has(handle)) {
                  return prev
                }
                const next = new Map(prev)
                next.delete(handle)
                return next
              })
            }
          }
          lastKnownTerminalCountRef.current = result.terminals.length
          // Why: defense-in-depth dedupe. If the server ever returns a list
          // with the same handle twice (race during rename/split, or stale
          // process tracking), React would throw 'two children with same
          // key' on render. Keep the first occurrence — list order matters
          // for the tab strip, and createParams puts new tabs at the end.
          const seen = new Set<string>()
          const deduped = result.terminals.filter((t) => {
            if (seen.has(t.handle)) {
              return false
            }
            seen.add(t.handle)
            return true
          })

          const mergedTerminals = mergeTerminalListWithKnownRecords(
            deduped,
            terminalsRef.current,
            sessionTabsRef.current
          )
          setTerminals((prev) =>
            terminalRecordsEqual(prev, mergedTerminals) ? prev : mergedTerminals
          )
          terminalsRef.current = mergedTerminals

          // Session tabs are the UI authority. terminal.list only refreshes
          // per-handle metadata for existing ready terminal surfaces.
        }
      } catch {
        // Failed to list terminals
      } finally {
        fetchTerminalsInFlightRef.current = false
      }
    },
    [
      client,
      worktreeId,
      clearTerminalLiveInputDefault,
      defaultTerminalHandlesToLiveInput,
      pruneTerminalHandlesFromLiveInput,
      subscribeToTerminal,
      unsubscribeTerminal
    ]
  )

  const applySessionTabs = useMobileSessionTabSnapshot({
    store: sessionTabsStore,
    worktreeId,
    diagnosticsRef: terminalDiagnosticsRef,
    markdownDocsRef,
    terminalsRef,
    lastKnownTerminalCountRef,
    activeHandleRef,
    initializedHandlesRef,
    initialEmptySessionAutoCreateRef,
    setTerminals,
    setTerminalsLoaded,
    setActiveHandle,
    defaultTerminalHandlesToLiveInput,
    subscribeToTerminal,
    unsubscribeTerminal
  })

  const readFileTab = useCallback(
    async (tab: Extract<MobileSessionTab, { type: 'file' }>) => {
      if (!client) {
        return
      }
      setFileDocs((prev) => new Map(prev).set(tab.id, { status: 'loading' }))
      try {
        const doc = await resolveMobileFileTabDoc(client, {
          worktreeId,
          relativePath: tab.relativePath,
          diffSource: tab.diffSource
        })
        setFileDocs((prev) => new Map(prev).set(tab.id, doc))
      } catch (err) {
        const message = err instanceof Error ? err.message : ''
        const previewMessage =
          message === 'binary_file'
            ? translate('mobile.files.binaryPreviewUnavailable', 'Binary preview unavailable')
            : message === 'file_too_large'
              ? translate('mobile.files.previewTooLarge', 'File too large for mobile preview')
              : tab.diffSource === 'staged' || tab.diffSource === 'unstaged'
                ? translate('mobile.files.diffPreviewFailed', "Couldn't load diff preview")
                : translate('mobile.files.previewFailed', "Couldn't load file preview")
        setFileDocs((prev) =>
          new Map(prev).set(tab.id, {
            status: 'error',
            message: previewMessage
          })
        )
      }
    },
    [client, worktreeId]
  )

  const leaveSession = useCallback(() => {
    if (router.canGoBack()) {
      router.back()
      return
    }
    // Why: Android back can arrive when this session is the root route; using
    // replace avoids React Navigation's dev-only unhandled GO_BACK warning.
    router.replace(`/h/${hostId}`)
  }, [hostId, router])

  const requestLeaveSession = useCallback(() => {
    const dirtyDrafts = getDirtyMarkdownDrafts()
    if (dirtyDrafts.length === 0) {
      leaveSession()
      return
    }
    Keyboard.dismiss()
    setLeaveDrafts(dirtyDrafts)
  }, [getDirtyMarkdownDrafts, leaveSession])

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      requestLeaveSession()
      return true
    })
    return () => subscription.remove()
  }, [requestLeaveSession])

  const fetchSessionTabsInFlightRef = useRef(false)

  const fetchSessionTabs = useCallback(async () => {
    if (!client) {
      terminalDiagnosticsRef.current.tabsFetchSkipped('no-client')
      return
    }
    if (fetchSessionTabsInFlightRef.current) {
      terminalDiagnosticsRef.current.tabsFetchSkipped('already-in-flight')
      return
    }
    fetchSessionTabsInFlightRef.current = true
    terminalDiagnosticsRef.current.tabsFetchStarted(worktreeId)
    try {
      const response = await client.sendRequest('session.tabs.list', {
        worktree: `id:${worktreeId}`
      })
      if (!response.ok) {
        terminalDiagnosticsRef.current.tabsFetchFailed((response as RpcFailure).error.code)
        return
      }
      const result = (response as RpcSuccess).result as SessionTabsResult
      terminalDiagnosticsRef.current.tabsFetchSucceeded(result)
      applySessionTabs(result)
      // Focus a just-opened browser tab once it appears in the snapshot, via the
      // normal activate path so it sticks and the user can still switch away.
      const pendingPageId = pendingBrowserFocusPageIdRef.current
      if (pendingPageId) {
        const browserTab = result.tabs.find(
          (tab) => tab.type === 'browser' && tab.browserPageId === pendingPageId
        )
        if (browserTab) {
          pendingBrowserFocusPageIdRef.current = null
          switchSessionTabRef.current?.(browserTab)
        }
      }
    } catch (error) {
      terminalDiagnosticsRef.current.tabsFetchErrored(error)
      // Keep the last tab snapshot visible during reconnect/backoff.
    } finally {
      fetchSessionTabsInFlightRef.current = false
    }
  }, [applySessionTabs, client, worktreeId])

  useEffect(() => {
    if (connState === 'connected') {
      return
    }
    for (const queued of terminalGestureInputQueuesRef.current.values()) {
      if (queued.timer) {
        clearTimeout(queued.timer)
      }
    }
    terminalGestureInputQueuesRef.current.clear()
    terminalGestureInputInFlightRef.current.clear()
  }, [connState])

  // Why: deviceToken is read from host record so feature code can pass
  // `client.id` on subscribe/send for driver-state-machine identity.
  // The shared client itself stays alive across screens; we just need
  // the token alongside the client.
  useEffect(() => {
    if (!hostId) {
      return
    }
    let stale = false
    void loadHosts().then((hosts) => {
      if (stale) {
        return
      }
      const host = hosts.find((h) => h.id === hostId)
      if (host) {
        deviceTokenRef.current = host.deviceToken
        setHostEndpoint(host.endpoint)
      }
    })
    return () => {
      stale = true
    }
  }, [hostId])

  useEffect(() => {
    void loadCustomKeys().then(setCustomKeys)
  }, [])

  useFocusEffect(
    useCallback(() => {
      let stale = false
      void loadTerminalAccessoryLayout().then((layout) => {
        if (!stale) {
          setVisibleBuiltInIds(layout.visibleBuiltInIds)
        }
      })
      return () => {
        stale = true
      }
    }, [])
  )

  useEffect(() => {
    let mounted = true
    const refresh = () => {
      void loadTerminalAccessoryLayout().then((layout) => {
        if (mounted) {
          setVisibleBuiltInIds(layout.visibleBuiltInIds)
        }
      })
    }
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') {
        refresh()
      }
    })
    return () => {
      mounted = false
      sub.remove()
    }
  }, [])

  useMobileTerminalForegroundRecovery({
    connState,
    connStateRef,
    activeHandleRef,
    terminalRefs,
    initializedHandlesRef,
    scheduleDelayedAction,
    subscribeToTerminal,
    unsubscribeTerminal
  })

  // Why: viewport refits for layout changes outside the subscribe path
  // (tab strip toggling, fold/unfold, rotation) live in a dedicated hook —
  // see terminal-viewport-refit.ts for the full rationale.
  const { notifyTerminalFrameHeight, notifyKeyboardVisibility } = useTerminalViewportRefit({
    activeHandleRef,
    terminalRefs,
    terminalFrameHeightRef,
    viewportRef,
    viewportMeasuredRef,
    clientRef,
    deviceTokenRef,
    initializedHandlesRef,
    connState,
    tabStripVisible: terminals.length > 1,
    textScale: terminalTextScale,
    terminalFrameWidth,
    unsubscribeTerminal,
    subscribeToTerminal
  })

  useEffect(() => {
    const onShow = (e: KeyboardEvent) => {
      notifyKeyboardVisibility(true)
      setKeyboardHeight(e.endCoordinates?.height ?? 0)
    }
    const onHide = () => {
      notifyKeyboardVisibility(false)
      setKeyboardHeight(0)
    }
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const showSub = Keyboard.addListener(showEvent, onShow)
    const hideSub = Keyboard.addListener(hideEvent, onHide)
    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [notifyKeyboardVisibility])

  useEffect(() => {
    if (hostId && worktreeId) {
      void AsyncStorage.setItem(
        'yiru:last-visited-worktree',
        JSON.stringify({ hostId, worktreeId })
      )
    }
  }, [hostId, worktreeId])

  const handleDeleteCustomKey = useCallback(
    async (key: CustomKey) => {
      const updated = customKeys.filter((k) => k.id !== key.id)
      setCustomKeys(updated)
      await saveCustomKeys(updated)
    },
    [customKeys]
  )

  const handleManageShortcuts = useCallback(() => {
    setShowCustomKeyModal(false)
    router.push('/terminal-settings')
  }, [router])

  useEffect(() => {
    // Why: Expo can reuse this screen across worktrees. Reset pending
    // keyboard listeners, snapshot floors, and tombstones so prior route state
    // cannot open stale UI or reject the next worktree's first snapshot.
    sessionTabActionSheetRequestSeqRef.current += 1
    sessionTabActionSheetKeyboardHideSubRef.current?.remove()
    sessionTabActionSheetKeyboardHideSubRef.current = null
    clearTerminalCache()
    activeHandleRef.current = null
    resetSessionTabsForRoute()
    pendingBrowserFocusPageIdRef.current = null
    pendingTerminalActivationAttemptRef.current = null
    initialEmptySessionAutoCreateRef.current = null
    // Why: a stale terminal count makes fetchTerminals' consecutive-empty guard
    // swallow the next worktree's first legitimately-empty list.
    lastKnownTerminalCountRef.current = 0
    ptyModesRef.current.clear()
    initialModesSeenRef.current.clear()
    terminalGestureInputBucketsRef.current.clear()
    terminalDiagnosticsRef.current.resetRoute()
    for (const queued of terminalGestureInputQueuesRef.current.values()) {
      if (queued.timer) {
        clearTimeout(queued.timer)
      }
    }
    terminalGestureInputQueuesRef.current.clear()
    terminalGestureInputInFlightRef.current.clear()
    setActiveHandle(null)
    setTerminals([])
    terminalsRef.current = []
    clearPendingLiveInputCommit()
    setMarkdownDocs(new Map())
    setFileDocs(new Map())
    setDiffComments([])
    clearDelayedActionTimers()
    return () => {
      sessionTabActionSheetRequestSeqRef.current += 1
      sessionTabActionSheetKeyboardHideSubRef.current?.remove()
      clearPendingLiveInputCommit()
      clearDelayedActionTimers()
    }
  }, [
    clearDelayedActionTimers,
    clearPendingLiveInputCommit,
    clearTerminalCache,
    hostId,
    resetSessionTabsForRoute,
    worktreeId
  ])

  useEffect(() => {
    if (connState !== 'connected') {
      return
    }
    // Why: the RPC client auto-resends terminal.subscribe on reconnect.
    // Keep the current xterm visible while the binary snapshot hydrates,
    // instead of clearing to a blank "Loading terminals" surface.
    if (initializedHandlesRef.current.size === 0) {
      setTerminalsLoaded(false)
    }
    // Why: on reconnect the RPC client auto-resends terminal.subscribe and
    // the server sends a fresh scrollback frame. The subscribe handler drops
    // scrollback when initializedHandlesRef already contains the handle, so
    // we'd keep stale pre-disconnect content (and lose any output emitted
    // during the disconnect). Clear the flag so the fresh snapshot calls
    // ref.init(...) and replaces the buffer.
    initializedHandlesRef.current.clear()
    let disposed = false
    const timers: ReturnType<typeof setTimeout>[] = []
    function addTimer(fn: () => void, ms: number) {
      if (disposed) {
        return
      }
      timers.push(setTimeout(fn, ms))
    }
    void (async () => {
      const reportActivationOutcome = (response: RpcSuccess | null): void => {
        if (!disposed && response && headlessActivationNeedsHostRenderer(response.result)) {
          showToast(
            translate(
              'mobile.session.wakeAgents.openHost',
              'Open Yiru on the host to wake sleeping agents.'
            ),
            3000
          )
        }
      }
      if (client && created !== '1' && !isFloatingWorkspaceRoute) {
        // Why: mobile needs host-owned tabs hydrated for this route, but should
        // not pull other paired clients, especially desktop, into this worktree.
        void client
          .sendRequest('worktree.activate', {
            worktree: `id:${worktreeId}`,
            notifyClients: false
          })
          .then((response) => reportActivationOutcome(response.ok ? response : null))
          .catch(() => null)
      }
      if (disposed) {
        return
      }
      await fetchSessionTabs().catch(() => null)
      if (disposed) {
        return
      }
      await fetchTerminals({ allowEmptyLoaded: false })
      if (disposed) {
        return
      }
      addTimer(() => void fetchTerminals({ allowEmptyLoaded: false }), 750)
      addTimer(() => void fetchTerminals({ allowEmptyLoaded: true }), 1500)
      if (client && created === '1' && !isFloatingWorkspaceRoute) {
        addTimer(() => {
          if (activeHandleRef.current) {
            return
          }
          void (async () => {
            const activationResponse = await client
              .sendRequest('worktree.activate', {
                worktree: `id:${worktreeId}`,
                notifyClients: false
              })
              .catch(() => null)
            reportActivationOutcome(activationResponse?.ok ? activationResponse : null)
            if (disposed) {
              return
            }
            await fetchTerminals({ allowEmptyLoaded: true })
            addTimer(() => void fetchTerminals({ allowEmptyLoaded: true }), 750)
          })()
        }, 1800)
      }
    })()
    return () => {
      disposed = true
      for (const t of timers) {
        clearTimeout(t)
      }
    }
  }, [
    client,
    connState,
    created,
    fetchSessionTabs,
    fetchTerminals,
    isFloatingWorkspaceRoute,
    showToast,
    worktreeId
  ])

  useEffect(() => {
    if (!client || connState !== 'connected') {
      return
    }
    const unsubscribe = client.subscribe(
      'session.tabs.subscribe',
      { worktree: `id:${worktreeId}` },
      (payload) => {
        const event = payload as { type?: string } & SessionTabsResult
        if (event.type === 'snapshot' || event.type === 'updated') {
          applySessionTabs(event)
          const activeMarkdown = event.tabs.find(
            (tab): tab is Extract<MobileSessionTab, { type: 'markdown' }> =>
              tab.type === 'markdown' && tab.isActive
          )
          if (activeMarkdown?.isDirty) {
            markMarkdownTabStale(activeMarkdown.id)
          }
        }
      }
    )
    return () => unsubscribe()
  }, [applySessionTabs, client, connState, markMarkdownTabStale, worktreeId])

  useFocusEffect(
    useCallback(() => {
      if (connState !== 'connected') {
        return
      }
      void fetchSessionTabs()
      void fetchTerminals()
      // Why: the live tab subscription stays mounted for stream ownership,
      // but the fallback list poll should stop while this route is hidden.
      const interval = setInterval(() => {
        void fetchSessionTabs()
        void fetchTerminals()
      }, 2000)
      return () => clearInterval(interval)
    }, [connState, fetchSessionTabs, fetchTerminals])
  )

  // Why: pick up the Settings → Terminal text size when returning here — the
  // terminal panes stay mounted, so they update in place.
  useFocusEffect(
    useCallback(() => {
      let active = true
      void loadTerminalTextScale().then((scale) => {
        if (active) {
          setTerminalTextScale(scale)
        }
      })
      return () => {
        active = false
      }
    }, [])
  )

  // Why: pick up the Settings → Terminal autocomplete toggle when returning here.
  useFocusEffect(
    useCallback(() => {
      let active = true
      void loadTerminalAutocompleteEnabled().then((enabled) => {
        if (active) {
          setAutocompleteEnabled(enabled)
        }
      })
      return () => {
        active = false
      }
    }, [])
  )

  // Why: link routing is a phone-local choice; reload after Settings → Browser.
  useFocusEffect(
    useCallback(() => {
      let active = true
      void loadTerminalLinkOpenMode().then((mode) => {
        if (active) {
          setTerminalLinkOpenMode(mode)
        }
      })
      return () => {
        active = false
      }
    }, [])
  )

  // Why: unsubscribe the old terminal so the server restores its desktop dims
  // (clearing the phone-fit banner), then subscribe the new terminal with the
  // measured viewport so the server phone-fits it. Also call terminal.focus
  // so the desktop renderer follows the mobile user's active terminal.
  const switchTab = useCallback(
    (handle: string) => {
      triggerSelection()
      const matchingTab = sessionTabs.find(
        (tab): tab is Extract<MobileSessionTab, { type: 'terminal' }> =>
          tab.type === 'terminal' && tab.terminal === handle
      )
      terminalDiagnosticsRef.current.tabSwitch('terminal', matchingTab?.id ?? '', false, handle)
      pendingActiveSessionTabIdRef.current = matchingTab?.id ?? null
      pendingActiveTerminalHandleRef.current = handle
      activeSessionTabTypeRef.current = 'terminal'
      defaultTerminalHandlesToLiveInput([handle])
      setActiveSessionTabId(matchingTab?.id ?? null)
      const prev = activeHandleRef.current
      activeHandleRef.current = handle
      setActiveHandle(handle)
      if (prev && prev !== handle) {
        unsubscribeTerminal(prev)
        initializedHandlesRef.current.delete(prev)
      }
      // Force a fresh subscribe even if eagerly subscribed without viewport
      if (terminalUnsubsRef.current.has(handle)) {
        unsubscribeTerminal(handle)
        initializedHandlesRef.current.delete(handle)
      }
      subscribeToTerminal(handle)
      if (client) {
        void focusMobileTerminal(client, handle).catch(() => {})
        if (matchingTab) {
          // Why: persist selection for headless hosts; the snapshot gate keeps
          // this phone-local acknowledgement from impersonating desktop focus.
          void activateMobileSessionTab(client, {
            worktree: `id:${worktreeId}`,
            tabId: matchingTab.id,
            notifyClients: false
          }).catch(() => releasePendingTabSelection(matchingTab.id, handle))
        }
      }
    },
    [
      client,
      defaultTerminalHandlesToLiveInput,
      releasePendingTabSelection,
      sessionTabs,
      subscribeToTerminal,
      unsubscribeTerminal,
      worktreeId
    ]
  )

  const switchSessionTab = useCallback(
    (tab: MobileSessionTab) => {
      if (tab.type === 'terminal') {
        if (typeof tab.terminal === 'string') {
          switchTab(tab.terminal)
          return
        }
        terminalDiagnosticsRef.current.tabSwitch('terminal', tab.id, true)
        triggerSelection()
        pendingActiveSessionTabIdRef.current = tab.id
        pendingActiveTerminalHandleRef.current = null
        activeSessionTabTypeRef.current = 'terminal'
        setActiveSessionTabId(tab.id)
        const prev = activeHandleRef.current
        if (prev) {
          unsubscribeTerminal(prev)
          initializedHandlesRef.current.delete(prev)
        }
        activeHandleRef.current = null
        setActiveHandle(null)
        if (client) {
          void activateMobileSessionTab(client, {
            worktree: `id:${worktreeId}`,
            tabId: tab.id,
            notifyClients: false
          }).catch(() => releasePendingTabSelection(tab.id))
        }
        return
      }

      triggerSelection()
      terminalDiagnosticsRef.current.tabSwitch(tab.type, tab.id, false)
      pendingActiveSessionTabIdRef.current = tab.id
      pendingActiveTerminalHandleRef.current = null
      activeSessionTabTypeRef.current = tab.type
      setActiveSessionTabId(tab.id)
      const prev = activeHandleRef.current
      if (prev) {
        unsubscribeTerminal(prev)
        initializedHandlesRef.current.delete(prev)
      }
      activeHandleRef.current = null
      setActiveHandle(null)
      if (client) {
        void activateMobileSessionTab(client, {
          worktree: `id:${worktreeId}`,
          tabId: tab.id,
          notifyClients: false
        }).catch(() => releasePendingTabSelection(tab.id))
      }
      if (tab.type === 'browser') {
        return
      }
      if (tab.type === 'file') {
        void readFileTab(tab)
        return
      }
      const cached = markdownDocs.get(tab.id)
      if (cached?.status === 'ready' && cached.isDirty) {
        return
      }
      // Why: desktop clean saves do not carry a reliable content version in the
      // lightweight tab list. Re-read on revisit unless the phone has a draft.
      void readMarkdownTab(tab)
    },
    [
      client,
      markdownDocs,
      readFileTab,
      readMarkdownTab,
      releasePendingTabSelection,
      switchTab,
      unsubscribeTerminal,
      worktreeId
    ]
  )
  // Keep the ref pointing at the latest switchSessionTab so fetchSessionTabs can
  // activate a freshly-synced browser tab without a callback dependency cycle.
  switchSessionTabRef.current = switchSessionTab

  // Why: just store the ref. Subscription is deferred to handleTerminalWebReady
  // which fires after the WebView has loaded xterm.js and is ready to process
  // init messages. This prevents the blank terminal race where init() was
  // queued before the WebView loaded.
  const setTerminalWebViewRef = useCallback((handle: string, ref: TerminalWebViewHandle | null) => {
    terminalDiagnosticsRef.current.webViewRef(handle, ref != null)
    if (ref) {
      terminalRefs.current.set(handle, ref)
    } else {
      terminalRefs.current.delete(handle)
      terminalGestureInputBucketsRef.current.delete(handle)
      const queued = terminalGestureInputQueuesRef.current.get(handle)
      if (queued?.timer) {
        clearTimeout(queued.timer)
      }
      terminalGestureInputQueuesRef.current.delete(handle)
      terminalGestureInputInFlightRef.current.delete(handle)
    }
  }, [])

  const handleTerminalWebReady = useCallback(
    (handle: string) => {
      const wasAlreadyReady = webReadyHandlesRef.current.has(handle)
      webReadyHandlesRef.current.add(handle)
      notifyTerminalWebReady(handle, wasAlreadyReady)
      terminalDiagnosticsRef.current.webViewReady(
        handle,
        wasAlreadyReady,
        handle === activeHandleRef.current
      )
      if (wasAlreadyReady && initializedHandlesRef.current.has(handle)) {
        // Why: the native WebView reloaded (Metro hot reload or Android
        // process churn). The old xterm buffer is gone, so force a fresh
        // scrollback snapshot. Only resubscribe if this is a reload — on
        // first load the subscription is already running and pendingMessages
        // will flush the queued init after this callback returns.
        // (unsubscribeTerminal also clears layoutSeqRef for this handle.)
        unsubscribeTerminal(handle)
        initializedHandlesRef.current.delete(handle)
        if (handle === activeHandleRef.current) {
          subscribeToTerminal(handle)
        }
        return
      }
      // Why: on first web-ready, the initial subscribeToTerminal call from
      // fetchTerminals may have been skipped (reason=no-ref, WebView wasn't
      // mounted yet). Now that the WebView is ready, subscribe if this is the
      // active terminal and no subscription is running. Await measure before
      // subscribe so the very first subscribe carries the viewport — without
      // this, subscribe(viewport=null) lands on the server first and the
      // post-scrollback measure path's resubscribe sees alreadyMeasured=true
      // (because measureViewportOnce won the race) and silently skips.
      // Why: a just-created tab can briefly lose activeHandleRef to a lagging
      // session-tab snapshot; honor the pending marker so its one web-ready
      // subscribe still fires (see handleCreateTerminal).
      const isIntendedActive = () =>
        handle === activeHandleRef.current || handle === pendingActiveTerminalHandleRef.current
      if (isIntendedActive() && !terminalUnsubsRef.current.has(handle)) {
        void (async () => {
          await measureViewportOnce(handle)
          if (isIntendedActive() && !terminalUnsubsRef.current.has(handle)) {
            subscribeToTerminal(handle)
          }
        })()
      }
    },
    [measureViewportOnce, notifyTerminalWebReady, subscribeToTerminal, unsubscribeTerminal]
  )

  useEffect(() => {
    if (activeSessionTab?.type !== 'markdown') {
      return
    }
    const doc = markdownDocs.get(activeSessionTab.id)
    if (!doc) {
      void readMarkdownTab(activeSessionTab)
    }
  }, [activeSessionTab, markdownDocs, readMarkdownTab])

  useEffect(() => {
    if (activeSessionTab?.type !== 'file') {
      return
    }
    const doc = fileDocs.get(activeSessionTab.id)
    if (!doc) {
      void readFileTab(activeSessionTab)
    }
  }, [activeSessionTab, fileDocs, readFileTab])

  async function handleSend() {
    if (!client || !activeHandle || sendingRef.current) {
      return
    }
    sendingRef.current = true

    const text = normalizeTerminalTextInput(input)
    setInput('')

    try {
      const outcome = await sendMobileBufferedTerminalInput({
        client,
        terminal: activeHandle,
        text,
        deviceToken: deviceTokenRef.current
      })
      // Why: restoring an unknown, possibly delivered command invites duplicate retries.
      if (outcome === 'rejected' && activeHandleRef.current === activeHandle) {
        setInput(text)
      }
    } finally {
      sendingRef.current = false
    }
  }

  async function handleAccessoryKey(input: ReturnType<typeof createTerminalLiveAccessoryInput>) {
    if (!client || !activeHandle || !canSend) {
      return
    }
    const targetHandle = activeHandle
    const accessoryCommit = await handleLiveInputAccessoryBytes(input)
    if (accessoryCommit.kind !== 'allow-raw') {
      return
    }
    const currentClient = clientRef.current
    // Why: async IME flushing can outlive the original terminal selection.
    const rawSendTarget = getTerminalLiveAccessoryRawSendTarget({
      targetHandle,
      activeHandle: activeHandleRef.current,
      activeSessionTabType: activeSessionTabTypeRef.current
    })
    if (!currentClient || !rawSendTarget || connStateRef.current !== 'connected') {
      return
    }
    await currentClient
      .sendRequest('terminal.send', {
        terminal: rawSendTarget,
        text: input.bytes,
        enter: false,
        ...(deviceTokenRef.current
          ? { client: { id: deviceTokenRef.current, type: 'mobile' as const } }
          : {})
      })
      .then(
        () => undefined,
        () => undefined
      )
  }
  controlModeSenderRef.current = (bytes) => {
    void handleAccessoryKey({ bytes })
  }
  const sendLiveTerminalInput = useCallback(
    async (handle: string, bytes: string): Promise<boolean> => {
      const text = normalizeTerminalTextInput(bytes)
      if (text.length === 0) {
        return false
      }
      if (!isTerminalLiveInputWithinByteLimit(text)) {
        triggerError()
        showToast(
          translate('mobile.session.terminal.inputTooLarge', 'Input too large (max 256 KiB)'),
          1500
        )
        return false
      }
      const rpc = clientRef.current
      // Why: callers suppress follow-up controls/toasts when this live send is stale.
      if (
        !rpc ||
        connStateRef.current !== 'connected' ||
        handle !== activeHandleRef.current ||
        activeSessionTabTypeRef.current !== 'terminal'
      ) {
        return false
      }
      return rpc
        .sendRequest('terminal.send', {
          terminal: handle,
          text,
          enter: false,
          ...(deviceTokenRef.current
            ? { client: { id: deviceTokenRef.current, type: 'mobile' as const } }
            : {})
        })
        .then(isTerminalSendRpcAccepted, () => false)
    },
    [showToast]
  )
  sendLiveTerminalInputRef.current = sendLiveTerminalInput

  const focusLiveInput = useCallback(() => {
    if (!canSend || !liveInputEnabled) {
      return
    }
    focusTerminalLiveInputTarget(liveInputRef.current, {
      keyboardHeight,
      refocus: () =>
        scheduleTerminalLiveInputFocus(liveInputFocusTimerRef, () => liveInputRef.current?.focus())
    })
  }, [canSend, keyboardHeight, liveInputEnabled])

  const clearSessionTabActionSheetKeyboardListener = useCallback(() => {
    sessionTabActionSheetKeyboardHideSubRef.current?.remove()
    sessionTabActionSheetKeyboardHideSubRef.current = null
  }, [])

  const openSessionTabActionSheet = useCallback((tab: MobileSessionTab) => {
    if (tab.type === 'terminal') {
      if (typeof tab.terminal !== 'string') {
        return
      }
      setActionTarget({
        handle: tab.terminal,
        title: tab.title,
        isActive: tab.terminal === activeHandleRef.current
      })
    } else if (tab.type === 'markdown') {
      setMarkdownActionTarget(tab)
    } else if (tab.type === 'file') {
      setFileActionTarget(tab)
    } else {
      setBrowserActionTarget(tab)
    }
  }, [])

  const openSessionTabActionSheetAfterKeyboardDismiss = useCallback(
    (tab: MobileSessionTab) => {
      // Why: live input can have a queued refocus; action sheets should open after
      // the terminal keyboard is gone, not race it under the drawer.
      sessionTabActionSheetRequestSeqRef.current += 1
      const requestSeq = sessionTabActionSheetRequestSeqRef.current
      clearSessionTabActionSheetKeyboardListener()
      let didOpen = false
      const openAfterDismiss = () => {
        if (didOpen || requestSeq !== sessionTabActionSheetRequestSeqRef.current) {
          return
        }
        didOpen = true
        clearSessionTabActionSheetKeyboardListener()
        openSessionTabActionSheet(tab)
      }

      clearTerminalLiveInputFocusTimer(liveInputFocusTimerRef)

      if (keyboardHeight <= 0) {
        liveInputRef.current?.blur()
        Keyboard.dismiss()
        openAfterDismiss()
        return
      }

      sessionTabActionSheetKeyboardHideSubRef.current = Keyboard.addListener(
        'keyboardDidHide',
        openAfterDismiss
      )
      liveInputRef.current?.blur()
      Keyboard.dismiss()
      scheduleDelayedAction(openAfterDismiss, TERMINAL_KEYBOARD_DISMISS_ACTION_SHEET_FALLBACK_MS)
    },
    [
      clearSessionTabActionSheetKeyboardListener,
      keyboardHeight,
      openSessionTabActionSheet,
      scheduleDelayedAction
    ]
  )

  const handleTerminalTap = useCallback(
    (handle: string) => {
      if (handle !== activeHandleRef.current) {
        return
      }
      focusLiveInput()
    },
    [focusLiveInput]
  )

  // Tap on a file path in terminal output → resolve it on the host and open it
  // as a file tab (mirrors desktop Cmd/Ctrl-click). Silent on a miss; the
  // WebView only emits this when the tap landed on a detected path.
  const handleFileTapActivationSeqRef = useRef(0)
  const handleFileTap = useCallback(
    (handle: string, pathText: string, line: number | null, column: number | null) => {
      if (handle !== activeHandleRef.current || !client) {
        return
      }
      const activationSeq = ++handleFileTapActivationSeqRef.current
      openMobileTerminalFileTap<MobileSessionTab>({
        client,
        hostId,
        worktreeId,
        worktreeName: routeWorktreeName,
        terminalHandle: handle,
        pathText,
        cwd: terminalCwdRef.current.get(handle) ?? null,
        line,
        column,
        pushPreviewRoute: (href) => router.push(href),
        openBrowser: (url) => void handleCreateBrowserRef.current?.(url),
        triggerOpenFeedback: triggerSelection,
        fetchSessionTabs,
        getSessionTabs: () => sessionTabsRef.current,
        getActiveSessionTabId: () => activeSessionTabIdRef.current,
        getActivationState: (activated) => ({
          activated,
          activationSeq,
          latestActivationSeq: handleFileTapActivationSeqRef.current,
          sourceTerminalHandle: handle,
          activeTerminalHandle: activeHandleRef.current,
          activeTabType: activeSessionTabTypeRef.current
        }),
        switchSessionTab: (tab) => switchSessionTabRef.current?.(tab),
        scheduleDelayedAction
      })
    },
    [client, fetchSessionTabs, hostId, routeWorktreeName, router, scheduleDelayedAction, worktreeId]
  )

  const handleOpenedFileDiffActivationSeqRef = useRef(0)
  // Active tab captured at tap time (before the openDiff RPC). Capturing it when
  // the diff finishes opening would misread a tab the user switched to mid-RPC
  // as the tap-time tab, letting the retry steal focus back to the diff.
  const fileOpenStartActiveTabIdRef = useRef<string | null>(null)
  const handleFileOpenStart = useCallback(() => {
    fileOpenStartActiveTabIdRef.current = activeSessionTabIdRef.current
  }, [])
  const handleOpenedFileDiff = useCallback(
    (relativePath: string) => {
      const activationSeq = ++handleOpenedFileDiffActivationSeqRef.current
      const activeTabIdAtTap = fileOpenStartActiveTabIdRef.current

      let activated = false
      const activateOpenedTab = async (): Promise<void> => {
        // Route matching through the shared helper so the deterministic repro
        // test exercises the same logic production runs.
        const settled = await activateOpenedSourceControlDiffTab<MobileSessionTab>({
          relativePath,
          activeTabIdAtTap,
          fetchSessionTabs,
          getTabs: () => sessionTabsRef.current,
          getActiveTabId: () => activeSessionTabIdRef.current,
          getActivationState: () => ({
            activated,
            activationSeq,
            latestActivationSeq: handleOpenedFileDiffActivationSeqRef.current
          }),
          switchSessionTab: (tab) => switchSessionTabRef.current?.(tab)
        })
        if (settled) {
          activated = true
        }
      }

      scheduleDelayedAction(() => void activateOpenedTab(), 300)
      scheduleDelayedAction(() => void activateOpenedTab(), 900)
      scheduleDelayedAction(() => void activateOpenedTab(), 1800)
    },
    [fetchSessionTabs, scheduleDelayedAction]
  )

  const handleTerminalOpenUrl = useCallback(
    (handle: string, url: string) => {
      if (handle !== activeHandleRef.current) {
        return
      }
      // Why: host browser creation resolves a real worktree; floating URL taps stay phone-local.
      if (terminalLinkOpenMode === 'phone-browser' || isFloatingWorkspaceRoute) {
        void Linking.openURL(url).catch(() => {})
        return
      }
      void handleCreateBrowserRef.current?.(url)
    },
    [isFloatingWorkspaceRoute, terminalLinkOpenMode]
  )

  const toggleLiveInput = useCallback(() => {
    if (!activeHandle) {
      return
    }
    const nextEnabled = toggleTerminalLiveInput(activeHandle)
    if (!nextEnabled) {
      resetControlMode()
    }
    clearPendingLiveInputCommit()
    if (nextEnabled) {
      scheduleTerminalLiveInputFocus(liveInputFocusTimerRef, () => liveInputRef.current?.focus())
    } else {
      clearTerminalLiveInputFocusTimer(liveInputFocusTimerRef)
      liveInputRef.current?.blur()
    }
  }, [activeHandle, clearPendingLiveInputCommit, resetControlMode, toggleTerminalLiveInput])

  const allowTerminalGestureInput = useCallback(
    (handle: string, sequenceCount: number): boolean => {
      const now = Date.now()
      const current = terminalGestureInputBucketsRef.current.get(handle) ?? {
        tokens: TERMINAL_GESTURE_INPUT_BUCKET_CAPACITY,
        lastRefillMs: now
      }
      const elapsedSeconds = Math.max(0, now - current.lastRefillMs) / 1000
      const tokens = Math.min(
        TERMINAL_GESTURE_INPUT_BUCKET_CAPACITY,
        current.tokens + elapsedSeconds * TERMINAL_GESTURE_INPUT_REFILL_PER_SECOND
      )

      // Why: tokens represent terminal control sequences, not WebView messages;
      // one legitimate gesture message may batch up to 32 wheel/key reports.
      if (tokens < sequenceCount) {
        terminalGestureInputBucketsRef.current.set(handle, { tokens, lastRefillMs: now })
        return false
      }

      terminalGestureInputBucketsRef.current.set(handle, {
        tokens: tokens - sequenceCount,
        lastRefillMs: now
      })
      return true
    },
    []
  )

  const flushTerminalGestureInput = useCallback(async (handle: string) => {
    const queued = terminalGestureInputQueuesRef.current.get(handle)
    if (!queued) {
      return
    }
    if (queued.timer) {
      clearTimeout(queued.timer)
      queued.timer = null
    }
    if (terminalGestureInputInFlightRef.current.has(handle)) {
      return
    }

    terminalGestureInputQueuesRef.current.delete(handle)
    const isActive =
      handle === activeHandleRef.current && activeSessionTabTypeRef.current === 'terminal'
    const isFresh = Date.now() - queued.lastUpdatedMs <= TERMINAL_GESTURE_INPUT_MAX_QUEUE_AGE_MS
    const rpc = clientRef.current
    if (!rpc || connStateRef.current !== 'connected' || !isActive || !isFresh) {
      return
    }

    terminalGestureInputInFlightRef.current.add(handle)
    try {
      await rpc.sendRequest('terminal.send', {
        terminal: handle,
        text: queued.bytes,
        enter: false,
        ...(deviceTokenRef.current
          ? { client: { id: deviceTokenRef.current, type: 'mobile' as const } }
          : {})
      })
    } catch {
      // Transient failure
    } finally {
      terminalGestureInputInFlightRef.current.delete(handle)
      const next = terminalGestureInputQueuesRef.current.get(handle)
      if (next) {
        if (Date.now() - next.lastUpdatedMs > TERMINAL_GESTURE_INPUT_MAX_QUEUE_AGE_MS) {
          if (next.timer) {
            clearTimeout(next.timer)
          }
          terminalGestureInputQueuesRef.current.delete(handle)
        } else {
          void flushTerminalGestureInput(handle)
        }
      }
    }
  }, [])

  const enqueueTerminalGestureInput = useCallback(
    (handle: string, bytes: string, sequenceCount: number) => {
      const now = Date.now()
      const current = terminalGestureInputQueuesRef.current.get(handle)
      if (
        current &&
        current.sequenceCount + sequenceCount <= TERMINAL_GESTURE_INPUT_MAX_PENDING_SEQUENCES
      ) {
        current.bytes += bytes
        current.sequenceCount += sequenceCount
        current.lastUpdatedMs = now
        return
      }

      if (current) {
        if (current.timer) {
          clearTimeout(current.timer)
        }
        if (!terminalGestureInputInFlightRef.current.has(handle)) {
          void flushTerminalGestureInput(handle)
        } else {
          // Why: an RPC is in-flight and the new batch would overflow the
          // pending-sequences cap. Appending preserves the already-queued
          // bytes (which would otherwise be dropped) — the in-flight flush's
          // finally block will pick up the merged queue. The cap is a soft
          // guideline; brief overflow during in-flight is preferable to
          // silently dropping user input.
          current.bytes += bytes
          current.sequenceCount += sequenceCount
          current.lastUpdatedMs = now
          current.timer = setTimeout(() => {
            current.timer = null
            void flushTerminalGestureInput(handle)
          }, TERMINAL_GESTURE_INPUT_FLUSH_DELAY_MS)
          return
        }
      }

      const queued: TerminalGestureInputQueue = {
        bytes,
        sequenceCount,
        timer: null,
        lastUpdatedMs: now
      }
      queued.timer = setTimeout(() => {
        queued.timer = null
        void flushTerminalGestureInput(handle)
      }, TERMINAL_GESTURE_INPUT_FLUSH_DELAY_MS)
      terminalGestureInputQueuesRef.current.set(handle, queued)
    },
    [flushTerminalGestureInput]
  )

  const handleTerminalInput = useCallback(
    async (handle: string, bytes: string) => {
      if (!client || connState !== 'connected' || bytes.length === 0) {
        return
      }
      if (handle !== activeHandleRef.current || activeSessionTabTypeRef.current !== 'terminal') {
        return
      }
      const modes = ptyModesRef.current.get(handle)
      // Why: WebView gesture bytes can become PTY input here, so mouse-aware
      // reports stay behind validation and SSH-safe rate limiting.
      if (!modes?.altScreen && !isGestureMouseTrackingMode(modes?.mouseTrackingMode)) {
        return
      }
      const sequenceCount = countTerminalGestureInputSequences(bytes)
      if (sequenceCount == null) {
        return
      }
      if (!allowTerminalGestureInput(handle, sequenceCount)) {
        return
      }
      enqueueTerminalGestureInput(handle, bytes, sequenceCount)
    },
    [allowTerminalGestureInput, client, connState, enqueueTerminalGestureInput]
  )

  const handleTerminalQueryReply = useCallback((handle: string, bytes: string) => {
    void sendMobileTerminalQueryReply({
      bytes,
      client: clientRef.current,
      clientId: deviceTokenRef.current,
      connected: connStateRef.current === 'connected',
      handle,
      hostSupportsQueryReplyInput: hostQueryReplyInputSupportedRef.current,
      subscribedTerminals: terminalUnsubsRef.current
    })
  }, [])

  async function handleClearTerminal(target: Terminal) {
    if (!client) {
      return
    }
    getTerminalRef(target.handle)?.clear()
    try {
      await client.sendRequest('terminal.clearBuffer', {
        terminal: target.handle
      })
      showToast(translate('mobile.session.terminal.cleared', 'Terminal cleared'))
    } catch {
      showToast(translate('mobile.session.terminal.clearFailed', "Couldn't clear terminal"), 1500)
    }
  }

  // Why: press-and-hold key repeat for keys flagged repeatable (arrows,
  // backspace, forward-delete). Matches iOS keyboard cadence: instant first
  // fire, then ~400ms before the second, then ~45ms between subsequent
  // repeats. Non-repeatable keys (Tab, Esc, Ctrl-*) intentionally fire once
  // because holding them is destructive or meaningless.
  const repeatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const repeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Why: hold the latest handleAccessoryKey in a ref so the repeat interval
  // always invokes the current callback. Otherwise a held key keeps firing
  // through the callback captured when the interval started, which can route
  // bytes to a stale terminal/RPC client after a tab switch or reconnect
  // mid-hold.
  const handleAccessoryKeyRef = useRef(handleAccessoryKey)
  handleAccessoryKeyRef.current = handleAccessoryKey
  const stopAccessoryRepeat = useCallback(() => {
    if (repeatTimeoutRef.current) {
      clearTimeout(repeatTimeoutRef.current)
      repeatTimeoutRef.current = null
    }
    if (repeatIntervalRef.current) {
      clearInterval(repeatIntervalRef.current)
      repeatIntervalRef.current = null
    }
  }, [])
  const startAccessoryRepeat = useCallback(
    (input: ReturnType<typeof createTerminalLiveAccessoryInput>) => {
      stopAccessoryRepeat()
      repeatTimeoutRef.current = setTimeout(() => {
        repeatIntervalRef.current = setInterval(() => {
          void handleAccessoryKeyRef.current(input)
        }, 45)
      }, 400)
    },
    [stopAccessoryRepeat]
  )
  const setMobileSessionRootRef = useCallback(
    (node: View | null): void => {
      if (node !== null) {
        return
      }
      // Why: terminal subscriptions and route-level timers must clear only on
      // real route detach; client churn during mount can otherwise wipe xterm
      // state mid-subscribe.
      toastSeqRef.current += 1
      clearTerminalCache()
      clearToastHideTimer()
      clearDelayedActionTimers()
      clearTerminalLiveInputFocusTimer(liveInputFocusTimerRef)
      clearPendingLiveInputCommit()
      sessionTabActionSheetRequestSeqRef.current += 1
      clearSessionTabActionSheetKeyboardListener()
      stopAccessoryRepeat()
    },
    [
      clearPendingLiveInputCommit,
      clearDelayedActionTimers,
      clearSessionTabActionSheetKeyboardListener,
      clearTerminalCache,
      clearToastHideTimer,
      stopAccessoryRepeat
    ]
  )

  const handleSelectionMode = useCallback((handle: string, active: boolean) => {
    if (handle !== activeHandleRef.current) {
      return
    }
    setSelectModeActive(active)
    if (active) {
      Keyboard.dismiss()
    }
  }, [])

  const handleSelectionCopy = useCallback(
    async (handle: string, text: string) => {
      if (handle !== activeHandleRef.current) {
        return
      }
      if (!text || text.length === 0) {
        terminalRefs.current.get(handle)?.cancelSelect()
        return
      }
      try {
        await Clipboard.setStringAsync(text)
        triggerSuccess()
        // Why: Android 13+ shows its own system "Copied to clipboard" toast on
        // every clipboard write, so our toast would be redundant; iOS shows
        // nothing on copy (it only banners on paste), so the in-app toast is
        // the only success signal there.
        if (Platform.OS === 'ios') {
          showToast(translate('mobile.common.copied', 'Copied'))
        }
        terminalRefs.current.get(handle)?.cancelSelect()
      } catch (e) {
        triggerError()
        const err = e as { name?: string; message?: string }
        // eslint-disable-next-line no-console
        console.warn('[mobile-clip] setString failed', {
          name: err.name,
          message: err.message
        })
        showToast(translate('mobile.common.copyFailed', "Couldn't copy"), 1500)
      }
    },
    [showToast]
  )

  const handleSelectionEvicted = useCallback(
    (handle: string) => {
      if (handle !== activeHandleRef.current) {
        return
      }
      // eslint-disable-next-line no-console
      console.warn('[mobile-clip] selection evicted')
      showToast(
        translate(
          'mobile.session.terminal.selectionEvicted',
          'Selection cleared (scrolled out of buffer)'
        ),
        1500
      )
      setSelectModeActive(false)
    },
    [showToast]
  )

  const handleModesChanged = useCallback((handle: string, modes: TerminalModes) => {
    ptyModesRef.current.set(handle, modes)
    initialModesSeenRef.current.add(handle)
  }, [])

  const handleKeyboardAvoidanceMetrics = useCallback(
    (handle: string, metrics: TerminalKeyboardAvoidanceMetrics) => {
      setTerminalKeyboardMetrics((prev) => {
        const current = prev.get(handle)
        if (
          current &&
          current.cursorY === metrics.cursorY &&
          current.rows === metrics.rows &&
          current.altScreen === metrics.altScreen
        ) {
          return prev
        }
        return new Map(prev).set(handle, metrics)
      })
    },
    []
  )

  const handleHaptic = useCallback((kind: 'selection' | 'success' | 'error' | 'edge-bump') => {
    if (kind === 'selection') {
      triggerSelection()
    } else if (kind === 'success') {
      triggerSuccess()
    } else if (kind === 'error') {
      triggerError()
    } else if (kind === 'edge-bump') {
      triggerEdgeBump()
    }
  }, [])

  const refreshCanPaste = useCallback(() => {
    void Promise.all([
      Clipboard.hasStringAsync().catch(() => false),
      Clipboard.hasImageAsync().catch(() => false)
    ]).then(([hasString, hasImage]) => {
      setCanPaste(hasString || hasImage)
    })
  }, [])

  const handlePaste = useMobileTerminalPaste({
    client,
    activeHandle,
    activeHandleRef,
    activeSessionTabTypeRef,
    canSend,
    connState,
    connStateRef,
    clientRef,
    deviceTokenRef,
    flushPendingLiveInputBeforeExternalSend,
    onError: triggerError,
    onSuccess: triggerSelection,
    ptyModesRef,
    refreshCanPaste,
    showToast
  })

  const flushPendingLiveInputBeforeAttachmentSend = useMobileAttachmentInputLeaseGate({
    flushPendingLiveInputBeforeExternalSend,
    connStateRef,
    activeHandleRef,
    activeSessionTabTypeRef,
    nativeChatInputLeaseReadyRef,
    showToast
  })

  const { attachImage, isAttaching } = useMobileImageAttachment({
    client,
    activeHandle,
    canSend,
    connState,
    deviceTokenRef,
    beforeTerminalSend: flushPendingLiveInputBeforeAttachmentSend,
    showToast,
    onSuccess: triggerSelection,
    onError: triggerError
  })

  // Why: refresh canPaste on mount, AppState active, after paste.
  useEffect(() => {
    let mounted = true
    const refresh = () => {
      void Promise.all([
        Clipboard.hasStringAsync().catch(() => false),
        Clipboard.hasImageAsync().catch(() => false)
      ]).then(([hasString, hasImage]) => {
        if (mounted) {
          setCanPaste(hasString || hasImage)
        }
      })
    }
    refresh()
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') {
        refresh()
      } else if (selectModeActive && activeHandleRef.current) {
        terminalRefs.current.get(activeHandleRef.current)?.cancelSelect()
      }
    })
    return () => {
      mounted = false
      sub.remove()
    }
  }, [selectModeActive])

  useEffect(() => {
    const shouldLoadAgentOptions = showCreateTabDrawer || pendingDiffNotesDelivery !== null
    if (!shouldLoadAgentOptions) {
      setCreateTabAgentLoadState('idle')
      setCreateTabAgentOptions([])
      return
    }
    if (!client || connState !== 'connected') {
      setCreateTabAgentLoadState('idle')
      setCreateTabAgentOptions([])
      return
    }

    let stale = false
    setCreateTabAgentLoadState('loading')
    setCreateTabAgentOptions([])

    void (async () => {
      const options = await loadMobileNewTabAgentOptions({ client, worktreeId })
      if (stale) {
        return
      }
      setCreateTabAgentOptions(options)
      setCreateTabAgentLoadState('loaded')
    })().catch(() => {
      if (!stale) {
        setCreateTabAgentOptions([])
        setCreateTabAgentLoadState('error')
      }
    })

    return () => {
      stale = true
    }
  }, [client, connState, pendingDiffNotesDelivery, showCreateTabDrawer, worktreeId])

  async function handleCreateTerminal(
    agent?: MobileNewTabAgentOption['agent'],
    options?: MobileQuickCommandLaunch['options'] & {
      onPromptSent?: () => void
      errorToast?: string
    }
  ) {
    if (!client || creatingTerminalRef.current) {
      return
    }
    creatingTerminalRef.current = true

    setCreating(true)
    setCreateError('')

    // Why: idempotency key so a transport-level retry (reconnect replay) of this
    // create resolves to the same terminal instead of spawning a duplicate. Kept
    // compact (no worktree id) to stay under the schema's length cap; the ref
    // guard above blocks concurrent taps synchronously.
    const clientMutationId = `mobile-create:${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 10)}`

    try {
      const response = await client.sendRequest('session.tabs.createTerminal', {
        worktree: `id:${worktreeId}`,
        afterTabId: activeSessionTabId ?? undefined,
        clientMutationId,
        ...(options?.startupCommand ? { command: options.startupCommand } : {}),
        ...(options?.startupCommandDelivery
          ? { startupCommandDelivery: options.startupCommandDelivery }
          : {}),
        ...(options?.agentPrompt ? { agentPrompt: options.agentPrompt } : {}),
        ...(agent ? { agent } : {})
      })
      if (response.ok) {
        const result = (response as RpcSuccess).result as TerminalCreateResult
        const created = result.tab
        // Why: unsubscribe the old active terminal so the server restores its
        // desktop dims. Without this, the old terminal's mobile subscription
        // stays alive and its restore timer is never set.
        const prev = activeHandleRef.current
        if (prev) {
          unsubscribeTerminal(prev)
          initializedHandlesRef.current.delete(prev)
        }
        pendingActiveSessionTabIdRef.current = created.id
        activeSessionTabTypeRef.current = 'terminal'
        setActiveSessionTabId(created.id)
        setSessionTabs((prev) => {
          if (prev.some((tab) => tab.id === created.id)) {
            return prev
          }
          return [...prev, { ...created, isActive: true }]
        })
        if (typeof created.terminal === 'string') {
          const createdHandle = created.terminal
          defaultTerminalHandlesToLiveInput([createdHandle])
          // Why: session-tab snapshots can lag the create RPC. Without the
          // handle marker, applySessionTabs snaps activeHandleRef back to the
          // previous terminal, and the new pane's web-ready subscribe (gated
          // on the active handle) is skipped — blank tab until a manual switch.
          pendingActiveTerminalHandleRef.current = createdHandle
          activeHandleRef.current = createdHandle
          setActiveHandle(createdHandle)
          setTerminals((prev) => {
            const existing = prev.find((terminal) => terminal.handle === createdHandle)
            const createdTerminal: Terminal = {
              handle: createdHandle,
              title:
                created.title ||
                existing?.title ||
                translate('mobile.terminal.defaultTitle', 'Terminal'),
              terminalTheme: created.terminalTheme ?? existing?.terminalTheme,
              isActive: true
            }
            if (existing) {
              const next = prev.map((terminal) =>
                terminal.handle === createdHandle ? { ...terminal, ...createdTerminal } : terminal
              )
              terminalsRef.current = next
              return terminalRecordsEqual(prev, next) ? prev : next
            }
            const next = [...prev, createdTerminal]
            terminalsRef.current = next
            return next
          })
          subscribeToTerminal(createdHandle)
          if (options?.initialPrompt?.trim()) {
            void client
              .sendRequest('terminal.send', {
                terminal: createdHandle,
                text: options.initialPrompt,
                enter: options.enter !== false,
                ...(deviceTokenRef.current
                  ? { client: { id: deviceTokenRef.current, type: 'mobile' as const } }
                  : {})
              })
              .then((sendResponse) => {
                if (!sendResponse.ok) {
                  throw new Error(
                    (sendResponse as RpcFailure).error.message ||
                      translate('mobile.terminal.sendNotesFailed', 'Failed to send notes')
                  )
                }
                const result = (sendResponse as RpcSuccess).result as {
                  send?: { accepted?: boolean }
                }
                if (result.send?.accepted === false) {
                  throw new Error(
                    translate(
                      'mobile.terminal.inputLocked',
                      'Terminal input is locked by another client.'
                    )
                  )
                }
                triggerSuccess()
                showToast(
                  options.successToast ?? translate('mobile.terminal.notesSent', 'Notes sent')
                )
                options.onPromptSent?.()
              })
              .catch((err) => {
                triggerError()
                showToast(
                  options.errorToast ??
                    (err instanceof Error
                      ? err.message
                      : translate('mobile.terminal.sendNotesError', "Couldn't send notes")),
                  1800
                )
              })
          } else if (options?.successToast) {
            triggerSuccess()
            showToast(options.successToast)
          }
        } else {
          // Why: a prior pending handle must not outlive a create that returned
          // no terminal; web-ready subscribe gates on this ref as active.
          pendingActiveTerminalHandleRef.current = null
          activeHandleRef.current = null
          setActiveHandle(null)
        }
        scheduleDelayedAction(() => void fetchSessionTabs(), 500)
      } else {
        const message =
          options?.errorToast ??
          translate('mobile.terminal.createFailed', 'Failed to create terminal')
        setCreateError(message)
        if (options?.errorToast) {
          triggerError()
          showToast(message, 1800)
        }
      }
    } catch {
      const message =
        options?.errorToast ??
        translate('mobile.terminal.createFailed', 'Failed to create terminal')
      setCreateError(message)
      if (options?.errorToast) {
        triggerError()
        showToast(message, 1800)
      }
    } finally {
      creatingTerminalRef.current = false
      setCreating(false)
    }
  }

  // Why: Quick Commands mirror desktop by spawning a fresh terminal; runnable
  // content uses host-built shell-ready delivery while insert-only text stays a draft.
  function launchQuickCommand(command: TerminalQuickCommand): boolean {
    if (
      !client ||
      connState !== 'connected' ||
      creatingTerminalRef.current ||
      creatingBrowser ||
      creatingMarkdown
    ) {
      return false
    }
    const launch = buildMobileQuickCommandLaunch(command)
    if (!launch) {
      triggerError()
      showToast(
        translate(
          'mobile.session.quickCommands.editBeforeRunning',
          'Edit this quick command before running it'
        ),
        1800
      )
      return false
    }
    const label =
      command.label.trim() || translate('mobile.quickCommand.defaultLabel', 'Quick command')
    void handleCreateTerminal(launch.agent, {
      ...launch.options,
      errorToast: translate('mobile.quickCommand.runFailed', "Couldn't run {{label}}", { label })
    })
    return true
  }

  async function handleCreateMarkdownNote() {
    if (!client || creatingMarkdown) {
      return
    }

    setCreatingMarkdown(true)
    setCreateError('')

    try {
      const worktree = `id:${worktreeId}`
      for (let attempt = 1; attempt <= 100; attempt += 1) {
        const relativePath = attempt === 1 ? 'untitled.md' : `untitled-${attempt}.md`
        const createResponse = await client.sendRequest(
          'files.createFile',
          { worktree, relativePath },
          { timeoutMs: 15_000 }
        )
        if (!createResponse.ok) {
          const message = (createResponse as RpcFailure).error.message
          if (isFileExistsErrorMessage(message) && attempt < 100) {
            continue
          }
          throw new Error(
            message || translate('mobile.markdown.createFailed', 'Failed to create markdown note')
          )
        }

        const openResponse = await client.sendRequest(
          'files.open',
          { worktree, relativePath },
          { timeoutMs: 15_000 }
        )
        if (!openResponse.ok) {
          throw new Error((openResponse as RpcFailure).error.message)
        }
        scheduleDelayedAction(() => void fetchSessionTabs(), 300)
        return
      }
      throw new Error(
        translate('mobile.markdown.createUntitledFailed', 'Unable to create untitled markdown note')
      )
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : translate('mobile.markdown.createFailed', 'Failed to create markdown note')
      setCreateError(message)
      showToast(message, 1800)
    } finally {
      setCreatingMarkdown(false)
    }
  }

  async function handleCreateBrowser(rawUrl = 'about:blank'): Promise<boolean> {
    if (!client || creatingBrowser) {
      return false
    }
    // Why: read via ref so a tap that fires before the capability probe resolves
    // (or from a stale callback) still sees the live support value.
    if (browserScreencastSupportedRef.current !== true) {
      showToast(BROWSER_STREAMING_UNAVAILABLE_MESSAGE, 1600)
      return false
    }
    const url = normalizeBrowserUrl(rawUrl)
    if (!url) {
      const message = translate('mobile.browser.enterValidUrl', 'Enter a valid URL')
      setCreateError(message)
      showToast(message, 1400)
      return false
    }

    setCreatingBrowser(true)
    setCreateError('')
    try {
      const response = await client.sendRequest(
        'browser.tabCreate',
        {
          worktree: `id:${worktreeId}`,
          url,
          // The user opened this tab (tapped HTML / address bar) → focus it.
          activate: true
        },
        { timeoutMs: 30_000 }
      )
      if (!response.ok) {
        throw new Error((response as RpcFailure).error.message)
      }
      // Focus the new browser tab once it syncs (fetchSessionTabs activates it
      // via the normal path). Refresh a few times since the desktop registers
      // the tab asynchronously.
      const created = (response as RpcSuccess).result as { browserPageId?: string }
      if (created.browserPageId) {
        pendingBrowserFocusPageIdRef.current = created.browserPageId
      }
      void fetchSessionTabs()
      scheduleDelayedAction(() => void fetchSessionTabs(), 400)
      scheduleDelayedAction(() => void fetchSessionTabs(), 1200)
      return true
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : translate('mobile.browser.createFailed', 'Failed to create browser')
      setCreateError(message)
      showToast(message, 1800)
      return false
    } finally {
      setCreatingBrowser(false)
    }
  }
  // Keep the ref pointing at the latest handleCreateBrowser so a terminal URL
  // tap (handleTerminalOpenUrl) always runs the current closure.
  handleCreateBrowserRef.current = handleCreateBrowser

  async function handleBrowserNavigationCommand(
    tab: Extract<MobileSessionTab, { type: 'browser' }>,
    method: 'browser.back' | 'browser.forward' | 'browser.reload'
  ) {
    if (!client || !tab.browserPageId) {
      showToast(
        translate('mobile.session.browser.pageUnavailable', 'Browser page is not available yet.'),
        1500
      )
      return
    }
    try {
      const response = await client.sendRequest(
        method,
        {
          worktree: `id:${worktreeId}`,
          page: tab.browserPageId
        },
        { timeoutMs: 15_000 }
      )
      if (!response.ok) {
        throw new Error((response as RpcFailure).error.message)
      }
      scheduleDelayedAction(() => void fetchSessionTabs(), 250)
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : translate('mobile.browser.commandFailed', 'Browser command failed')
      showToast(message, 1600)
    }
  }

  async function handleRenameTerminal(value: string) {
    if (!client || !renameTarget) {
      return
    }
    const target = renameTarget
    setRenameTarget(null)

    try {
      const title = value.trim()
      const response = await client.sendRequest('terminal.rename', {
        terminal: target.handle,
        title
      })
      if (response.ok) {
        setTerminals((prev) => {
          const next = prev.map((terminal) =>
            terminal.handle === target.handle
              ? {
                  ...terminal,
                  title: title || translate('mobile.terminal.defaultTitle', 'Terminal')
                }
              : terminal
          )
          terminalsRef.current = next
          return next
        })
        scheduleDelayedAction(() => void fetchTerminals(), 300)
      }
    } catch {
      // Rename failed — refresh will restore the server title.
    }
  }

  async function handleCloseTerminal(target: Terminal) {
    if (!client) {
      return
    }
    // Why: the session tab is the UI authority — route the action-sheet close
    // through the tab path so it is tombstoned and the active tab stays in sync.
    const owningTab = sessionTabsRef.current.find(
      (candidate) => candidate.type === 'terminal' && candidate.terminal === target.handle
    )
    if (owningTab) {
      await handleCloseSessionTab(owningTab)
      return
    }

    try {
      const response = await client.sendRequest('terminal.close', {
        terminal: target.handle
      })
      if (response.ok) {
        unsubscribeTerminal(target.handle)
        terminalRefs.current.delete(target.handle)
        initializedHandlesRef.current.delete(target.handle)
        clearTerminalLiveInputDefault(target.handle)
        const next = terminals.filter((terminal) => terminal.handle !== target.handle)
        setTerminals(next)
        terminalsRef.current = next
        if (activeHandleRef.current === target.handle) {
          const replacement = next[0] ?? null
          activeHandleRef.current = replacement?.handle ?? null
          pendingActiveTerminalHandleRef.current = replacement?.handle ?? null
          setActiveHandle(replacement?.handle ?? null)
          if (replacement) {
            subscribeToTerminal(replacement.handle)
          }
        }
      }
    } catch {
      // Close failed — keep the local tab list unchanged.
    }
  }

  async function handleCloseSessionTab(tab: MobileSessionTab) {
    if (!client) {
      return
    }
    try {
      const response = await client.sendRequest('session.tabs.close', {
        worktree: `id:${worktreeId}`,
        tabId: tab.id
      })
      if (response.ok) {
        if (tab.type === 'terminal' && typeof tab.terminal === 'string') {
          const terminalHandle = tab.terminal
          unsubscribeTerminal(terminalHandle)
          terminalRefs.current.delete(terminalHandle)
          initializedHandlesRef.current.delete(terminalHandle)
          clearTerminalLiveInputDefault(terminalHandle)
          const nextTerminals = terminalsRef.current.filter(
            (terminal) => terminal.handle !== terminalHandle
          )
          terminalsRef.current = nextTerminals
          setTerminals(nextTerminals)
        }
        sessionTabsRef.current = sessionTabsRef.current.filter(
          (candidate) => candidate.id !== tab.id
        )
        setSessionTabs((prev) => prev.filter((candidate) => candidate.id !== tab.id))
        // Why: tombstone the closed tab and rely on the subscription/poll
        // snapshot (gated by snapshotVersion) instead of a blind 300ms refetch
        // that re-applied whatever the host had — often the not-yet-closed list.
        closedTabTombstonesRef.current.set(tab.id, Date.now() + 10_000)
        // Why: clear the whole selection together — a half-switched tab/handle pair
        // desyncs canSend and the dock until the next snapshot lands.
        const closedActiveHandle =
          tab.type === 'terminal' &&
          typeof tab.terminal === 'string' &&
          activeHandleRef.current === tab.terminal
        if (activeSessionTabIdRef.current === tab.id || activeSessionTabId === tab.id) {
          activeSessionTabTypeRef.current = null
          activeSessionTabIdRef.current = null
          setActiveSessionTabId(null)
        }
        if (closedActiveHandle) {
          activeHandleRef.current = null
          setActiveHandle(null)
        }
      }
    } catch {
      // Close failed — keep the authoritative session snapshot visible.
    }
  }

  const isPhoneMode = (handle: string | null): boolean => {
    if (!handle) {
      return false
    }
    const mode = terminalModes.get(handle)
    return mode === 'auto' || mode === 'phone' || mode === undefined
  }

  const visibleTabs: MobileSessionTab[] = sessionTabs
  const activeMarkdownTab = activeSessionTab?.type === 'markdown' ? activeSessionTab : null
  const activeFileTab = activeSessionTab?.type === 'file' ? activeSessionTab : null
  const activeBrowserTab = activeSessionTab?.type === 'browser' ? activeSessionTab : null
  const activePendingTerminalTab =
    activeSessionTab?.type === 'terminal' && typeof activeSessionTab.terminal !== 'string'
      ? activeSessionTab
      : null

  useEffect(() => {
    if (!client || connState !== 'connected' || !activePendingTerminalTab) {
      if (connState !== 'connected' || !activePendingTerminalTab) {
        pendingTerminalActivationAttemptRef.current = null
      }
      return
    }
    const activationKey = `${worktreeId}:${activePendingTerminalTab.id}:${activePendingTerminalTab.leafId ?? ''}`
    if (pendingTerminalActivationAttemptRef.current === activationKey) {
      return
    }
    // Why: a hydrated headless/server-owned tab can already be active but still
    // pending; activation is the RPC that materializes or focuses its PTY handle.
    pendingTerminalActivationAttemptRef.current = activationKey
    void activateMobileSessionTab(client, {
      worktree: `id:${worktreeId}`,
      tabId: activePendingTerminalTab.id,
      leafId: activePendingTerminalTab.leafId,
      notifyClients: false
    })
      .then((response) => {
        if (!response.ok) {
          if (pendingTerminalActivationAttemptRef.current === activationKey) {
            pendingTerminalActivationAttemptRef.current = null
          }
          return
        }
        applySessionTabs((response as RpcSuccess).result as SessionTabsResult)
        scheduleDelayedAction(() => void fetchSessionTabs(), 300)
        scheduleDelayedAction(() => void fetchSessionTabs(), 1200)
      })
      .catch(() => {
        if (pendingTerminalActivationAttemptRef.current === activationKey) {
          pendingTerminalActivationAttemptRef.current = null
        }
      })
  }, [
    activePendingTerminalTab,
    applySessionTabs,
    client,
    connState,
    fetchSessionTabs,
    scheduleDelayedAction,
    worktreeId
  ])

  const showLoadingState = connState === 'connected' && !terminalsLoaded && visibleTabs.length === 0
  const showEmptyState =
    connState === 'connected' && terminalsLoaded && visibleTabs.length === 0 && !activeHandle

  useEffect(() => {
    if (
      !client ||
      !showEmptyState ||
      creating ||
      creatingBrowser ||
      creatingMarkdown ||
      initialEmptySessionAutoCreateRef.current === worktreeId
    ) {
      return
    }
    // Why: a sleeping/new workspace can hydrate with zero session tabs. Create
    // the first terminal once on initial load instead of leaving mobile blank.
    initialEmptySessionAutoCreateRef.current = worktreeId
    setCreateError('')
    void handleCreateTerminal()
  }, [client, creating, creatingBrowser, creatingMarkdown, showEmptyState, worktreeId])

  const { showConnectionRetry, terminalSummary } = resolveMobileSessionConnectionHealth({
    connState,
    reconnectAttempts,
    lastConnectedAt,
    endpoint: hostEndpoint,
    showLoadingState,
    visibleTabCount: visibleTabs.length
  })

  // Why: keep safe-area padding in layout at all times, then visually translate
  // the controls over the terminal when the keyboard appears. iOS keyboard
  // height includes the home-indicator inset; Android IME height does not.
  const keyboardLift =
    keyboardHeight > 0
      ? Platform.OS === 'ios'
        ? Math.max(0, keyboardHeight - insets.bottom)
        : keyboardHeight
      : 0
  const terminalComposerKeyboardOffset = keyboardLift + (keyboardLift > 0 ? keyboardComposerGap : 0)
  const activeTerminalKeyboardLift = (() => {
    if (keyboardLift <= 0 || !activeHandle) {
      return 0
    }
    const metrics = terminalKeyboardMetrics.get(activeHandle)
    if (!metrics || metrics.rows <= 0 || terminalFrameHeightRef.current <= 0) {
      return keyboardLift
    }
    if (metrics.altScreen) {
      return keyboardLift
    }
    const rowHeight = terminalFrameHeightRef.current / metrics.rows
    const cursorBottom = (metrics.cursorY + 1) * rowHeight
    const dockTop = terminalFrameHeightRef.current - keyboardLift
    const margin = rowHeight
    // Why: only move the terminal when the active cursor would sit under the
    // raised input dock. Short shell output near the top should stay put.
    return Math.min(keyboardLift, Math.max(0, cursorBottom + margin - dockTop))
  })()
  const toastAnimatedStyle = {
    opacity: toastOpacityRef.current,
    transform: [{ translateY: -keyboardLift }]
  }
  const createTabAgentActions = buildCreateTabAgentActions({
    loadState: createTabAgentLoadState,
    options: createTabAgentOptions,
    onCreate: (agent) => void handleCreateTerminal(agent)
  })
  const sendDiffNotesAgentActions = buildSendReviewNotesAgentActions({
    loadState: createTabAgentLoadState,
    options: pendingDiffNotesDelivery === null ? [] : createTabAgentOptions,
    onSelect: (agent) => {
      const delivery = pendingDiffNotesDelivery
      if (!delivery) {
        return
      }
      void handleCreateTerminal(agent, {
        initialPrompt: delivery.prompt,
        onPromptSent: () => void clearDeliveredDiffComments(delivery.comments)
      })
    }
  })

  // Routes a header panel-icon tap through the pure dock-vs-push decision (U1):
  // measured dock-capable rows toggle/swap, constrained rows push full-screen.
  const handleSessionContentRowLayout = useCallback((event: LayoutChangeEvent) => {
    const width = Math.round(event.nativeEvent.layout.width)
    setSessionContentRowWidth((prev) => (prev === width ? prev : width))
  }, [])

  const handlePanelTap = (tapped: Exclude<ActivePanel, null>) => {
    const action = resolvePanelAction({ canDock: canDockPanel, tapped, current: activePanel })
    if (action.kind === 'dock') {
      setActivePanel(action.next)
      return
    }
    const descriptor = panelRouteDescriptor(action.panel)
    router.push({
      pathname: descriptor.pathname,
      params: {
        hostId,
        worktreeId,
        name: worktreeName || '',
        // SC + PR both land on the source-control hub; post-diff-open dismissal
        // keys off origin: 'session' (U2). Files keeps its own route without origin.
        ...(action.panel === 'sourceControl' || action.panel === 'pr' ? { origin: 'session' } : {}),
        // The PR panel routes into the hub's Pull Request segment via descriptor params.
        ...descriptor.params
      }
    })
  }

  const openAgentSessionHistory = () => {
    const params = new URLSearchParams({ name: worktreeName || '' })
    router.push(`/h/${hostId}/agent-history/${encodeURIComponent(worktreeId)}?${params.toString()}`)
  }
  const showAgentSessionHistoryAction =
    !isFolderWorkspaceRoute && !isFloatingWorkspaceRoute && agentSessionHistorySupported === true
  const showQuickCommandsAction = shouldShowMobileQuickCommandsAction(quickCommandsSupported)
  const showFileExplorerAction = !isFloatingWorkspaceRoute
  const showSourceControlAction = !isFolderWorkspaceRoute && !isFloatingWorkspaceRoute
  const showChecksAction = shouldShowSessionHeaderChecksAction({
    isFolderWorkspaceRoute: isFolderWorkspaceRoute || isFloatingWorkspaceRoute,
    repoContextLoaded: prRepoContextLoaded,
    hostedChecksSupported: prIsGithubRepo
  })
  const showHeaderMoreButton =
    showQuickCommandsAction ||
    showFileExplorerAction ||
    showSourceControlAction ||
    showAgentSessionHistoryAction ||
    showChecksAction
  const openQuickCommands = (): void => {
    if (quickCommandsSupported === true) {
      setShowQuickCommands(true)
      return
    }
    showToast(
      translate(
        'mobile.session.capabilities.checking',
        'Checking desktop capabilities - try again in a moment'
      ),
      1600
    )
  }
  const useNativeSessionHeader = shouldUseNativeSessionHeader(isWideLayout)
  const hasDirtyMarkdownDrafts = getDirtyMarkdownDrafts().length > 0
  const nativeHeaderOptions = useMemo(
    () => ({
      gestureEnabled: !hasDirtyMarkdownDrafts,
      headerBackVisible: false,
      headerShadowVisible: false,
      headerStyle: { backgroundColor },
      title: worktreeName || translate('mobile.session.header.terminalFallback', 'Terminal')
    }),
    [backgroundColor, hasDirtyMarkdownDrafts, worktreeName]
  )

  return (
    <View ref={setMobileSessionRootRef} className="bg-background flex-1">
      <Stack.Screen options={nativeHeaderOptions} />
      {useNativeSessionHeader ? (
        <>
          <Stack.Toolbar placement="left">
            <Stack.Toolbar.Button
              accessibilityLabel={translate(
                'mobile.session.header.backToWorkspaces',
                'Back to workspaces'
              )}
              icon="chevron.left"
              onPress={requestLeaveSession}
            />
          </Stack.Toolbar>
          <Stack.Toolbar placement="right">
            <Stack.Toolbar.Menu
              accessibilityLabel={translate(
                'mobile.session.header.moreActions',
                'More session actions'
              )}
              hidden={!showHeaderMoreButton}
              icon="ellipsis"
              separateBackground
            >
              <Stack.Toolbar.MenuAction
                hidden={!showQuickCommandsAction}
                icon="arrow.right.square"
                onPress={openQuickCommands}
              >
                {translate('mobile.session.quickCommands', 'Quick commands')}
              </Stack.Toolbar.MenuAction>
              <Stack.Toolbar.MenuAction
                hidden={!showFileExplorerAction}
                icon="folder"
                onPress={() => handlePanelTap('files')}
              >
                {translate('mobile.session.header.openFileExplorer', 'Open file explorer')}
              </Stack.Toolbar.MenuAction>
              <Stack.Toolbar.MenuAction
                hidden={!showSourceControlAction}
                icon="arrow.triangle.branch"
                onPress={() => handlePanelTap('sourceControl')}
              >
                {translate('mobile.session.header.openSourceControl', 'Open source control')}
              </Stack.Toolbar.MenuAction>
              <Stack.Toolbar.MenuAction
                hidden={!showAgentSessionHistoryAction}
                icon="clock.arrow.circlepath"
                onPress={openAgentSessionHistory}
              >
                {translate('mobile.session.header.agentHistory', 'Agent History')}
              </Stack.Toolbar.MenuAction>
              <Stack.Toolbar.MenuAction
                hidden={!showChecksAction}
                icon="checkmark.circle"
                onPress={() => handlePanelTap('pr')}
              >
                {translate('mobile.session.header.checks', 'Checks')}
              </Stack.Toolbar.MenuAction>
            </Stack.Toolbar.Menu>
          </Stack.Toolbar>
        </>
      ) : null}
      <View className="flex-1">
        {!useNativeSessionHeader ? (
          <MobileGlassHeader includesTopInset>
            <View className="min-h-15 flex-row items-center gap-2 px-3 py-1">
              <MobileGlassIconButton
                accessibilityLabel={translate(
                  'mobile.session.header.backToWorkspaces',
                  'Back to workspaces'
                )}
                icon="back"
                onPress={requestLeaveSession}
              />

              <Pressable
                className="min-h-11 min-w-0 flex-1 justify-center"
                disabled={!showConnectionRetry}
                onPress={() => {
                  if (hostId) {
                    void forceReconnectHost(hostId)
                  }
                }}
                accessibilityRole={showConnectionRetry ? 'button' : undefined}
                accessibilityLabel={
                  showConnectionRetry
                    ? translate('mobile.session.header.reconnectToDesktop', 'Reconnect to desktop')
                    : undefined
                }
              >
                <Text className="text-foreground text-base font-semibold" numberOfLines={1}>
                  {worktreeName || translate('mobile.session.header.terminalFallback', 'Terminal')}
                </Text>
                <View className="mt-1 flex-row items-center gap-2">
                  <StatusDot state={connState} />
                  <Text className="text-muted-foreground shrink text-xs" numberOfLines={1}>
                    {terminalSummary}
                  </Text>
                </View>
              </Pressable>
              <MobileGlassGroup className="flex-row items-center gap-2" spacing={8}>
                {showHeaderMoreButton ? (
                  <MobileGlassIconButton
                    accessibilityLabel={translate(
                      'mobile.session.header.moreActions',
                      'More session actions'
                    )}
                    icon="more"
                    isSelected={activePanel !== null}
                    onPress={() => setShowHeaderMoreActions(true)}
                  />
                ) : null}
              </MobileGlassGroup>
            </View>
          </MobileGlassHeader>
        ) : null}

        {useNativeSessionHeader && connState !== 'connected' ? (
          <MobileGlassSurface className="mx-3 mt-2 overflow-hidden rounded-xl" isFunctional>
            <Pressable
              accessibilityLabel={
                showConnectionRetry
                  ? translate('mobile.session.header.reconnectToDesktop', 'Reconnect to desktop')
                  : undefined
              }
              accessibilityRole={showConnectionRetry ? 'button' : undefined}
              className="active:bg-accent min-h-11 flex-row items-center gap-2 rounded-xl px-3 py-2"
              disabled={!showConnectionRetry}
              onPress={() => {
                if (hostId) {
                  void forceReconnectHost(hostId)
                }
              }}
            >
              <StatusDot state={connState} />
              <Text className="text-muted-foreground flex-1 text-xs" numberOfLines={1}>
                {terminalSummary}
              </Text>
            </Pressable>
          </MobileGlassSurface>
        ) : null}

        {visibleTabs.length > 0 ? (
          <MobileSessionTabStrip
            activeTabId={activeSessionTabId}
            disabled={creating || creatingBrowser || creatingMarkdown || connState !== 'connected'}
            tabs={visibleTabs}
            onTabPress={switchSessionTab}
            onTabLongPress={(tab) => {
              triggerMediumImpact()
              openSessionTabActionSheetAfterKeyboardDismiss(tab)
            }}
            onNewTabPress={() => {
              setCreateError('')
              setShowCreateTabDrawer(true)
            }}
          />
        ) : null}

        {/* Content-row host (KTD2): the header/tab chrome stays a full-width sibling
            above; on wide the post-chrome content shares this row with the docked panel.
            There is no single terminal node, so the entire conditional block is the
            flex-1 left child. On narrow the dock never renders and layout is unchanged. */}
        <View className="flex-1 flex-row" onLayout={handleSessionContentRowLayout}>
          <View className="min-w-0 flex-1">
            {createWarning ? (
              <MobileSessionCreationWarning
                message={createWarning}
                onDismiss={() => setCreateWarningState(dismissMobileSessionCreateWarningState)}
              />
            ) : null}

            {showLoadingState || showEmptyState ? (
              <MobileSessionCreationPlaceholder
                createError={createError}
                disabled={
                  creating || creatingBrowser || creatingMarkdown || connState !== 'connected'
                }
                isCreating={creating || creatingBrowser || creatingMarkdown}
                loading={showLoadingState}
                onCreateTab={() => {
                  setCreateError('')
                  setShowCreateTabDrawer(true)
                }}
              />
            ) : activeMarkdownTab ? (
              <View className={styles.markdownFrame}>
                <MarkdownReader
                  documentId={activeMarkdownTab.id}
                  doc={markdownDocs.get(activeMarkdownTab.id)}
                  onRefresh={() => void readMarkdownTab(activeMarkdownTab)}
                  onChange={(content) => updateMarkdownLocalContent(activeMarkdownTab.id, content)}
                  onSave={() => void saveMarkdownTab(activeMarkdownTab)}
                  onCopy={() => void copyMarkdownLocalContent(activeMarkdownTab.id)}
                  onDiscard={() => discardMarkdownLocalContent(activeMarkdownTab)}
                  keyboardLift={keyboardLift}
                />
                {toastMessage && (
                  <Animated.View
                    pointerEvents="none"
                    className={styles.toast}
                    style={[toastAnimatedStyle]}
                  >
                    <Text className={styles.toastText}>{toastMessage}</Text>
                  </Animated.View>
                )}
              </View>
            ) : activeFileTab ? (
              <View className={styles.markdownFrame}>
                <FileReader
                  doc={fileDocs.get(activeFileTab.id)}
                  title={activeFileTab.title || translate('mobile.files.defaultTitle', 'File')}
                  relativePath={activeFileTab.relativePath}
                  language={activeFileTab.language}
                  diffCommentActions={
                    activeFileTab.diffSource === 'staged' || activeFileTab.diffSource === 'unstaged'
                      ? {
                          comments: diffComments,
                          busy: diffCommentBusy,
                          onAdd: addDiffCommentForFile,
                          onDelete: deleteDiffCommentForFile,
                          onCopyAll: copyDiffCommentsToClipboard,
                          onSendAll: sendDiffCommentsToAgent
                        }
                      : undefined
                  }
                />
                {toastMessage && (
                  <Animated.View
                    pointerEvents="none"
                    className={styles.toast}
                    style={[toastAnimatedStyle]}
                  >
                    <Text className={styles.toastText}>{toastMessage}</Text>
                  </Animated.View>
                )}
              </View>
            ) : activeBrowserTab ? (
              <View className="bg-background min-h-0 flex-1">
                {/* Why: the pane owns imperative frame refs; browser tabs should
            never render a stale frame while the old stream effect cleans up. */}
                <MobileBrowserPane
                  key={activeBrowserTab.browserPageId ?? activeBrowserTab.id}
                  client={client}
                  worktreeId={worktreeId}
                  tab={activeBrowserTab}
                  screencastSupported={browserScreencastSupported}
                  keyboardLift={keyboardLift}
                  bottomInset={insets.bottom}
                  onToast={showToast}
                />
                {toastMessage && (
                  <Animated.View
                    pointerEvents="none"
                    className={styles.toast}
                    style={[toastAnimatedStyle]}
                  >
                    <Text className={styles.toastText}>{toastMessage}</Text>
                  </Animated.View>
                )}
              </View>
            ) : activePendingTerminalTab ? (
              <View className={styles.emptyState}>
                <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
                <Text className={styles.emptyText}>
                  {activePendingTerminalTab.title ||
                    translate('mobile.terminal.loading', 'Loading terminal')}
                </Text>
              </View>
            ) : (
              <View
                className="relative min-h-0 flex-1 overflow-hidden"
                onLayout={(e) => {
                  terminalFrameHeightRef.current = e.nativeEvent.layout.height
                  // Why: notify height imperatively so dock settling re-fits the
                  // PTY without rerendering SessionScreen for layout callbacks.
                  const nextWidth = Math.round(e.nativeEvent.layout.width)
                  const nextHeight = Math.round(e.nativeEvent.layout.height)
                  setTerminalFrameWidth((prev) => (prev === nextWidth ? prev : nextWidth))
                  notifyTerminalFrameHeight(nextHeight)
                }}
              >
                {terminals.map((terminal) => (
                  <TerminalPaneView
                    key={terminal.handle}
                    handle={terminal.handle}
                    active={terminal.handle === activeHandle}
                    keyboardLift={terminal.handle === activeHandle ? activeTerminalKeyboardLift : 0}
                    terminalTheme={terminal.terminalTheme}
                    textScale={terminalTextScale}
                    onTextScaleChange={(scale) => {
                      // Why: pinch-to-zoom in the WebView reports a new preset; persist
                      // it so the size sticks across panes and app launches.
                      setTerminalTextScale(scale)
                      void saveTerminalTextScale(scale)
                    }}
                    onRef={setTerminalWebViewRef}
                    onWebReady={handleTerminalWebReady}
                    onSelectionMode={handleSelectionMode}
                    onSelectionCopy={handleSelectionCopy}
                    onSelectionEvicted={handleSelectionEvicted}
                    onModesChanged={handleModesChanged}
                    onKeyboardAvoidanceMetrics={handleKeyboardAvoidanceMetrics}
                    onHaptic={handleHaptic}
                    onTerminalInput={handleTerminalInput}
                    onTerminalQueryReply={handleTerminalQueryReply}
                    onTerminalTap={handleTerminalTap}
                    onFileTap={handleFileTap}
                    onOpenUrl={handleTerminalOpenUrl}
                  />
                ))}
                <MobileNativeChatOverlay
                  controller={nativeChatController}
                  onAttachImage={attachImage}
                  isAttaching={isAttaching}
                  inputLockReason={nativeChatInputLockReason}
                  keyboardInset={keyboardLift}
                />
                {toastMessage && (
                  <Animated.View
                    pointerEvents="none"
                    className={styles.toast}
                    style={[toastAnimatedStyle]}
                  >
                    <Text className={styles.toastText}>{toastMessage}</Text>
                  </Animated.View>
                )}
              </View>
            )}

            {/* Why: translate instead of resizing so keyboard open/close does not
            trigger a server-side PTY viewport change. The dock hides in native
            chat because that view supplies its own composer. */}
            {!activeMarkdownTab && !activeFileTab && !activeBrowserTab && !showNativeChat && (
              <MobileTerminalDock
                autocompleteEnabled={autocompleteEnabled}
                bottomInset={insets.bottom}
                builtInKeys={visibleBuiltInAccessoryKeys}
                canPaste={canPaste}
                canSend={canSend}
                commandInputRef={commandInputRef}
                controlModeActive={controlModeActive}
                customKeys={customKeys}
                input={input}
                isAttaching={isAttaching}
                isPhoneDisplayMode={isPhoneMode(activeHandle)}
                keyboardOffset={terminalComposerKeyboardOffset}
                liveInputCapture={liveInputCapture}
                liveInputEnabled={liveInputEnabled}
                liveInputRef={liveInputRef}
                onAccessoryInput={(accessoryInput) => void handleAccessoryKey(accessoryInput)}
                onAttachImage={attachImage}
                onChangeCommandText={setInput}
                onChangeLiveInput={handleTerminalLiveInputChange}
                onCustomKeyLongPress={(key) => {
                  triggerMediumImpact()
                  setDeleteKeyTarget(key)
                }}
                onKeyPressLiveInput={handleLiveInputKeyPress}
                onOpenChat={
                  showTerminalChatAction && activeSessionTabId
                    ? () => toggleTabChatView(activeSessionTabId)
                    : null
                }
                onPaste={() => void handlePaste()}
                onRepeatStart={startAccessoryRepeat}
                onRepeatStop={stopAccessoryRepeat}
                onSendCommand={() => void handleSend()}
                onSubmitLiveInput={handleLiveInputSubmit}
                onToggleControl={toggleControlMode}
                onToggleDisplayMode={() => {
                  if (activeHandle) {
                    void toggleDisplayMode(activeHandle)
                  }
                }}
                onToggleLiveInput={toggleLiveInput}
              />
            )}
          </View>
          {canDockPanel && activePanel !== null && (
            <SessionDockColumn
              activePanel={activePanel}
              hostId={hostId}
              worktreeId={worktreeId}
              name={worktreeName || ''}
              availableWidth={sessionContentRowWidth}
              onRequestClose={() => setActivePanel(null)}
              onFileOpenStart={handleFileOpenStart}
              onOpenedFileDiff={handleOpenedFileDiff}
            />
          )}
        </View>
      </View>

      <MobileSessionHeaderMoreActionsSheet
        visible={!useNativeSessionHeader && showHeaderMoreActions}
        showQuickCommands={showQuickCommandsAction}
        showFileExplorer={showFileExplorerAction}
        showSourceControl={showSourceControlAction}
        showAgentSessionHistory={showAgentSessionHistoryAction}
        showChecks={showChecksAction}
        onOpenQuickCommands={openQuickCommands}
        onOpenFileExplorer={() => handlePanelTap('files')}
        onOpenSourceControl={() => handlePanelTap('sourceControl')}
        onOpenAgentSessionHistory={openAgentSessionHistory}
        onOpenChecks={() => handlePanelTap('pr')}
        onClose={() => setShowHeaderMoreActions(false)}
      />

      <QuickCommandsSheet
        visible={showQuickCommands && quickCommandsSupported === true}
        onClose={() => setShowQuickCommands(false)}
        client={client}
        repoId={
          isFolderWorkspaceRoute || isFloatingWorkspaceRoute
            ? null
            : getRepoIdFromMobileWorktreeId(worktreeId) || null
        }
        repoName={worktreeName || null}
        onLaunch={launchQuickCommand}
      />

      <BottomDrawerModalHost
        visible={
          showCreateTabDrawer ||
          showCreateBrowserModal ||
          pendingDiffNotesDelivery !== null ||
          actionTarget !== null ||
          renameTarget !== null ||
          markdownActionTarget !== null ||
          discardMarkdownTarget !== null ||
          fileActionTarget !== null ||
          browserActionTarget !== null ||
          leaveDrafts !== null
        }
        onRequestClose={() => {
          setShowCreateTabDrawer(false)
          setShowCreateBrowserModal(false)
          setPendingDiffNotesDelivery(null)
          setActionTarget(null)
          setRenameTarget(null)
          setMarkdownActionTarget(null)
          setDiscardMarkdownTarget(null)
          setFileActionTarget(null)
          setBrowserActionTarget(null)
          setLeaveDrafts(null)
        }}
      >
        <CreateTabDrawers
          actionVisible={showCreateTabDrawer}
          browserInputVisible={showCreateBrowserModal}
          agentActions={createTabAgentActions}
          browserSupported={browserScreencastSupported === true}
          isFloatingWorkspace={isFloatingWorkspaceRoute}
          onActionClose={() => setShowCreateTabDrawer(false)}
          onBrowserInputClose={() => setShowCreateBrowserModal(false)}
          onBrowserSubmit={(value) => {
            void handleCreateBrowser(value).then((created) => {
              if (created) {
                setShowCreateBrowserModal(false)
              }
            })
          }}
          onBrowserUnavailable={() => showToast(BROWSER_STREAMING_UNAVAILABLE_MESSAGE, 1600)}
          onCreateMarkdown={() => void handleCreateMarkdownNote()}
          onCreateTerminal={() => void handleCreateTerminal()}
          onOpenBrowserInput={() => setShowCreateBrowserModal(true)}
        />

        <ActionSheetModal
          visible={pendingDiffNotesDelivery !== null}
          title={translate('mobile.session.reviewNotes.title', 'Send Review Notes')}
          message={translate(
            'mobile.session.reviewNotes.message',
            'Choose an agent session for the current notes.'
          )}
          actions={[
            ...sendDiffNotesAgentActions,
            {
              id: 'copy-notes',
              label: translate('mobile.session.reviewNotes.copy', 'Copy Notes'),
              icon: Copy,
              dismiss: 'immediate',
              onPress: () => {
                const delivery = pendingDiffNotesDelivery
                if (!delivery) {
                  return
                }
                void Clipboard.setStringAsync(delivery.prompt)
                  .then(() => {
                    triggerSuccess()
                    showToast(translate('mobile.session.reviewNotes.copied', 'Notes copied'))
                  })
                  .catch(() => {
                    triggerError()
                    showToast(
                      translate('mobile.session.reviewNotes.copyFailed', "Couldn't copy notes"),
                      1500
                    )
                  })
              }
            }
          ]}
          onClose={() => setPendingDiffNotesDelivery(null)}
        />

        <ActionSheetModal
          visible={actionTarget != null}
          title={
            actionTarget?.title ?? translate('mobile.session.terminalActions.title', 'Terminal')
          }
          actions={getMobileTerminalActionSheetActions({
            target: actionTarget,
            tabs: sessionTabs.filter((tab) => tab.type === 'terminal'),
            isTabChatView: nativeChatController.isTabChatView,
            nativeChatTranscriptIsLocalReadable,
            onToggleChat: toggleTabChatView,
            isPhoneMode,
            onToggleDisplayMode: (handle) => void toggleDisplayMode(handle),
            onRename: setRenameTarget,
            onClear: (target) => void handleClearTerminal(target),
            onClose: (target) => void handleCloseTerminal(target)
          })}
          onClose={() => setActionTarget(null)}
        />
        <ActionSheetModal
          visible={markdownActionTarget != null}
          title={
            markdownActionTarget?.title ??
            translate('mobile.session.markdownActions.title', 'Markdown')
          }
          actions={[
            {
              id: 'refresh-markdown',
              label: translate('mobile.session.markdownActions.refresh', 'Refresh'),
              icon: RefreshCw,
              dismiss: 'immediate',
              onPress: () => {
                const target = markdownActionTarget
                if (target) {
                  discardMarkdownLocalContent(target)
                }
              }
            },
            {
              id: 'copy-markdown-path',
              label: translate('mobile.session.markdownActions.copyPath', 'Copy Path'),
              icon: FileText,
              dismiss: 'immediate',
              onPress: () => {
                const target = markdownActionTarget
                if (target) {
                  void Clipboard.setStringAsync(target.relativePath || target.filePath)
                  showToast(translate('mobile.session.markdownActions.pathCopied', 'Path copied'))
                }
              }
            },
            {
              id: 'close-markdown',
              label: translate('mobile.session.markdownActions.close', 'Close'),
              icon: X,
              dismiss: 'immediate',
              onPress: () => {
                const target = markdownActionTarget
                if (target) {
                  void handleCloseSessionTab(target)
                }
              }
            }
          ]}
          onClose={() => setMarkdownActionTarget(null)}
        />
        <ActionSheetModal
          visible={fileActionTarget != null}
          title={fileActionTarget?.title ?? translate('mobile.session.fileActions.title', 'File')}
          actions={[
            {
              id: 'refresh-file',
              label: translate('mobile.session.fileActions.refresh', 'Refresh'),
              icon: RefreshCw,
              dismiss: 'immediate',
              onPress: () => {
                const target = fileActionTarget
                if (target) {
                  void readFileTab(target)
                }
              }
            },
            {
              id: 'close-file',
              label: translate('mobile.session.fileActions.close', 'Close'),
              icon: X,
              dismiss: 'immediate',
              onPress: () => {
                const target = fileActionTarget
                if (target) {
                  void handleCloseSessionTab(target)
                }
              }
            }
          ]}
          onClose={() => setFileActionTarget(null)}
        />
        <MobileBrowserTabActionSheet
          target={browserActionTarget}
          onClose={() => setBrowserActionTarget(null)}
          onNavigate={handleBrowserNavigationCommand}
          onCloseTab={handleCloseSessionTab}
        />
        <ActionSheetModal
          visible={leaveDrafts != null}
          title={translate('mobile.session.unsavedDrafts.title', 'Unsaved markdown changes')}
          message={translate(
            'mobile.session.unsavedDrafts.message',
            'Copy or discard phone drafts before leaving.'
          )}
          actions={[
            {
              id: 'copy-drafts-and-leave',
              label: translate('mobile.session.unsavedDrafts.copyAndLeave', 'Copy All & Leave'),
              icon: FileText,
              dismiss: 'on-success',
              onPress: async () => {
                const drafts = leaveDrafts ?? []
                const combined = drafts
                  .map((draft) => `# ${draft.title}\n\n${draft.content}`)
                  .join('\n\n---\n\n')
                try {
                  await Clipboard.setStringAsync(combined)
                  leaveSession()
                  return true
                } catch {
                  triggerError()
                  showToast(
                    translate('mobile.session.unsavedDrafts.copyFailed', "Couldn't copy drafts"),
                    1500
                  )
                  return false
                }
              }
            },
            {
              id: 'discard-drafts-and-leave',
              label: translate('mobile.session.unsavedDrafts.discardAndLeave', 'Discard & Leave'),
              icon: Trash2,
              destructive: true,
              dismiss: 'immediate',
              onPress: leaveSession
            }
          ]}
          onClose={() => setLeaveDrafts(null)}
        />
        <ConfirmModal
          visible={discardMarkdownTarget != null}
          title={translate('mobile.session.markdownDiscard.title', 'Discard Changes')}
          message={translate(
            'mobile.session.markdownDiscard.message',
            'Replace the phone draft with the latest desktop file?'
          )}
          confirmLabel={translate('mobile.session.markdownDiscard.confirm', 'Discard')}
          destructive
          onConfirm={confirmDiscardMarkdown}
          onCancel={() => setDiscardMarkdownTarget(null)}
        />
        <TextInputModal
          visible={renameTarget != null}
          title={translate('mobile.session.terminalRename.title', 'Rename Terminal')}
          defaultValue={
            renameTarget?.title ??
            translate('mobile.session.terminalRename.defaultName', 'Terminal')
          }
          placeholder={translate('mobile.session.terminalRename.placeholder', 'Terminal name')}
          onSubmit={(value) => void handleRenameTerminal(value)}
          onCancel={() => setRenameTarget(null)}
        />
      </BottomDrawerModalHost>
      <CustomKeyModal
        visible={showCustomKeyModal}
        onClose={() => setShowCustomKeyModal(false)}
        onKeysChanged={setCustomKeys}
        onManageShortcuts={handleManageShortcuts}
      />
      <ConfirmModal
        visible={deleteKeyTarget != null}
        title={translate('mobile.session.customShortcut.removeTitle', 'Remove Shortcut')}
        message={translate(
          'mobile.session.customShortcut.removeMessage',
          'Remove "{{label}}" from your custom shortcuts?',
          { label: deleteKeyTarget?.label ?? '' }
        )}
        confirmLabel={translate('mobile.session.customShortcut.removeConfirm', 'Remove')}
        destructive
        onConfirm={() => {
          const target = deleteKeyTarget
          setDeleteKeyTarget(null)
          if (target) {
            void handleDeleteCustomKey(target)
          }
        }}
        onCancel={() => setDeleteKeyTarget(null)}
      />
    </View>
  )
}
