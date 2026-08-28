import {
  sanitizeCrashReportString,
  type CrashReportDetailValue
} from '@yiru/runtime-protocol/workbench/crash-reporting'
import {
  SUPPORT_REPORT_DIAGNOSTIC_EXCERPT_MAX_LENGTH,
  SUPPORT_REPORT_GITHUB_EMAIL_MAX_LENGTH,
  SUPPORT_REPORT_GITHUB_LOGIN_MAX_LENGTH,
  SUPPORT_REPORT_TEXT_MAX_LENGTH,
  type SupportReportDraft
} from '@yiru/runtime-protocol/workbench/telemetry-events'

import { redactString } from '../observability/redactor'

const MAX_DIAGNOSTIC_LINE_LENGTH = 4_000

export type SupportReportDiagnosticInput = {
  bundleSubmissionId: string
  content: string
  bytes: number
  spanCount: number
}

export type BuildSupportReportDraftArgs = {
  reportType: 'feedback' | 'crash' | 'diagnostics'
  reportText?: string
  submitAnonymously?: boolean
  githubLogin?: string | null
  githubEmail?: string | null
  diagnosticBundle?: SupportReportDiagnosticInput
}

function sanitizeBoundedText(value: string, maxLength: number): string {
  return sanitizeCrashReportString(redactString(value), maxLength).trim().slice(0, maxLength)
}

function sanitizeIdentity(value: string | null | undefined, maxLength: number): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const singleLine = value.replace(/[\p{Cc}]+/gu, ' ').trim()
  return singleLine ? singleLine.slice(0, maxLength) : undefined
}

function buildDiagnosticExcerpt(content: string): { excerpt: string; truncated: boolean } {
  const lines = content.split(/\r?\n/)
  const selected: string[] = []
  let remaining = SUPPORT_REPORT_DIAGNOSTIC_EXCERPT_MAX_LENGTH
  let truncated = false
  // Why: newest complete records carry the failure context; retain them from the tail.
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    if (!line) {
      continue
    }
    const sanitized = sanitizeBoundedText(line, MAX_DIAGNOSTIC_LINE_LENGTH)
    if (!sanitized) {
      continue
    }
    const available = remaining - (selected.length > 0 ? 1 : 0)
    if (available <= 0 || sanitized.length > available) {
      if (available > 0) {
        selected.unshift(sanitized.slice(0, available))
      }
      truncated = true
      break
    }
    selected.unshift(sanitized)
    remaining -= sanitized.length + (selected.length > 1 ? 1 : 0)
  }
  if (selected.length === 0) {
    return { excerpt: '[no diagnostic records available]', truncated: content.length > 0 }
  }
  return {
    excerpt: selected.join('\n'),
    truncated: truncated || selected.length !== lines.filter(Boolean).length
  }
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

type SupportReportPrimitive = Exclude<SupportReportDraft[keyof SupportReportDraft], undefined>
const supportReportPrimitiveCheck: SupportReportPrimitive extends CrashReportDetailValue
  ? true
  : never = true
void supportReportPrimitiveCheck
