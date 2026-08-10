import { LocalPtyProvider } from '../providers/local-pty-provider'
import type { IPtyProvider } from '../providers/types'

type ProviderStateCleanup = (ptyId: string) => void

let localProvider: IPtyProvider = new LocalPtyProvider()
let providerStateCleanup: ProviderStateCleanup | null = null

export function getLocalPtyProvider(): IPtyProvider {
  return localProvider
}

export function setLocalPtyProvider(provider: IPtyProvider): void {
  localProvider = provider
}

export function installProviderStateCleanup(cleanup: ProviderStateCleanup): void {
  providerStateCleanup = cleanup
}

export function clearProviderPtyState(ptyId: string): void {
  providerStateCleanup?.(ptyId)
}

export function killAllPty(): void {
  if (localProvider instanceof LocalPtyProvider) {
    localProvider.killAll()
  }
}
