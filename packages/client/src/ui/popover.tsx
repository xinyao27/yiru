'use client'

import { Popover as PopoverPrimitive } from '@base-ui/react/popover'
import * as React from 'react'
import { cn } from '~renderer/ui/class-names'
import {
  floatingSurfaceClass,
  floatingSurfaceMotionClass
} from '~renderer/ui/floating-surface-styles'

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

type PopoverWheelEvent = Parameters<NonNullable<PopoverPrimitive.Popup.Props['onWheel']>>[0]

function Popover(props: PopoverPrimitive.Root.Props) {
  const anchorRef = React.useRef<HTMLElement | null>(null)
  const [hasAnchor, setHasAnchor] = React.useState(false)
  const setAnchor = (node: HTMLElement | null) => {
    anchorRef.current = node
    setHasAnchor(node != null)
  }
  const ctx = (() => ({ setAnchor, anchorRef, hasAnchor }))()
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
  const setRef = (node: HTMLElement | null) => ctx?.setAnchor(node)
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

  const cancelWheelFrames = () => {
    for (const frameId of wheelFrameIdsRef.current) {
      cancelAnimationFrame(frameId)
    }
    wheelFrameIdsRef.current.clear()
  }

  const setContentRef = (node: HTMLDivElement | null) => {
    // Why: the wheel shim schedules frames against the content node; cancel
    // them when Base UI removes that node instead of from a passive Effect.
    return updatePopoverContentRef(forwardedRef, node, cancelWheelFrames)
  }

  const handleWheel = (event: PopoverWheelEvent) => {
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
  }

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
          className={cn(
            floatingSurfaceClass,
            floatingSurfaceMotionClass,
            'z-[60] overflow-hidden outline-none',
            className
          )}
          ref={setContentRef}
          style={style}
          onWheel={handleWheel}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger }
