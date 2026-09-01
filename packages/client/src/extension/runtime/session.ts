import {
  configureBrowserHostRuntime,
  configureBrowserHostTerminalMultiplex
} from '../../runtime/browser-host-runtime'
import {
  ExtensionRuntimeClient,
  type ExtensionConnectionState,
  type ExtensionRuntimeOrpcClient
} from './client'
import { openExtensionTerminalMultiplex } from './terminal-multiplex'

export type ExtensionRuntimeBootstrap = {
  authToken: string
  endpoint: string
  protocolVersion: number
  runtimeId: string
}

let runtimeClient: ExtensionRuntimeClient | null = null
let runtimeLabel = ''

export function configureExtensionRuntime(bootstrap: ExtensionRuntimeBootstrap): void {
  runtimeClient?.close()
  runtimeClient = new ExtensionRuntimeClient(bootstrap)
  runtimeLabel = new URL(bootstrap.endpoint).host
  configureBrowserHostRuntime(async () => ({
    client: await getExtensionRuntimeClient(),
    close: () => {},
    transport: 'extension'
  }))
  configureBrowserHostTerminalMultiplex((options) =>
    openExtensionTerminalMultiplex(bootstrap, options)
  )
}

export function getExtensionRuntimeLabel(): string {
  return runtimeLabel
}

export async function getExtensionRuntimeClient(): Promise<ExtensionRuntimeOrpcClient> {
  if (!runtimeClient) {
    throw new Error('extension_runtime_not_configured')
  }
  return runtimeClient.getOrpcClient()
}

export function closeExtensionRuntime(): void {
  runtimeClient?.close()
  runtimeClient = null
  configureBrowserHostRuntime(null)
  configureBrowserHostTerminalMultiplex(null)
}

export function getExtensionConnectionSnapshot(): ExtensionConnectionState {
  return runtimeClient?.getConnectionState() ?? 'connecting'
}

export function subscribeExtensionConnection(listener: () => void): () => void {
  return runtimeClient?.subscribe(listener) ?? (() => {})
}
