import { type, type ContractRouter } from '@orpc/contract'

import type {
  CrashReportBreadcrumbRecordArgs,
  CrashReportCopyDiagnosticsArgs,
  CrashReportCopyDiagnosticsResult,
  CrashReportRecord,
  CrashReportSubmitArgs,
  CrashReportSubmitResult,
  RendererErrorReportArgs,
  RendererErrorReportResult
} from '../../workbench/crash-reporting.js'
import type {
  DeveloperPermissionId,
  DeveloperPermissionRequestResult,
  DeveloperPermissionState
} from '../../workbench/developer-permissions-types.js'
import type {
  DiagnosticsBundle,
  DiagnosticsStatus,
  DiagnosticsUploadResult,
  FeedbackSubmitArgs,
  FeedbackSubmitResult
} from '../../workbench/support-report.js'
import type {
  WindowsMobileFirewallRepairResult,
  WindowsMobileFirewallStatus
} from '../../workbench/windows-mobile-firewall.js'
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
  getLatestPending: withAccess(SHELL_TOOLS_READ_ACCESS).output(type<CrashReportRecord | null>()),
  getLatestReport: withAccess(SHELL_TOOLS_READ_ACCESS).output(type<CrashReportRecord | null>()),
  dismiss: withAccess(SHELL_TOOLS_WRITE_ACCESS)
    .input(type<{ reportId: string }>())
    .output(type<CrashReportRecord | null>()),
  recordRendererError: withAccess(SHELL_TOOLS_WRITE_ACCESS)
    .input(type<RendererErrorReportArgs>())
    .output(type<RendererErrorReportResult>()),
  recordBreadcrumb: withAccess(SHELL_TOOLS_WRITE_ACCESS)
    .input(type<CrashReportBreadcrumbRecordArgs>())
    .output(type<void>()),
  submit: withAccess(SHELL_TOOLS_WRITE_ACCESS)
    .input(type<CrashReportSubmitArgs>())
    .output(type<CrashReportSubmitResult>()),
  copyLatestDiagnostics: withAccess(SHELL_TOOLS_WRITE_ACCESS)
    .input(type<CrashReportCopyDiagnosticsArgs | undefined>())
    .output(type<CrashReportCopyDiagnosticsResult>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export const shellDiagnosticsContract = {
  getStatus: withAccess(SHELL_TOOLS_READ_ACCESS).output(type<DiagnosticsStatus>()),
  collectBundle: withAccess(SHELL_TOOLS_WRITE_ACCESS)
    .input(type<{ lookbackMinutes?: number } | undefined>())
    .output(type<DiagnosticsBundle>()),
  openBundlePreview: withAccess(SHELL_TOOLS_WRITE_ACCESS)
    .input(type<{ bundleSubmissionId: string }>())
    .output(type<void>()),
  discardBundlePreview: withAccess(SHELL_TOOLS_WRITE_ACCESS)
    .input(type<{ bundleSubmissionId: string }>())
    .output(type<void>()),
  uploadBundle: withAccess(SHELL_TOOLS_WRITE_ACCESS)
    .input(type<{ bundleSubmissionId: string }>())
    .output(type<DiagnosticsUploadResult>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export const shellTelemetryContract = {
  track: withAccess(SHELL_TOOLS_WRITE_ACCESS).input(type<unknown>()).output(type<void>()),
  setOptIn: withAccess(SHELL_TOOLS_WRITE_ACCESS)
    .input(type<{ optedIn: boolean }>())
    .output(type<void>()),
  getConsentState: withAccess(SHELL_TOOLS_READ_ACCESS).output(type<unknown>()),
  acknowledgeBanner: withAccess(SHELL_TOOLS_WRITE_ACCESS).output(type<void>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export const shellMiniMaxCredentialsContract = {
  getStatus: withAccess(SHELL_TOOLS_READ_ACCESS).output(type<unknown>()),
  saveCookie: withAccess(SHELL_TOOLS_WRITE_ACCESS)
    .input(type<{ cookie: string }>())
    .output(type<unknown>()),
  clearCookie: withAccess(SHELL_TOOLS_WRITE_ACCESS).output(type<unknown>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export const shellMobileContract = {
  getWindowsFirewallStatus: withAccess(SHELL_TOOLS_READ_ACCESS)
    .input(type<{ address?: string } | undefined>())
    .output(type<WindowsMobileFirewallStatus>()),
  repairWindowsFirewall:
    withAccess(SHELL_TOOLS_WRITE_ACCESS).output(type<WindowsMobileFirewallRepairResult>()),
  openWindowsNetworkSettings: withAccess(SHELL_TOOLS_WRITE_ACCESS).output(type<boolean>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export const shellDeveloperPermissionsContract = {
  getStatus: withAccess(SHELL_TOOLS_READ_ACCESS).output(type<DeveloperPermissionState[]>()),
  request: withAccess(SHELL_TOOLS_WRITE_ACCESS)
    .input(type<{ id: DeveloperPermissionId }>())
    .output(type<DeveloperPermissionRequestResult>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export const shellFeedbackContract = {
  submit: withAccess(SHELL_TOOLS_WRITE_ACCESS)
    .input(type<FeedbackSubmitArgs>())
    .output(type<FeedbackSubmitResult>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export type ShellHtmlToPdfInput = {
  html: string
  title: string
}

export type ShellHtmlToPdfResult =
  | { success: true; filePath: string }
  | { success: false; cancelled?: boolean; error?: string }

export const shellExportContract = {
  htmlToPdf: withAccess(SHELL_TOOLS_WRITE_ACCESS)
    .input(type<ShellHtmlToPdfInput>())
    .output(type<ShellHtmlToPdfResult>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export const shellLocalhostWorktreeLabelsContract = {
  register: withAccess(SHELL_TOOLS_WRITE_ACCESS).input(type<unknown>()).output(type<unknown>())
} satisfies ContractRouter<RuntimeProcedureMeta>
