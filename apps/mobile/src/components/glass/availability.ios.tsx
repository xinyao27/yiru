import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect'
import { useEffect, useState, type ReactNode } from 'react'
import { AccessibilityInfo } from 'react-native'

import { MobileGlassAvailabilityContext } from './availability-context'

export { useMobileGlassAvailable } from './availability-context'

const PLATFORM_SUPPORTS_GLASS = isGlassEffectAPIAvailable() && isLiquidGlassAvailable()

type MobileGlassScopeProps = {
  children: ReactNode
}

export function MobileGlassAvailabilityProvider({
  children
}: MobileGlassScopeProps): React.JSX.Element {
  const [allowsTransparency, setAllowsTransparency] = useState(false)

  useEffect(() => {
    if (!PLATFORM_SUPPORTS_GLASS) {
      return
    }

    let active = true
    void AccessibilityInfo.isReduceTransparencyEnabled().then((enabled) => {
      if (active) {
        setAllowsTransparency(!enabled)
      }
    })
    const subscription = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      (enabled) => setAllowsTransparency(!enabled)
    )
    return () => {
      active = false
      subscription.remove()
    }
  }, [])

  return (
    <MobileGlassAvailabilityContext value={PLATFORM_SUPPORTS_GLASS && allowsTransparency}>
      {children}
    </MobileGlassAvailabilityContext>
  )
}
