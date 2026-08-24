import { translate } from '~renderer/i18n/i18n'
import type {
  DeveloperPermissionId,
  DeveloperPermissionRequestResult,
  DeveloperPermissionState
} from '~shared/developer-permissions-types'
import type {
  LocalhostWorktreeLabelResult,
  LocalhostWorktreeLabelRoute
} from '~shared/localhost-worktree-labels'

import { callShellOrpc, isWebRuntimeClient } from './orpc-client'

export type ShellMiniMaxCredentialsApi = {
  getStatus: () => Promise<{ configured: boolean }>
  saveCookie: (cookie: string) => Promise<{ configured: boolean }>
  clearCookie: () => Promise<{ configured: boolean }>
}
export type ShellMobileApi = {
  getWindowsFirewallStatus: (args?: { address?: string }) => Promise<
    | { supported: false }
    | {
        supported: true
        port: number
        ruleAllowed: boolean
        blockingRuleDetected: boolean
        privateFirewallEnabled: boolean
        networkCategory: 'private' | 'public' | 'domain' | 'unknown'
        inspectionAvailable: boolean
      }
  >
  repairWindowsFirewall: () => Promise<
    { ok: true } | { ok: false; reason: 'cancelled' | 'failed' | 'unsupported' }
  >
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
  htmlToPdf: (args: {
    html: string
    title: string
  }) => Promise<
    { success: true; filePath: string } | { success: false; cancelled?: boolean; error?: string }
  >
}

function restoreShellDocument<T>(value: unknown): T {
  return value as T
}

const electronMiniMaxCredentialsApi: ShellMiniMaxCredentialsApi = {
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
const electronMobileApi: ShellMobileApi = {
  getWindowsFirewallStatus: async (input) =>
    restoreShellDocument(
      await callShellOrpc((client) => client.shell.mobile.getWindowsFirewallStatus, input)
    ),
  repairWindowsFirewall: async () =>
    restoreShellDocument(
      await callShellOrpc((client) => client.shell.mobile.repairWindowsFirewall, undefined)
    ),
  openWindowsNetworkSettings: () =>
    callShellOrpc((client) => client.shell.mobile.openWindowsNetworkSettings, undefined)
}
const electronDeveloperPermissionsApi: ShellDeveloperPermissionsApi = {
  getStatus: async () =>
    restoreShellDocument(
      await callShellOrpc((client) => client.shell.developerPermissions.getStatus, undefined)
    ),
  request: async (input) =>
    restoreShellDocument(
      await callShellOrpc((client) => client.shell.developerPermissions.request, input)
    )
}
const electronExportApi: ShellExportApi = {
  htmlToPdf: async (input) =>
    restoreShellDocument(await callShellOrpc((client) => client.shell.export.htmlToPdf, input))
}
const electronLocalhostWorktreeLabelsApi: ShellLocalhostWorktreeLabelsApi = {
  register: async (input) =>
    restoreShellDocument(
      await callShellOrpc((client) => client.shell.localhostWorktreeLabels.register, input)
    )
}
const unavailableOnWeb = (): Error =>
  new Error(translate('auto.web.runtime.shellBoundary.unavailable', 'Unavailable on web.'))
const webMiniMaxCredentialsApi: ShellMiniMaxCredentialsApi = {
  getStatus: () => Promise.resolve({ configured: false }),
  saveCookie: () => Promise.reject(unavailableOnWeb()),
  clearCookie: () => Promise.resolve({ configured: false })
}
const webMobileApi: ShellMobileApi = {
  getWindowsFirewallStatus: () => Promise.resolve({ supported: false }),
  repairWindowsFirewall: () => Promise.resolve({ ok: false, reason: 'unsupported' }),
  openWindowsNetworkSettings: () => Promise.resolve(false)
}
const webDeveloperPermissionsApi: ShellDeveloperPermissionsApi = {
  getStatus: () => Promise.resolve([]),
  request: ({ id }) => Promise.resolve({ id, status: 'unsupported', openedSystemSettings: false })
}
const webExportApi: ShellExportApi = {
  htmlToPdf: () =>
    Promise.resolve({
      success: false,
      error: translate(
        'auto.web.webShell.exportHtmlToPdfUnavailable',
        'Exporting to PDF is unavailable in the web client.'
      )
    })
}
const webLocalhostWorktreeLabelsApi: ShellLocalhostWorktreeLabelsApi = {
  register: () => Promise.reject(unavailableOnWeb())
}
const isWeb = isWebRuntimeClient()
export const shellMiniMaxCredentialsApi = isWeb
  ? webMiniMaxCredentialsApi
  : electronMiniMaxCredentialsApi
export const shellMobileApi = isWeb ? webMobileApi : electronMobileApi
export const shellDeveloperPermissionsApi = isWeb
  ? webDeveloperPermissionsApi
  : electronDeveloperPermissionsApi
export const shellExportApi = isWeb ? webExportApi : electronExportApi
export const shellLocalhostWorktreeLabelsApi = isWeb
  ? webLocalhostWorktreeLabelsApi
  : electronLocalhostWorktreeLabelsApi
