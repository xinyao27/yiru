import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '@/lib/class-names'

const buttonVariants = cva(
  // Why: every button suppresses the UA ring locally and replaces it with a flat border focus state.
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent cursor-pointer text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-[color-mix(in_srgb,var(--primary)_90%,var(--background))]',
        destructive:
          'bg-destructive text-white hover:bg-[color-mix(in_srgb,var(--destructive)_90%,var(--background))] dark:bg-destructive',
        // Why: toolbar controls must keep an opaque resting surface in both themes.
        outline:
          'border border-border bg-background text-foreground hover:border-muted-foreground/35 hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-background dark:hover:bg-accent',
        // Why: titlebar chrome shares the row seams, so controls only draw vertical separators.
        'outline-transparent':
          'border border-y-0 border-border bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:border-border focus-visible:bg-accent focus-visible:text-accent-foreground dark:border-input dark:hover:bg-accent dark:focus-visible:border-input',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-[color-mix(in_srgb,var(--secondary)_80%,var(--background))]',
        ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent',
        // Why: muted toolbar/icon chrome that should rest quieter than ghost without
        // call sites repeating text-muted-foreground + hover/focus overrides.
        quiet:
          'text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground dark:hover:bg-accent',
        // Why: command/listbox rows share selected-state chrome, including a
        // border that remains legible while the user types.
        'picker-row':
          'text-foreground hover:bg-accent hover:text-accent-foreground aria-selected:border-border aria-selected:bg-accent aria-selected:text-accent-foreground',
        // Why: inline actions floating above an editor need opaque popover
        // paint while retaining the standard outline interaction states.
        'popover-outline':
          'border border-border bg-popover text-muted-foreground hover:border-muted-foreground/35 hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground',
        // Why: status actions cannot reserve a border seam, so focus uses background contrast.
        'status-bar': 'border-0 font-normal hover:bg-accent/70 focus-visible:bg-accent/70',
        'status-bar-icon':
          'border-0 text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground aria-[current=page]:text-foreground',
        'status-bar-quiet':
          'border-0 font-normal text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        // Why: multi-line list actions need content-driven height without bypassing Button chrome.
        'list-row': 'h-auto px-3 py-2',
        'picker-row': 'h-auto gap-2 px-2 py-1.5 text-left text-sm font-normal whitespace-normal',
        'popover-hint': 'h-auto gap-2 px-3 py-1.5 text-left',
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        // Why: status actions fill the footer while their content retains compact spacing.
        'status-bar': "h-full gap-1.5 px-1 py-0.5 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-xs': "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        'icon-status-bar': "h-full w-5 [&_svg:not([class*='size-'])]:size-3",
        'icon-status-bar-wide': "h-full w-6 [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
        // Why: titlebar controls share the row height while retaining compact horizontal rhythm.
        'icon-titlebar': "h-full w-7 [&_svg:not([class*='size-'])]:size-3.5",
        'icon-titlebar-compact': "h-full w-6 [&_svg:not([class*='size-'])]:size-3.5",
        'icon-titlebar-wide': "h-full w-8 [&_svg:not([class*='size-'])]:size-3.5",
        'icon-titlebar-extra-wide': "h-full w-9 [&_svg:not([class*='size-'])]:size-3.5"
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

const Button = React.forwardRef<
  HTMLElement,
  // Base UI's Button typing allows a callback className; keep the wrapper's
  // className a plain string so it stays compatible with the cva call below.
  Omit<ButtonPrimitive.Props, 'className'> &
    VariantProps<typeof buttonVariants> & { className?: string }
>(function Button({ className, variant = 'default', size = 'default', ...props }, ref) {
  // Base UI Button supports `render` natively, replacing the Slot/asChild idiom.
  return (
    <ButtonPrimitive
      ref={ref}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
})

export { Button, buttonVariants }
