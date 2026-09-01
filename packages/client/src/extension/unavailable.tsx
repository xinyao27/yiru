import '../assets/main.css'
import { CSPProvider } from '@base-ui/react/csp-provider'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'

import { setRendererUiLanguage, translate } from '../i18n/i18n'
import { HugeiconsIconContextProvider } from '../icons/context-provider'
import { Button } from '../ui/button'

export type ExtensionUnavailableReason =
  | 'daemon-stopped'
  | 'incompatible-version'
  | 'loopback-blocked'
  | 'missing-cli'
  | 'unknown'

export type ExtensionUnavailableActions = {
  requestLoopbackAccess?: () => Promise<void>
}

type ExtensionUnavailableProps = ExtensionUnavailableActions & {
  reason: ExtensionUnavailableReason
}

export function mountExtensionConnecting(): () => void {
  setRendererUiLanguage('system')
  const rootElement = document.getElementById('root')
  if (!rootElement) {
    throw new Error('extension_root_missing')
  }
  const root = createRoot(rootElement)
  let isMounted = true
  root.render(
    <CSPProvider disableStyleElements>
      <main className="bg-background text-foreground grid h-dvh place-items-center p-6">
        <div className="border-border bg-card w-full max-w-sm border p-5" role="status">
          <h1 className="text-base font-semibold">
            {translate('extension.runtime.connecting', 'Connecting to Yiru…')}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {translate(
              'extension.runtime.startingDaemon',
              'Starting the local daemon and restoring your workspace.'
            )}
          </p>
        </div>
      </main>
    </CSPProvider>
  )
  return () => {
    if (isMounted) {
      isMounted = false
      root.unmount()
    }
  }
}

export function mountExtensionUnavailable(
  reason: ExtensionUnavailableReason = 'unknown',
  actions: ExtensionUnavailableActions = {}
): void {
  setRendererUiLanguage('system')
  const rootElement = document.getElementById('root')
  if (!rootElement) {
    throw new Error('extension_root_missing')
  }
  createRoot(rootElement).render(
    <CSPProvider disableStyleElements>
      <HugeiconsIconContextProvider>
        <ExtensionUnavailable reason={reason} {...actions} />
      </HugeiconsIconContextProvider>
    </CSPProvider>
  )
}

function ExtensionUnavailable({
  reason,
  requestLoopbackAccess
}: ExtensionUnavailableProps): React.JSX.Element {
  const [accessState, setAccessState] = useState<'failed' | 'idle' | 'requesting'>('idle')
  const requestAccess = async (): Promise<void> => {
    if (!requestLoopbackAccess) {
      return
    }
    setAccessState('requesting')
    try {
      await requestLoopbackAccess()
    } catch {
      setAccessState('failed')
    }
  }

  return (
    <main className="bg-background text-foreground grid h-dvh place-items-center p-6">
      <div className="border-border bg-card max-w-sm border p-5">
        <h1 className="text-base font-semibold">
          {translate('extension.unavailable.title', 'Yiru daemon is not available')}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">{unavailableDescription(reason)}</p>
        {reason === 'missing-cli' ? (
          <pre className="bg-muted mt-3 overflow-x-auto p-2 text-xs">bunx @yiru/cli install</pre>
        ) : null}
        {reason === 'loopback-blocked' && requestLoopbackAccess ? (
          <div className="mt-4">
            <Button disabled={accessState === 'requesting'} onClick={() => void requestAccess()}>
              {accessState === 'requesting'
                ? translate('extension.unavailable.waitingForChrome', 'Waiting for Chrome…')
                : translate('extension.unavailable.allowLoopback', 'Allow local connection')}
            </Button>
            {accessState === 'failed' ? (
              <p aria-live="polite" className="text-destructive mt-2 text-xs">
                {translate(
                  'extension.unavailable.loopbackDenied',
                  'Chrome did not allow the local connection. Check the address-bar permission and try again.'
                )}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  )
}

function unavailableDescription(reason: ExtensionUnavailableReason): string {
  switch (reason) {
    case 'missing-cli':
      return translate(
        'extension.unavailable.missingCli',
        'The Yiru CLI and Native Messaging host are not installed. Install them, then reopen this page.'
      )
    case 'daemon-stopped':
      return translate(
        'extension.unavailable.daemonStopped',
        'The daemon could not start. Run “yiru daemon” in a terminal and inspect its output.'
      )
    case 'incompatible-version':
      return translate(
        'extension.unavailable.incompatible',
        'The extension and daemon protocol versions are incompatible. Update the older component.'
      )
    case 'loopback-blocked':
      return translate(
        'extension.unavailable.loopback',
        'Chrome could not reach the authenticated local daemon. Check firewall or loopback policy settings.'
      )
    case 'unknown':
      return translate(
        'extension.unavailable.description',
        'Install or start the Yiru daemon, then reopen this page.'
      )
  }
}
