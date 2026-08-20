import { createElement } from 'react'
import logo from '~renderer/assets/brand/yiru-wordmark.png?url'
import type { IconProps } from '~renderer/components/icons/hugeicons'
import { cn } from '~renderer/lib/class-names'

export function YiruLogoSettingsIcon({ className }: IconProps): React.JSX.Element {
  return createElement('img', {
    src: logo,
    alt: '',
    'aria-hidden': true,
    className: cn('object-contain invert dark:invert-0', className)
  })
}
