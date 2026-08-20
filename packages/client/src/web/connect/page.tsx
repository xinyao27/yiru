import { useEffect, useState } from 'react'
import { Check, Copy } from '~renderer/components/icons/hugeicons'
import { LoadingIndicator } from '~renderer/components/loading-indicator'
import { Button } from '~renderer/components/ui/button'
import { ButtonGroup, ButtonGroupText } from '~renderer/components/ui/button-group'
import { ScrollArea } from '~renderer/components/ui/scroll-area'
import { translate } from '~renderer/i18n/i18n'

import {
  createStoredWebRuntimeEnvironment,
  saveStoredWebRuntimeEnvironment
} from '../runtime-environment'
import {
  cancelBrowserConnectGrant,
  createBrowserConnectGrant,
  readBrowserConnectGrantStatus
} from './grant-client'
import type { BrowserConnectGrant } from './grant-client'

type PairingViewState =
  | { kind: 'loading' }
  | { kind: 'ready'; grant: BrowserConnectGrant }
  | {
      kind: 'verification-required'
      grant: BrowserConnectGrant
      machineName: string
      verificationCode: string
    }
  | { kind: 'paired'; machineId: string; machineName: string }
  | { kind: 'error'; message: string }

const INSTALL_COMMAND = 'curl -fsSL https://yiru.ai/install.sh | sh'
const STATUS_POLL_INTERVAL_MS = 1_500

type WebConnectProps = { onConnected: () => void }

export function WebConnect({ onConnected }: WebConnectProps): React.JSX.Element {
  const [state, setState] = useState<PairingViewState>({ kind: 'loading' })
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null)
  const activeGrantId =
    state.kind === 'ready' || state.kind === 'verification-required' ? state.grant.grantId : null

  useEffect(() => {
    const controller = new AbortController()
    // Why: aborting after server-side creation can hide the grant ID needed for signed cleanup.
    // A late response is accepted only long enough to revoke that grant immediately.
    void createBrowserConnectGrant().then(
      (grant) => {
        if (controller.signal.aborted) {
          void cancelBrowserConnectGrant(grant.grantId)
          return
        }
        setState({ kind: 'ready', grant })
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            kind: 'error',
            message: error instanceof Error ? error.message : String(error)
          })
        }
      }
    )
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (state.kind !== 'ready' && state.kind !== 'verification-required') {
      return
    }
    const grant = state.grant
    let stopped = false
    let timer: number | null = null
    const poll = async (): Promise<void> => {
      try {
        const status = await readBrowserConnectGrantStatus(grant.grantId)
        if (stopped) {
          return
        }
        if (status.status === 'verification-required') {
          setState({
            kind: 'verification-required',
            grant,
            machineName: status.machineName,
            verificationCode: status.verificationCode
          })
        } else if (status.status === 'paired') {
          saveStoredWebRuntimeEnvironment(
            createStoredWebRuntimeEnvironment({
              name: status.machineName,
              offer: {
                v: 2,
                endpoint: `${window.location.origin}/api/connect/machines/${status.machineId}/socket`,
                deviceToken: '',
                publicKeyB64: '',
                scope: 'runtime',
                relayMachineId: status.machineId,
                relayMachineSigningKey: status.machineSigningKey
              }
            })
          )
          setState({ kind: 'paired', machineId: status.machineId, machineName: status.machineName })
          window.setTimeout(onConnected, 1_000)
          return
        } else if (status.status === 'expired') {
          setState({
            kind: 'error',
            message: translate(
              'auto.web.WebConnect.grantExpired',
              'This pairing command expired. Refresh the page to create a new one.'
            )
          })
          return
        }
        timer = window.setTimeout(() => void poll(), STATUS_POLL_INTERVAL_MS)
      } catch (error) {
        if (!stopped) {
          setState({
            kind: 'error',
            message: error instanceof Error ? error.message : String(error)
          })
        }
      }
    }
    timer = window.setTimeout(() => void poll(), STATUS_POLL_INTERVAL_MS)
    return () => {
      stopped = true
      if (timer !== null) {
        window.clearTimeout(timer)
      }
    }
  }, [onConnected, state])

  useEffect(() => {
    if (!activeGrantId) {
      return
    }
    return () => {
      void cancelBrowserConnectGrant(activeGrantId)
    }
  }, [activeGrantId])

  const copyCommand = async (command: string): Promise<void> => {
    await navigator.clipboard.writeText(command)
    setCopiedCommand(command)
    window.setTimeout(
      () => setCopiedCommand((current) => (current === command ? null : current)),
      1_500
    )
  }

  const pairingCommand =
    state.kind === 'ready' || state.kind === 'verification-required'
      ? `yiru connect --pair ${state.grant.grant}`
      : null
  const pairingCommandVisible = state.kind === 'ready'

  return (
    <main className="bg-background text-foreground min-h-dvh px-5 py-10 sm:px-8 sm:py-16">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-10">
        <header className="border-border border-b pb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            {translate('auto.web.WebConnect.title', 'Connect your computer')}
          </h1>
          <p className="text-muted-foreground mt-3 max-w-[620px] text-sm leading-6">
            {translate(
              'auto.web.WebConnect.description',
              'No account is required. This browser and your computer create their own private identities, then pair directly.'
            )}
          </p>
        </header>

        <ConnectStep
          number="1"
          title={translate('auto.web.WebConnect.installTitle', 'Install Yiru')}
        >
          <p className="text-muted-foreground text-sm leading-6">
            {translate(
              'auto.web.WebConnect.installDescription',
              'Run this once on the macOS or Linux computer you want to use.'
            )}
          </p>
          <CommandBlock
            command={INSTALL_COMMAND}
            copied={copiedCommand === INSTALL_COMMAND}
            onCopy={copyCommand}
          />
        </ConnectStep>

        <ConnectStep
          number="2"
          title={translate('auto.web.WebConnect.pairTitle', 'Pair this browser')}
        >
          {state.kind === 'loading' && <LoadingRow />}
          {pairingCommandVisible && pairingCommand && (
            <>
              <p className="text-muted-foreground text-sm leading-6">
                {translate(
                  'auto.web.WebConnect.pairDescription',
                  'Run this single-use command on that computer. It expires after 10 minutes.'
                )}
              </p>
              <CommandBlock
                command={pairingCommand}
                copied={copiedCommand === pairingCommand}
                onCopy={copyCommand}
              />
            </>
          )}
          {state.kind === 'verification-required' && (
            <div className="border-border bg-muted border p-4">
              <p className="text-sm font-medium">
                {translate('auto.web.WebConnect.verifyTitle', 'Check the code before confirming')}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                {translate(
                  'auto.web.WebConnect.verifyDescription',
                  'The terminal on {{machine}} must show this same code:',
                  { machine: state.machineName }
                )}
              </p>
              <div className="mt-4 font-mono text-3xl tracking-[0.28em] tabular-nums">
                {state.verificationCode}
              </div>
            </div>
          )}
          {state.kind === 'paired' && (
            <div className="border-border flex items-start gap-3 border p-4">
              <Check className="text-success mt-0.5" size={18} aria-hidden />
              <div>
                <p className="text-sm font-medium">
                  {translate('auto.web.WebConnect.pairedTitle', '{{machine}} is paired', {
                    machine: state.machineName
                  })}
                </p>
                <p className="text-muted-foreground mt-1 text-sm leading-6">
                  {translate(
                    'auto.web.WebConnect.pairedDescription',
                    'Keep the terminal command running to use this computer in the Web app. Ctrl+C takes it offline.'
                  )}
                </p>
              </div>
            </div>
          )}
          {state.kind === 'error' && (
            <div className="border-destructive/40 text-destructive border p-4 text-sm">
              {state.message}
            </div>
          )}
        </ConnectStep>

        <p className="text-muted-foreground border-border border-t pt-6 text-xs leading-5">
          {translate(
            'auto.web.WebConnect.securityNote',
            'The private browser key cannot be exported. Clearing this site’s browser data removes access and requires pairing again.'
          )}
        </p>
      </div>
    </main>
  )
}

type ConnectStepProps = {
  number: string
  title: string
  children: React.ReactNode
}

function ConnectStep(props: ConnectStepProps): React.JSX.Element {
  return (
    <section className="grid gap-4 sm:grid-cols-[32px_1fr]">
      <div className="border-border flex size-8 items-center justify-center border font-mono text-xs">
        {props.number}
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <h2 className="text-base font-semibold">{props.title}</h2>
        {props.children}
      </div>
    </section>
  )
}

type CommandBlockProps = {
  command: string
  copied: boolean
  onCopy: (command: string) => Promise<void>
}

function CommandBlock(props: CommandBlockProps): React.JSX.Element {
  return (
    <ButtonGroup className="border-border bg-muted h-12 w-full min-w-0 border">
      <ButtonGroupText className="min-h-0 min-w-0 flex-1 overflow-hidden border-0 bg-transparent p-0 font-normal">
        <ScrollArea
          className="h-full min-w-0 flex-1"
          horizontalScrollBar
          hasVerticalScrollBar={false}
        >
          <code className="block px-4 py-3 font-mono text-xs leading-5 whitespace-nowrap">
            {props.command}
          </code>
        </ScrollArea>
      </ButtonGroupText>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-auto w-12 bg-transparent"
        onClick={() => void props.onCopy(props.command)}
        aria-label={translate('auto.web.WebConnect.copyCommand', 'Copy command')}
      >
        {props.copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
      </Button>
    </ButtonGroup>
  )
}

function LoadingRow(): React.JSX.Element {
  return (
    <div className="text-muted-foreground flex items-center gap-2 text-sm">
      <LoadingIndicator className="size-4" aria-hidden="true" />
      {translate('auto.web.WebConnect.creatingGrant', 'Creating a secure pairing command…')}
    </div>
  )
}
