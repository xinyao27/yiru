import type { JSX, PropsWithChildren } from 'react'

/**
 * Keeps the renderer entrypoint explicit about its icon system. Individual
 * Hugeicons components carry the shared Stroke Rounded defaults themselves,
 * so no legacy provider context is needed.
 */
export function HugeiconsIconContextProvider({ children }: PropsWithChildren): JSX.Element {
  return <>{children}</>
}
