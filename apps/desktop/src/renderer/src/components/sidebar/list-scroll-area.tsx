import type {
  LayoutRectangle,
  NativeScrollEvent,
  NativeSyntheticEvent
} from '@legendapp/list/react'
import * as React from 'react'

import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/class-names'

type LegendListStyle =
  | React.CSSProperties
  | (React.CSSProperties | null | undefined | false)[]
  | null
  | undefined
  | false

type LegendListScrollOptions = {
  animated?: boolean
  x?: number
  y?: number
}

type LegendListOffsetOptions = {
  animated?: boolean
  offset: number
}

type LegendListScrollAreaHandle = {
  flashScrollIndicators: () => void
  getBoundingClientRect: () => DOMRect | undefined
  getCurrentScrollOffset: () => number
  getNativeScrollRef: () => HTMLDivElement | null
  getScrollableNode: () => HTMLDivElement | null
  getScrollEventTarget: () => HTMLDivElement | null
  getScrollResponder: () => HTMLDivElement | null
  isWindowScroll: () => false
  scrollBy: (x: number, y: number) => void
  scrollTo: (options: LegendListScrollOptions) => void
  scrollToEnd: (options?: { animated?: boolean }) => void
  scrollToOffset: (options: LegendListOffsetOptions) => void
}

type LegendListScrollAreaProps = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  'children' | 'onScroll' | 'style'
> & {
  children?: React.ReactNode
  contentContainerClassName?: string
  contentContainerStyle?: LegendListStyle
  contentOffset?: { x: number; y: number }
  horizontal?: boolean
  maintainVisibleContentPosition?: { minIndexForVisible: number }
  onLayout?: (event: { nativeEvent: { layout: LayoutRectangle } }) => void
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
  refreshControl?: React.ReactNode
  ref?: React.Ref<LegendListScrollAreaHandle>
  scrollEventThrottle?: number
  style?: LegendListStyle
}

function flattenStyle(style: LegendListStyle): React.CSSProperties {
  if (!Array.isArray(style)) {
    return style || {}
  }
  return Object.assign({}, ...style.filter(Boolean))
}

function getScrollBehavior(animated: boolean | undefined): ScrollBehavior {
  return animated ? 'smooth' : 'auto'
}

export function LegendListScrollArea({
  children,
  className,
  contentContainerClassName,
  contentContainerStyle,
  contentOffset,
  horizontal: _horizontal,
  maintainVisibleContentPosition,
  onLayout,
  onScroll,
  refreshControl,
  ref: forwardedRef,
  scrollEventThrottle: _scrollEventThrottle,
  style,
  ...viewportProps
}: LegendListScrollAreaProps): React.JSX.Element {
  const viewportRef = React.useRef<HTMLDivElement>(null)
  const scrollFrameRef = React.useRef<number | null>(null)
  const contentOffsetX = contentOffset?.x
  const contentOffsetY = contentOffset?.y
  const viewportStyle = React.useMemo<React.CSSProperties>(
    () =>
      maintainVisibleContentPosition
        ? { ...flattenStyle(style), overflowAnchor: 'none' }
        : flattenStyle(style),
    [maintainVisibleContentPosition, style]
  )
  const contentStyle = React.useMemo<React.CSSProperties>(() => {
    const resolvedStyle = {
      display: 'block',
      minHeight: '100%',
      ...flattenStyle(contentContainerStyle)
    } satisfies React.CSSProperties
    return maintainVisibleContentPosition
      ? { ...resolvedStyle, overflowAnchor: 'none' }
      : resolvedStyle
  }, [contentContainerStyle, maintainVisibleContentPosition])

  const emitScroll = React.useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport || !onScroll) {
      return
    }
    onScroll({
      nativeEvent: {
        contentInset: { top: 0, right: 0, bottom: 0, left: 0 },
        contentOffset: { x: viewport.scrollLeft, y: viewport.scrollTop },
        contentSize: { width: viewport.scrollWidth, height: viewport.scrollHeight },
        layoutMeasurement: { width: viewport.clientWidth, height: viewport.clientHeight },
        zoomScale: 1
      }
    })
  }, [onScroll])

  const handleScroll = React.useCallback(() => {
    if (scrollFrameRef.current !== null) {
      return
    }
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null
      emitScroll()
    })
  }, [emitScroll])

  React.useImperativeHandle(
    forwardedRef,
    () => ({
      flashScrollIndicators: () => {},
      getBoundingClientRect: () => viewportRef.current?.getBoundingClientRect(),
      getCurrentScrollOffset: () => viewportRef.current?.scrollTop ?? 0,
      getNativeScrollRef: () => viewportRef.current,
      getScrollableNode: () => viewportRef.current,
      getScrollEventTarget: () => viewportRef.current,
      getScrollResponder: () => viewportRef.current,
      isWindowScroll: () => false,
      scrollBy: (x, y) => viewportRef.current?.scrollBy({ left: x, top: y }),
      scrollTo: ({ animated, x = 0, y = 0 }) =>
        viewportRef.current?.scrollTo({ behavior: getScrollBehavior(animated), left: x, top: y }),
      scrollToEnd: ({ animated } = {}) =>
        viewportRef.current?.scrollTo({
          behavior: getScrollBehavior(animated),
          top: viewportRef.current.scrollHeight
        }),
      scrollToOffset: ({ animated, offset }) =>
        viewportRef.current?.scrollTo({
          behavior: getScrollBehavior(animated),
          top: offset
        })
    }),
    []
  )

  React.useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || !onLayout) {
      return
    }
    const emitLayout = (): void => {
      const rect = viewport.getBoundingClientRect()
      onLayout({
        nativeEvent: {
          layout: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        }
      })
    }
    emitLayout()
    const observer = new ResizeObserver(emitLayout)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [onLayout])

  React.useLayoutEffect(() => {
    if (contentOffsetX === undefined || contentOffsetY === undefined) {
      return
    }
    const applyOffset = (): void => {
      viewportRef.current?.scrollTo({ left: contentOffsetX, top: contentOffsetY })
    }
    applyOffset()
    const frameId = window.requestAnimationFrame(applyOffset)
    return () => window.cancelAnimationFrame(frameId)
  }, [contentOffsetX, contentOffsetY])

  React.useEffect(
    () => () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current)
      }
    },
    []
  )

  const resolvedViewportProps = React.useMemo(
    () => ({ ...viewportProps, onScroll: handleScroll, style: viewportStyle }),
    [handleScroll, viewportProps, viewportStyle]
  )

  return (
    <ScrollArea
      className="h-full min-h-0"
      viewportClassName={cn('overflow-x-hidden', className)}
      viewportRef={viewportRef}
      viewportProps={resolvedViewportProps}
    >
      {refreshControl}
      <div
        className={cn('legend-list-content-container', contentContainerClassName)}
        style={contentStyle}
      >
        {children}
      </div>
    </ScrollArea>
  )
}
