import { Separator as SeparatorPrimitive } from '@base-ui/react/separator'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/class-names'

const separatorVariants = cva(
  'shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px',
  {
    variants: {
      size: {
        default: 'data-[orientation=vertical]:h-full',
        sm: 'data-[orientation=vertical]:h-3'
      }
    },
    defaultVariants: {
      size: 'default'
    }
  }
)

function Separator({
  className,
  orientation = 'horizontal',
  size,
  ...props
}: SeparatorPrimitive.Props & VariantProps<typeof separatorVariants>) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(separatorVariants({ size }), className)}
      {...props}
    />
  )
}

export { Separator }
