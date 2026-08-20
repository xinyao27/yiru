import '../assets/main.css'
import { CSPProvider } from '@base-ui/react/csp-provider'
import { Suspense, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { lazyWithRetry as lazy } from '~renderer/lib/lazy-with-retry'

import { RecoverableRenderErrorBoundary } from '../components/error-boundaries/recoverable-render-error-boundary'
import { HugeiconsIconContextProvider } from '../components/icons/context-provider'
import { translate } from '../i18n/i18n'
import { I18nProvider } from '../i18n/provider'
import { useUiLocale } from '../i18n/use-ui-locale'
import { WebConnect } from './connect/page'
import { initializeWebRuntimeConnection } from './runtime-connection'
import { readStoredWebRuntimeEnvironment } from './runtime-environment'
import { installWebTrustedTypesPolicy } from './trusted-html'

const App = lazy(() => import('../application-shell/shell'))

installWebTrustedTypesPolicy()

function WebRoot(): React.JSX.Element {
  const [hasEnvironment, setHasEnvironment] = useState(
    () => readStoredWebRuntimeEnvironment() !== null
  )
  if (!hasEnvironment) {
    return <WebConnect onConnected={() => setHasEnvironment(true)} />
  }

  initializeWebRuntimeConnection()
  return (
    <Suspense fallback={<div className="bg-background min-h-dvh" />}>
      <App />
    </Suspense>
  )
}

function WebRootBoundary(): React.JSX.Element {
  useUiLocale()
  return (
    <RecoverableRenderErrorBoundary
      boundaryId="web.root"
      surface="web-root"
      title={translate('app.recoverableError.webTitle', 'Yiru web hit a renderer error.')}
      description={translate(
        'app.recoverableError.webDescription',
        'Retry the web client or reconnect to the paired runtime.'
      )}
    >
      <WebRoot />
    </RecoverableRenderErrorBoundary>
  )
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <CSPProvider disableStyleElements>
    <HugeiconsIconContextProvider>
      <I18nProvider>
        <WebRootBoundary />
      </I18nProvider>
    </HugeiconsIconContextProvider>
  </CSPProvider>
)
