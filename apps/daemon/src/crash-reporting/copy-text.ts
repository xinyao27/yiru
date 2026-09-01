import {
  sanitizeCrashReportString,
  type CrashReportCopySubmissionFailure
} from '@yiru/runtime-protocol/workbench/crash-reporting'

function sanitizedLine(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  return sanitizeCrashReportString(value.replace(/[\r\n]+/g, ' ')).trim() || null
}

function normalizeFailure(value: unknown): CrashReportCopySubmissionFailure | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const error = sanitizedLine(Reflect.get(value, 'error'))
  if (!error) {
    return null
  }
  const context = Reflect.get(value, 'diagnosticContext')
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    return { error }
  }
  if (Reflect.get(context, 'status') === 'uploaded') {
    const ticketId = sanitizedLine(Reflect.get(context, 'ticketId'))
    return ticketId ? { error, diagnosticContext: { status: 'uploaded', ticketId } } : { error }
  }
  if (Reflect.get(context, 'status') === 'not_uploaded') {
    const reason = sanitizedLine(Reflect.get(context, 'reason'))
    return reason ? { error, diagnosticContext: { status: 'not_uploaded', reason } } : { error }
  }
  return { error }
}

export function formatCrashReportCopyText(baseText: string, failureInput: unknown): string {
  const failure = normalizeFailure(failureInput)
  if (!failure) {
    return baseText
  }
  const lines = [baseText, '', 'Submission failure:', `- Report error: ${failure.error}`]
  if (failure.diagnosticContext?.status === 'uploaded') {
    lines.push(`- Diagnostic ticket uploaded but not linked: ${failure.diagnosticContext.ticketId}`)
  } else if (failure.diagnosticContext?.status === 'not_uploaded') {
    lines.push(`- Diagnostic logs not uploaded: ${failure.diagnosticContext.reason}`)
  }
  return lines.join('\n')
}
