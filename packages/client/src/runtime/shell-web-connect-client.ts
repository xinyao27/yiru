import type { ShellWebConnectStatus } from '@yiru/runtime-protocol/contract'

import { callShellOrpc, isWebRuntimeClient } from './orpc-client'

export type ShellWebConnectApi = {
  cancelPendingVerification: () => Promise<void>
  confirmPendingVerification: () => Promise<void>
  disconnect: () => Promise<void>
  getStatus: () => Promise<ShellWebConnectStatus | null>
  openBrowserSession: () => Promise<{ opened: boolean }>
}

const electronWebConnectApi: ShellWebConnectApi = {
  cancelPendingVerification: () =>
    callShellOrpc((client) => client.shell.webConnect.cancelPendingVerification, undefined),
  confirmPendingVerification: () =>
    callShellOrpc((client) => client.shell.webConnect.confirmPendingVerification, undefined),
  disconnect: () => callShellOrpc((client) => client.shell.webConnect.disconnect, undefined),
  getStatus: () => callShellOrpc((client) => client.shell.webConnect.getStatus, undefined),
  openBrowserSession: () =>
    callShellOrpc((client) => client.shell.webConnect.openBrowserSession, undefined)
}

// Why: the workbench already runs in the browser here, so there is no local shell
// to pair and no second browser session to open. A null status lets the surface
// hide itself instead of every caller branching on the host.
const webWebConnectApi: ShellWebConnectApi = {
  cancelPendingVerification: () => Promise.resolve(),
  confirmPendingVerification: () => Promise.resolve(),
  disconnect: () => Promise.resolve(),
  getStatus: () => Promise.resolve(null),
  openBrowserSession: () => Promise.resolve({ opened: false })
}

export const shellWebConnectApi: ShellWebConnectApi = isWebRuntimeClient()
  ? webWebConnectApi
  : electronWebConnectApi
