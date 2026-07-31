import type { CoworkingRequesterTransportErrorCode } from '~shared/coworking/ipc-contract'

import type { CoworkingTerminalConnectionStatus } from './terminal-status-label'

type CoworkingTerminalSubscriptionSettlementOptions = {
  setStatus: (status: CoworkingTerminalConnectionStatus) => void
  onClosed?: (canContinue: boolean) => void
  onError?: (code: CoworkingRequesterTransportErrorCode | null) => void
}

/** Settles one renderer attempt once even when main reports both an event and a rejection. */
export function createCoworkingTerminalSubscriptionSettlement(
  options: CoworkingTerminalSubscriptionSettlementOptions
): {
  isSettled: () => boolean
  complete: (canContinue: boolean) => void
  error: (code: CoworkingRequesterTransportErrorCode | null) => void
} {
  let settled = false
  const settle = (status: CoworkingTerminalConnectionStatus, notify: () => void): void => {
    if (settled) {
      return
    }
    settled = true
    options.setStatus(status)
    notify()
  }
  return {
    isSettled: () => settled,
    complete: (canContinue) => settle('closed', () => options.onClosed?.(canContinue)),
    error: (code) => settle('error', () => options.onError?.(code))
  }
}
