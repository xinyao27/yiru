import type { ShellServicesBrowserCommandInput } from '@yiru/runtime-protocol/contract'

import {
  getConnectedShellServicesClient,
  getConnectedWebShellServicesClient
} from './shell-services-reverse-link'

export async function requestShellBrowserCommand(
  shellConnectionId: string | undefined,
  input: ShellServicesBrowserCommandInput
): Promise<unknown> {
  // Why: CLI, mobile, and automation calls use their own RPC connection. Browser
  // effects still belong to the authenticated extension shell that owns Chrome.
  const client =
    getConnectedShellServicesClient(shellConnectionId) ?? getConnectedWebShellServicesClient()
  if (!client) {
    throw new Error('shell_unavailable')
  }
  const output = await client.browser.command(input, {
    signal: AbortSignal.timeout(30_000)
  })
  return output.result
}
