import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { loadMobileLoaderStyle, saveMobileLoaderStyle } from '../storage/preferences'
import { DEFAULT_MOBILE_LOADER_STYLE, type MobileLoaderStyle } from './mobile-loader-style'

type MobileLoaderStyleContextValue = {
  loaderStyle: MobileLoaderStyle
  setLoaderStyle: (style: MobileLoaderStyle) => void
}

const MobileLoaderStyleContext = createContext<MobileLoaderStyleContextValue>({
  loaderStyle: DEFAULT_MOBILE_LOADER_STYLE,
  setLoaderStyle: () => undefined
})

export function MobileLoaderStyleProvider({
  children
}: {
  children: React.ReactNode
}): React.JSX.Element {
  const [loaderStyle, setLoaderStyleState] = useState<MobileLoaderStyle>(
    DEFAULT_MOBILE_LOADER_STYLE
  )

  useEffect(() => {
    let active = true
    void loadMobileLoaderStyle().then((storedStyle) => {
      if (active) {
        setLoaderStyleState(storedStyle)
      }
    })
    return () => {
      active = false
    }
  }, [])

  const setLoaderStyle = useCallback((style: MobileLoaderStyle) => {
    setLoaderStyleState(style)
    void saveMobileLoaderStyle(style)
  }, [])

  const value = useMemo(() => ({ loaderStyle, setLoaderStyle }), [loaderStyle, setLoaderStyle])

  return (
    <MobileLoaderStyleContext.Provider value={value}>{children}</MobileLoaderStyleContext.Provider>
  )
}

export function useMobileLoaderStyle(): MobileLoaderStyleContextValue {
  return useContext(MobileLoaderStyleContext)
}
