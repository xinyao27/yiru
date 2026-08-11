import { translate } from '~renderer/i18n/i18n'
import type {
  AutomationDispatchResult,
  AutomationPrecheckResult,
  AutomationRun
} from '~shared/automations-types'
import type {
  DeveloperPermissionId,
  DeveloperPermissionRequestResult,
  DeveloperPermissionState
} from '~shared/developer-permissions-types'
import type { FridaySession } from '~shared/friday-types'
import type {
  LocalhostWorktreeLabelResult,
  LocalhostWorktreeLabelRoute
} from '~shared/localhost-worktree-labels'
import type { ExportApi } from '~shared/preload/api-types'
import type { CustomPet } from '~shared/types'

import { callShellOrpc, isWebRuntimeClient } from './orpc-client'

export type ShellPetApi = {
  import: () => Promise<CustomPet | null>
  importPetBundle: () => Promise<CustomPet | null>
  read: (id: string, fileName: string, kind?: 'image' | 'bundle') => Promise<ArrayBuffer | null>
  delete: (id: string, fileName: string, kind?: 'image' | 'bundle') => Promise<void>
}
export type ShellMiniMaxCredentialsApi = {
  getStatus: () => Promise<{ configured: boolean }>
  saveCookie: (cookie: string) => Promise<{ configured: boolean }>
  clearCookie: () => Promise<{ configured: boolean }>
}
export type ShellAutomationsApi = {
  runPrecheck: (args: {
    automationId: string
    runId: string
  }) => Promise<AutomationPrecheckResult | null>
  markDispatchResult: (result: AutomationDispatchResult) => Promise<AutomationRun>
  rendererReady: () => Promise<void>
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
export type ShellFridayApi = {
  getOrCreate: () => Promise<FridaySession>
  restart: () => Promise<FridaySession>
}
export type ShellLocalhostWorktreeLabelsApi = {
  register: (args: LocalhostWorktreeLabelRoute) => Promise<LocalhostWorktreeLabelResult>
}
export type ShellSpeechApi = {
  ensureMicrophoneAccess: () => Promise<void>
}

function restoreShellDocument<T>(value: unknown): T {
  return value as T
}

const electronPetApi: ShellPetApi = {
  import: async () =>
    restoreShellDocument(await callShellOrpc((client) => client.shell.pet.import, undefined)),
  importPetBundle: async () =>
    restoreShellDocument(
      await callShellOrpc((client) => client.shell.pet.importPetBundle, undefined)
    ),
  read: (id, fileName, kind) =>
    callShellOrpc((client) => client.shell.pet.read, { id, fileName, kind }),
  delete: (id, fileName, kind) =>
    callShellOrpc((client) => client.shell.pet.delete, { id, fileName, kind })
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
const electronAutomationsApi: ShellAutomationsApi = {
  runPrecheck: async (input) =>
    restoreShellDocument(
      await callShellOrpc((client) => client.shell.automations.runPrecheck, input)
    ),
  markDispatchResult: async (input) =>
    restoreShellDocument(
      await callShellOrpc((client) => client.shell.automations.markDispatchResult, input)
    ),
  rendererReady: () => callShellOrpc((client) => client.shell.automations.rendererReady, undefined)
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
const electronFridayApi: ShellFridayApi = {
  getOrCreate: async () =>
    restoreShellDocument(
      await callShellOrpc((client) => client.shell.friday.getOrCreate, undefined)
    ),
  restart: async () =>
    restoreShellDocument(await callShellOrpc((client) => client.shell.friday.restart, undefined))
}
const electronExportApi: ExportApi = {
  htmlToPdf: async (input) =>
    restoreShellDocument(await callShellOrpc((client) => client.shell.export.htmlToPdf, input))
}
const electronLocalhostWorktreeLabelsApi: ShellLocalhostWorktreeLabelsApi = {
  register: async (input) =>
    restoreShellDocument(
      await callShellOrpc((client) => client.shell.localhostWorktreeLabels.register, input)
    )
}
const electronSpeechApi: ShellSpeechApi = {
  ensureMicrophoneAccess: () =>
    callShellOrpc((client) => client.shell.speech.ensureMicrophoneAccess, undefined)
}

const unavailableOnWeb = (): Error =>
  new Error(translate('auto.web.web.preload.api.fb290366b2', 'Unavailable on web.'))
const webPetApi: ShellPetApi = {
  import: () => Promise.resolve(null),
  importPetBundle: () => Promise.resolve(null),
  read: () => Promise.resolve(null),
  delete: () => Promise.resolve()
}
const webMiniMaxCredentialsApi: ShellMiniMaxCredentialsApi = {
  getStatus: () => Promise.resolve({ configured: false }),
  saveCookie: () => Promise.reject(unavailableOnWeb()),
  clearCookie: () => Promise.resolve({ configured: false })
}
const webAutomationsApi: ShellAutomationsApi = {
  runPrecheck: () => Promise.reject(unavailableOnWeb()),
  markDispatchResult: () => Promise.reject(unavailableOnWeb()),
  rendererReady: () => Promise.resolve()
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
const webFridayApi: ShellFridayApi = {
  getOrCreate: () => Promise.reject(unavailableOnWeb()),
  restart: () => Promise.reject(unavailableOnWeb())
}
const webExportApi: ExportApi = {
  htmlToPdf: () =>
    Promise.resolve({
      success: false,
      error: translate(
        'auto.web.webPreloadApi.exportHtmlToPdfUnavailable',
        'Exporting to PDF is unavailable in the web client.'
      )
    })
}
const webLocalhostWorktreeLabelsApi: ShellLocalhostWorktreeLabelsApi = {
  register: () => Promise.reject(unavailableOnWeb())
}
const webSpeechApi: ShellSpeechApi = {
  ensureMicrophoneAccess: () => Promise.reject(unavailableOnWeb())
}

const isWeb = isWebRuntimeClient()
export const shellPetApi = isWeb ? webPetApi : electronPetApi
export const shellMiniMaxCredentialsApi = isWeb
  ? webMiniMaxCredentialsApi
  : electronMiniMaxCredentialsApi
export const shellAutomationsApi = isWeb ? webAutomationsApi : electronAutomationsApi
export const shellMobileApi = isWeb ? webMobileApi : electronMobileApi
export const shellDeveloperPermissionsApi = isWeb
  ? webDeveloperPermissionsApi
  : electronDeveloperPermissionsApi
export const shellFridayApi = isWeb ? webFridayApi : electronFridayApi
export const shellExportApi = isWeb ? webExportApi : electronExportApi
export const shellLocalhostWorktreeLabelsApi = isWeb
  ? webLocalhostWorktreeLabelsApi
  : electronLocalhostWorktreeLabelsApi
export const shellSpeechApi = isWeb ? webSpeechApi : electronSpeechApi
