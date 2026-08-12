import './assets/main.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './application-shell/shell'
import { applyDocumentTheme } from './components/editor/document-theme'
import { RecoverableRenderErrorBoundary } from './components/error-boundaries/recoverable-render-error-boundary'
import { PhosphorIconContextProvider } from './components/phosphor-icon-context-provider'
import { translate } from './i18n/i18n'
import { I18nProvider } from './i18n/provider'
import { useUiLocale } from './i18n/use-ui-locale'
import {
  installRendererCrashDiagnostics,
  recordRendererCrashBreadcrumb
} from './lib/crash-diagnostics'
import { shouldEnableReactGrab } from './react-grab-dev-gate'
import { startShellEventStream } from './runtime/shell-events-client'
import { hydrateRenderingHost } from './runtime/shell-platform-client'
import { hydrateShellSettings } from './runtime/shell-state-client'
import { hydrateShellUi } from './runtime/shell-ui-client'

recordRendererCrashBreadcrumb('renderer_bootstrap_started', { dev: import.meta.env.DEV })
startShellEventStream()
hydrateRenderingHost()
const shellUiHydration = hydrateShellUi()
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
  useUiLocale()
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

void hydrateShellSettings()
  .catch(() => {})
  .then(() => shellUiHydration)
  .then(() => {
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
  })
