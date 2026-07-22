import { type ReactNode, useCallback, useEffect, useState } from 'react'
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

import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView
} from '@/components/uniwind-native-components'
import { useSafeAreaInsets } from '@/components/uniwind-native-components'
import { cn } from '@/style/class-names'

import { useResponsiveLayout } from '../layout/responsive-layout'
import { spacing } from '../theme/uniwind-theme-values'
import { useInsideBottomDrawerModalHost } from './bottom-drawer-modal-host'
import { resolveBottomDrawerMounted } from './bottom-drawer-mount-state'

const DISMISS_THRESHOLD = 80
const SPRING_CONFIG = { damping: 28, stiffness: 400 }
// Why: negative translateY (pulling up) is damped with a rubber-band factor
// so the drawer resists upward dragging — a subtle polish touch that signals
// the drawer cannot expand further.
const RUBBER_BAND_FACTOR = 0.25
const SHOW_DURATION = 180
export const BOTTOM_DRAWER_HIDE_DURATION_MS = 150
const TOP_SCROLL_EPSILON = 1

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
      onHidden={() => {
        setMounted(false)
        onAfterClose?.()
      }}
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

  // Why: the sheet renders through a full-screen native window (its own Modal
  // below, or the shared BottomDrawerModalHost) so it always covers the viewport
  // — even when mounted deep inside a ScrollView, where a plain absolute overlay
  // anchors to the scrolled content and clips the sheet. Show/hide is driven by
  // `progress` (animationType "none") so the reanimated exit animation runs before
  // the parent unmounts us.
  const overlay = (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      className={styles.overlay}
      style={[{ zIndex }]}
      accessibilityViewIsModal
      aria-modal
    >
      <GestureHandlerRootView className={styles.root}>
        <Animated.View className={styles.backdrop} style={[backdropStyle]}>
          <Pressable className="absolute inset-0" onPress={dismiss} />
        </Animated.View>

        <View
          className={cn(styles.anchor, isWideLayout && styles.anchorWide)}
          pointerEvents="box-none"
        >
          <Animated.View
            className={styles.drawer}
            style={[
              {
                width: '100%',
                maxWidth: isWideLayout ? modalMaxWidth : undefined,
                maxHeight: screenHeight - insets.top - spacing.lg,
                paddingBottom: insets.bottom + spacing.lg
              },
              drawerStyle
            ]}
          >
            {!contentScrollable ? (
              <>
                <GestureDetector gesture={handlePanGesture}>
                  <Animated.View
                    className={styles.handleHitArea}
                    accessibilityRole="button"
                    accessibilityLabel="Dismiss drawer"
                  >
                    <View className={styles.handle} />
                  </Animated.View>
                </GestureDetector>
                <View className={styles.staticContent}>{children}</View>
              </>
            ) : dragContentToDismiss ? (
              <>
                <GestureDetector gesture={handlePanGesture}>
                  <Animated.View
                    className={styles.handleHitArea}
                    accessibilityRole="button"
                    accessibilityLabel="Dismiss drawer"
                  >
                    <View className={styles.handle} />
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
                    className={styles.handleHitArea}
                    accessibilityRole="button"
                    accessibilityLabel="Dismiss drawer"
                  >
                    <View className={styles.handle} />
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
            <View className={styles.bottomExtension} />
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Animated.View>
  )

  // Why: inside a BottomDrawerModalHost the host owns the single native Modal;
  // rendering our own would stack modals and reintroduce the iOS present/dismiss
  // race the host exists to avoid. The host handles the Android back button.
  if (insideModalHost) {
    return overlay
  }

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={dismiss}>
      {overlay}
    </Modal>
  )
}

const styles = {
  overlay: cn('absolute inset-0 z-[1000]'),
  root: cn('flex-1'),
  backdrop: cn('absolute inset-0 bg-black/50'),
  anchor: cn('flex-1 justify-end'),
  anchorWide: cn('items-center'),
  drawer: cn('bg-background rounded-none px-3'),
  handle: cn('self-center w-9 h-1 rounded-none bg-muted-foreground/60 opacity-[0.4]'),
  handleHitArea: cn('items-center pt-2 pb-3'),
  staticContent: cn('min-h-0'),
  bottomExtension: cn('absolute bottom-[-500px] left-0 right-0 h-[500px] bg-background')
} as const
