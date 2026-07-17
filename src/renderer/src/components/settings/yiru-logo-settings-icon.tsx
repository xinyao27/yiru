import { createElement } from 'react'
import type { IconProps } from '@phosphor-icons/react'
import logo from '../../../../../resources/logo.svg'
import { cn } from '@/lib/utils'

export function YiruLogoSettingsIcon({ className }: IconProps): React.JSX.Element {
  return createElement('img', {
    src: logo,
    alt: '',
    'aria-hidden': true,
    className: cn('object-contain invert dark:invert-0', className)
  })
}
