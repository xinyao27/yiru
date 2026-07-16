'use client'

import * as React from 'react'
import { Popover as PopoverPrimitive } from '@base-ui/react/popover'

import { cn } from '@/lib/utils'
import { updatePopoverContentRef } from './popover-content-ref'

function mergeRefs<T>(...refs: (React.Ref<T> | undefined)[]): React.RefCallback<T> {
  return (node) => {
    for (const ref of refs) {
      if (typeof ref === 'function') {
        ref(node)
      } else if (ref) {
        ;(ref as React.RefObject<T | null>).current = node
      }
    }
  }
}

// Base UI has no Popover Anchor part; the Positioner takes an `anchor` prop
// instead. This context bridges the shadcn PopoverAnchor API: the anchor
// element registers its node here and PopoverContent forwards it to the
// Positioner so the popup re-anchors onto it (falling back to the trigger when
// no anchor is mounted).
type PopoverAnchorContextValue = {
  setAnchor: (node: HTMLElement | null) => void
  anchorRef: React.RefObject<HTMLElement | null>
  hasAnchor: boolean
}
const PopoverAnchorContext = React.createContext<PopoverAnchorContextValue | null>(null)

function Popover(props: PopoverPrimitive.Root.Props) {
  const anchorRef = React.useRef<HTMLElement | null>(null)
  const [hasAnchor, setHasAnchor] = React.useState(false)
  const setAnchor = React.useCallback((node: HTMLElement | null) => {
    anchorRef.current = node
    setHasAnchor(node != null)
  }, [])
  const ctx = React.useMemo(() => ({ setAnchor, anchorRef, hasAnchor }), [setAnchor, hasAnchor])
  return (
    <PopoverAnchorContext.Provider value={ctx}>
      <PopoverPrimitive.Root data-slot="popover" {...props} />
    </PopoverAnchorContext.Provider>
  )
}

function PopoverTrigger(props: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverAnchor({
  render,
  children
}: {
  render?: React.ReactElement
  children?: React.ReactNode
}) {
  const ctx = React.useContext(PopoverAnchorContext)
  const setRef = React.useCallback((node: HTMLElement | null) => ctx?.setAnchor(node), [ctx])
  const element = render ?? children
  if (React.isValidElement(element)) {
    const el = element as React.ReactElement<{ ref?: React.Ref<HTMLElement> }>
    return React.cloneElement(el, { ref: mergeRefs(setRef, el.props.ref) })
  }
  return <span ref={setRef}>{children}</span>
}

function PopoverContent({
  className,
  align = 'center',
  alignOffset,
  side,
  sideOffset = 4,
  portalContainer,
  style,
  onWheel,
  ref: forwardedRef,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<PopoverPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'> & {
    portalContainer?: HTMLElement | null
  }) {
  const anchorCtx = React.useContext(PopoverAnchorContext)
  const wheelFrameIdsRef = React.useRef<Set<number>>(new Set())

  const cancelWheelFrames = React.useCallback(() => {
    for (const frameId of wheelFrameIdsRef.current) {
      cancelAnimationFrame(frameId)
    }
    wheelFrameIdsRef.current.clear()
  }, [])

  const setContentRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      // Why: the wheel shim schedules frames against the content node; cancel
      // them when Base UI removes that node instead of from a passive Effect.
      return updatePopoverContentRef(forwardedRef, node, cancelWheelFrames)
    },
    [cancelWheelFrames, forwardedRef]
  )

  const handleWheel = React.useCallback<NonNullable<PopoverPrimitive.Popup.Props['onWheel']>>(
    (event) => {
      onWheel?.(event)
      if (event.defaultPrevented) {
        return
      }

      const el = event.currentTarget
      if (!el.classList.contains('popover-scroll-content') || el.scrollHeight <= el.clientHeight) {
        return
      }

      const delta =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? event.deltaY * 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? event.deltaY * el.clientHeight
            : event.deltaY
      const maxScrollTop = el.scrollHeight - el.clientHeight
      const nextScrollTop = Math.max(0, Math.min(maxScrollTop, el.scrollTop + delta))

      // Why: issue drawers are dialogs with scroll-lock. These popovers are
      // portaled outside the dialog subtree, so native wheel scrolling is
      // swallowed even though the scrollbar can be dragged.
      if (nextScrollTop !== el.scrollTop) {
        const previousScrollTop = el.scrollTop
        event.stopPropagation()
        const frameId = requestAnimationFrame(() => {
          wheelFrameIdsRef.current.delete(frameId)
          if (el.scrollTop === previousScrollTop) {
            el.scrollTop = nextScrollTop
          }
        })
        wheelFrameIdsRef.current.add(frameId)
      }
    },
    [onWheel]
  )

  return (
    <PopoverPrimitive.Portal container={portalContainer ?? undefined}>
      {/* Positioner owns placement + stacking; z stays at 60 to sit above dialogs. */}
      <PopoverPrimitive.Positioner
        className="isolate z-[60]"
        anchor={anchorCtx?.hasAnchor ? anchorCtx.anchorRef : undefined}
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          // Why: matches the dropdown-menu recipe — translucent surface, solid
          // 14% border, dual shadow, and 2xl backdrop blur. bg-popover equals
          // the canvas in dark mode (#171717 vs #0a0a0a) and border-border/50
          // is too faint to read, so the popover blended into the background.
          className={cn(
            'z-[60] overflow-hidden rounded-md border border-black/14 bg-[rgba(255,255,255,0.82)] text-popover-foreground shadow-[0_16px_36px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-2xl outline-none dark:border-white/14 dark:bg-[rgba(0,0,0,0.72)] dark:shadow-[0_20px_44px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.04)] transition-[opacity,transform,scale] data-starting-style:opacity-0 data-starting-style:scale-95 data-ending-style:opacity-0 data-ending-style:scale-95 data-[side=bottom]:data-starting-style:-translate-y-2 data-[side=left]:data-starting-style:translate-x-2 data-[side=right]:data-starting-style:-translate-x-2 data-[side=top]:data-starting-style:translate-y-2',
            className
          )}
          ref={setContentRef}
          // Why: Electron's -webkit-app-region: drag on the titlebar captures
          // clicks at the OS level regardless of z-index. Without no-drag,
          // popovers that visually overlap the titlebar are unclickable.
          style={
            {
              ...style,
              WebkitAppRegion: 'no-drag'
            } as React.CSSProperties
          }
          onWheel={handleWheel}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger }
