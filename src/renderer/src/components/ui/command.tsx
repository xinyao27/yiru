'use client'

import * as React from 'react'
import { Command as CommandPrimitive } from 'cmdk'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { MagnifyingGlass as SearchIcon } from '@phosphor-icons/react'

import { cn } from '@/lib/utils'

function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        'flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground',
        className
      )}
      {...props}
    />
  )
}

function CommandDialog({
  children,
  title = 'Command Palette',
  description = 'Search for a command to run...',
  shouldFilter,
  onOpenAutoFocus,
  onCloseAutoFocus,
  contentClassName,
  overlayClassName,
  commandProps,
  ...props
}: Omit<DialogPrimitive.Root.Props, 'children'> & {
  // Why: Base UI's Dialog.Root types children as a payload render function too;
  // this wrapper only ever renders the command palette, so narrow it to ReactNode.
  children?: React.ReactNode
  title?: string
  description?: string
  shouldFilter?: boolean
  onOpenAutoFocus?: (e: Event) => void
  onCloseAutoFocus?: (e: Event) => void
  contentClassName?: string
  overlayClassName?: string
  commandProps?: React.ComponentProps<typeof CommandPrimitive>
}) {
  const { className: commandClassName, ...commandRootProps } = commandProps ?? {}

  // Why: Base UI has no onOpen/onCloseAutoFocus events; it controls focus via
  // Popup initialFocus/finalFocus. Bridge the Radix `event.preventDefault()`
  // idiom to Base's "return false to suppress focus" so existing call sites
  // keep working: run the callback with a cancelable event, and if it prevents
  // default, suppress the focus move.
  const initialFocus = onOpenAutoFocus
    ? (): boolean | undefined => {
        const event = new Event('focus', { cancelable: true })
        onOpenAutoFocus(event)
        return event.defaultPrevented ? false : undefined
      }
    : undefined
  const finalFocus = onCloseAutoFocus
    ? (): boolean | undefined => {
        const event = new Event('focus', { cancelable: true })
        onCloseAutoFocus(event)
        return event.defaultPrevented ? false : undefined
      }
    : undefined

  return (
    <DialogPrimitive.Root {...props}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          // Why: matches the DialogOverlay recipe — deeper scrim + 2px backdrop
          // blur so the dark canvas lifts off the command palette. A flat
          // bg-black/50 disappears in dark mode.
          className={cn(
            'fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] transition-opacity data-starting-style:opacity-0 data-ending-style:opacity-0',
            overlayClassName
          )}
        />
        <DialogPrimitive.Popup
          // Why: matches the DialogContent recipe — translucent surface, solid
          // 14% border, dual shadow, and 2xl backdrop blur. bg-popover equals
          // the canvas in dark mode (#171717 vs #0a0a0a) and the previous
          // border-border + shadow-lg was barely visible against the dark
          // canvas.
          className={cn(
            'fixed top-[20%] left-[50%] z-50 w-[660px] max-w-[90vw] translate-x-[-50%] rounded-lg border border-black/14 bg-background/96 text-foreground shadow-[0_20px_60px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl outline-none dark:border-white/14 dark:bg-[rgba(23,23,23,0.96)] dark:shadow-[0_24px_72px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] transition-[opacity,transform] data-starting-style:opacity-0 data-starting-style:scale-95 data-ending-style:opacity-0 data-ending-style:scale-95',
            contentClassName
          )}
          initialFocus={initialFocus}
          finalFocus={finalFocus}
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            {description}
          </DialogPrimitive.Description>
          <Command
            shouldFilter={shouldFilter}
            className={cn(
              '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3',
              commandClassName
            )}
            {...commandRootProps}
          >
            {children}
          </Command>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function CommandInput({
  className,
  wrapperClassName,
  iconClassName,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input> & {
  wrapperClassName?: string
  iconClassName?: string
}) {
  return (
    <div
      className={cn(
        'flex items-center border-b border-border bg-muted/30 px-3 py-1',
        wrapperClassName
      )}
      data-cmdk-input-wrapper=""
    >
      <SearchIcon className={cn('mr-2 h-4 w-4 shrink-0 opacity-50', iconClassName)} />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          'flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        {...props}
      />
    </div>
  )
}

function CommandList({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  const internalRef = React.useRef<HTMLDivElement>(null)

  // Why: the dialog's scroll-lock calls preventDefault() on wheel events for
  // portaled elements (e.g. Popover) outside the Dialog's DOM tree. The
  // scrollbar renders (CSS overflow works) but the browser never
  // scrolls because the native event is cancelled. A non-passive wheel listener
  // directly on the list takes over scrolling manually so it works regardless
  // of whether a scroll-lock is active.
  React.useEffect(() => {
    const el = internalRef.current
    if (!el) {
      return
    }
    const onWheel = (e: WheelEvent): void => {
      if (el.scrollHeight <= el.clientHeight) {
        return
      }
      e.preventDefault()
      el.scrollTop += e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const mergedRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      internalRef.current = node
      if (typeof ref === 'function') {
        ref(node)
      } else if (ref) {
        ref.current = node
      }
    },
    [ref]
  )

  return (
    <CommandPrimitive.List
      ref={mergedRef}
      data-slot="command-list"
      className={cn(
        'max-h-[min(400px,60vh)] overflow-y-auto overflow-x-hidden scrollbar-sleek scroll-pb-4 scroll-pt-4',
        className
      )}
      {...props}
    />
  )
}

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn('py-6 text-center text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        'overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground',
        className
      )}
      {...props}
    />
  )
}

function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        'relative flex cursor-default gap-2 select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
        className
      )}
      {...props}
    />
  )
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn('-mx-1 h-px bg-border', className)}
      {...props}
    />
  )
}

export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
}
