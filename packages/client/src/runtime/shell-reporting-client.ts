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
import { translate } from '~renderer/i18n/i18n'

import { callShellOrpc, isWebRuntimeClient } from './orpc-client'

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

const electronFeedbackApi: ShellFeedbackApi = {
  submit: (input) => callShellOrpc((client) => client.shell.feedback.submit, input)
}

const electronCrashReportsApi: ShellCrashReportsApi = {
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

const electronDiagnosticsApi: ShellDiagnosticsApi = {
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

const electronTelemetryApi: ShellTelemetryApi = {
  track: (name, props) => callShellOrpc((client) => client.shell.telemetry.track, { name, props }),
  setOptIn: (optedIn) => callShellOrpc((client) => client.shell.telemetry.setOptIn, { optedIn }),
  getConsentState: async () =>
    restoreShellDocument(
      await callShellOrpc((client) => client.shell.telemetry.getConsentState, undefined)
    ),
  acknowledgeBanner: () =>
    callShellOrpc((client) => client.shell.telemetry.acknowledgeBanner, undefined)
}

const webFeedbackApi: ShellFeedbackApi = {
  submit: () =>
    Promise.resolve({
      ok: false,
      status: null,
      error: translate(
        'auto.web.webShell.feedbackUnavailable',
        'Feedback is unavailable in the web client.'
      )
    })
}

const webCrashReportsApi: ShellCrashReportsApi = {
  getLatestPending: () => Promise.resolve(null),
  getLatestReport: () => Promise.resolve(null),
  dismiss: () => Promise.resolve(null),
  recordRendererError: () => Promise.resolve({ ok: true, report: null, deduped: true }),
  recordBreadcrumb: () => {},
  submit: () =>
    Promise.resolve({
      ok: false,
      status: null,
      error: translate('auto.web.runtime.shellBoundary.unavailable', 'Unavailable on web.'),
      report: null
    }),
  copyLatestDiagnostics: () =>
    Promise.resolve({
      ok: false,
      error: translate('auto.web.runtime.shellBoundary.unavailable', 'Unavailable on web.')
    })
}

const diagnosticsUnavailableOnWeb = (): Error =>
  new Error(translate('auto.web.runtime.shellBoundary.unavailable', 'Unavailable on web.'))

const webDiagnosticsApi: ShellDiagnosticsApi = {
  getStatus: () =>
    Promise.resolve({
      localFileEnabled: false,
      bundleEnabled: false,
      traceFilePath: '',
      traceFamilySize: 0
    }),
  collectBundle: () => Promise.reject(diagnosticsUnavailableOnWeb()),
  openBundlePreview: () => Promise.reject(diagnosticsUnavailableOnWeb()),
  discardBundlePreview: () => Promise.resolve(),
  uploadBundle: () => Promise.reject(diagnosticsUnavailableOnWeb())
}

const webTelemetryApi: ShellTelemetryApi = {
  track: () => Promise.resolve(),
  setOptIn: () => Promise.resolve(),
  getConsentState: () => Promise.resolve({ effective: 'disabled', reason: 'user_opt_out' }),
  acknowledgeBanner: () => Promise.resolve()
}

const isWeb = isWebRuntimeClient()
export const shellFeedbackApi = isWeb ? webFeedbackApi : electronFeedbackApi
export const shellCrashReportsApi = isWeb ? webCrashReportsApi : electronCrashReportsApi
export const shellDiagnosticsApi = isWeb ? webDiagnosticsApi : electronDiagnosticsApi
export const shellTelemetryApi = isWeb ? webTelemetryApi : electronTelemetryApi
