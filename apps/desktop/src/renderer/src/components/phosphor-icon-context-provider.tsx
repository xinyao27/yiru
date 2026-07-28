import { IconContext } from '@phosphor-icons/react'
import type { JSX, PropsWithChildren } from 'react'

// Why: the desktop and web entrypoints are separate app roots, but both use
// the same renderer-wide Phosphor defaults.
const DEFAULT_ICON_CONTEXT_VALUE = {
  color: 'currentColor',
  size: '1em',
  weight: 'duotone',
  mirrored: false
} as const

export function PhosphorIconContextProvider({ children }: PropsWithChildren): JSX.Element {
  return <IconContext.Provider value={DEFAULT_ICON_CONTEXT_VALUE}>{children}</IconContext.Provider>
}
