import { HugeiconsIcon } from '@hugeicons/react'
import type { HugeiconsProps, IconSvgElement } from '@hugeicons/react'
import { forwardRef, type ForwardRefExoticComponent, type RefAttributes } from 'react'

export type IconProps = Omit<
  HugeiconsProps,
  'absoluteStrokeWidth' | 'altIcon' | 'icon' | 'ref' | 'strokeWidth'
> & {
  mirrored?: boolean
}

export type Icon = ForwardRefExoticComponent<IconProps & RefAttributes<SVGSVGElement>>

export function createHugeIcon(icon: IconSvgElement): Icon {
  return forwardRef<SVGSVGElement, IconProps>(function HugeIcon(
    { mirrored, size, style, ...props },
    ref
  ) {
    const iconStyle = mirrored
      ? { ...style, transform: `${style?.transform ?? ''} scaleX(-1)` }
      : style
    return <HugeiconsIcon {...props} ref={ref} icon={icon} size={size ?? '1em'} style={iconStyle} />
  })
}
