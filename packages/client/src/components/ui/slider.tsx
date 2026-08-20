import { Slider as SliderPrimitive } from '@base-ui/react/slider'
import * as React from 'react'
import { cn } from '~renderer/lib/class-names'

type SliderProps = SliderPrimitive.Root.Props & {
  variant?: 'default' | 'theme-intensity'
}

function Slider({ className, variant = 'default', ...props }: SliderProps): React.ReactElement {
  const isThemeIntensity = variant === 'theme-intensity'
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      data-variant={variant}
      // Base UI defaults thumbAlignment to 'center'; 'edge' keeps the thumb within
      // the track bounds, preserving Radix's edge-aligned positioning.
      thumbAlignment="edge"
      className={cn('data-disabled:opacity-50', className)}
      {...props}
    >
      {/* Base UI moves pointer interaction and track layout onto Control (Radix put them on Root). */}
      <SliderPrimitive.Control className="relative flex w-full touch-none items-center select-none">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className={cn(
            'relative w-full grow overflow-hidden rounded-full',
            isThemeIntensity ? 'bg-foreground/10 h-[18px]' : 'bg-primary/20 h-1.5'
          )}
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className={cn('absolute h-full', isThemeIntensity ? 'bg-transparent' : 'bg-primary')}
          />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          className={cn(
            'block rounded-full',
            isThemeIntensity
              ? 'bg-foreground h-[var(--theme-intensity-thumb-height)] w-[var(--theme-intensity-thumb-width)] border-0'
              : 'size-4 border border-primary/40 bg-background',
            'transition-colors outline-none focus-visible:border-ring',
            'disabled:pointer-events-none disabled:opacity-50'
          )}
        />
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
