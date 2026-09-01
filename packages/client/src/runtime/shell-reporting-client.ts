import type {
  CrashReportBreadcrumbData,
  CrashReportCopyDiagnosticsArgs,
  CrashReportCopyDiagnosticsResult,
  CrashReportRecord,
  CrashReportSubmitArgs,
  CrashReportSubmitResult,
  RendererErrorReportArgs,
  RendererErrorReportResult
} from '@yiru/runtime-protocol/workbench/crash-reporting'
import type {
  DiagnosticsBundle,
  DiagnosticsStatus,
  DiagnosticsUploadResult,
  FeedbackSubmitArgs,
  FeedbackSubmitResult
} from '@yiru/runtime-protocol/workbench/support-report'
import type { TelemetryConsentState } from '@yiru/runtime-protocol/workbench/telemetry-consent-types'

import { callShellOrpc } from './orpc-client'

export type ShellFeedbackApi = {
  submit: (args: FeedbackSubmitArgs) => Promise<FeedbackSubmitResult>
}

export type ShellCrashReportsApi = {
  getLatestPending: () => Promise<CrashReportRecord | null>
  getLatestReport: () => Promise<CrashReportRecord | null>
  dismiss: (args: { reportId: string }) => Promise<CrashReportRecord | null>
  recordRendererError: (args: RendererErrorReportArgs) => Promise<RendererErrorReportResult>
  recordBreadcrumb: (args: { name: string; data?: CrashReportBreadcrumbData }) => void
  submit: (args: CrashReportSubmitArgs) => Promise<CrashReportSubmitResult>
  copyLatestDiagnostics: (
    args?: CrashReportCopyDiagnosticsArgs
  ) => Promise<CrashReportCopyDiagnosticsResult>
}

export type ShellDiagnosticsApi = {
  getStatus: () => Promise<DiagnosticsStatus>
  collectBundle: (lookbackMinutes?: number) => Promise<DiagnosticsBundle>
  openBundlePreview: (bundleSubmissionId: string) => Promise<void>
  discardBundlePreview: (bundleSubmissionId: string) => Promise<void>
  uploadBundle: (bundleSubmissionId: string) => Promise<DiagnosticsUploadResult>
}

export type ShellTelemetryApi = {
  track: (name: string, props: Record<string, unknown>) => Promise<void>
  setOptIn: (optedIn: boolean) => Promise<void>
  getConsentState: () => Promise<TelemetryConsentState>
  acknowledgeBanner: () => Promise<void>
}

function restoreShellDocument<T>(value: unknown): T {
  return value as T
}

export const shellFeedbackApi: ShellFeedbackApi = {
  submit: (input) => callShellOrpc((client) => client.shell.feedback.submit, input)
}

export const shellCrashReportsApi: ShellCrashReportsApi = {
  getLatestPending: () =>
    callShellOrpc((client) => client.shell.crashReports.getLatestPending, undefined),
  getLatestReport: () =>
    callShellOrpc((client) => client.shell.crashReports.getLatestReport, undefined),
  dismiss: (input) => callShellOrpc((client) => client.shell.crashReports.dismiss, input),
  recordRendererError: (input) =>
    callShellOrpc((client) => client.shell.crashReports.recordRendererError, input),
  recordBreadcrumb: (input) => {
    void callShellOrpc((client) => client.shell.crashReports.recordBreadcrumb, input).catch(
      (error: unknown) => console.warn('[crash-reporting] Failed to record breadcrumb:', error)
    )
  },
  submit: (input) => callShellOrpc((client) => client.shell.crashReports.submit, input),
  copyLatestDiagnostics: (input) =>
    callShellOrpc((client) => client.shell.crashReports.copyLatestDiagnostics, input)
}

export const shellDiagnosticsApi: ShellDiagnosticsApi = {
  getStatus: () => callShellOrpc((client) => client.shell.diagnostics.getStatus, undefined),
  collectBundle: (lookbackMinutes) =>
    callShellOrpc((client) => client.shell.diagnostics.collectBundle, { lookbackMinutes }),
  openBundlePreview: (bundleSubmissionId) =>
    callShellOrpc((client) => client.shell.diagnostics.openBundlePreview, {
      bundleSubmissionId
    }),
  discardBundlePreview: (bundleSubmissionId) =>
    callShellOrpc((client) => client.shell.diagnostics.discardBundlePreview, {
      bundleSubmissionId
    }),
  uploadBundle: (bundleSubmissionId) =>
    callShellOrpc((client) => client.shell.diagnostics.uploadBundle, { bundleSubmissionId })
}

export const shellTelemetryApi: ShellTelemetryApi = {
  track: (name, props) => callShellOrpc((client) => client.shell.telemetry.track, { name, props }),
  setOptIn: (optedIn) => callShellOrpc((client) => client.shell.telemetry.setOptIn, { optedIn }),
  getConsentState: async () =>
    restoreShellDocument(
      await callShellOrpc((client) => client.shell.telemetry.getConsentState, undefined)
    ),
  acknowledgeBanner: () =>
    callShellOrpc((client) => client.shell.telemetry.acknowledgeBanner, undefined)
}
