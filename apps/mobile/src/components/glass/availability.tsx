import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { AccessibilityInfo, Platform } from 'react-native'

const PLATFORM_SUPPORTS_GLASS =
  Platform.OS === 'ios' && isGlassEffectAPIAvailable() && isLiquidGlassAvailable()

const MobileGlassAvailabilityContext = createContext(false)

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

export function MobileGlassFallbackScope({ children }: MobileGlassScopeProps): React.JSX.Element {
  return <MobileGlassAvailabilityContext value={false}>{children}</MobileGlassAvailabilityContext>
}

export function useMobileGlassAvailable(): boolean {
  return useContext(MobileGlassAvailabilityContext)
}
