import './assets/main.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { useTranslation } from 'react-i18next'

import App from './application-shell'
import { RecoverableRenderErrorBoundary } from './components/error-boundaries/recoverable-render-error-boundary'
import { PhosphorIconContextProvider } from './components/phosphor-icon-context-provider'
import { translate } from './i18n/i18n'
import { I18nProvider } from './i18n/i18n-provider'
import {
  installRendererCrashDiagnostics,
  recordRendererCrashBreadcrumb
} from './lib/crash-diagnostics'
import { applyDocumentTheme } from './lib/document-theme'
import { shouldEnableReactGrab } from './lib/react-grab-dev-gate'

recordRendererCrashBreadcrumb('renderer_bootstrap_started', { dev: import.meta.env.DEV })
installRendererCrashDiagnostics()

if (
  import.meta.env.DEV &&
  shouldEnableReactGrab({
    dev: import.meta.env.DEV,
    enableFlag: import.meta.env.VITE_ENABLE_REACT_GRAB
  })
) {
  // Why: React Grab injects styles into its own host; its global Tailwind bundle
  // would otherwise override Yiru utilities loaded earlier in the document.
  void import('react-grab').then(({ init }) => init())
}

applyDocumentTheme('system', { disableTransitions: false })

const rootElement = document.getElementById('root')
if (!rootElement) {
  recordRendererCrashBreadcrumb('renderer_root_missing')
  throw new Error('Renderer root element not found.')
}

function RendererRoot(): React.JSX.Element {
  useTranslation()
  return (
    <RecoverableRenderErrorBoundary
      boundaryId="app.root"
      surface="app-root"
      title={translate('app.recoverableError.rootTitle', 'Yiru hit a renderer error.')}
      description={translate(
        'app.recoverableError.rootDescription',
        'The app shell could not finish rendering. Retry to remount it, or relaunch Yiru if the error persists.'
      )}
    >
      <App />
    </RecoverableRenderErrorBoundary>
  )
}

createRoot(rootElement).render(
  <StrictMode>
    <PhosphorIconContextProvider>
      <I18nProvider>
        <RendererRoot />
      </I18nProvider>
    </PhosphorIconContextProvider>
  </StrictMode>
)
recordRendererCrashBreadcrumb('renderer_bootstrap_rendered')
