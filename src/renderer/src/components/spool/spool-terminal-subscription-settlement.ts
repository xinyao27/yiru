import type { SpoolRequesterTransportErrorCode } from '../../../../shared/spool/spool-ipc-contract'
import type { SpoolTerminalConnectionStatus } from './spool-terminal-status-label'

type SpoolTerminalSubscriptionSettlementOptions = {
  setStatus: (status: SpoolTerminalConnectionStatus) => void
  onClosed?: (canContinue: boolean) => void
  onError?: (code: SpoolRequesterTransportErrorCode | null) => void
}

/** Settles one renderer attempt once even when main reports both an event and a rejection. */
export function createSpoolTerminalSubscriptionSettlement(
  options: SpoolTerminalSubscriptionSettlementOptions
): {
  isSettled: () => boolean
  complete: (canContinue: boolean) => void
  error: (code: SpoolRequesterTransportErrorCode | null) => void
} {
  let settled = false
  const settle = (status: SpoolTerminalConnectionStatus, notify: () => void): void => {
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
