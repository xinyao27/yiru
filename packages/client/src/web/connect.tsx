import {
  PlugsConnected as Cable,
  HardDrives as Server,
  Trash as Trash2
} from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LoadingIndicator } from '~renderer/components/loading-indicator'
import { Button } from '~renderer/components/ui/button'
import { Input } from '~renderer/components/ui/input'
import { Label } from '~renderer/components/ui/label'
import { translate } from '~renderer/i18n/i18n'

import { parseWebPairingInput } from './pairing'
import { WebRuntimeClient } from './runtime-client'
import {
  clearStoredWebRuntimeEnvironment,
  createStoredWebRuntimeEnvironment,
  isMixedContentWebSocket,
  readStoredWebRuntimeEnvironment,
  saveStoredWebRuntimeEnvironment
} from './runtime-environment'

type WebConnectProps = {
  initialPairingInput: string | null
  onConnected: () => void
}

export default function WebConnect({
  initialPairingInput,
  onConnected
}: WebConnectProps): React.JSX.Element {
  const existingEnvironment = readStoredWebRuntimeEnvironment()
  const [name, setName] = useState(
    existingEnvironment?.name ?? translate('auto.web.WebConnect.runtimeHostName', 'Runtime host')
  )
  const [pairingCode, setPairingCode] = useState(initialPairingInput ?? '')
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const parsedOffer = useMemo(() => parseWebPairingInput(pairingCode), [pairingCode])
  const autoConnectAttempted = useRef(false)

  const connect = useCallback(async (): Promise<void> => {
    setError(null)
    if (!parsedOffer) {
      setError(
        translate(
          'auto.web.WebConnect.invalidPairingInput',
          'Enter a valid Yiru pairing URL or pairing code.'
        )
      )
      return
    }
    if (parsedOffer.scope === 'mobile') {
      setError(
        translate(
          'auto.web.WebConnect.mobileScopeRejected',
          'This connection has limited mobile access. Ask the host owner to authorize this client through Coworking for full web access.'
        )
      )
      return
    }
    if (isMixedContentWebSocket(parsedOffer.endpoint)) {
      setError(
        translate(
          'auto.web.WebConnect.mixedContentRejected',
          'This HTTPS page cannot connect to a plain ws:// runtime host. Open the web client over HTTP or use a wss:// endpoint.'
        )
      )
      return
    }
    setConnecting(true)
    const environment = createStoredWebRuntimeEnvironment({ name, offer: parsedOffer })
    // Why: this pre-app probe runs before installWebPreloadApi, so it is an
    // authenticated runtime client but not yet a renderer shell.
    const client = new WebRuntimeClient(parsedOffer, undefined, { enableShellServices: false })
    try {
      const signal = AbortSignal.timeout(15_000)
      const orpcClient = await client.getOrpcClient(15_000, signal)
      const status = await orpcClient.status.get(undefined, { signal })
      // Why: older pairing offers may not carry scope metadata. The host
      // stamps it onto status.get so those links still fail before app entry.
      if (status.deviceScope === 'mobile') {
        setError(
          translate(
            'auto.web.WebConnect.mobileScopeRejected',
            'This connection has limited mobile access. Ask the host owner to authorize this client through Coworking for full web access.'
          )
        )
        return
      }
      saveStoredWebRuntimeEnvironment({
        ...environment,
        runtimeId: status.runtimeId,
        lastUsedAt: Date.now()
      })
      onConnected()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      client.close()
      setConnecting(false)
    }
  }, [name, onConnected, parsedOffer])

  // Why: a deep-linked offer that reaches this screen either has mobile scope
  // or unknown legacy scope; run the same connect path to reject/probe it.
  useEffect(() => {
    if (autoConnectAttempted.current || !initialPairingInput || !parsedOffer) {
      return
    }
    autoConnectAttempted.current = true
    void connect()
  }, [connect, initialPairingInput, parsedOffer])

  const clear = (): void => {
    clearStoredWebRuntimeEnvironment()
    setPairingCode('')
    setError(null)
  }

  return (
    <div className="bg-background text-foreground flex min-h-dvh items-center justify-center px-4 py-6">
      <div className="border-border bg-card flex w-full max-w-[520px] flex-col gap-5 border p-5">
        <div className="flex items-start gap-3">
          <div className="border-border bg-muted flex size-9 shrink-0 items-center justify-center border">
            <Server size={18} aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="text-base leading-6 font-semibold">
              {translate('auto.web.WebConnect.e3bcd082ac', 'Connect to Yiru')}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm leading-5">
              {translate(
                'auto.web.WebConnect.3affe7de3a',
                'Paste a pairing URL from a runtime host that this browser can reach.'
              )}
            </p>
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="web-runtime-name">
            {translate('auto.web.WebConnect.cb4d287238', 'Host name')}
          </Label>
          <Input
            id="web-runtime-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="web-runtime-pairing-code">
            {translate('auto.web.WebConnect.7a566540de', 'Pairing URL or code')}
          </Label>
          <Input
            id="web-runtime-pairing-code"
            value={pairingCode}
            onChange={(event) => setPairingCode(event.target.value)}
            placeholder={translate('auto.web.WebConnect.27393856e4', 'yiru://pair?code=...')}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {parsedOffer && (
          <div className="border-border bg-muted text-muted-foreground border px-3 py-2 text-xs">
            {translate('auto.web.WebConnect.4a4c017be1', 'Endpoint:')} {parsedOffer.endpoint}
          </div>
        )}

        {error && (
          <div className="border-destructive/40 bg-destructive/10 text-destructive border px-3 py-2 text-sm">
            {error}
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" onClick={clear} className="gap-2">
            <Trash2 size={15} aria-hidden />
            {translate('auto.web.WebConnect.2cf9e5a294', 'Clear saved host')}
          </Button>
          <Button
            type="button"
            onClick={() => void connect()}
            disabled={connecting || !parsedOffer}
            className="gap-2"
          >
            {connecting ? (
              <LoadingIndicator size={15} aria-hidden />
            ) : (
              <Cable size={15} aria-hidden />
            )}
            {translate('auto.web.WebConnect.b411ec0069', 'Connect')}
          </Button>
        </div>
      </div>
    </div>
  )
}
