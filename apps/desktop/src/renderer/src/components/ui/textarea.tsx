import * as React from 'react'

import { cn } from '@/lib/class-names'

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      data-slot="textarea"
      className={cn(
        'scrollbar-sleek min-h-20 w-full min-w-0 resize-y border border-input bg-transparent px-3 py-2 text-base outline-none transition-[color] placeholder:text-muted-foreground/60 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30',
        'focus-visible:border-ring',
        'aria-invalid:border-destructive',
        className
      )}
      {...props}
    />
  )
)

Textarea.displayName = 'Textarea'

export { Textarea }
