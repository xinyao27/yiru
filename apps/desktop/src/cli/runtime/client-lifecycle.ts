import { parsePairingCode, type PairingOffer } from '~shared/pairing'
import type { CliStatusResult } from '~shared/runtime-types'

import { resolveEnvironmentPairingOffer } from './environments'
import { RuntimeClientError, type RuntimeRpcSuccess } from './types'

export function attachMutationRecovery(error: unknown, requestId: string | undefined): unknown {
  if (!requestId || !(error instanceof RuntimeClientError)) {
    return error
  }
  return new RuntimeClientError(
    error.code,
    `${error.message} Orchestration mutation request ID: ${requestId}.`,
    {
      ...(error.data && typeof error.data === 'object' ? error.data : {}),
      orchestrationRequestId: requestId
    }
  )
}

export function isOpenYiruReady(
  status: RuntimeRpcSuccess<CliStatusResult>,
  remote: boolean
): boolean {
  // Why: desktop availability can precede renderer graph/store attachment on a
  // cold launch; follow-up workspace RPCs are safe only once both are ready.
  return (
    status.result.graph.state === 'ready' &&
    (remote || status.result.app.desktopWindowStatus === 'available')
  )
}

export function throwDesktopActivationBlocked(): never {
  throw new RuntimeClientError(
    'desktop_activation_blocked',
    'Yiru is running headlessly, but it cannot open a desktop window safely because the persistent terminal provider is unavailable. Quit Yiru normally and start the app again; do not use open -n.'
  )
}

export function resolveRemotePairing(
  userDataPath: string,
  pairingCode: string | null,
  environmentSelector: string | null
): PairingOffer | null {
  if (pairingCode && environmentSelector) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Use either --pairing-code or --environment, not both.'
    )
  }
  if (environmentSelector) {
    return resolveEnvironmentPairingOffer(userDataPath, environmentSelector)
  }
  if (!pairingCode) {
    return null
  }
  const pairing = parsePairingCode(pairingCode)
  if (!pairing) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Invalid remote pairing code. Expected a yiru://pair?... URL or bare pairing payload.'
    )
  }
  return pairing
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
