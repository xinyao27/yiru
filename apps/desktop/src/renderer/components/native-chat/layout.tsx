import {
  forwardRef,
  useLayoutEffect,
  useState,
  type PropsWithChildren,
  type RefObject
} from 'react'

/** Transcript, composer, and interactive cards share one optical column. */
export const NATIVE_CHAT_CONTENT_WIDTH_CLASS = 'max-w-[840px]'

/** Paints the composer fade without obscuring the transcript scrollbar strip. */
export const NativeChatInputOverlay = forwardRef<HTMLDivElement, PropsWithChildren>(
  function NativeChatInputOverlay({ children }, ref) {
    return (
      <div ref={ref} className="pointer-events-none absolute inset-x-0 bottom-0 z-30 pt-8">
        <div
          aria-hidden="true"
          className="via-background/95 to-background absolute inset-y-0 right-3 left-0 bg-gradient-to-b from-transparent"
        />
        <div className="relative">{children}</div>
      </div>
    )
  }
)

/** Keeps transcript tail controls above the variable-height overlay composer. */
export function useNativeChatInputRegionHeight(
  inputRegionRef: RefObject<HTMLDivElement | null>
): number {
  const [height, setHeight] = useState(0)

  useLayoutEffect(() => {
    const inputRegion = inputRegionRef.current
    if (!inputRegion) {
      return
    }

    const measure = (): void => {
      const nextHeight = Math.ceil(inputRegion.getBoundingClientRect().height)
      setHeight((currentHeight) => (currentHeight === nextHeight ? currentHeight : nextHeight))
    }

    measure()
    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(measure)
    observer.observe(inputRegion)
    return () => observer.disconnect()
  }, [inputRegionRef])

  return height
}
