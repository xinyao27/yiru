import { ScrollArea as ScrollAreaPrimitive } from '@base-ui/react/scroll-area'
import * as React from 'react'

import { cn } from '@/lib/class-names'

function ScrollArea({
  className,
  viewportClassName,
  viewportRef,
  viewportTabIndex,
  viewportProps,
  children,
  ...props
}: ScrollAreaPrimitive.Root.Props & {
  viewportClassName?: string
  viewportRef?: React.Ref<HTMLDivElement>
  /** Set e.g. -1 so the viewport can receive programmatic focus (explorer keyboard shortcuts after inline rename). */
  viewportTabIndex?: number
  viewportProps?: ScrollAreaPrimitive.Viewport.Props
}) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn('relative', className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        ref={viewportRef}
        tabIndex={viewportTabIndex}
        data-slot="scroll-area-viewport"
        className={cn(
          'size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1',
          viewportClassName
        )}
        {...viewportProps}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({
  className,
  orientation = 'vertical',
  ...props
}: ScrollAreaPrimitive.Scrollbar.Props) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        'flex touch-none p-px transition-colors select-none bg-transparent',
        orientation === 'vertical' && 'h-full w-3 py-2 border-l border-l-transparent',
        orientation === 'horizontal' && 'h-3 px-2 flex-col border-t border-t-transparent',
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className="bg-muted-foreground/40 hover:bg-muted-foreground/60 relative flex-1 rounded-full"
      />
    </ScrollAreaPrimitive.Scrollbar>
  )
}

export { ScrollArea, ScrollBar }
