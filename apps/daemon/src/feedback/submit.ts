import type {
  FeedbackSubmitArgs,
  FeedbackSubmitResult
} from '@yiru/runtime-protocol/workbench/support-report'

import { buildSupportReportDraft } from '../support-report/payload'
import { submitSupportReport } from '../telemetry/client'

export async function submitFeedback(args: FeedbackSubmitArgs): Promise<FeedbackSubmitResult> {
  try {
    const result = await submitSupportReport(
      buildSupportReportDraft({
        reportType: 'feedback',
        reportText: args.feedback,
        submitAnonymously: args.submitAnonymously,
        githubLogin: args.githubLogin,
        githubEmail: args.githubEmail
      })
    )
    return result.ok ? { ok: true } : { ok: false, status: null, error: result.error }
  } catch (error) {
    return {
      ok: false,
      status: null,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
