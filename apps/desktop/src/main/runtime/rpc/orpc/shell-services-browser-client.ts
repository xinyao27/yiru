import type {
  ShellServicesBrowserTabCloseInput,
  ShellServicesBrowserTabCloseResult,
  ShellServicesBrowserTabCreateInput,
  ShellServicesBrowserTabCreateResult,
  ShellServicesBrowserTabSetProfileInput,
  ShellServicesBrowserTabSetProfileResult
} from '@yiru/runtime-protocol/contract'

import { getConnectedElectronShellServicesClient } from './shell-services-reverse-link'

export async function requestShellBrowserTabCreate(
  webContentsId: number | undefined,
  input: ShellServicesBrowserTabCreateInput
): Promise<ShellServicesBrowserTabCreateResult> {
  const client = getConnectedElectronShellServicesClient(webContentsId)
  if (!client) {
    return { ok: false, reason: 'shell-unavailable' }
  }
  const output = await client.browser.tabCreate(input, {
    signal: AbortSignal.timeout(10_000)
  })
  return { ok: true, ...output }
}

export async function requestShellBrowserTabSetProfile(
  webContentsId: number | undefined,
  input: ShellServicesBrowserTabSetProfileInput
): Promise<ShellServicesBrowserTabSetProfileResult> {
  const client = getConnectedElectronShellServicesClient(webContentsId)
  if (!client) {
    return { ok: false, reason: 'shell-unavailable' }
  }
  const output = await client.browser.tabSetProfile(input, {
    signal: AbortSignal.timeout(10_000)
  })
  return { ok: true, ...output }
}

export async function requestShellBrowserTabClose(
  webContentsId: number | undefined,
  input: ShellServicesBrowserTabCloseInput
): Promise<ShellServicesBrowserTabCloseResult> {
  const client = getConnectedElectronShellServicesClient(webContentsId)
  if (!client) {
    return { ok: false, reason: 'shell-unavailable' }
  }
  const output = await client.browser.tabClose(input, {
    signal: AbortSignal.timeout(10_000)
  })
  return { ok: true, ...output }
}
