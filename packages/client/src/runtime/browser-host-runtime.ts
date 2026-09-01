import type { TerminalOpenMultiplexResult } from '@yiru/runtime-protocol/contract'
import type { RuntimeRpcResponse } from '@yiru/runtime-protocol/rpc-envelope'

import type { RuntimeOrpcClientConnection } from './orpc-connection'

type BrowserHostRuntimeConnection = () => Promise<RuntimeOrpcClientConnection>
export type BrowserHostTerminalMultiplexHandle = {
  sendBinary: (bytes: Uint8Array<ArrayBufferLike>) => void
  unsubscribe: () => void
}
export type BrowserHostTerminalMultiplexOptions = {
  environmentIdentity: string
  onBinary: (bytes: Uint8Array<ArrayBufferLike>) => void
  onClose: () => void
  onError: (error: Error) => void
  onResponse: (response: RuntimeRpcResponse<unknown>) => void
  ticket: TerminalOpenMultiplexResult
}
type BrowserHostTerminalMultiplex = (
  options: BrowserHostTerminalMultiplexOptions
) => Promise<BrowserHostTerminalMultiplexHandle>

let openBrowserHostRuntimeConnection: BrowserHostRuntimeConnection | null = null
let openBrowserHostTerminalMultiplex: BrowserHostTerminalMultiplex | null = null

export function configureBrowserHostRuntime(
  openConnection: BrowserHostRuntimeConnection | null
): void {
  openBrowserHostRuntimeConnection = openConnection
}

export function hasBrowserHostRuntime(): boolean {
  return openBrowserHostRuntimeConnection !== null
}

export function openConfiguredBrowserHostRuntime(): Promise<RuntimeOrpcClientConnection> {
  if (!openBrowserHostRuntimeConnection) {
    return Promise.reject(new Error('browser_host_runtime_not_configured'))
  }
  return openBrowserHostRuntimeConnection()
}

export function configureBrowserHostTerminalMultiplex(
  openMultiplex: BrowserHostTerminalMultiplex | null
): void {
  openBrowserHostTerminalMultiplex = openMultiplex
}

export function hasBrowserHostTerminalMultiplex(): boolean {
  return openBrowserHostTerminalMultiplex !== null
}

export function openConfiguredBrowserHostTerminalMultiplex(
  options: BrowserHostTerminalMultiplexOptions
): Promise<BrowserHostTerminalMultiplexHandle> {
  if (!openBrowserHostTerminalMultiplex) {
    return Promise.reject(new Error('browser_host_terminal_multiplex_not_configured'))
  }
  return openBrowserHostTerminalMultiplex(options)
}
