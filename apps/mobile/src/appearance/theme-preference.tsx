import AsyncStorage from '@react-native-async-storage/async-storage'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Uniwind } from 'uniwind'

export const MOBILE_THEME_MODES = ['system', 'light', 'dark'] as const

export type MobileThemeMode = (typeof MOBILE_THEME_MODES)[number]

type MobileThemeContextValue = {
  themeMode: MobileThemeMode
  setThemeMode: (mode: MobileThemeMode) => void
}

const DEFAULT_MOBILE_THEME_MODE: MobileThemeMode = 'system'
const THEME_MODE_STORAGE_KEY = 'yiru:themeMode:v1'

const MobileThemeContext = createContext<MobileThemeContextValue>({
  themeMode: DEFAULT_MOBILE_THEME_MODE,
  setThemeMode: () => undefined
})

function normalizeThemeMode(value: string | null): MobileThemeMode {
  switch (value) {
    case 'system':
    case 'light':
    case 'dark':
      return value
    default:
      return DEFAULT_MOBILE_THEME_MODE
  }
}

async function loadThemeMode(): Promise<MobileThemeMode> {
  try {
    return normalizeThemeMode(await AsyncStorage.getItem(THEME_MODE_STORAGE_KEY))
  } catch {
    return DEFAULT_MOBILE_THEME_MODE
  }
}

export function MobileThemeProvider({
  children
}: {
  children: React.ReactNode
}): React.JSX.Element {
  const [themeMode, setThemeModeState] = useState<MobileThemeMode>(DEFAULT_MOBILE_THEME_MODE)
  const mutationRevisionRef = useRef(0)

  useEffect(() => {
    const loadRevision = mutationRevisionRef.current
    let active = true
    void loadThemeMode().then((storedMode) => {
      // Why: a selection made before storage finishes loading must remain authoritative.
      if (active && mutationRevisionRef.current === loadRevision) {
        setThemeModeState(storedMode)
        Uniwind.setTheme(storedMode)
      }
    })
    return () => {
      active = false
    }
  }, [])

  const setThemeMode = useCallback((mode: MobileThemeMode) => {
    mutationRevisionRef.current += 1
    setThemeModeState(mode)
    Uniwind.setTheme(mode)
    void AsyncStorage.setItem(THEME_MODE_STORAGE_KEY, mode).catch(() => {})
  }, [])

  const value = useMemo(() => ({ themeMode, setThemeMode }), [setThemeMode, themeMode])

  return <MobileThemeContext.Provider value={value}>{children}</MobileThemeContext.Provider>
}

export function useMobileTheme(): MobileThemeContextValue {
  return useContext(MobileThemeContext)
}
