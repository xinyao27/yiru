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

export function PhosphorIconContextProvider({ children }: PropsWithChildren): JSX.Element {
  return <IconContext.Provider value={DEFAULT_ICON_CONTEXT_VALUE}>{children}</IconContext.Provider>
}
