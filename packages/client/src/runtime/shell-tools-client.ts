import type { ShellHtmlToPdfInput, ShellHtmlToPdfResult } from '@yiru/runtime-protocol/contract'
import type {
  DeveloperPermissionId,
  DeveloperPermissionRequestResult,
  DeveloperPermissionState
} from '@yiru/runtime-protocol/workbench/developer-permissions-types'
import type {
  LocalhostWorktreeLabelResult,
  LocalhostWorktreeLabelRoute
} from '@yiru/runtime-protocol/workbench/localhost-worktree-labels'
import type {
  WindowsMobileFirewallRepairResult,
  WindowsMobileFirewallStatus
} from '@yiru/runtime-protocol/workbench/windows-mobile-firewall'

import { callShellOrpc } from './orpc-client'

export type ShellMiniMaxCredentialsApi = {
  getStatus: () => Promise<{ configured: boolean }>
  saveCookie: (cookie: string) => Promise<{ configured: boolean }>
  clearCookie: () => Promise<{ configured: boolean }>
}
export type ShellMobileApi = {
  getWindowsFirewallStatus: (args?: { address?: string }) => Promise<WindowsMobileFirewallStatus>
  repairWindowsFirewall: () => Promise<WindowsMobileFirewallRepairResult>
  openWindowsNetworkSettings: () => Promise<boolean>
}
export type ShellDeveloperPermissionsApi = {
  getStatus: () => Promise<DeveloperPermissionState[]>
  request: (args: { id: DeveloperPermissionId }) => Promise<DeveloperPermissionRequestResult>
}
export type ShellLocalhostWorktreeLabelsApi = {
  register: (args: LocalhostWorktreeLabelRoute) => Promise<LocalhostWorktreeLabelResult>
}
export type ShellExportApi = {
  htmlToPdf: (args: ShellHtmlToPdfInput) => Promise<ShellHtmlToPdfResult>
}

function restoreShellDocument<T>(value: unknown): T {
  return value as T
}

export const shellMiniMaxCredentialsApi: ShellMiniMaxCredentialsApi = {
  getStatus: async () =>
    restoreShellDocument(
      await callShellOrpc((client) => client.shell.minimaxCredentials.getStatus, undefined)
    ),
  saveCookie: async (cookie) =>
    restoreShellDocument(
      await callShellOrpc((client) => client.shell.minimaxCredentials.saveCookie, { cookie })
    ),
  clearCookie: async () =>
    restoreShellDocument(
      await callShellOrpc((client) => client.shell.minimaxCredentials.clearCookie, undefined)
    )
}
export const shellMobileApi: ShellMobileApi = {
  getWindowsFirewallStatus: (input) =>
    callShellOrpc((client) => client.shell.mobile.getWindowsFirewallStatus, input),
  repairWindowsFirewall: () =>
    callShellOrpc((client) => client.shell.mobile.repairWindowsFirewall, undefined),
  openWindowsNetworkSettings: () =>
    callShellOrpc((client) => client.shell.mobile.openWindowsNetworkSettings, undefined)
}
export const shellDeveloperPermissionsApi: ShellDeveloperPermissionsApi = {
  getStatus: () =>
    callShellOrpc((client) => client.shell.developerPermissions.getStatus, undefined),
  request: (input) => callShellOrpc((client) => client.shell.developerPermissions.request, input)
}
export const shellExportApi: ShellExportApi = {
  htmlToPdf: async (input) =>
    restoreShellDocument(await callShellOrpc((client) => client.shell.export.htmlToPdf, input))
}
export const shellLocalhostWorktreeLabelsApi: ShellLocalhostWorktreeLabelsApi = {
  register: async (input) =>
    restoreShellDocument(
      await callShellOrpc((client) => client.shell.localhostWorktreeLabels.register, input)
    )
}
