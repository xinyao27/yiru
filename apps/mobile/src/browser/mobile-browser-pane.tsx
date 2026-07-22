/* oxlint-disable react-doctor/no-adjust-state-on-prop-change -- Why: mobile browser state mirrors a remote desktop screencast session and CDP dialogs, which are external systems that cannot be derived during render. */
// Why: import from 'buffer' (the npm polyfill), not 'node:buffer' — Metro
// can't resolve Node's builtin in a React Native bundle.
import { Buffer } from 'buffer'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  Image,
  PanResponder,
  PixelRatio,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState
} from 'react-native'

import {
  ArrowUp,
  CaretLeft as ChevronLeft,
  CaretRight as ChevronRight,
  ArrowClockwise as RefreshCw
} from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import type {
  BrowserScreencastFrame,
  BrowserScreencastFrameMetadata
} from '../transport/browser-screencast-protocol'
import type { RpcClient } from '../transport/rpc-client'
import type { RpcFailure, RpcSuccess } from '../transport/types'
import {
  MOBILE_BROWSER_FRAME_MIN_INTERVAL_MS,
  buildMobileBrowserScreencastRequest,
  type MobileBrowserViewMode
} from './browser-screencast-request'
import {
  clampBrowserZoomState,
  computeBrowserFrameGeometry,
  computeBrowserTouchClickRadiusCss,
  mapScreenToBrowserPoint,
  readLocalTouchPoint,
  type BrowserFrameGeometry,
  type BrowserPoint,
  type BrowserTouchLayout,
  type BrowserZoomState
} from './browser-touch-geometry'
import { displayBrowserUrl, normalizeBrowserUrl } from './browser-url'
import { resolveMobileBrowserAddressSync } from './mobile-browser-address-sync'
import { MobileBrowserKeyRow } from './mobile-browser-key-row'
import {
  MobileBrowserPointerModifiers,
  type BrowserPointerModifier
} from './mobile-browser-pointer-modifiers'
import { MobileBrowserToolbarIconButton } from './mobile-browser-toolbar-icon-button'
import {
  getInitialMobileBrowserViewMode,
  saveMobileBrowserViewMode
} from './mobile-browser-view-mode-state'
import { MobileBrowserViewModeSwitch } from './mobile-browser-view-mode-switch'

export type MobileBrowserTab = {
  type: 'browser'
  id: string
  title: string
  browserWorkspaceId: string
  browserPageId: string | null
  url: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  isActive: boolean
}

type MobileBrowserPaneProps = {
  client: RpcClient | null
  worktreeId: string
  tab: MobileBrowserTab
  screencastSupported: boolean | null
  keyboardLift: number
  bottomInset: number
  onToast: (message: string, durationMs?: number) => void
}

type FrameLayer = 0 | 1

type PinchGesture = {
  distance: number
  scale: number
  anchorX: number
  anchorY: number
}

type PanGesture = {
  x: number
  y: number
  offsetX: number
  offsetY: number
}

type BrowserDialogState = {
  dialogType: string
  message: string
}

const TAP_SLOP = 16
const SCROLL_START_SLOP = 22
const LONG_PRESS_MS = 550
const WHEEL_INTERVAL_MS = 70
const TOUCH_CLICK_RADIUS_DIP = 14
const MIN_ZOOM = 1
const MAX_ZOOM = 3.5
const DEFAULT_ZOOM: BrowserZoomState = { scale: 1, offsetX: 0, offsetY: 0 }
const BROWSER_FRAME_CACHE_LIMIT = 4

type BrowserFrameCacheEntry = {
  uri: string
  metadata: BrowserScreencastFrameMetadata
}

const browserFrameCache = new Map<string, BrowserFrameCacheEntry>()

type BrowserPageParams = {
  worktree: string
  page: string
}

type PendingWheelCommand = {
  base: BrowserPageParams
  point: BrowserPoint
  gestureId: number
  dx: number
  dy: number
}

export function MobileBrowserPane({
  client,
  worktreeId,
  tab,
  screencastSupported,
  keyboardLift,
  bottomInset,
  onToast
}: MobileBrowserPaneProps) {
  const [browserViewMode, setBrowserViewMode] = useState<MobileBrowserViewMode>(() =>
    getInitialMobileBrowserViewMode(worktreeId, tab.browserPageId)
  )
  const cacheKey = makeBrowserFrameCacheKey(worktreeId, tab.browserPageId, browserViewMode)
  const cachedInitialFrame = peekCachedBrowserFrame(cacheKey)
  const [addressValue, setAddressValue] = useState(displayBrowserUrl(tab.url))
  const [addressFocused, setAddressFocused] = useState(false)
  const [addressSyncState, setAddressSyncState] = useState({
    focused: false,
    url: tab.url
  })
  const [keyboardValue, setKeyboardValue] = useState('')
  const [frameUri, setFrameUri] = useState<string | null>(cachedInitialFrame?.uri ?? null)
  const [frameMetadata, setFrameMetadata] = useState<BrowserScreencastFrameMetadata | null>(
    cachedInitialFrame?.metadata ?? null
  )
  const [ready, setReady] = useState(cachedInitialFrame !== null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<BrowserDialogState | null>(null)
  const [pointerModifiers, setPointerModifiers] = useState<BrowserPointerModifier[]>([])
  const [zoom, setZoom] = useState<BrowserZoomState>(DEFAULT_ZOOM)
  const [layout, setLayout] = useState<BrowserTouchLayout | null>(null)
  const [appActive, setAppActive] = useState(AppState.currentState === 'active')
  const streamGenerationRef = useRef(0)
  const layoutRef = useRef<BrowserTouchLayout | null>(null)
  const frameMetadataRef = useRef<BrowserScreencastFrameMetadata | null>(
    cachedInitialFrame?.metadata ?? null
  )
  const frameUriRef = useRef<string | null>(cachedInitialFrame?.uri ?? null)
  const frameMountedRef = useRef(cachedInitialFrame !== null)
  const browserImageRefs = useRef<[Image | null, Image | null]>([null, null])
  const browserLayerRefs = useRef<[View | null, View | null]>([null, null])
  const pendingFrameLayerRef = useRef<FrameLayer | null>(null)
  const visibleFrameLayerRef = useRef<FrameLayer>(0)
  const readyRef = useRef(cachedInitialFrame !== null)
  const busyRef = useRef(false)
  const lastAppliedFrameAtRef = useRef(0)
  const pendingThrottledFrameRef = useRef<{
    frame: BrowserScreencastFrame
    cacheKey: string
  } | null>(null)
  const frameThrottleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dialogRef = useRef<BrowserDialogState | null>(null)
  const lastStreamCacheKeyRef = useRef<string | null>(cacheKey)
  const startPointRef = useRef<{ x: number; y: number; t: number } | null>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rightClickSentRef = useRef(false)
  const lastWheelRef = useRef<{ dx: number; dy: number; at: number }>({ dx: 0, dy: 0, at: 0 })
  const wheelGestureIdRef = useRef(0)
  const pendingWheelCommandRef = useRef<PendingWheelCommand | null>(null)
  const wheelCommandInFlightRef = useRef(false)
  const zoomRef = useRef<BrowserZoomState>(DEFAULT_ZOOM)
  const pinchRef = useRef<PinchGesture | null>(null)
  const panRef = useRef<PanGesture | null>(null)
  const scrollingRef = useRef(false)
  const lastZoomResetUrlRef = useRef(tab.url || 'about:blank')

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  const setRootViewRef = useCallback(
    (node: View | null) => {
      // Why: long-press right-click timers belong to this responder surface;
      // clearing from ref cleanup preserves the same unmount boundary.
      if (node === null) {
        clearLongPressTimer()
      }
    },
    [clearLongPressTimer]
  )

  const resetBrowserZoomState = useCallback(() => {
    clearLongPressTimer()
    pinchRef.current = null
    panRef.current = null
    scrollingRef.current = false
    startPointRef.current = null
    zoomRef.current = DEFAULT_ZOOM
    setZoom(DEFAULT_ZOOM)
  }, [clearLongPressTimer])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const active = nextState === 'active'
      if (!active) {
        clearCachedBrowserFramesForWorktree(worktreeId)
      }
      setAppActive(active)
    })
    return () => {
      subscription.remove()
    }
  }, [worktreeId])

  const addressSync = resolveMobileBrowserAddressSync(addressSyncState, {
    focused: addressFocused,
    url: tab.url
  })
  if (addressSync.nextState !== addressSyncState) {
    setAddressSyncState(addressSync.nextState)
    if (addressSync.shouldSyncValue) {
      // Why: keep browser stream/goto address updates intact, but avoid a
      // stale post-blur paint when the tab URL is the source of truth.
      setAddressValue(displayBrowserUrl(tab.url))
    }
  }

  useLayoutEffect(() => {
    // Why: gesture and stream handlers need committed values before passive
    // Effects flush, without leaking refs from an uncommitted render.
    frameMetadataRef.current = frameMetadata
    layoutRef.current = layout
    dialogRef.current = dialog
    zoomRef.current = zoom
  }, [dialog, frameMetadata, layout, zoom])

  useEffect(() => {
    lastZoomResetUrlRef.current = tab.url || 'about:blank'
    resetBrowserZoomState()
  }, [resetBrowserZoomState, tab.browserPageId, tab.url])

  const pageParams = useCallback(() => {
    if (!tab.browserPageId) {
      return null
    }
    return {
      worktree: `id:${worktreeId}`,
      page: tab.browserPageId
    }
  }, [tab.browserPageId, worktreeId])

  const applyFrame = useCallback((frame: BrowserScreencastFrame, frameCacheKey: string): void => {
    if (!browserFrameMetadataEqual(frameMetadataRef.current, frame.metadata)) {
      frameMetadataRef.current = frame.metadata
      setFrameMetadata(frame.metadata)
    }
    const nextFrameUri = createBrowserFrameDataUri(frame)
    cacheBrowserFrame(frameCacheKey, { uri: nextFrameUri, metadata: frame.metadata })
    if (!frameMountedRef.current) {
      frameUriRef.current = nextFrameUri
      frameMountedRef.current = true
      setFrameUri(nextFrameUri)
      updateBrowserImageSource(browserImageRefs.current[0], nextFrameUri)
    } else if (pendingFrameLayerRef.current === null) {
      // Why: decode the next frame offscreen and keep the previous layer visible
      // until onLoad; replacing the visible Image directly flashes black.
      const nextLayer: FrameLayer = visibleFrameLayerRef.current === 0 ? 1 : 0
      frameUriRef.current = nextFrameUri
      pendingFrameLayerRef.current = nextLayer
      updateBrowserImageSource(browserImageRefs.current[nextLayer], nextFrameUri)
    } else {
      // Why: popovers/menus can settle in one final frame while the previous
      // offscreen frame is still decoding. Keep the hidden layer pointed at
      // the newest frame instead of dropping the final static state.
      frameUriRef.current = nextFrameUri
      updateBrowserImageSource(browserImageRefs.current[pendingFrameLayerRef.current], nextFrameUri)
    }
    if (busyRef.current) {
      busyRef.current = false
      setBusy(false)
    }
    if (!readyRef.current) {
      readyRef.current = true
      setReady(true)
    }
  }, [])

  const clearFrameThrottle = useCallback(() => {
    pendingThrottledFrameRef.current = null
    if (frameThrottleTimerRef.current) {
      clearTimeout(frameThrottleTimerRef.current)
      frameThrottleTimerRef.current = null
    }
  }, [])

  const applyFrameThrottled = useCallback(
    (frame: BrowserScreencastFrame, frameCacheKey: string): void => {
      const now = Date.now()
      const elapsed = now - lastAppliedFrameAtRef.current
      if (lastAppliedFrameAtRef.current === 0 || elapsed >= MOBILE_BROWSER_FRAME_MIN_INTERVAL_MS) {
        clearFrameThrottle()
        lastAppliedFrameAtRef.current = now
        applyFrame(frame, frameCacheKey)
        return
      }

      // Why: static UI changes can be the last frame Chromium emits. Coalesce
      // throttled frames so the final visible state is applied after the delay.
      pendingThrottledFrameRef.current = { frame, cacheKey: frameCacheKey }
      if (frameThrottleTimerRef.current) {
        return
      }
      frameThrottleTimerRef.current = setTimeout(
        () => {
          frameThrottleTimerRef.current = null
          const pending = pendingThrottledFrameRef.current
          pendingThrottledFrameRef.current = null
          if (!pending) {
            return
          }
          lastAppliedFrameAtRef.current = Date.now()
          applyFrame(pending.frame, pending.cacheKey)
        },
        Math.max(0, MOBILE_BROWSER_FRAME_MIN_INTERVAL_MS - elapsed)
      )
    },
    [applyFrame, clearFrameThrottle]
  )

  const streamRequest = useMemo(
    () => buildMobileBrowserScreencastRequest(layout, PixelRatio.get(), browserViewMode),
    [browserViewMode, layout]
  )

  const frameGeometry = useMemo(
    () => computeBrowserFrameGeometry(layout, frameMetadata),
    [frameMetadata, layout]
  )

  useEffect(() => {
    if (!frameGeometry) {
      return
    }
    setZoom((current) => {
      const next = clampBrowserZoomState(current, frameGeometry, MIN_ZOOM, MAX_ZOOM)
      if (
        next.scale === current.scale &&
        next.offsetX === current.offsetX &&
        next.offsetY === current.offsetY
      ) {
        return current
      }
      // Why: rotation/layout changes can shrink the legal pan range while the
      // current zoom state still points at the previous viewport geometry.
      zoomRef.current = next
      return next
    })
  }, [frameGeometry])

  useEffect(() => {
    streamGenerationRef.current += 1
    const generation = streamGenerationRef.current
    const sameStream = Boolean(cacheKey) && lastStreamCacheKeyRef.current === cacheKey
    lastStreamCacheKeyRef.current = cacheKey
    if (!sameStream || !frameUriRef.current) {
      const cachedFrame = getCachedBrowserFrame(cacheKey)
      if (cachedFrame) {
        frameUriRef.current = cachedFrame.uri
        frameMountedRef.current = true
        frameMetadataRef.current = cachedFrame.metadata
        setFrameUri(cachedFrame.uri)
        setFrameMetadata(cachedFrame.metadata)
        readyRef.current = true
        setReady(true)
      } else {
        frameUriRef.current = null
        frameMountedRef.current = false
        setFrameUri(null)
        setFrameMetadata(null)
        frameMetadataRef.current = null
        readyRef.current = false
        setReady(false)
      }
    } else {
      frameMountedRef.current = true
    }
    pendingFrameLayerRef.current = null
    if (!sameStream || !frameUriRef.current) {
      visibleFrameLayerRef.current = 0
    }
    updateBrowserLayerVisibility(browserLayerRefs.current, visibleFrameLayerRef.current)
    lastAppliedFrameAtRef.current = 0
    clearFrameThrottle()
    busyRef.current = false
    setDialog(null)
    setError(null)
    if (
      !client ||
      screencastSupported !== true ||
      !tab.browserPageId ||
      !appActive ||
      !streamRequest
    ) {
      busyRef.current = false
      setBusy(false)
      if (screencastSupported === false) {
        setError('Update desktop Yiru to stream browser tabs on mobile.')
      } else if (screencastSupported === null) {
        setError('Checking desktop browser streaming support.')
      } else if (!tab.browserPageId) {
        setError('Browser page is not available yet.')
      }
      return
    }
    busyRef.current = true
    setBusy(true)
    let startupTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (streamGenerationRef.current !== generation) {
        return
      }
      busyRef.current = false
      setBusy(false)
      setError('Browser stream timed out.')
    }, 15_000)
    const clearStartupTimer = (): void => {
      if (startupTimer) {
        clearTimeout(startupTimer)
        startupTimer = null
      }
    }
    const unsubscribe = client.subscribe(
      'browser.screencast',
      {
        worktree: `id:${worktreeId}`,
        page: tab.browserPageId,
        ...streamRequest
      },
      (payload) => {
        if (streamGenerationRef.current !== generation) {
          return
        }
        const event = payload as {
          type?: string
          message?: string
          error?: { message?: string }
          dialogType?: string
          tab?: { url?: string; title?: string; canGoBack?: boolean; canGoForward?: boolean }
        }
        if (event.type === 'ready') {
          clearStartupTimer()
          if (!readyRef.current) {
            readyRef.current = true
            setReady(true)
          }
          if (busyRef.current) {
            busyRef.current = false
            setBusy(false)
          }
          if (typeof event.tab?.url === 'string') {
            setAddressValue(displayBrowserUrl(event.tab.url))
            if (event.tab.url !== lastZoomResetUrlRef.current) {
              lastZoomResetUrlRef.current = event.tab.url
              resetBrowserZoomState()
            }
          }
        } else if (event.type === 'end') {
          clearStartupTimer()
          if (readyRef.current) {
            readyRef.current = false
            setReady(false)
          }
          if (busyRef.current) {
            busyRef.current = false
            setBusy(false)
          }
        } else if (event.type === 'dialog') {
          setDialog({
            dialogType: event.dialogType ?? 'alert',
            message: event.message ?? 'Browser dialog'
          })
        } else if (event.type === 'dialogClosed') {
          setDialog(null)
        } else if (event.type === 'error') {
          clearStartupTimer()
          if (busyRef.current) {
            busyRef.current = false
            setBusy(false)
          }
          const message = event.message ?? event.error?.message ?? 'Browser stream failed.'
          if (shouldSurfaceBrowserError(message)) {
            if (readyRef.current) {
              readyRef.current = false
              setReady(false)
            }
            setError(message)
          }
        }
      },
      {
        onBinaryFrame: (frame) => {
          if (streamGenerationRef.current !== generation) {
            return
          }
          clearStartupTimer()
          if (cacheKey) {
            applyFrameThrottled(frame, cacheKey)
          }
        }
      }
    )
    return () => {
      clearStartupTimer()
      clearFrameThrottle()
      unsubscribe()
    }
  }, [
    appActive,
    applyFrameThrottled,
    clearFrameThrottle,
    client,
    resetBrowserZoomState,
    screencastSupported,
    streamRequest,
    cacheKey,
    tab.browserPageId,
    worktreeId
  ])

  const sendBrowserRequest = useCallback(
    async (
      method: string,
      params: Record<string, unknown> = {},
      opts: { showBusy?: boolean; suppressError?: boolean; timeoutMs?: number } = {}
    ): Promise<unknown | null> => {
      const base = pageParams()
      if (!client || !base) {
        return null
      }
      if (opts.showBusy) {
        busyRef.current = true
        setBusy(true)
      }
      try {
        const response = await client.sendRequest(
          method,
          { ...base, ...params },
          { timeoutMs: opts.timeoutMs ?? 15_000 }
        )
        if (!response.ok) {
          throw new Error((response as RpcFailure).error.message)
        }
        setError(null)
        return (response as RpcSuccess).result
      } catch (err) {
        const message = browserErrorMessage(err, 'Browser command failed')
        if (!opts.suppressError && shouldSurfaceBrowserError(message)) {
          setError(message)
        }
        return null
      } finally {
        if (opts.showBusy) {
          busyRef.current = false
          setBusy(false)
        }
      }
    },
    [client, pageParams]
  )

  const navigateToAddress = useCallback(async () => {
    const url = normalizeBrowserUrl(addressValue)
    if (!url) {
      setError('Enter a valid URL.')
      return
    }
    const result = (await sendBrowserRequest(
      'browser.goto',
      { url },
      { showBusy: true, timeoutMs: 30_000 }
    )) as { url?: string } | null
    if (typeof result?.url === 'string') {
      setAddressValue(displayBrowserUrl(result.url))
      lastZoomResetUrlRef.current = result.url
      resetBrowserZoomState()
    }
  }, [addressValue, resetBrowserZoomState, sendBrowserRequest])

  const flushPendingWheelCommand = useCallback(() => {
    if (wheelCommandInFlightRef.current) {
      return
    }
    const pending = pendingWheelCommandRef.current
    if (!pending || !client) {
      return
    }
    pendingWheelCommandRef.current = null
    wheelCommandInFlightRef.current = true
    void (async () => {
      try {
        assertRpcOk(
          await client.sendRequest('browser.mouseMove', {
            ...pending.base,
            x: pending.point.x,
            y: pending.point.y
          }),
          'Browser pointer move failed'
        )
        assertRpcOk(
          await client.sendRequest('browser.mouseWheel', {
            ...pending.base,
            dx: pending.dx,
            dy: pending.dy
          }),
          'Browser scroll failed'
        )
        setError(null)
      } catch {
        // Scroll bursts commonly race page reload/navigation. Avoid replacing
        // the live browser with transient command errors like selector_not_found.
      } finally {
        wheelCommandInFlightRef.current = false
        flushPendingWheelCommand()
      }
    })()
  }, [client])

  const sendPointerClick = useCallback(
    async (point: BrowserPoint, button: 'left' | 'right') => {
      const base = pageParams()
      if (!client || !base) {
        return
      }
      const clickResult = await sendBrowserRequest(
        'browser.mouseClick',
        {
          x: point.x,
          y: point.y,
          button,
          modifiers: pointerModifiers,
          ...(button === 'left'
            ? {
                radius: computeBrowserTouchClickRadiusCss(
                  layoutRef.current,
                  frameMetadataRef.current,
                  zoomRef.current,
                  TOUCH_CLICK_RADIUS_DIP
                )
              }
            : {})
        },
        { suppressError: true, timeoutMs: 5_000 }
      )
      if (clickResult !== null || pointerModifiers.length > 0) {
        return
      }
      try {
        assertRpcOk(
          await client.sendRequest('browser.mouseMove', { ...base, x: point.x, y: point.y }),
          'Browser pointer move failed'
        )
        assertRpcOk(
          await client.sendRequest('browser.mouseDown', { ...base, button }),
          'Browser pointer down failed'
        )
        assertRpcOk(
          await client.sendRequest('browser.mouseUp', { ...base, button }),
          'Browser pointer up failed'
        )
        setError(null)
      } catch {
        // Pointer commands can race page navigation. Keep the stream visible;
        // actionable failures still surface through navigation/stream errors.
      }
    },
    [client, pageParams, pointerModifiers, sendBrowserRequest]
  )

  const togglePointerModifier = useCallback((modifier: BrowserPointerModifier) => {
    setPointerModifiers((current) =>
      current.includes(modifier)
        ? current.filter((candidate) => candidate !== modifier)
        : [...current, modifier]
    )
  }, [])

  const sendWheel = useCallback(
    (point: BrowserPoint, screenDx: number, screenDy: number) => {
      const base = pageParams()
      if (!client || !base) {
        return
      }
      const currentLayout = layoutRef.current
      const geometry = computeBrowserFrameGeometry(currentLayout, frameMetadataRef.current)
      const localZoom = zoomRef.current.scale
      const scale = (geometry?.scale ?? 1) * localZoom
      const cssDx = screenDx / scale
      const cssDy = screenDy / scale
      const delta = { dx: Math.round(-cssDx), dy: Math.round(-cssDy) }
      if (Math.abs(delta.dx) < 1 && Math.abs(delta.dy) < 1) {
        return
      }
      const pending = pendingWheelCommandRef.current
      pendingWheelCommandRef.current =
        pending &&
        pending.base.page === base.page &&
        pending.gestureId === wheelGestureIdRef.current
          ? {
              base,
              point,
              gestureId: wheelGestureIdRef.current,
              dx: pending.dx + delta.dx,
              dy: pending.dy + delta.dy
            }
          : { base, point, gestureId: wheelGestureIdRef.current, ...delta }
      flushPendingWheelCommand()
    },
    [client, flushPendingWheelCommand, pageParams]
  )

  const mapTouchPoint = useCallback((locationX: number, locationY: number): BrowserPoint | null => {
    return mapScreenToBrowserPoint(
      locationX,
      locationY,
      layoutRef.current,
      frameMetadataRef.current,
      zoomRef.current
    )
  }, [])

  const handleResponderGrant = useCallback(
    (event: GestureResponderEvent) => {
      const pinch = createPinchGesture(event, frameGeometry, zoomRef.current)
      if (pinch) {
        clearLongPressTimer()
        pinchRef.current = pinch
        panRef.current = null
        startPointRef.current = null
        return
      }
      const startPoint = readLocalTouchPoint(event.nativeEvent)
      if (!startPoint) {
        return
      }
      startPointRef.current = { x: startPoint.x, y: startPoint.y, t: Date.now() }
      rightClickSentRef.current = false
      scrollingRef.current = false
      wheelGestureIdRef.current += 1
      lastWheelRef.current = { dx: 0, dy: 0, at: 0 }
      panRef.current =
        zoomRef.current.scale > MIN_ZOOM
          ? {
              x: startPoint.x,
              y: startPoint.y,
              offsetX: zoomRef.current.offsetX,
              offsetY: zoomRef.current.offsetY
            }
          : null
      clearLongPressTimer()
      longPressTimerRef.current = setTimeout(() => {
        const start = startPointRef.current
        if (!start) {
          return
        }
        const point = mapTouchPoint(start.x, start.y)
        if (!point) {
          return
        }
        rightClickSentRef.current = true
        void sendPointerClick(point, 'right')
        onToast('Right click')
      }, LONG_PRESS_MS)
    },
    [clearLongPressTimer, frameGeometry, mapTouchPoint, onToast, sendPointerClick]
  )

  const handleResponderMove = useCallback(
    (event: GestureResponderEvent, gesture: PanResponderGestureState) => {
      const startedPinch = pinchRef.current
        ? null
        : createPinchGesture(event, frameGeometry, zoomRef.current)
      if (startedPinch) {
        clearLongPressTimer()
        pinchRef.current = startedPinch
        panRef.current = null
        startPointRef.current = null
      }
      const activePinch = pinchRef.current
      const nextPinch = activePinch ? updatePinchZoom(event, frameGeometry, activePinch) : null
      if (nextPinch) {
        clearLongPressTimer()
        zoomRef.current = nextPinch
        setZoom(nextPinch)
        return
      }
      if (activePinch) {
        pinchRef.current = null
      }
      const moved = Math.hypot(gesture.dx, gesture.dy)
      if (moved > TAP_SLOP) {
        clearLongPressTimer()
      }
      const activePan = panRef.current
      if (activePan && frameGeometry) {
        const currentPoint = readLocalTouchPoint(event.nativeEvent)
        if (!currentPoint) {
          return
        }
        if (!scrollingRef.current && moved <= TAP_SLOP) {
          return
        }
        scrollingRef.current = true
        startPointRef.current = null
        const nextZoom = clampBrowserZoomState(
          {
            scale: zoomRef.current.scale,
            offsetX: activePan.offsetX + currentPoint.x - activePan.x,
            offsetY: activePan.offsetY + currentPoint.y - activePan.y
          },
          frameGeometry,
          MIN_ZOOM,
          MAX_ZOOM
        )
        zoomRef.current = nextZoom
        setZoom(nextZoom)
        return
      }
      if (!scrollingRef.current) {
        if (moved <= SCROLL_START_SLOP) {
          return
        }
        scrollingRef.current = true
        startPointRef.current = null
      }
      const now = Date.now()
      if (now - lastWheelRef.current.at < WHEEL_INTERVAL_MS) {
        return
      }
      const deltaX = gesture.dx - lastWheelRef.current.dx
      const deltaY = gesture.dy - lastWheelRef.current.dy
      if (Math.abs(deltaX) + Math.abs(deltaY) < 8) {
        return
      }
      const currentPoint = readLocalTouchPoint(event.nativeEvent)
      if (!currentPoint) {
        return
      }
      const point = mapTouchPoint(currentPoint.x, currentPoint.y)
      if (!point) {
        return
      }
      lastWheelRef.current = { dx: gesture.dx, dy: gesture.dy, at: now }
      sendWheel(point, deltaX, deltaY)
    },
    [clearLongPressTimer, frameGeometry, mapTouchPoint, sendWheel]
  )

  const handleResponderRelease = useCallback(
    (event: GestureResponderEvent, gesture: PanResponderGestureState) => {
      clearLongPressTimer()
      pinchRef.current = null
      panRef.current = null
      const start = startPointRef.current
      startPointRef.current = null
      const wasScrolling = scrollingRef.current
      scrollingRef.current = false
      if (!start || rightClickSentRef.current || wasScrolling) {
        return
      }
      const moved = Math.hypot(gesture.dx, gesture.dy)
      if (moved <= TAP_SLOP && Date.now() - start.t < LONG_PRESS_MS) {
        // Why: native browser taps resolve at touch-up. Using touch-down makes
        // tiny finger drift feel like the click lands left/up of the finger.
        const release = readLocalTouchPoint(event.nativeEvent) ?? start
        const point = mapTouchPoint(release.x, release.y)
        if (point) {
          void sendPointerClick(point, 'left')
        }
      }
    },
    [clearLongPressTimer, mapTouchPoint, sendPointerClick]
  )

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => dialogRef.current === null,
        onMoveShouldSetPanResponder: () => dialogRef.current === null,
        onPanResponderGrant: handleResponderGrant,
        onPanResponderMove: handleResponderMove,
        onPanResponderRelease: handleResponderRelease,
        onPanResponderTerminate: () => {
          clearLongPressTimer()
          pinchRef.current = null
          panRef.current = null
          scrollingRef.current = false
          startPointRef.current = null
        },
        onPanResponderTerminationRequest: () => true
      }),
    [clearLongPressTimer, handleResponderGrant, handleResponderMove, handleResponderRelease]
  )

  const sendKeyboardText = useCallback(async () => {
    const text = keyboardValue
    if (!text) {
      return
    }
    setKeyboardValue('')
    const result = await sendBrowserRequest(
      'browser.keyboardInsertText',
      { text },
      { suppressError: true }
    )
    if (result !== null) {
      onToast('Sent')
    } else {
      setKeyboardValue(text)
    }
  }, [keyboardValue, onToast, sendBrowserRequest])

  const sendKeypress = useCallback(
    async (key: string) => {
      await sendBrowserRequest('browser.keypress', { key }, { suppressError: true })
    },
    [sendBrowserRequest]
  )

  const sendDialogCommand = useCallback(
    async (method: 'browser.dialogAccept' | 'browser.dialogDismiss') => {
      setDialog(null)
      await sendBrowserRequest(method, {}, { suppressError: true, timeoutMs: 5_000 })
    },
    [sendBrowserRequest]
  )

  const setBrowserImageRef = useCallback((layer: FrameLayer, image: Image | null) => {
    browserImageRefs.current[layer] = image
    const currentFrameUri = frameUriRef.current
    if (image && currentFrameUri) {
      updateBrowserImageSource(image, currentFrameUri)
    }
  }, [])
  const setBrowserLayerRef = useCallback((layer: FrameLayer, view: View | null) => {
    browserLayerRefs.current[layer] = view
    updateBrowserLayerVisibility(browserLayerRefs.current, visibleFrameLayerRef.current)
  }, [])
  const setBrowserLayer0Ref = useCallback(
    (view: View | null) => setBrowserLayerRef(0, view),
    [setBrowserLayerRef]
  )
  const setBrowserLayer1Ref = useCallback(
    (view: View | null) => setBrowserLayerRef(1, view),
    [setBrowserLayerRef]
  )
  const setBrowserImageLayer0Ref = useCallback(
    (image: Image | null) => setBrowserImageRef(0, image),
    [setBrowserImageRef]
  )
  const setBrowserImageLayer1Ref = useCallback(
    (image: Image | null) => setBrowserImageRef(1, image),
    [setBrowserImageRef]
  )

  const handleBrowserImageLoad = useCallback((layer: FrameLayer) => {
    if (pendingFrameLayerRef.current !== layer) {
      return
    }
    pendingFrameLayerRef.current = null
    visibleFrameLayerRef.current = layer
    updateBrowserLayerVisibility(browserLayerRefs.current, layer)
  }, [])
  const handleBrowserImageLayer0Load = useCallback(
    () => handleBrowserImageLoad(0),
    [handleBrowserImageLoad]
  )
  const handleBrowserImageLayer1Load = useCallback(
    () => handleBrowserImageLoad(1),
    [handleBrowserImageLoad]
  )
  const handleBrowserImageError = useCallback((layer: FrameLayer) => {
    if (pendingFrameLayerRef.current === layer) {
      pendingFrameLayerRef.current = null
    }
  }, [])
  const handleBrowserImageLayer0Error = useCallback(
    () => handleBrowserImageError(0),
    [handleBrowserImageError]
  )
  const handleBrowserImageLayer1Error = useCallback(
    () => handleBrowserImageError(1),
    [handleBrowserImageError]
  )

  const controlsDisabled = !client || !tab.browserPageId || screencastSupported !== true
  const addressSelection = useMemo(
    () => (addressFocused ? undefined : { start: 0, end: 0 }),
    [addressFocused]
  )
  const goBack = useCallback(() => {
    if (controlsDisabled || !tab.canGoBack) {
      return
    }
    void sendBrowserRequest('browser.back', {}, { suppressError: true })
  }, [controlsDisabled, sendBrowserRequest, tab.canGoBack])
  const goForward = useCallback(() => {
    if (controlsDisabled || !tab.canGoForward) {
      return
    }
    void sendBrowserRequest('browser.forward', {}, { suppressError: true })
  }, [controlsDisabled, sendBrowserRequest, tab.canGoForward])
  const reloadPage = useCallback(() => {
    if (controlsDisabled) {
      return
    }
    void sendBrowserRequest('browser.reload', {}, { suppressError: true })
  }, [controlsDisabled, sendBrowserRequest])
  const selectBrowserViewMode = useCallback(
    (mode: MobileBrowserViewMode) => {
      if (browserViewMode === mode) {
        return
      }
      // Why: browser panes can remount during normal tab/workspace navigation;
      // keep a page-scoped choice while new browser pages still default to Web.
      saveMobileBrowserViewMode(worktreeId, tab.browserPageId, mode)
      setBrowserViewMode(mode)
      resetBrowserZoomState()
    },
    [browserViewMode, resetBrowserZoomState, tab.browserPageId, worktreeId]
  )
  const renderedFrameSource =
    frameUriRef.current || frameUri ? { uri: frameUriRef.current ?? frameUri! } : null
  const frameLayerClassName = useCallback((layer: FrameLayer) => {
    return cn(
      styles.browserImageLayer,
      visibleFrameLayerRef.current !== layer && styles.browserImageLayerHidden
    )
  }, [])
  const browserLayerRef = useCallback(
    (layer: FrameLayer) => (layer === 0 ? setBrowserLayer0Ref : setBrowserLayer1Ref),
    [setBrowserLayer0Ref, setBrowserLayer1Ref]
  )
  const frameLayerRef = useCallback(
    (layer: FrameLayer) => (layer === 0 ? setBrowserImageLayer0Ref : setBrowserImageLayer1Ref),
    [setBrowserImageLayer0Ref, setBrowserImageLayer1Ref]
  )
  const frameLayerLoadHandler = useCallback(
    (layer: FrameLayer) =>
      layer === 0 ? handleBrowserImageLayer0Load : handleBrowserImageLayer1Load,
    [handleBrowserImageLayer0Load, handleBrowserImageLayer1Load]
  )
  const frameLayerErrorHandler = useCallback(
    (layer: FrameLayer) =>
      layer === 0 ? handleBrowserImageLayer0Error : handleBrowserImageLayer1Error,
    [handleBrowserImageLayer0Error, handleBrowserImageLayer1Error]
  )

  return (
    <View ref={setRootViewRef} className={styles.root}>
      <View className={styles.toolbar}>
        <MobileBrowserToolbarIconButton
          disabled={controlsDisabled || !tab.canGoBack}
          label="Back"
          onPress={goBack}
        >
          <ChevronLeft size={15} colorClassName="accent-muted-foreground" />
        </MobileBrowserToolbarIconButton>
        <MobileBrowserToolbarIconButton
          disabled={controlsDisabled || !tab.canGoForward}
          label="Forward"
          onPress={goForward}
        >
          <ChevronRight size={15} colorClassName="accent-muted-foreground" />
        </MobileBrowserToolbarIconButton>
        <MobileBrowserToolbarIconButton
          disabled={controlsDisabled}
          label="Reload"
          onPress={reloadPage}
        >
          <RefreshCw size={15} colorClassName="accent-muted-foreground" />
        </MobileBrowserToolbarIconButton>
        <TextInput
          className={styles.addressInput}
          style={{ includeFontPadding: false, textAlignVertical: 'center' }}
          value={addressValue}
          onChangeText={setAddressValue}
          onFocus={() => setAddressFocused(true)}
          onBlur={() => setAddressFocused(false)}
          onSubmitEditing={() => void navigateToAddress()}
          selectTextOnFocus
          selection={addressSelection}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={Platform.OS === 'ios' ? 'url' : 'default'}
          numberOfLines={1}
          returnKeyType="go"
          placeholder="URL"
          placeholderTextColorClassName="accent-muted-foreground"
          editable={!controlsDisabled}
        />
        <MobileBrowserViewModeSwitch
          disabled={controlsDisabled}
          value={browserViewMode}
          onChange={selectBrowserViewMode}
        />
      </View>

      <View
        className={styles.viewport}
        onLayout={(event) => {
          const next = {
            width: event.nativeEvent.layout.width,
            height: event.nativeEvent.layout.height
          }
          const current = layoutRef.current
          if (current && current.width === next.width && current.height === next.height) {
            return
          }
          layoutRef.current = next
          setLayout(next)
        }}
        {...panResponder.panHandlers}
      >
        {renderedFrameSource ? (
          <View className={styles.browserImageHost}>
            {frameGeometry ? (
              <View
                pointerEvents="none"
                className={styles.browserZoomOffset}
                style={[
                  {
                    width: frameGeometry.renderedWidth,
                    height: frameGeometry.renderedHeight,
                    transform: [{ translateX: zoom.offsetX }, { translateY: zoom.offsetY }]
                  }
                ]}
              >
                <View
                  className={styles.browserFrameBox}
                  style={[
                    {
                      width: frameGeometry.renderedWidth,
                      height: frameGeometry.renderedHeight,
                      transform: [{ scale: zoom.scale }]
                    }
                  ]}
                >
                  {([0, 1] as const).map((layer) => (
                    <View
                      key={layer}
                      ref={browserLayerRef(layer)}
                      pointerEvents="none"
                      className={frameLayerClassName(layer)}
                    >
                      <Image
                        ref={frameLayerRef(layer)}
                        source={renderedFrameSource}
                        resizeMode="stretch"
                        fadeDuration={0}
                        onLoad={frameLayerLoadHandler(layer)}
                        onError={frameLayerErrorHandler(layer)}
                        className={styles.browserImage}
                        style={[
                          {
                            width: frameGeometry.renderedWidth,
                            height: frameGeometry.renderedHeight
                          }
                        ]}
                      />
                    </View>
                  ))}
                </View>
              </View>
            ) : (
              ([0, 1] as const).map((layer) => (
                <View
                  key={layer}
                  ref={browserLayerRef(layer)}
                  pointerEvents="none"
                  className={frameLayerClassName(layer)}
                >
                  <Image
                    ref={frameLayerRef(layer)}
                    source={renderedFrameSource}
                    resizeMode="contain"
                    fadeDuration={0}
                    onLoad={frameLayerLoadHandler(layer)}
                    onError={frameLayerErrorHandler(layer)}
                    className={styles.browserImageFill}
                  />
                </View>
              ))
            )}
          </View>
        ) : null}
        {!renderedFrameSource || busy || error ? (
          <View pointerEvents="none" className={styles.overlay}>
            {busy || (!ready && !error) ? (
              <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
            ) : null}
            {error ? <Text className={styles.errorText}>{error}</Text> : null}
          </View>
        ) : null}
        {dialog ? (
          <View className={styles.dialogOverlay}>
            <View className={styles.dialogCard}>
              <Text className={styles.dialogTitle}>Browser Dialog</Text>
              <Text className={styles.dialogMessage}>{dialog.message}</Text>
              <View className={styles.dialogActions}>
                {dialog.dialogType !== 'alert' ? (
                  <Pressable
                    className={cn(styles.dialogButton, styles.dialogButtonPressedActive)}
                    onPress={() => void sendDialogCommand('browser.dialogDismiss')}
                  >
                    <Text className={styles.dialogButtonText}>Cancel</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  className={cn(
                    styles.dialogButton,
                    styles.dialogButtonPrimary,
                    styles.dialogButtonPressedActive
                  )}
                  onPress={() => void sendDialogCommand('browser.dialogAccept')}
                >
                  <Text className={cn(styles.dialogButtonText, styles.dialogButtonPrimaryText)}>
                    OK
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
      </View>

      <View
        className={styles.keyboardDock}
        style={[{ paddingBottom: bottomInset, transform: [{ translateY: -keyboardLift }] }]}
      >
        <MobileBrowserPointerModifiers
          disabled={controlsDisabled}
          selectedModifiers={pointerModifiers}
          onToggle={togglePointerModifier}
        />
        <MobileBrowserKeyRow
          disabled={controlsDisabled}
          onKeypress={(key) => void sendKeypress(key)}
        />
        <View className={styles.inputRow}>
          <TextInput
            className={styles.keyboardInput}
            value={keyboardValue}
            onChangeText={setKeyboardValue}
            placeholder="Type on page…"
            placeholderTextColorClassName="accent-muted-foreground"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!controlsDisabled}
            onSubmitEditing={() => void sendKeyboardText()}
          />
          <Pressable
            className={cn(
              styles.sendButton,
              (controlsDisabled || !keyboardValue) && styles.disabled
            )}
            disabled={controlsDisabled || !keyboardValue}
            onPress={() => void sendKeyboardText()}
            accessibilityLabel="Send text to browser"
          >
            <ArrowUp size={18} colorClassName="accent-muted-foreground" />
          </Pressable>
        </View>
      </View>
    </View>
  )
}

function createBrowserFrameDataUri(frame: BrowserScreencastFrame): string {
  return `data:image/${frame.format};base64,${Buffer.from(frame.image).toString('base64')}`
}

function makeBrowserFrameCacheKey(
  worktreeId: string,
  browserPageId: string | null,
  viewMode: MobileBrowserViewMode
): string | null {
  return browserPageId ? `${worktreeId}:${browserPageId}:${viewMode}` : null
}

function clearCachedBrowserFramesForWorktree(worktreeId: string): void {
  const prefix = `${worktreeId}:`
  for (const key of browserFrameCache.keys()) {
    if (key.startsWith(prefix)) {
      browserFrameCache.delete(key)
    }
  }
}

function getCachedBrowserFrame(cacheKey: string | null): BrowserFrameCacheEntry | null {
  if (!cacheKey) {
    return null
  }
  const cached = browserFrameCache.get(cacheKey)
  if (!cached) {
    return null
  }
  browserFrameCache.delete(cacheKey)
  browserFrameCache.set(cacheKey, cached)
  return cached
}

function peekCachedBrowserFrame(cacheKey: string | null): BrowserFrameCacheEntry | null {
  return cacheKey ? (browserFrameCache.get(cacheKey) ?? null) : null
}

function cacheBrowserFrame(cacheKey: string | null, entry: BrowserFrameCacheEntry): void {
  if (!cacheKey) {
    return
  }
  browserFrameCache.delete(cacheKey)
  browserFrameCache.set(cacheKey, entry)
  while (browserFrameCache.size > BROWSER_FRAME_CACHE_LIMIT) {
    const oldestKey = browserFrameCache.keys().next().value
    if (typeof oldestKey !== 'string') {
      break
    }
    browserFrameCache.delete(oldestKey)
  }
}

function updateBrowserLayerVisibility(
  layers: [View | null, View | null],
  visible: FrameLayer
): void {
  for (const [index, layer] of layers.entries()) {
    layer?.setNativeProps({ style: { opacity: index === visible ? 1 : 0 } })
  }
}

function updateBrowserImageSource(image: Image | null, uri: string): void {
  // Why: browser frames are large strings; mutating only the native Image
  // source avoids re-rendering the whole tab view for every streamed frame.
  const source = [{ uri }]
  image?.setNativeProps({ source, src: source })
}

function assertRpcOk(
  response: RpcSuccess | RpcFailure,
  fallbackMessage: string
): asserts response is RpcSuccess {
  if (!response.ok) {
    throw new Error(response.error.message || fallbackMessage)
  }
}

function browserFrameMetadataEqual(
  a: BrowserScreencastFrameMetadata | null,
  b: BrowserScreencastFrameMetadata
): boolean {
  return (
    a?.deviceWidth === b.deviceWidth &&
    a?.deviceHeight === b.deviceHeight &&
    a?.pageScaleFactor === b.pageScaleFactor
  )
}

function browserErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function shouldSurfaceBrowserError(message: string): boolean {
  const normalized = message.toLowerCase()
  // Why: selector_not_found can be emitted by in-flight page automation while
  // the browser is still usable; replacing the frame with it feels like a crash.
  return !normalized.includes('selector_not_found') && !normalized.includes('selector not found')
}

function touchPair(event: GestureResponderEvent): { a: BrowserPoint; b: BrowserPoint } | null {
  const touches = event.nativeEvent.touches
  if (!touches || touches.length < 2) {
    return null
  }
  const a = readLocalTouchPoint(touches[0])
  const b = readLocalTouchPoint(touches[1])
  return a && b ? { a, b } : null
}

function pointDistance(a: BrowserPoint, b: BrowserPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function createPinchGesture(
  event: GestureResponderEvent,
  geometry: BrowserFrameGeometry | null,
  zoom: BrowserZoomState
): PinchGesture | null {
  if (!geometry) {
    return null
  }
  const pair = touchPair(event)
  if (!pair) {
    return null
  }
  const distance = pointDistance(pair.a, pair.b)
  if (distance < 8) {
    return null
  }
  const centerX = (pair.a.x + pair.b.x) / 2
  const centerY = (pair.a.y + pair.b.y) / 2
  const frameCenterX = geometry.offsetX + geometry.renderedWidth / 2 + zoom.offsetX
  const frameCenterY = geometry.offsetY + geometry.renderedHeight / 2 + zoom.offsetY
  return {
    distance,
    scale: zoom.scale,
    anchorX: (centerX - frameCenterX) / zoom.scale,
    anchorY: (centerY - frameCenterY) / zoom.scale
  }
}

function updatePinchZoom(
  event: GestureResponderEvent,
  geometry: BrowserFrameGeometry | null,
  pinch: PinchGesture
): BrowserZoomState | null {
  if (!geometry) {
    return null
  }
  const pair = touchPair(event)
  if (!pair) {
    return null
  }
  const nextScale = Math.min(
    MAX_ZOOM,
    Math.max(MIN_ZOOM, (pinch.scale * pointDistance(pair.a, pair.b)) / pinch.distance)
  )
  const centerX = (pair.a.x + pair.b.x) / 2
  const centerY = (pair.a.y + pair.b.y) / 2
  const baseCenterX = geometry.offsetX + geometry.renderedWidth / 2
  const baseCenterY = geometry.offsetY + geometry.renderedHeight / 2
  return clampBrowserZoomState(
    {
      scale: nextScale,
      offsetX: centerX - baseCenterX - pinch.anchorX * nextScale,
      offsetY: centerY - baseCenterY - pinch.anchorY * nextScale
    },
    geometry,
    MIN_ZOOM,
    MAX_ZOOM
  )
}

const styles = {
  root: cn('flex-1 min-h-0 bg-background'),
  toolbar: cn('min-h-8 flex-row items-center gap-1 px-2 py-[2px] border-b border-b-border bg-card'),
  addressInput: cn(
    'flex-1 min-w-0 h-7 rounded-none bg-secondary text-foreground px-2 py-0 text-[12px] leading-[16px] font-mono'
  ),
  viewport: cn('flex-1 min-h-0 overflow-hidden bg-background'),
  browserImageHost: cn('absolute inset-0 items-center justify-center overflow-hidden'),
  browserImageFill: cn('w-full h-full'),
  browserImageLayer: cn('absolute inset-0 items-center justify-center'),
  browserImageLayerHidden: cn('opacity-[0]'),
  browserZoomOffset: cn('items-center justify-center'),
  browserFrameBox: cn('items-center justify-center overflow-hidden'),
  browserImage: cn('bg-background'),
  overlay: cn('absolute inset-0 items-center justify-center p-6 gap-2 bg-black/20'),
  errorText: cn(
    'text-foreground bg-card border border-border rounded-none px-3 py-2 text-[13px] text-center overflow-hidden'
  ),
  dialogOverlay: cn('absolute inset-0 z-[30] items-center justify-center p-6 bg-black/50'),
  dialogCard: cn('w-full max-w-[360px] rounded-none border border-border bg-card p-4'),
  dialogTitle: cn('text-foreground text-[16px] font-semibold'),
  dialogMessage: cn('text-muted-foreground text-[14px] leading-[20px] mt-2'),
  dialogActions: cn('flex-row justify-end gap-2 mt-4'),
  dialogButton: cn('min-h-[34px] rounded-none bg-secondary px-3 items-center justify-center'),
  dialogButtonPrimary: cn('bg-foreground'),
  dialogButtonPressedActive: cn('active:opacity-[0.75]'),
  dialogButtonText: cn('text-muted-foreground text-[14px] font-semibold'),
  dialogButtonPrimaryText: cn('text-background'),
  keyboardDock: cn('z-[20] border-t border-t-border bg-card'),
  inputRow: cn('flex-row items-center px-3 pt-1 pb-1.5'),
  keyboardInput: cn(
    'flex-1 h-[34px] bg-secondary text-foreground rounded-none px-3 text-[14px] font-mono mr-2'
  ),
  sendButton: cn('w-[34px] h-[34px] rounded-none items-center justify-center bg-secondary'),
  disabled: cn('opacity-[0.35]'),
  disabledText: cn('text-muted-foreground/60')
} as const
