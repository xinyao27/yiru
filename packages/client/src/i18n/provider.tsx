import { useEffect, type ReactNode } from 'react'

import { useAppStore } from '../store/state'
import { setRendererUiLanguage } from './i18n'

export function I18nProvider({ children }: { children: ReactNode }): React.JSX.Element {
  // Why: settings arrive asynchronously over IPC. Keep English active until
  // the persisted choice exists instead of briefly applying the system locale.
  const uiLanguage = useAppStore((state) => state.settings?.uiLanguage ?? null)

  useEffect(() => {
    if (uiLanguage !== null) {
      setRendererUiLanguage(uiLanguage)
    }
  }, [uiLanguage])

  return <>{children}</>
}
