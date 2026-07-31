import type { SshConnectionState, SshConnectionStatus } from '@yiru/runtime-protocol/ssh-connection'

import { translate } from '../i18n/translate'

export type WorkspaceSshGate = {
  status: SshConnectionStatus | null
  requiresConnection: boolean
  connectInProgress: boolean
  error: string | null
}

function isWorkspaceSshConnectInProgress(status: SshConnectionStatus | null): boolean {
  return status === 'connecting' || status === 'deploying-relay' || status === 'reconnecting'
}

export function workspaceSshStatusLabel(status: SshConnectionStatus | null): string {
  if (status === 'connected') {
    return translate('mobile.newWorkspace.sshStatusConnected', 'Connected')
  }
  if (status === 'connecting') {
    return translate('mobile.newWorkspace.sshStatusConnecting', 'Connecting')
  }
  if (status === 'deploying-relay') {
    return translate('mobile.newWorkspace.sshStatusDeployingRelay', 'Deploying relay')
  }
  if (status === 'reconnecting') {
    return translate('mobile.newWorkspace.sshStatusReconnecting', 'Reconnecting')
  }
  if (status === 'auth-failed') {
    return translate('mobile.newWorkspace.sshStatusAuthFailed', 'Authentication failed')
  }
  if (status === 'reconnection-failed') {
    return translate('mobile.newWorkspace.sshStatusReconnectFailed', 'Reconnect failed')
  }
  if (status === 'error') {
    return translate('mobile.newWorkspace.sshStatusConnectionFailed', 'Connection failed')
  }
  return translate('mobile.newWorkspace.sshStatusDisconnected', 'Disconnected')
}

export function deriveWorkspaceSshGate(args: {
  connectionId: string | null
  state: SshConnectionState | null
  connecting: boolean
}): WorkspaceSshGate {
  const matchingState =
    args.connectionId && args.state?.targetId === args.connectionId ? args.state : null
  const status = matchingState?.status ?? null
  return {
    status,
    requiresConnection: args.connectionId !== null && status !== 'connected',
    connectInProgress: args.connecting || isWorkspaceSshConnectInProgress(status),
    error: matchingState?.error ?? null
  }
}
