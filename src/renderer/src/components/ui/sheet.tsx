'use client'

import * as React from 'react'
import { XIcon } from 'lucide-react'
import { Dialog as SheetPrimitive } from '@base-ui/react/dialog'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'

function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({ className, style, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      // Why: same fix as DialogOverlay — a flat bg-black/50 scrim disappears
      // over the dark canvas. A deeper scrim + 2px backdrop blur lifts the
      // canvas behind the sheet so its edge reads clearly.
      className={cn(
        'fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] transition-opacity data-starting-style:opacity-0 data-ending-style:opacity-0',
        className
      )}
      // Why: Electron's OS-level drag hit-test ignores z-index. Without
      // no-drag, the overlay is transparent to clicks in the titlebar's
      // drag strip, so clicking the sheet header buttons drags the window.
      style={{ ...style, WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      {...props}
    />
  )
}

const sheetContentVariants = cva(
  // Why: bg-background in dark mode equals the canvas color, and border-border/60
  // is still ~4% white over that canvas. The translucent surface + solid 14%
  // border + dual shadow + 2xl backdrop blur match the dropdown-menu / dialog
  // recipe and give the sheet a clearly visible edge in both light and dark.
  'fixed z-50 flex flex-col gap-0 bg-background/96 text-foreground shadow-[0_20px_60px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl outline-none transition ease-in-out duration-300 data-ending-style:duration-200 dark:bg-[rgba(23,23,23,0.96)] dark:shadow-[0_24px_72px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)]',
  {
    variants: {
      // Why: Base UI drives enter/exit with data-starting-style/data-ending-style
      // transitions (not keyframes), so the per-side slide is restated as an
      // off-screen translate keyed off the starting and ending states.
      side: {
        right:
          'inset-y-0 right-0 h-full w-3/4 border-l border-black/14 dark:border-white/14 data-starting-style:translate-x-full data-ending-style:translate-x-full sm:max-w-[560px]',
        left: 'inset-y-0 left-0 h-full w-3/4 border-r border-black/14 dark:border-white/14 data-starting-style:-translate-x-full data-ending-style:-translate-x-full sm:max-w-[560px]',
        top: 'inset-x-0 top-0 h-auto border-b border-black/14 dark:border-white/14 data-starting-style:-translate-y-full data-ending-style:-translate-y-full',
        bottom:
          'inset-x-0 bottom-0 h-auto border-t border-black/14 dark:border-white/14 data-starting-style:translate-y-full data-ending-style:translate-y-full'
      }
    },
    defaultVariants: {
      side: 'right'
    }
  }
)

function SheetContent({
  className,
  children,
  side = 'right',
  showCloseButton = true,
  overlayClassName,
  overlayStyle,
  style,
  ...props
}: SheetPrimitive.Popup.Props &
  VariantProps<typeof sheetContentVariants> & {
    showCloseButton?: boolean
    overlayClassName?: string
    overlayStyle?: React.CSSProperties
  }) {
  return (
    <SheetPortal>
      <SheetOverlay className={overlayClassName} style={overlayStyle} />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        className={cn(sheetContentVariants({ side }), className)}
        // Why: same as SheetOverlay — the sheet content portals to the
        // document root and its header overlaps the titlebar drag strip.
        style={{ ...style, WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            className="absolute top-4 right-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">
              {translate('auto.components.ui.sheet.1189e9fe0a', 'Close')}
            </span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn('flex flex-col gap-1.5 p-4', className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn('mt-auto flex flex-col gap-2 p-4', className)}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn('text-base font-semibold text-foreground', className)}
      {...props}
    />
  )
}

function SheetDescription({ className, ...props }: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger
}
