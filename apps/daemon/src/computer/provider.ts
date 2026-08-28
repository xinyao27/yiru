import type {
  ComputerActionResult,
  ComputerListAppsResult,
  ComputerListWindowsResult,
  ComputerProviderCapabilities,
  ComputerSnapshotResult
} from '@yiru/runtime-protocol/workbench/runtime-types'

import { resolveMacOSComputerUseExecutablePath } from './macos-native-provider-paths'
import { MacOSProviderClient } from './macos-provider-client'
import { isMacOS14OrNewer } from './macos-provider-transport'
import { PlatformScriptProviderClient } from './platform-script-provider-client'
import type { ComputerProviderActionMethod } from './provider-action-validation'
import { RuntimeClientError } from './runtime-client-error'

type ComputerProviderClient = MacOSProviderClient | PlatformScriptProviderClient

let provider: ComputerProviderClient | null = null
let providerPromise: Promise<ComputerProviderClient> | null = null

export async function listComputerApps(): Promise<ComputerListAppsResult> {
  return await (await getComputerProvider()).listApps()
}

export async function readComputerCapabilities(): Promise<ComputerProviderCapabilities> {
  return await (await getComputerProvider()).capabilities()
}

export async function listComputerWindows(params: unknown): Promise<ComputerListWindowsResult> {
  return await (await getComputerProvider()).listWindows(params)
}

export async function readComputerSnapshot(params: unknown): Promise<ComputerSnapshotResult> {
  return await (await getComputerProvider()).snapshot(params)
}

export async function performComputerAction(
  method: ComputerProviderActionMethod,
  params: unknown
): Promise<ComputerActionResult> {
  return await (await getComputerProvider()).action(method, params)
}

export function shutdownComputerProvider(): void {
  provider?.shutdown()
  provider = null
  providerPromise = null
}

async function getComputerProvider(): Promise<ComputerProviderClient> {
  if (provider) {
    return provider
  }
  providerPromise ??= createComputerProvider()
  try {
    provider = await providerPromise
    return provider
  } finally {
    providerPromise = null
  }
}

async function createComputerProvider(): Promise<ComputerProviderClient> {
  if (
    process.platform === 'darwin' &&
    isMacOS14OrNewer() &&
    resolveMacOSComputerUseExecutablePath() !== null
  ) {
    return new MacOSProviderClient()
  }
  if (process.platform === 'linux' || process.platform === 'win32') {
    return await PlatformScriptProviderClient.create()
  }
  throw new RuntimeClientError(
    'unsupported_capability',
    `computer-use has no available provider for ${process.platform}`
  )
}
