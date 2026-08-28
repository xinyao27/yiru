export type FeedbackSubmitArgs = {
  feedback: string
  submitAnonymously?: boolean
  githubLogin: string | null
  githubEmail: string | null
}

export type FeedbackSubmitResult =
  | { ok: true }
  | { ok: false; status: number | null; error: string }

export type DiagnosticsDisabledReason =
  | 'do_not_track'
  | 'yiru_telemetry_disabled'
  | 'yiru_diagnostics_disabled'
  | 'ci'

export type DiagnosticsStatus = {
  localFileEnabled: boolean
  bundleEnabled: boolean
  traceFilePath: string
  traceFamilySize: number
  disabledReason?: DiagnosticsDisabledReason
}

export type DiagnosticsBundle = {
  bundleSubmissionId: string
  bytes: number
  spanCount: number
}

export type DiagnosticsUploadResult = { ticketId: string } | { canceled: true }
