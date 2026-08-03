import { useCallback, useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'yiru-theme'

function subscribe(callback: () => void): () => void {
  const observer = new MutationObserver(callback)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => {
    observer.disconnect()
  }
}

// Why: dark is the default, so the opt-in class marks light rather than dark.
function getSnapshot(): Theme {
  return document.documentElement.classList.contains('light') ? 'light' : 'dark'
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const theme = useSyncExternalStore(subscribe, getSnapshot)
  const toggle = useCallback(() => {
    const next: Theme = getSnapshot() === 'light' ? 'dark' : 'light'
    document.documentElement.classList.toggle('light', next === 'light')
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Why: private browsing may block storage; the class toggle still applies.
    }
  }, [])
  return { theme, toggle }
}
