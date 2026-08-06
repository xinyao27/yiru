import type { CliStatusResult } from '~shared/runtime-types'

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

export function isOpenYiruReady(status: RuntimeRpcSuccess<CliStatusResult>): boolean {
  // Why: desktop availability can precede renderer graph/store attachment on a
  // cold launch; follow-up workspace RPCs are safe only once both are ready.
  return (
    status.result.graph.state === 'ready' && status.result.app.desktopWindowStatus === 'available'
  )
}

export function throwDesktopActivationBlocked(): never {
  throw new RuntimeClientError(
    'desktop_activation_blocked',
    'Yiru is running headlessly, but it cannot open a desktop window safely because the persistent terminal provider is unavailable. Quit Yiru normally and start the app again; do not use open -n.'
  )
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
