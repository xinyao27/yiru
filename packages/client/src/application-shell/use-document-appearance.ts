import { useEffect } from 'react'

import { applyDocumentTheme } from '../editor/document-theme'
import { scheduleRuntimeGraphSync } from '../runtime/sync-runtime-graph'
import type { AppState } from '../store/types'
import { buildAppFontFamily } from './app-font-family'
import { applyDocumentAppFont } from './document-app-font'

export function useDocumentAppearance(settings: AppState['settings']): void {
  useEffect(() => {
    if (!settings) {
      return
    }
    if (settings.theme === 'dark' || settings.theme === 'light') {
      applyDocumentTheme(settings.theme)
      return
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    applyDocumentTheme('system')
    const handleChange = (): void => {
      applyDocumentTheme('system')
      // Why: a system theme change does not mutate store state, so the mobile
      // terminal graph needs an explicit color republish.
      scheduleRuntimeGraphSync()
    }
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [settings])

  useEffect(() => {
    applyDocumentAppFont(buildAppFontFamily(settings?.appFontFamily))
  }, [settings?.appFontFamily])
}
