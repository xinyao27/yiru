import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip'

import { cn } from '@/lib/class-names'

// Why: shortcut caps use default-surface colors, while tooltips invert the app
// surface. Adapt nested caps here so every tooltip keeps its shortcut visible.
const TOOLTIP_SHORTCUT_CLASSES =
  '[&_[data-slot=shortcut-key-cap]]:border-background/20 [&_[data-slot=shortcut-key-cap]]:bg-background/10 [&_[data-slot=shortcut-key-cap]]:text-background [&_[data-slot=shortcut-key-separator]]:text-background/70'

function TooltipProvider({ delay = 0, ...props }: TooltipPrimitive.Provider.Props) {
  return <TooltipPrimitive.Provider delay={delay} {...props} />
}

function Tooltip({ disableHoverablePopup = true, ...props }: TooltipPrimitive.Root.Props) {
  // Why: app tooltips are non-interactive labels. Letting the floating popup
  // keep itself open can block the controls it is describing. Base UI has no
  // provider-level switch, so the guard lives per-Root instead.
  return (
    <TooltipPrimitive.Root
      data-slot="tooltip"
      disableHoverablePopup={disableHoverablePopup}
      {...props}
    />
  )
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  align,
  alignOffset,
  side,
  sideOffset = 4,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<TooltipPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'>) {
  return (
    <TooltipPrimitive.Portal>
      {/* Why: tooltip portals can be triggered from inside menus/popovers. The
          Positioner owns the stacking context now, so keep it above those
          floating surfaces instead of hidden behind them. */}
      <TooltipPrimitive.Positioner
        className="isolate z-[90]"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            'pointer-events-none z-[90] w-fit origin-(--transform-origin) rounded-md bg-foreground px-3 py-1.5 text-xs text-balance text-background transition-[opacity,transform,scale] data-starting-style:opacity-0 data-starting-style:scale-95 data-ending-style:opacity-0 data-ending-style:scale-95 data-[side=bottom]:data-starting-style:-translate-y-2 data-[side=left]:data-starting-style:translate-x-2 data-[side=right]:data-starting-style:-translate-x-2 data-[side=top]:data-starting-style:translate-y-2',
            TOOLTIP_SHORTCUT_CLASSES,
            className
          )}
          {...props}
        >
          {children}
          {/* Why: product tooltips intentionally use an arrowless surface across the app. */}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
