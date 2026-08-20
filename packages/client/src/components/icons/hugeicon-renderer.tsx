import { HugeiconsIcon } from '@hugeicons/react'
import type { HugeiconsProps, IconSvgElement } from '@hugeicons/react'
import { forwardRef, type ForwardRefExoticComponent, type RefAttributes } from 'react'

export type IconProps = Omit<HugeiconsProps, 'icon' | 'altIcon' | 'ref'> & {
  mirrored?: boolean
  weight?: string
}

export type Icon = ForwardRefExoticComponent<IconProps & RefAttributes<SVGSVGElement>>

export function createHugeIcon(icon: IconSvgElement): Icon {
  return forwardRef<SVGSVGElement, IconProps>(function HugeIcon(
    { mirrored, size, strokeWidth, style, weight, ...props },
    ref
  ) {
    void weight
    const iconStyle = mirrored
      ? { ...style, transform: `${style?.transform ?? ''} scaleX(-1)` }
      : style
    return (
      <HugeiconsIcon
        {...props}
        ref={ref}
        icon={icon}
        size={size ?? '1em'}
        strokeWidth={strokeWidth ?? 1.5}
        style={iconStyle}
      />
    )
  })
}
