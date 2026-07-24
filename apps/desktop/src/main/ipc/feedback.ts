import { ipcMain } from 'electron'

import {
  buildSupportReportDraft,
  type SupportReportDiagnosticInput
} from '../support-report/support-report-payload'
import { submitSupportReport } from '../telemetry/client'

export type FeedbackSubmissionType = 'feedback' | 'crash'

export type FeedbackSubmitArgs = {
  feedback: string
  submitAnonymously?: boolean
  githubLogin: string | null
  githubEmail: string | null
}

export type FeedbackDiagnosticBundleAttachment = SupportReportDiagnosticInput

export type FeedbackSubmitResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly status: null; readonly error: string }

type InternalFeedbackSubmitArgs = FeedbackSubmitArgs & {
  submissionType?: FeedbackSubmissionType
  diagnosticBundle?: FeedbackDiagnosticBundleAttachment
}

export async function submitFeedback(
  args: InternalFeedbackSubmitArgs
): Promise<FeedbackSubmitResult> {
  try {
    const result = await submitSupportReport(
      buildSupportReportDraft({
        reportType: args.submissionType ?? 'feedback',
        reportText: args.feedback,
        submitAnonymously: args.submitAnonymously,
        githubLogin: args.githubLogin,
        githubEmail: args.githubEmail,
        diagnosticBundle: args.diagnosticBundle
      })
    )
    return result.ok ? { ok: true } : { ok: false, status: null, error: result.error }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, status: null, error: message }
  }
}

export function registerFeedbackHandlers(): void {
  ipcMain.removeHandler('feedback:submit')
  ipcMain.handle('feedback:submit', (_event, args: FeedbackSubmitArgs) =>
    // Why: crash submissions are main-only. A compromised renderer can invoke
    // this channel directly, so force the public feedback lane at the boundary.
    submitFeedback({ ...args, submissionType: 'feedback' })
  )
}
