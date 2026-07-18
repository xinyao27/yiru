// Why: every portaled surface must use one elevation recipe so light/dark
// contrast fixes land once instead of drifting across each headless wrapper.
export const floatingSurfaceClass =
  'border border-border bg-popover text-popover-foreground shadow-md'

export const modalSurfaceClass = 'border-border bg-background text-foreground shadow-lg'

export const modalBackdropClass = 'bg-black/50'

export const floatingSurfaceMotionClass =
  'origin-(--transform-origin) transition-[opacity,transform,scale] data-starting-style:opacity-0 data-starting-style:scale-95 data-ending-style:opacity-0 data-ending-style:scale-95 data-[side=bottom]:data-starting-style:-translate-y-2 data-[side=top]:data-starting-style:translate-y-2 data-[side=left]:data-starting-style:translate-x-2 data-[side=right]:data-starting-style:-translate-x-2'

export const modalSurfaceMotionClass =
  'transition-[opacity,transform] data-starting-style:opacity-0 data-starting-style:scale-95 data-ending-style:opacity-0 data-ending-style:scale-95'

export const modalBackdropMotionClass =
  'transition-opacity data-starting-style:opacity-0 data-ending-style:opacity-0'
