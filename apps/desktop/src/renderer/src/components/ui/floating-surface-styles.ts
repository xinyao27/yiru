// Why: every portaled surface must use one opaque elevation recipe so content
// behind menus never bleeds through or drifts across headless wrappers.
export const floatingSurfaceClass =
  'border border-border !bg-popover text-popover-foreground shadow-md !backdrop-blur-none'

export const modalSurfaceClass =
  'border-border bg-background text-foreground shadow-lg !backdrop-blur-none'

export const modalBackdropClass = 'bg-black/50'

export const floatingSurfaceMotionClass =
  'origin-(--transform-origin) transition-[opacity,transform,scale] data-starting-style:opacity-0 data-starting-style:scale-95 data-ending-style:opacity-0 data-ending-style:scale-95 data-[side=bottom]:data-starting-style:-translate-y-2 data-[side=top]:data-starting-style:translate-y-2 data-[side=left]:data-starting-style:translate-x-2 data-[side=right]:data-starting-style:-translate-x-2'

export const modalSurfaceMotionClass =
  'transition-[opacity,transform] data-starting-style:opacity-0 data-starting-style:scale-95 data-ending-style:opacity-0 data-ending-style:scale-95'

export const modalBackdropMotionClass =
  'transition-opacity data-starting-style:opacity-0 data-ending-style:opacity-0'
