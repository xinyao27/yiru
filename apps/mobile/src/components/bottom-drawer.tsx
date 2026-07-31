import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Pressable,
  Platform,
  useWindowDimensions,
  ScrollView,
  Keyboard,
  BackHandler,
  Modal
} from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation
} from 'react-native-reanimated'
import { FullWindowOverlay } from 'react-native-screens'
import { useCSSVariable } from 'uniwind'

import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView
} from '~/components/uniwind-native-components'
import { useSafeAreaInsets } from '~/components/uniwind-native-components'
import { cn } from '~/style/class-names'
import { resolveCssNumber } from '~/style/resolve-css-variable'

import { useResponsiveLayout } from '../layout/responsive-layout'
import { useInsideBottomDrawerModalHost } from './bottom-drawer-modal-host'
import { resolveBottomDrawerMounted } from './bottom-drawer-mount-state'
import { MobileGlassSurface } from './glass/surface'

const DISMISS_THRESHOLD = 80
const SPRING_CONFIG = { damping: 28, stiffness: 400 }
// Why: negative translateY (pulling up) is damped with a rubber-band factor
// so the drawer resists upward dragging — a subtle polish touch that signals
// the drawer cannot expand further.
const RUBBER_BAND_FACTOR = 0.25
const SHOW_DURATION = 180
export const BOTTOM_DRAWER_HIDE_DURATION_MS = 150
const TOP_SCROLL_EPSILON = 1
const BOTTOM_DRAWER_GLASS_APPEARANCE = {
  fallbackClassName: 'bg-popover',
  tintColorClassName: 'accent-popover'
}

type Props = {
  visible: boolean
  onClose: () => void
  onAfterClose?: () => void
  children: ReactNode
  dragContentToDismiss?: boolean
  contentScrollable?: boolean
  zIndex?: number
}

export function BottomDrawer({
  visible,
  onClose,
  onAfterClose,
  children,
  dragContentToDismiss = true,
  contentScrollable = true,
  zIndex
}: Props) {
  const [mounted, setMounted] = useState(visible)
  const resolvedMounted = resolveBottomDrawerMounted(visible, mounted)

  const onAfterCloseRef = useRef(onAfterClose)
  onAfterCloseRef.current = onAfterClose
  // Why: must stay referentially stable — MountedBottomDrawer's show/hide effect
  // re-runs whenever this callback changes identity. A fresh closure per render
  // restarts the show animation on any parent re-render and cancels an in-flight
  // backdrop-tap dismiss (whose onClose only fires when the timing finishes),
  // making the drawer reopen in a loop.
  const onHidden = useCallback(() => {
    setMounted(false)
    onAfterCloseRef.current?.()
  }, [])

  // Why: opening drawers should mount before commit; waiting for a passive
  // Effect adds a null render before every drawer can animate in.
  if (resolvedMounted !== mounted) {
    setMounted(resolvedMounted)
  }

  // Why: hidden drawers are rendered by parent screens even while closed; keep
  // their Reanimated/Gesture setup out of hot paths like commit-message typing.
  if (!resolvedMounted) {
    return null
  }

  return (
    <MountedBottomDrawer
      visible={visible}
      onClose={onClose}
      onHidden={onHidden}
      dragContentToDismiss={dragContentToDismiss}
      contentScrollable={contentScrollable}
      zIndex={zIndex}
    >
      {children}
    </MountedBottomDrawer>
  )
}

type MountedBottomDrawerProps = Props & {
  onHidden: () => void
}

function MountedBottomDrawer({
  visible,
  onClose,
  onHidden,
  children,
  dragContentToDismiss = true,
  contentScrollable = true,
  zIndex = 1000
}: MountedBottomDrawerProps) {
  const translateY = useSharedValue(0)
  const progress = useSharedValue(0)
  const keyboardOffset = useSharedValue(0)
  const scrollOffsetY = useSharedValue(0)
  const contentDragStartY = useSharedValue(0)
  const contentDragCanDismiss = useSharedValue(false)
  const { height: screenHeight } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const spacing4 = resolveCssNumber(useCSSVariable('--spacing-4'))
  // Why: on wide/tablet canvases a full-width sheet looks stretched; cap it and
  // center it horizontally. Vertical bottom-anchoring (and all the drag/keyboard
  // transforms below) is unchanged, so phone behavior stays identical.
  const { isWideLayout, modalMaxWidth } = useResponsiveLayout()
  const insideModalHost = useInsideBottomDrawerModalHost()

  useEffect(() => {
    if (visible) {
      translateY.value = 0
      scrollOffsetY.value = 0
      progress.value = withTiming(1, { duration: SHOW_DURATION })
    } else {
      Keyboard.dismiss()
      progress.value = withTiming(0, { duration: BOTTOM_DRAWER_HIDE_DURATION_MS }, (finished) => {
        if (finished) {
          runOnJS(onHidden)()
        }
      })
    }
  }, [onHidden, visible])

  // Why: KeyboardAvoidingView and useAnimatedKeyboard are both unreliable
  // inside Modal (iOS ignores KAV; Android needs adjustNothing for
  // useAnimatedKeyboard). Keyboard event listeners work on both platforms
  // and give us the exact height to shift the drawer by.
  useEffect(() => {
    if (!visible) {
      return
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'

    const onShow = Keyboard.addListener(showEvent, (e) => {
      const height = e.endCoordinates.height - insets.bottom
      keyboardOffset.value = withTiming(Math.max(height, 0), { duration: e.duration || 250 })
    })
    const onHide = Keyboard.addListener(hideEvent, (e) => {
      keyboardOffset.value = withTiming(0, { duration: e.duration || 250 })
    })

    return () => {
      onShow.remove()
      onHide.remove()
      keyboardOffset.value = 0
    }
  }, [visible, insets.bottom])

  const dismiss = useCallback(() => {
    Keyboard.dismiss()
    progress.value = withTiming(0, { duration: BOTTOM_DRAWER_HIDE_DURATION_MS }, (finished) => {
      if (finished) {
        runOnJS(onClose)()
      }
    })
  }, [onClose, progress])

  useEffect(() => {
    if (!visible) {
      return
    }

    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      dismiss()
      return true
    })
    return () => sub.remove()
  }, [visible, dismiss])

  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollOffsetY.value = Math.max(event.contentOffset.y, 0)
  })

  const scrollGesture = Gesture.Native()
  const handlePanGesture = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .simultaneousWithExternalGesture(scrollGesture)
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY
      } else {
        translateY.value = e.translationY * RUBBER_BAND_FACTOR
      }
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_THRESHOLD || e.velocityY > 500) {
        const velocity = Math.max(e.velocityY, 800)
        const remaining = screenHeight - e.translationY
        const duration = Math.min(Math.max((remaining / velocity) * 1000, 120), 300)
        translateY.value = withTiming(screenHeight, { duration })
        progress.value = withTiming(0, { duration }, () => {
          runOnJS(onClose)()
        })
      } else {
        translateY.value = withSpring(0, SPRING_CONFIG)
      }
    })
  const contentPanGesture = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .simultaneousWithExternalGesture(scrollGesture)
    .onBegin(() => {
      contentDragStartY.value = 0
      contentDragCanDismiss.value = scrollOffsetY.value <= TOP_SCROLL_EPSILON
    })
    .onUpdate((e) => {
      // Why: action-sheet content can be taller than the drawer; downward drags
      // should scroll back to the top before they start dismissing the sheet.
      if (scrollOffsetY.value > TOP_SCROLL_EPSILON) {
        contentDragCanDismiss.value = false
        contentDragStartY.value = 0
        if (translateY.value !== 0) {
          translateY.value = withSpring(0, SPRING_CONFIG)
        }
        return
      }

      if (!contentDragCanDismiss.value) {
        contentDragCanDismiss.value = true
        contentDragStartY.value = e.translationY
      }

      const translationY = e.translationY - contentDragStartY.value
      if (translationY > 0) {
        translateY.value = translationY
      } else {
        translateY.value = translationY * RUBBER_BAND_FACTOR
      }
    })
    .onEnd((e) => {
      if (!contentDragCanDismiss.value || scrollOffsetY.value > TOP_SCROLL_EPSILON) {
        return
      }

      const translationY = e.translationY - contentDragStartY.value
      if (translationY > DISMISS_THRESHOLD || e.velocityY > 500) {
        const velocity = Math.max(e.velocityY, 800)
        const remaining = screenHeight - translationY
        const duration = Math.min(Math.max((remaining / velocity) * 1000, 120), 300)
        translateY.value = withTiming(screenHeight, { duration })
        progress.value = withTiming(0, { duration }, () => {
          runOnJS(onClose)()
        })
      } else {
        translateY.value = withSpring(0, SPRING_CONFIG)
      }
    })

  const drawerStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY:
          interpolate(progress.value, [0, 1], [screenHeight, 0], Extrapolation.CLAMP) +
          translateY.value -
          keyboardOffset.value
      }
    ]
  }))

  const backdropStyle = useAnimatedStyle(() => {
    const dragFade = interpolate(translateY.value, [0, 300], [1, 0], Extrapolation.CLAMP)
    return { opacity: progress.value * dragFade }
  })

  // Why: the sheet must escape local ScrollViews so it covers the viewport. iOS
  // keeps it in the current UIWindow via FullWindowOverlay so Liquid Glass can
  // sample the screen behind it; other platforms use a native Modal fallback.
  const overlay = (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      className="absolute inset-0 z-50"
      style={[{ zIndex }]}
      accessibilityViewIsModal
      aria-modal
    >
      <GestureHandlerRootView className="flex-1">
        <Animated.View className="bg-modal-backdrop absolute inset-0" style={[backdropStyle]}>
          <Pressable className="absolute inset-0" onPress={dismiss} />
        </Animated.View>

        <View
          className={cn('flex-1 justify-end', isWideLayout && 'items-center')}
          pointerEvents="box-none"
        >
          <Animated.View
            className="overflow-hidden rounded-t-3xl px-3"
            style={[
              {
                width: '100%',
                maxWidth: isWideLayout ? modalMaxWidth : undefined,
                maxHeight: screenHeight - insets.top - spacing4,
                paddingBottom: insets.bottom + spacing4
              },
              drawerStyle
            ]}
          >
            <MobileGlassSurface
              {...BOTTOM_DRAWER_GLASS_APPEARANCE}
              className="absolute inset-0 rounded-t-3xl"
              isFunctional
              pointerEvents="none"
            />
            {!contentScrollable ? (
              <>
                <GestureDetector gesture={handlePanGesture}>
                  <Animated.View
                    className="items-center pt-2 pb-3"
                    accessibilityRole="button"
                    accessibilityLabel="Dismiss drawer"
                  >
                    <View className="bg-muted-foreground h-1 w-9 self-center rounded-full opacity-40" />
                  </Animated.View>
                </GestureDetector>
                <View className="min-h-0">{children}</View>
              </>
            ) : dragContentToDismiss ? (
              <>
                <GestureDetector gesture={handlePanGesture}>
                  <Animated.View
                    className="items-center pt-2 pb-3"
                    accessibilityRole="button"
                    accessibilityLabel="Dismiss drawer"
                  >
                    <View className="bg-muted-foreground h-1 w-9 self-center rounded-full opacity-40" />
                  </Animated.View>
                </GestureDetector>
                <GestureDetector gesture={contentPanGesture}>
                  <Animated.View collapsable={false}>
                    <GestureDetector gesture={scrollGesture}>
                      <Animated.ScrollView
                        bounces={false}
                        keyboardShouldPersistTaps="handled"
                        onScroll={scrollHandler}
                        scrollEventThrottle={16}
                        showsVerticalScrollIndicator={false}
                      >
                        {children}
                      </Animated.ScrollView>
                    </GestureDetector>
                  </Animated.View>
                </GestureDetector>
              </>
            ) : (
              <>
                <GestureDetector gesture={handlePanGesture}>
                  <Animated.View
                    className="items-center pt-2 pb-3"
                    accessibilityRole="button"
                    accessibilityLabel="Dismiss drawer"
                  >
                    <View className="bg-muted-foreground h-1 w-9 self-center rounded-full opacity-40" />
                  </Animated.View>
                </GestureDetector>
                <ScrollView
                  bounces={false}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {children}
                </ScrollView>
              </>
            )}
            <MobileGlassSurface
              {...BOTTOM_DRAWER_GLASS_APPEARANCE}
              className="absolute top-full right-0 left-0 h-screen"
              isFunctional
              pointerEvents="none"
            />
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Animated.View>
  )

  // Why: inside a BottomDrawerModalHost the host owns the presentation layer;
  // rendering another one would stack overlays and reintroduce the sibling-sheet
  // transition race the host exists to avoid.
  if (insideModalHost) {
    return overlay
  }

  if (Platform.OS === 'ios') {
    return <FullWindowOverlay>{overlay}</FullWindowOverlay>
  }

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={dismiss}>
      {overlay}
    </Modal>
  )
}
