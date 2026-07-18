import * as React from 'react'
import { Slider as SliderPrimitive } from '@base-ui/react/slider'

import { cn } from '@/lib/class-names'

function Slider({ className, ...props }: SliderPrimitive.Root.Props): React.ReactElement {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      // Base UI defaults thumbAlignment to 'center'; 'edge' keeps the thumb within
      // the track bounds, preserving Radix's edge-aligned positioning.
      thumbAlignment="edge"
      className={cn('data-disabled:opacity-50', className)}
      {...props}
    >
      {/* Base UI moves pointer interaction and track layout onto Control (Radix put them on Root). */}
      <SliderPrimitive.Control className="relative flex w-full touch-none select-none items-center">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-primary/20"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="absolute h-full bg-primary"
          />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          className={cn(
            'block size-4 rounded-full border border-primary/40 bg-background shadow-sm',
            'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:pointer-events-none disabled:opacity-50'
          )}
        />
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
