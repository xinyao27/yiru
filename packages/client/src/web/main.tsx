import '../assets/main.css'
import { CSPProvider } from '@base-ui/react/csp-provider'
import { Suspense, useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { lazyWithRetry as lazy } from '~renderer/lib/lazy-with-retry'

import { RecoverableRenderErrorBoundary } from '../components/error-boundaries/recoverable-render-error-boundary'
import { HugeiconsIconContextProvider } from '../components/icons/context-provider'
import { translate } from '../i18n/i18n'
import { I18nProvider } from '../i18n/provider'
import { useUiLocale } from '../i18n/use-ui-locale'
import { WebConnect } from './connect/page'
import { WebRuntimeConnectionPage } from './connect/runtime-connection-page'
import {
  WebRuntimeStatusFooter,
  WebRuntimeStatusProvider,
  type WebRuntimeStatus
} from './connect/status'
import {
  disconnectActiveWebRuntimeEnvironment,
  getWebRuntimeEnvironmentApi,
  initializeWebRuntimeConnection
} from './runtime-connection'
import { readStoredWebRuntimeEnvironment } from './runtime-environment'
import { installWebTrustedTypesPolicy } from './trusted-html'

const App = lazy(() => import('../application-shell/shell'))

installWebTrustedTypesPolicy()

const WEB_RUNTIME_STATUS_POLL_INTERVAL_MS = 5_000
const WEB_RUNTIME_STATUS_TIMEOUT_MS = 5_000
const WEB_RUNTIME_CONNECTED_FAILURE_LIMIT = 2

function readInitialWebRootState(): WebRuntimeStatus {
  const environment = readStoredWebRuntimeEnvironment()
  return environment ? { kind: 'checking', environment } : { kind: 'pairing' }
}

function WebRoot(): React.JSX.Element {
  const [state, setState] = useState<WebRuntimeStatus>(readInitialWebRootState)
  const [probeGeneration, setProbeGeneration] = useState(0)
  const environment = state.kind === 'pairing' ? null : state.environment
  const environmentId = environment?.id ?? null

  useEffect(() => {
    if (!environment || !environmentId) {
      return
    }
    initializeWebRuntimeConnection()
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let consecutiveFailures = 0
    const probe = async (): Promise<void> => {
      let isAvailable = false
      try {
        const response = await getWebRuntimeEnvironmentApi().getStatus({
          selector: environmentId,
          timeoutMs: WEB_RUNTIME_STATUS_TIMEOUT_MS
        })
        isAvailable = response.ok
      } catch {
        isAvailable = false
      }
      if (cancelled) {
        return
      }
      if (isAvailable) {
        consecutiveFailures = 0
        setState((current) =>
          current.kind === 'connected' || current.kind === 'pairing'
            ? current
            : { kind: 'connected', environment }
        )
      } else {
        consecutiveFailures += 1
        setState((current) => {
          if (
            current.kind === 'pairing' ||
            (current.kind === 'connected' &&
              consecutiveFailures < WEB_RUNTIME_CONNECTED_FAILURE_LIMIT)
          ) {
            return current
          }
          return current.kind === 'offline' ? current : { kind: 'offline', environment }
        })
      }
      timer = setTimeout(() => void probe(), WEB_RUNTIME_STATUS_POLL_INTERVAL_MS)
    }
    void probe()
    return () => {
      cancelled = true
      if (timer !== null) {
        clearTimeout(timer)
      }
    }
  }, [environment, environmentId, probeGeneration])

  let content: React.JSX.Element
  if (state.kind === 'pairing') {
    content = (
      <WebConnect
        onConnected={() => {
          const pairedEnvironment = readStoredWebRuntimeEnvironment()
          if (pairedEnvironment) {
            setState({ kind: 'checking', environment: pairedEnvironment })
          }
        }}
      />
    )
  } else if (state.kind === 'checking' || state.kind === 'offline') {
    content = (
      <WebRuntimeConnectionPage
        environmentName={state.environment.name}
        state={state.kind}
        onRetry={() => {
          setState({ kind: 'checking', environment: state.environment })
          setProbeGeneration((current) => current + 1)
        }}
        onPairAnother={() => {
          disconnectActiveWebRuntimeEnvironment()
          setState({ kind: 'pairing' })
        }}
      />
    )
  } else {
    content = (
      <Suspense fallback={<div className="bg-background min-h-dvh" />}>
        <App />
      </Suspense>
    )
  }

  return (
    <WebRuntimeStatusProvider status={state}>
      {content}
      <WebRuntimeStatusFooter />
    </WebRuntimeStatusProvider>
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

export function mountWebClient(): void {
  const rootElement = document.getElementById('root')
  if (!rootElement) {
    throw new Error('Web client root element is missing')
  }
  ReactDOM.createRoot(rootElement).render(
    <CSPProvider disableStyleElements>
      <HugeiconsIconContextProvider>
        <I18nProvider>
          <WebRootBoundary />
        </I18nProvider>
      </HugeiconsIconContextProvider>
    </CSPProvider>
  )
}
