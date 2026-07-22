import { Switch as SwitchPrimitive } from '@base-ui/react/switch'
import * as React from 'react'

import { cn } from '@/lib/class-names'

type SwitchProps = Omit<SwitchPrimitive.Root.Props, 'nativeButton' | 'render'>

const Switch = React.forwardRef<HTMLElement, SwitchProps>(function Switch(
  { className, ...props },
  ref
) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      nativeButton
      render={<button type="button" />}
      data-slot="switch"
      className={cn(
        'relative inline-flex h-5 w-8 shrink-0 cursor-pointer items-center border border-transparent outline-none transition-colors data-checked:bg-primary data-unchecked:bg-input data-disabled:cursor-not-allowed data-disabled:opacity-50 dark:data-unchecked:bg-input/80',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="bg-background dark:data-checked:bg-primary-foreground pointer-events-none block size-4 translate-x-0 transition-transform data-checked:translate-x-3.5"
      />
    </SwitchPrimitive.Root>
  )
})

export { Switch }
