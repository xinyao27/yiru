import { HugeiconsIcon } from '@hugeicons/react'
import type { HugeiconsProps, IconSvgElement } from '@hugeicons/react'
import type { ReactElement, Ref } from 'react'

export type IconProps = Omit<
  HugeiconsProps,
  'absoluteStrokeWidth' | 'altIcon' | 'icon' | 'ref' | 'strokeWidth'
> & {
  mirrored?: boolean
}

export type Icon = (props: IconProps & { ref?: Ref<SVGSVGElement> }) => ReactElement

export function createHugeIcon(icon: IconSvgElement): Icon {
  return function HugeIcon({ mirrored, ref, size, style, ...props }) {
    const iconStyle = mirrored
      ? { ...style, transform: `${style?.transform ?? ''} scaleX(-1)` }
      : style
    return <HugeiconsIcon {...props} ref={ref} icon={icon} size={size ?? '1em'} style={iconStyle} />
  }
}
