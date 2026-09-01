import '../../assets/main.css'
import { CSPProvider } from '@base-ui/react/csp-provider'
import { createRoot } from 'react-dom/client'

import { applyDocumentTheme } from '../../editor/document-theme'
import { setRendererUiLanguage } from '../../i18n/i18n'
import { HugeiconsIconContextProvider } from '../../icons/context-provider'
import { ExtensionInstallPage, type ExtensionInstallPageProps } from './page'

export function mountExtensionInstall(options: ExtensionInstallPageProps): void {
  setRendererUiLanguage('system')
  applyDocumentTheme('system', { disableTransitions: false })
  const rootElement = document.getElementById('root')
  if (!rootElement) {
    throw new Error('extension_install_root_missing')
  }
  createRoot(rootElement).render(
    <CSPProvider disableStyleElements>
      <HugeiconsIconContextProvider>
        <ExtensionInstallPage {...options} />
      </HugeiconsIconContextProvider>
    </CSPProvider>
  )
}
