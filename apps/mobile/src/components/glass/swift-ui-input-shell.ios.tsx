import { HStack } from '@expo/ui/swift-ui'
import {
  backgroundOverlay,
  clipShape,
  frame,
  glassEffect,
  padding,
  strokeBorder,
  type ViewModifier
} from '@expo/ui/swift-ui/modifiers'
import { type ReactNode, useMemo } from 'react'
import { useCSSVariable } from 'uniwind'

import { resolveCssString } from '~/style/resolve-css-variable'

import { useMobileGlassAvailable } from './availability'

type MobileSwiftUiGlassInputShellProps = {
  alignment?: 'bottom' | 'center'
  children: ReactNode
  hasTrailingAction: boolean
  minHeight?: number
}

export function MobileSwiftUiGlassInputShell({
  alignment = 'center',
  children,
  hasTrailingAction,
  minHeight = 44
}: MobileSwiftUiGlassInputShellProps): React.JSX.Element {
  const isGlassAvailable = useMobileGlassAvailable()
  const [inputValue, borderValue] = useCSSVariable(['--color-input', '--color-border'])
  const inputColor = resolveCssString(inputValue)
  const borderColor = resolveCssString(borderValue)
  const modifiers = useMemo<ViewModifier[]>(
    () => [
      frame({ minWidth: 160, maxWidth: Infinity, minHeight, alignment: 'center' }),
      padding({ leading: 16, trailing: hasTrailingAction ? 4 : 16, vertical: 2 }),
      ...(isGlassAvailable
        ? mobileSwiftUiGlassEffect(true)
        : [
            backgroundOverlay({ color: inputColor }),
            clipShape('capsule'),
            strokeBorder({ color: borderColor, style: { lineWidth: 1 }, shape: 'capsule' })
          ])
    ],
    [borderColor, hasTrailingAction, inputColor, isGlassAvailable, minHeight]
  )

  return (
    <HStack alignment={alignment} spacing={8} modifiers={modifiers}>
      {children}
    </HStack>
  )
}

export function mobileSwiftUiGlassEffect(isGlassAvailable: boolean): ViewModifier[] {
  if (!isGlassAvailable) {
    return []
  }
  return [
    glassEffect({
      glass: { variant: 'regular', interactive: true },
      shape: 'capsule'
    })
  ]
}
