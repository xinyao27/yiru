import type { RpcClient } from '../transport/rpc-client'
import { callRuntimeOrpc } from '../transport/runtime-orpc-client'
import { LogicalClientCutoverError } from '../transport/stable-logical-rpc-client'
import {
  getMobileTerminalDiagnosticErrorName,
  logMobileTerminalDiagnostic,
  shortenMobileTerminalDiagnosticId
} from './terminal/diagnostics'

type MobileSessionTabActivationParams = {
  worktree: string
  tabId: string
  leafId?: string
  notifyClients: false
}

async function retryIdempotentActivationAfterCutover<TResult>(
  request: () => Promise<TResult>,
  operation: 'terminal.focus' | 'session.tabs.activate',
  target: string
): Promise<TResult> {
  const diagnosticTarget = shortenMobileTerminalDiagnosticId(target)
  logMobileTerminalDiagnostic('activation-request', { operation, target: diagnosticTarget })
  try {
    const result = await request()
    logMobileTerminalDiagnostic('activation-result', {
      operation,
      target: diagnosticTarget,
      ok: true,
      rpcCode: null
    })
    return result
  } catch (error) {
    if (!(error instanceof LogicalClientCutoverError)) {
      logMobileTerminalDiagnostic('activation-error', {
        operation,
        target: diagnosticTarget,
        errorName: getMobileTerminalDiagnosticErrorName(error)
      })
      throw error
    }
    logMobileTerminalDiagnostic('activation-cutover-retry', {
      operation,
      target: diagnosticTarget
    })
    // Why: cutover rejects ambiguous in-flight work after the replacement is
    // active; these state-setting requests are idempotent and safe to repeat once.
    try {
      const result = await request()
      logMobileTerminalDiagnostic('activation-result', {
        operation,
        target: diagnosticTarget,
        ok: true,
        rpcCode: null
      })
      return result
    } catch (retryError) {
      logMobileTerminalDiagnostic('activation-error', {
        operation,
        target: diagnosticTarget,
        errorName: getMobileTerminalDiagnosticErrorName(retryError)
      })
      throw retryError
    }
  }
}

export function focusMobileTerminal(client: RpcClient, terminal: string) {
  return retryIdempotentActivationAfterCutover(
    () => callRuntimeOrpc(client, (runtime) => runtime.terminal.focus, { terminal }),
    'terminal.focus',
    terminal
  )
}

export function activateMobileSessionTab(
  client: RpcClient,
  params: MobileSessionTabActivationParams
) {
  return retryIdempotentActivationAfterCutover(
    () => callRuntimeOrpc(client, (runtime) => runtime.session.tabs.activate, params),
    'session.tabs.activate',
    params.tabId
  )
}
