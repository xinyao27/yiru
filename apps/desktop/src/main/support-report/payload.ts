import {
  sanitizeCrashReportString,
  type CrashReportDetailValue
} from '../../shared/crash-reporting'
import {
  SUPPORT_REPORT_DIAGNOSTIC_EXCERPT_MAX_LENGTH,
  SUPPORT_REPORT_GITHUB_EMAIL_MAX_LENGTH,
  SUPPORT_REPORT_GITHUB_LOGIN_MAX_LENGTH,
  SUPPORT_REPORT_TEXT_MAX_LENGTH,
  type SupportReportDraft
} from '../../shared/telemetry-events'
import { redactString } from '../observability/redactor'

const MAX_DIAGNOSTIC_LINE_LENGTH = 4_000

export type SupportReportDiagnosticInput = {
  readonly bundleSubmissionId: string
  readonly content: string
  readonly bytes: number
  readonly spanCount: number
}

export type BuildSupportReportDraftArgs = {
  readonly reportType: 'feedback' | 'crash' | 'diagnostics'
  readonly reportText?: string
  readonly submitAnonymously?: boolean
  readonly githubLogin?: string | null
  readonly githubEmail?: string | null
  readonly diagnosticBundle?: SupportReportDiagnosticInput
}

function sanitizeBoundedText(value: string, maxLength: number): string {
  // Why: support text is intentionally free-form. Apply both secret and path
  // redactors before enforcing the PostHog event-size bound.
  return sanitizeCrashReportString(redactString(value), maxLength).trim().slice(0, maxLength)
}

function sanitizeIdentity(value: string | null | undefined, maxLength: number): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const singleLine = value.replace(/[\p{Cc}]+/gu, ' ').trim()
  return singleLine ? singleLine.slice(0, maxLength) : undefined
}

function buildDiagnosticExcerpt(content: string): {
  readonly excerpt: string
  readonly truncated: boolean
} {
  const lines = content.split(/\r?\n/)
  const selected: string[] = []
  let remaining = SUPPORT_REPORT_DIAGNOSTIC_EXCERPT_MAX_LENGTH
  let truncated = false

  // Why: the newest diagnostic records are the most likely to explain the
  // report. Keep complete redacted lines from the tail instead of slicing an
  // arbitrary 4 MiB payload into a PostHog property.
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    if (!line) {
      continue
    }
    const sanitized = sanitizeBoundedText(line, MAX_DIAGNOSTIC_LINE_LENGTH)
    if (!sanitized) {
      continue
    }
    const separatorBytes = selected.length > 0 ? 1 : 0
    const available = remaining - separatorBytes
    if (available <= 0) {
      truncated = true
      break
    }
    if (sanitized.length > available) {
      selected.unshift(sanitized.slice(0, available))
      truncated = true
      break
    }
    selected.unshift(sanitized)
    remaining -= sanitized.length + separatorBytes
    if (index > 0 && remaining === 0) {
      truncated = true
      break
    }
  }

  if (selected.length === 0) {
    return { excerpt: '[no diagnostic records available]', truncated: content.length > 0 }
  }
  const excerpt = selected.join('\n')
  const selectedAllNonEmptyLines = selected.length === lines.filter(Boolean).length
  return { excerpt, truncated: truncated || !selectedAllNonEmptyLines }
}

export function buildSupportReportDraft(args: BuildSupportReportDraftArgs): SupportReportDraft {
  const submitAnonymously = args.reportType === 'diagnostics' || args.submitAnonymously === true
  const reportText = args.reportText
    ? sanitizeBoundedText(args.reportText, SUPPORT_REPORT_TEXT_MAX_LENGTH)
    : undefined
  const githubLogin = submitAnonymously
    ? undefined
    : sanitizeIdentity(args.githubLogin, SUPPORT_REPORT_GITHUB_LOGIN_MAX_LENGTH)
  const githubEmail = submitAnonymously
    ? undefined
    : sanitizeIdentity(args.githubEmail, SUPPORT_REPORT_GITHUB_EMAIL_MAX_LENGTH)
  const diagnostic = args.diagnosticBundle
    ? buildDiagnosticExcerpt(args.diagnosticBundle.content)
    : null

  return {
    report_type: args.reportType,
    submit_anonymously: submitAnonymously,
    ...(reportText ? { report_text: reportText } : {}),
    ...(githubLogin ? { github_login: githubLogin } : {}),
    ...(githubEmail ? { github_email: githubEmail } : {}),
    ...(args.diagnosticBundle && diagnostic
      ? {
          diagnostic_bundle_id: args.diagnosticBundle.bundleSubmissionId,
          diagnostic_excerpt: diagnostic.excerpt,
          diagnostic_bytes: args.diagnosticBundle.bytes,
          diagnostic_span_count: args.diagnosticBundle.spanCount,
          diagnostic_excerpt_truncated: diagnostic.truncated
        }
      : {})
  }
}

// Compile-time guard: report properties must remain JSON primitives accepted
// by PostHog; exporting this alias makes that constraint visible to callers.
type _SupportReportPrimitive = Exclude<SupportReportDraft[keyof SupportReportDraft], undefined>
const _supportReportPrimitiveCheck: _SupportReportPrimitive extends CrashReportDetailValue
  ? true
  : never = true
void _supportReportPrimitiveCheck
