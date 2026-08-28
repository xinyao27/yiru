import { sanitizeCrashReportString } from '@yiru/runtime-protocol/workbench/crash-reporting'
import type { CrashReportDiagnosticBundle } from '@yiru/runtime-protocol/workbench/crash-reporting'

import { collectDiagnosticBundle, getDiagnosticsStatus } from '../observability/service'
import type { SupportReportSubmitResult } from '../support-report/client'
import type { SupportReportDiagnosticInput } from '../support-report/payload'

const CRASH_REPORT_LOOKBACK_MINUTES = 3 * 24 * 60

export type CrashDiagnosticAttachment = {
  diagnosticBundle: CrashReportDiagnosticBundle
  supportBundle?: SupportReportDiagnosticInput
}

function errorText(error: unknown): string {
  return sanitizeCrashReportString(error instanceof Error ? error.message : String(error))
}

export async function prepareCrashDiagnosticAttachment(
  includeDiagnosticLogs: boolean
): Promise<CrashDiagnosticAttachment> {
  if (!includeDiagnosticLogs) {
    return {
      diagnosticBundle: {
        status: 'not_uploaded',
        reason: 'diagnostic log upload skipped by user'
      }
    }
  }
  const status = getDiagnosticsStatus()
  if (!status.bundleEnabled) {
    return {
      diagnosticBundle: {
        status: 'not_uploaded',
        reason: status.disabledReason ?? 'diagnostic bundle collection is disabled'
      }
    }
  }
  try {
    const bundle = await collectDiagnosticBundle(CRASH_REPORT_LOOKBACK_MINUTES)
    return {
      diagnosticBundle: {
        status: 'attached',
        bundleSubmissionId: bundle.bundleSubmissionId,
        bytes: bundle.bytes,
        spanCount: bundle.spanCount
      },
      supportBundle: {
        bundleSubmissionId: bundle.bundleSubmissionId,
        content: bundle.payload,
        bytes: bundle.bytes,
        spanCount: bundle.spanCount
      }
    }
  } catch (error) {
    return { diagnosticBundle: { status: 'not_uploaded', reason: errorText(error) } }
  }
}

export function resolveSubmittedDiagnosticBundle(
  attachment: CrashDiagnosticAttachment,
  result: SupportReportSubmitResult
): CrashReportDiagnosticBundle {
  if (!attachment.supportBundle || result.ok) {
    return attachment.diagnosticBundle
  }
  return {
    status: 'not_uploaded',
    reason: `diagnostic log excerpt could not be sent: ${errorText(result.error)}`,
    bundleSubmissionId: attachment.supportBundle.bundleSubmissionId,
    bytes: attachment.supportBundle.bytes,
    spanCount: attachment.supportBundle.spanCount
  }
}
