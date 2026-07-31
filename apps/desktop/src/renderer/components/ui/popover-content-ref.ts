import type { Popover as PopoverPrimitive } from '@base-ui/react/popover'

type PopoverContentRef = PopoverPrimitive.Popup.Props['ref']

export function updatePopoverContentRef(
  forwardedRef: PopoverContentRef | undefined,
  node: HTMLDivElement | null,
  cancelWheelFrames: () => void
): (() => void) | undefined {
  if (node === null) {
    cancelWheelFrames()
    if (typeof forwardedRef === 'function') {
      forwardedRef(null)
    } else if (forwardedRef) {
      forwardedRef.current = null
    }
    return undefined
  }

  if (typeof forwardedRef === 'function') {
    const cleanup = forwardedRef(node)
    // Why: React callback refs may return cleanup; wrapping the Base UI ref must
    // preserve that cleanup instead of replacing it with a null callback.
    return () => {
      cancelWheelFrames()
      if (typeof cleanup === 'function') {
        cleanup()
      } else {
        forwardedRef(null)
      }
    }
  }

  if (forwardedRef) {
    forwardedRef.current = node
  }
  return () => {
    cancelWheelFrames()
    if (forwardedRef) {
      forwardedRef.current = null
    }
  }
}
