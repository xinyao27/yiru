import { createContext, useContext } from 'react'

export const MobileGlassAvailabilityContext = createContext(false)

export function useMobileGlassAvailable(): boolean {
  return useContext(MobileGlassAvailabilityContext)
}
