import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  RuntimeStatusIndicator,
  type RuntimeStatusIndicatorProps
} from '~renderer/status-bar/runtime-status/indicator'

import type { StoredWebRuntimeEnvironment } from '../runtime-environment'

export type WebRuntimeStatus =
  | { kind: 'pairing' }
  | {
      kind: 'checking' | 'connected' | 'offline'
      environment: StoredWebRuntimeEnvironment
    }

type WebRuntimeStatusProviderProps = {
  children: ReactNode
  status: WebRuntimeStatus
}

const WebRuntimeStatusContext = createContext<WebRuntimeStatus | null>(null)

export function WebRuntimeStatusProvider(props: WebRuntimeStatusProviderProps): React.JSX.Element {
  return (
    <WebRuntimeStatusContext.Provider value={props.status}>
      {props.children}
    </WebRuntimeStatusContext.Provider>
  )
}

function getStatusPresentation(status: WebRuntimeStatus): RuntimeStatusIndicatorProps {
  const title = translate('auto.web.WebRuntimeStatus.title', 'Yiru CLI connection')
  switch (status.kind) {
    case 'pairing':
      return {
        title,
        kind: 'pairing',
        details: [],
        shortLabel: translate('auto.web.WebRuntimeStatus.notPaired', 'Not paired'),
        label: translate('auto.web.WebRuntimeStatus.notPairedLabel', 'No Yiru CLI paired'),
        description: translate(
          'auto.web.WebRuntimeStatus.notPairedDescription',
          'Pair a computer to route Web work through its Yiru CLI.'
        )
      }
    case 'checking':
      return {
        title,
        kind: 'checking',
        details: [
          {
            label: translate('auto.web.WebRuntimeStatus.computer', 'Computer'),
            value: status.environment.name
          }
        ],
        shortLabel: translate('auto.web.WebRuntimeStatus.checking', 'Checking'),
        label: translate(
          'auto.web.WebRuntimeStatus.checkingLabel',
          'Checking the Yiru CLI on {{machine}}',
          { machine: status.environment.name }
        ),
        description: translate(
          'auto.web.WebRuntimeStatus.checkingDescription',
          'Checking the saved private connection before opening your projects.'
        )
      }
    case 'connected':
      return {
        title,
        kind: 'ready',
        details: [
          {
            label: translate('auto.web.WebRuntimeStatus.computer', 'Computer'),
            value: status.environment.name
          }
        ],
        shortLabel: translate('auto.web.WebRuntimeStatus.connected', 'Connected'),
        label: translate(
          'auto.web.WebRuntimeStatus.connectedLabel',
          'Yiru CLI connected on {{machine}}',
          { machine: status.environment.name }
        ),
        description: translate(
          'auto.web.WebRuntimeStatus.connectedDescription',
          'Web requests are routed through the Yiru CLI on {{machine}}.',
          { machine: status.environment.name }
        )
      }
    case 'offline':
      return {
        title,
        kind: 'offline',
        details: [
          {
            label: translate('auto.web.WebRuntimeStatus.computer', 'Computer'),
            value: status.environment.name
          }
        ],
        shortLabel: translate('auto.web.WebRuntimeStatus.offline', 'Offline'),
        label: translate(
          'auto.web.WebRuntimeStatus.offlineLabel',
          'Yiru CLI offline on {{machine}}',
          { machine: status.environment.name }
        ),
        description: translate(
          'auto.web.WebRuntimeStatus.offlineDescription',
          'Start Yiru or its connect command on {{machine}}. Reconnection is automatic.',
          { machine: status.environment.name }
        )
      }
  }
}

export function WebRuntimeStatusSegment(): React.JSX.Element | null {
  const status = useContext(WebRuntimeStatusContext)
  if (!status) {
    return null
  }
  return <RuntimeStatusIndicator {...getStatusPresentation(status)} />
}

export function WebRuntimeStatusFooter(): React.JSX.Element | null {
  const status = useContext(WebRuntimeStatusContext)
  if (!status || status.kind === 'connected') {
    return null
  }
  return (
    <footer
      aria-label={translate('auto.web.WebRuntimeStatus.footer', 'Yiru CLI status')}
      className="border-border bg-background fixed inset-x-0 bottom-0 z-40 flex h-6 items-center justify-end border-t pr-3"
    >
      <WebRuntimeStatusSegment />
    </footer>
  )
}
