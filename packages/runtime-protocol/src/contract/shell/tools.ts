import { type, type ContractRouter } from '@orpc/contract'

import { withAccess, type RuntimeProcedureMeta } from '../access-meta.js'

const SHELL_TOOLS_READ_ACCESS = {
  scope: 'host',
  tier: 'read',
  principals: ['local']
} as const
const SHELL_TOOLS_WRITE_ACCESS = {
  scope: 'host',
  tier: 'host',
  principals: ['local']
} as const

export const shellCrashReportsContract = {
  getLatestPending: withAccess(SHELL_TOOLS_READ_ACCESS).output(type<unknown>()),
  getLatestReport: withAccess(SHELL_TOOLS_READ_ACCESS).output(type<unknown>()),
  dismiss: withAccess(SHELL_TOOLS_WRITE_ACCESS)
    .input(type<{ reportId: string }>())
    .output(type<unknown>()),
  recordRendererError: withAccess(SHELL_TOOLS_WRITE_ACCESS)
    .input(type<unknown>())
    .output(type<unknown>()),
  recordBreadcrumb: withAccess(SHELL_TOOLS_WRITE_ACCESS)
    .input(type<unknown>())
    .output(type<void>()),
  submit: withAccess(SHELL_TOOLS_WRITE_ACCESS).input(type<unknown>()).output(type<unknown>()),
  copyLatestDiagnostics: withAccess(SHELL_TOOLS_WRITE_ACCESS)
    .input(type<unknown>())
    .output(type<unknown>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export const shellDiagnosticsContract = {
  getStatus: withAccess(SHELL_TOOLS_READ_ACCESS).output(type<unknown>()),
  collectBundle: withAccess(SHELL_TOOLS_WRITE_ACCESS)
    .input(type<{ lookbackMinutes?: number } | undefined>())
    .output(type<unknown>()),
  openBundlePreview: withAccess(SHELL_TOOLS_WRITE_ACCESS)
    .input(type<{ bundleSubmissionId: string }>())
    .output(type<void>()),
  discardBundlePreview: withAccess(SHELL_TOOLS_WRITE_ACCESS)
    .input(type<{ bundleSubmissionId: string }>())
    .output(type<void>()),
  uploadBundle: withAccess(SHELL_TOOLS_WRITE_ACCESS)
    .input(type<{ bundleSubmissionId: string }>())
    .output(type<unknown>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export const shellTelemetryContract = {
  track: withAccess(SHELL_TOOLS_WRITE_ACCESS).input(type<unknown>()).output(type<void>()),
  setOptIn: withAccess(SHELL_TOOLS_WRITE_ACCESS)
    .input(type<{ optedIn: boolean }>())
    .output(type<void>()),
  getConsentState: withAccess(SHELL_TOOLS_READ_ACCESS).output(type<unknown>()),
  acknowledgeBanner: withAccess(SHELL_TOOLS_WRITE_ACCESS).output(type<void>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export const shellPetContract = {
  import: withAccess(SHELL_TOOLS_WRITE_ACCESS).output(type<unknown>()),
  importPetBundle: withAccess(SHELL_TOOLS_WRITE_ACCESS).output(type<unknown>()),
  read: withAccess(SHELL_TOOLS_READ_ACCESS)
    .input(type<{ id: string; fileName: string; kind?: 'image' | 'bundle' }>())
    .output(type<ArrayBuffer | null>()),
  delete: withAccess(SHELL_TOOLS_WRITE_ACCESS)
    .input(type<{ id: string; fileName: string; kind?: 'image' | 'bundle' }>())
    .output(type<void>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export const shellMiniMaxCredentialsContract = {
  getStatus: withAccess(SHELL_TOOLS_READ_ACCESS).output(type<unknown>()),
  saveCookie: withAccess(SHELL_TOOLS_WRITE_ACCESS)
    .input(type<{ cookie: string }>())
    .output(type<unknown>()),
  clearCookie: withAccess(SHELL_TOOLS_WRITE_ACCESS).output(type<unknown>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export const shellAutomationsContract = {
  runPrecheck: withAccess(SHELL_TOOLS_WRITE_ACCESS).input(type<unknown>()).output(type<unknown>()),
  markDispatchResult: withAccess(SHELL_TOOLS_WRITE_ACCESS)
    .input(type<unknown>())
    .output(type<unknown>()),
  rendererReady: withAccess(SHELL_TOOLS_WRITE_ACCESS).output(type<void>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export const shellMobileContract = {
  getWindowsFirewallStatus: withAccess(SHELL_TOOLS_READ_ACCESS)
    .input(type<{ address?: string } | undefined>())
    .output(type<unknown>()),
  repairWindowsFirewall: withAccess(SHELL_TOOLS_WRITE_ACCESS).output(type<unknown>()),
  openWindowsNetworkSettings: withAccess(SHELL_TOOLS_WRITE_ACCESS).output(type<boolean>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export const shellDeveloperPermissionsContract = {
  getStatus: withAccess(SHELL_TOOLS_READ_ACCESS).output(type<unknown>()),
  request: withAccess(SHELL_TOOLS_WRITE_ACCESS).input(type<unknown>()).output(type<unknown>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export const shellFridayContract = {
  getOrCreate: withAccess(SHELL_TOOLS_WRITE_ACCESS).output(type<unknown>()),
  restart: withAccess(SHELL_TOOLS_WRITE_ACCESS).output(type<unknown>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export const shellFeedbackContract = {
  submit: withAccess(SHELL_TOOLS_WRITE_ACCESS).input(type<unknown>()).output(type<unknown>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export const shellExportContract = {
  htmlToPdf: withAccess(SHELL_TOOLS_WRITE_ACCESS).input(type<unknown>()).output(type<unknown>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export const shellLocalhostWorktreeLabelsContract = {
  register: withAccess(SHELL_TOOLS_WRITE_ACCESS).input(type<unknown>()).output(type<unknown>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export const shellSpeechContract = {
  ensureMicrophoneAccess: withAccess(SHELL_TOOLS_WRITE_ACCESS).output(type<void>())
} satisfies ContractRouter<RuntimeProcedureMeta>
