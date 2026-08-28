import '../../assets/main.css'
import { CSPProvider } from '@base-ui/react/csp-provider'
import { createRoot } from 'react-dom/client'

import { setRendererUiLanguage } from '../../i18n/i18n'
import { HugeiconsIconContextProvider } from '../../icons/context-provider'
import {
  DaemonSettingsPage,
  type DaemonConnectionSettings,
  type DaemonSettingsPageProps
} from './page'

export type { CommunityAdapter } from './page'
export type { DaemonConnectionSettings }

export function mountDaemonSettings(options: DaemonSettingsPageProps): void {
  setRendererUiLanguage('system')
  const rootElement = document.getElementById('root')
  if (!rootElement) {
    throw new Error('extension_settings_root_missing')
  }
  createRoot(rootElement).render(
    <CSPProvider disableStyleElements>
      <HugeiconsIconContextProvider>
        <DaemonSettingsPage {...options} />
      </HugeiconsIconContextProvider>
    </CSPProvider>
  )
}
