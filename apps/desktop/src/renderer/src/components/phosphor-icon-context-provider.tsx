import { IconContext } from '@phosphor-icons/react'
import type { JSX, PropsWithChildren } from 'react'

// Why: a provider replaces Phosphor's built-in context value, so repeat its
// other defaults here while changing only the renderer-wide icon weight.
const DEFAULT_ICON_CONTEXT_VALUE = {
  color: 'currentColor',
  size: '1em',
  weight: 'duotone',
  mirrored: false
} as const

const REGULAR_ICON_CONTEXT_VALUE = {
  ...DEFAULT_ICON_CONTEXT_VALUE,
  weight: 'regular'
} as const

export function PhosphorIconContextProvider({
  children,
  weight = 'duotone'
}: PropsWithChildren<{ weight?: 'duotone' | 'regular' }>): JSX.Element {
  // Why: selected dense chrome uses regular icons without losing the other
  // renderer-wide Phosphor defaults when a nested provider replaces context.
  const value = weight === 'regular' ? REGULAR_ICON_CONTEXT_VALUE : DEFAULT_ICON_CONTEXT_VALUE
  return <IconContext.Provider value={value}>{children}</IconContext.Provider>
}
