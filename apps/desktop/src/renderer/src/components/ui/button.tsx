import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '@/lib/class-names'

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md cursor-pointer text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
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
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-[color-mix(in_srgb,var(--secondary)_80%,var(--background))]',
        ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent',
        link: 'text-primary underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-xs': "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-8',
        'icon-lg': 'size-10'
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
