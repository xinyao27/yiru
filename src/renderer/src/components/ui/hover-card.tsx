'use client'

import { PreviewCard as HoverCardPrimitive } from '@base-ui/react/preview-card'

import { cn } from '@/lib/utils'

function HoverCard({ ...props }: HoverCardPrimitive.Root.Props) {
  return <HoverCardPrimitive.Root data-slot="hover-card" {...props} />
}

function HoverCardTrigger({ ...props }: HoverCardPrimitive.Trigger.Props) {
  return <HoverCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />
}

function HoverCardContent({
  className,
  align = 'center',
  alignOffset,
  side,
  sideOffset = 4,
  ...props
}: HoverCardPrimitive.Popup.Props &
  Pick<HoverCardPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'>) {
  return (
    <HoverCardPrimitive.Portal data-slot="hover-card-portal">
      <HoverCardPrimitive.Positioner
        className="isolate z-50"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <HoverCardPrimitive.Popup
          data-slot="hover-card-content"
          // Why: matches the dropdown-menu recipe — translucent surface, solid
          // 14% border, dual shadow, and 2xl backdrop blur. The previous
          // border-border/50 + bg-popover made the hover card blend into the
          // dark canvas (#171717 vs #0a0a0a, ~3% white lift) with a near-
          // invisible border.
          className={cn(
            'z-50 w-64 origin-(--transform-origin) rounded-md border border-black/14 bg-[rgba(255,255,255,0.82)] p-4 text-popover-foreground shadow-[0_16px_36px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-2xl outline-hidden dark:border-white/14 dark:bg-[rgba(0,0,0,0.72)] dark:shadow-[0_20px_44px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.04)] transition-[opacity,transform,scale] data-starting-style:opacity-0 data-starting-style:scale-95 data-ending-style:opacity-0 data-ending-style:scale-95 data-[side=bottom]:data-starting-style:-translate-y-2 data-[side=left]:data-starting-style:translate-x-2 data-[side=right]:data-starting-style:-translate-x-2 data-[side=top]:data-starting-style:translate-y-2',
            className
          )}
          {...props}
        />
      </HoverCardPrimitive.Positioner>
    </HoverCardPrimitive.Portal>
  )
}

export { HoverCard, HoverCardTrigger, HoverCardContent }
