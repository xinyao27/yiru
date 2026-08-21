import { type, type ContractRouter } from '@orpc/contract'

import { withAccess, type RuntimeProcedureMeta } from '../access-meta.js'

export type ShellWebConnectState = 'offline' | 'pairing' | 'connecting' | 'online'

export type ShellWebConnectPendingVerification = {
  expiresAt: number
  machineName: string
  verificationCode: string
}

export type ShellWebConnectStatus = {
  browserUrl: string | null
  machineId: string | null
  pairedBrowsers: number
  pendingVerification: ShellWebConnectPendingVerification | null
  state: ShellWebConnectState
}

const SHELL_WEB_CONNECT_READ_ACCESS = {
  scope: 'host',
  tier: 'read',
  principals: ['local']
} as const

const SHELL_WEB_CONNECT_WRITE_ACCESS = {
  scope: 'host',
  tier: 'host',
  principals: ['local']
} as const

// Why: this whole surface is local-only on purpose — it hands out pairing
// authority for this machine, so a remote or mobile principal must never be able
// to open a browser session or approve a pending verification.
export const shellWebConnectContract = {
  cancelPendingVerification: withAccess(SHELL_WEB_CONNECT_WRITE_ACCESS).output(type<void>()),
  confirmPendingVerification: withAccess(SHELL_WEB_CONNECT_WRITE_ACCESS).output(type<void>()),
  disconnect: withAccess(SHELL_WEB_CONNECT_WRITE_ACCESS).output(type<void>()),
  getStatus: withAccess(SHELL_WEB_CONNECT_READ_ACCESS).output(type<ShellWebConnectStatus>()),
  openBrowserSession: withAccess(SHELL_WEB_CONNECT_WRITE_ACCESS).output(type<{ opened: boolean }>())
} satisfies ContractRouter<RuntimeProcedureMeta>
