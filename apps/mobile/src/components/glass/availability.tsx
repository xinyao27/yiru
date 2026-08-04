import type { ReactNode } from 'react'

import { MobileGlassAvailabilityContext } from './availability-context'

export { useMobileGlassAvailable } from './availability-context'

type MobileGlassScopeProps = {
  children: ReactNode
}

export function MobileGlassAvailabilityProvider({
  children
}: MobileGlassScopeProps): React.JSX.Element {
  return <MobileGlassAvailabilityContext value={false}>{children}</MobileGlassAvailabilityContext>
}
