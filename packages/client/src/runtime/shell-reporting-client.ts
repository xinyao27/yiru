import { translate } from '~renderer/i18n/i18n'
import type {
  CrashReportBreadcrumbData,
  CrashReportCopyDiagnosticsArgs,
  CrashReportRecord,
  CrashReportSubmitArgs,
  CrashReportSubmitResult,
  ReactErrorBoundaryReportArgs,
  ReactErrorBoundaryReportResult
} from '~shared/crash-reporting'
import type { TelemetryConsentState } from '~shared/telemetry-consent-types'

import { callShellOrpc, isWebRuntimeClient } from './orpc-client'

export type ShellFeedbackApi = {
  submit: (args: {
    feedback: string
    submitAnonymously?: boolean
    githubLogin: string | null
    githubEmail: string | null
  }) => Promise<{ ok: true } | { ok: false; status: number | null; error: string }>
}

export type DiagnosticsStatusPayload = {
  readonly localFileEnabled: boolean
  readonly bundleEnabled: boolean
  readonly traceFilePath: string
  readonly traceFamilySize: number
  readonly disabledReason?:
    | 'do_not_track'
    | 'yiru_telemetry_disabled'
    | 'yiru_diagnostics_disabled'
    | 'ci'
}
export type DiagnosticsBundlePayload = {
  readonly bundleSubmissionId: string
  readonly bytes: number
  readonly spanCount: number
}
export type DiagnosticsUploadPayload = { readonly ticketId: string } | { readonly canceled: true }

export type ShellCrashReportsApi = {
  getLatestPending: () => Promise<CrashReportRecord | null>
  getLatestReport: () => Promise<CrashReportRecord | null>
  dismiss: (args: { reportId: string }) => Promise<CrashReportRecord | null>
  recordRendererError: (
    args: ReactErrorBoundaryReportArgs
  ) => Promise<ReactErrorBoundaryReportResult>
  recordBreadcrumb: (args: { name: string; data?: CrashReportBreadcrumbData }) => void
  submit: (args: CrashReportSubmitArgs) => Promise<CrashReportSubmitResult>
  copyLatestDiagnostics: (
    args?: CrashReportCopyDiagnosticsArgs
  ) => Promise<{ ok: true } | { ok: false; error: string }>
}

export type ShellDiagnosticsApi = {
  getStatus: () => Promise<DiagnosticsStatusPayload>
  collectBundle: (lookbackMinutes?: number) => Promise<DiagnosticsBundlePayload>
  openBundlePreview: (bundleSubmissionId: string) => Promise<void>
  discardBundlePreview: (bundleSubmissionId: string) => Promise<void>
  uploadBundle: (bundleSubmissionId: string) => Promise<DiagnosticsUploadPayload>
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
  submit: async (input) =>
    restoreShellDocument(await callShellOrpc((client) => client.shell.feedback.submit, input))
}

const electronCrashReportsApi: ShellCrashReportsApi = {
  getLatestPending: async () =>
    restoreShellDocument(
      await callShellOrpc((client) => client.shell.crashReports.getLatestPending, undefined)
    ),
  getLatestReport: async () =>
    restoreShellDocument(
      await callShellOrpc((client) => client.shell.crashReports.getLatestReport, undefined)
    ),
  dismiss: async (input) =>
    restoreShellDocument(await callShellOrpc((client) => client.shell.crashReports.dismiss, input)),
  recordRendererError: async (input) =>
    restoreShellDocument(
      await callShellOrpc((client) => client.shell.crashReports.recordRendererError, input)
    ),
  recordBreadcrumb: (input) => {
    void callShellOrpc((client) => client.shell.crashReports.recordBreadcrumb, input).catch(
      (error: unknown) => console.warn('[crash-reporting] Failed to record breadcrumb:', error)
    )
  },
  submit: async (input) =>
    restoreShellDocument(await callShellOrpc((client) => client.shell.crashReports.submit, input)),
  copyLatestDiagnostics: async (input) =>
    restoreShellDocument(
      await callShellOrpc((client) => client.shell.crashReports.copyLatestDiagnostics, input)
    )
}

const electronDiagnosticsApi: ShellDiagnosticsApi = {
  getStatus: async () =>
    restoreShellDocument(
      await callShellOrpc((client) => client.shell.diagnostics.getStatus, undefined)
    ),
  collectBundle: async (lookbackMinutes) =>
    restoreShellDocument(
      await callShellOrpc((client) => client.shell.diagnostics.collectBundle, {
        lookbackMinutes
      })
    ),
  openBundlePreview: (bundleSubmissionId) =>
    callShellOrpc((client) => client.shell.diagnostics.openBundlePreview, {
      bundleSubmissionId
    }),
  discardBundlePreview: (bundleSubmissionId) =>
    callShellOrpc((client) => client.shell.diagnostics.discardBundlePreview, {
      bundleSubmissionId
    }),
  uploadBundle: async (bundleSubmissionId) =>
    restoreShellDocument(
      await callShellOrpc((client) => client.shell.diagnostics.uploadBundle, {
        bundleSubmissionId
      })
    )
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
      error: translate('auto.web.web.preload.api.fb290366b2', 'Unavailable on web.'),
      report: null
    }),
  copyLatestDiagnostics: () =>
    Promise.resolve({
      ok: false,
      error: translate('auto.web.web.preload.api.fb290366b2', 'Unavailable on web.')
    })
}

const diagnosticsUnavailableOnWeb = (): Error =>
  new Error(translate('auto.web.web.preload.api.fb290366b2', 'Unavailable on web.'))

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
