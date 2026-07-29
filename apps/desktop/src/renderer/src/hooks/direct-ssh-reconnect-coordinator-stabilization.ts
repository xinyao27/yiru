import type { DirectSshAuthority } from '@yiru/runtime-protocol/ssh-connection'

import type { DirectSshReconnectTimer } from './direct-ssh-reconnect-coordinator-types'

export type DirectSshReconnectTargetState = {
  authority: DirectSshAuthority
  installedAt: number
  dampUntil: number | null
  timer: DirectSshReconnectTimer | null
}

export function createDirectSshReconnectTargetState(
  authority: DirectSshAuthority,
  previous: DirectSshReconnectTargetState | undefined,
  installedAt: number,
  stabilizationMs: number
): DirectSshReconnectTargetState {
  const rotatedRapidly =
    previous !== undefined && installedAt - previous.installedAt < stabilizationMs
  return {
    authority,
    installedAt,
    dampUntil: rotatedRapidly ? installedAt + stabilizationMs : null,
    timer: null
  }
}
