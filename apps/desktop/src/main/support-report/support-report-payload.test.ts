import { describe, expect, it } from 'vite-plus/test'

import {
  SUPPORT_REPORT_DIAGNOSTIC_EXCERPT_MAX_LENGTH,
  SUPPORT_REPORT_TEXT_MAX_LENGTH
} from '../../shared/telemetry-events'
import { validate } from '../telemetry/validator'
import { buildSupportReportDraft } from './support-report-payload'

const SYSTEM_PROPS = {
  report_id: '4b563e74-3bfe-4cf2-8d79-ce860b3c50cc',
  app_version: '1.2.3',
  platform: 'darwin',
  arch: 'arm64',
  os_release: '25.0.0',
  yiru_channel: 'stable' as const
}

describe('support report payloads', () => {
  it('redacts and bounds feedback while honoring anonymous submission', () => {
    const draft = buildSupportReportDraft({
      reportType: 'feedback',
      reportText: `token=super-secret /Users/alice/private/${'x'.repeat(12_000)}`,
      submitAnonymously: true,
      githubLogin: 'alice',
      githubEmail: 'alice@example.com'
    })

    expect(draft.report_text).not.toContain('super-secret')
    expect(draft.report_text).not.toContain('/Users/alice')
    expect(draft.report_text?.length).toBeLessThanOrEqual(SUPPORT_REPORT_TEXT_MAX_LENGTH)
    expect(draft).not.toHaveProperty('github_login')
    expect(draft).not.toHaveProperty('github_email')
    expect(validate('support_report_submitted', { ...draft, ...SYSTEM_PROPS }).ok).toBe(true)
  })

  it('keeps only a bounded, redacted diagnostic tail and its metadata', () => {
    const content = Array.from({ length: 200 }, (_, index) =>
      JSON.stringify({
        index,
        message: `${'diagnostic '.repeat(30)}api_key=sk-${'a'.repeat(48)}`
      })
    ).join('\n')
    const draft = buildSupportReportDraft({
      reportType: 'diagnostics',
      diagnosticBundle: {
        bundleSubmissionId: 'abcdefghijklmnopqrstuv',
        content,
        bytes: Buffer.byteLength(content),
        spanCount: 200
      }
    })

    expect(draft.diagnostic_excerpt).not.toContain(`sk-${'a'.repeat(48)}`)
    expect(draft.diagnostic_excerpt?.length).toBeLessThanOrEqual(
      SUPPORT_REPORT_DIAGNOSTIC_EXCERPT_MAX_LENGTH
    )
    expect(draft.diagnostic_excerpt_truncated).toBe(true)
    expect(draft.submit_anonymously).toBe(true)
    expect(validate('support_report_submitted', { ...draft, ...SYSTEM_PROPS }).ok).toBe(true)
  })

  it('fails closed when diagnostic metadata is incomplete', () => {
    const result = validate('support_report_submitted', {
      ...SYSTEM_PROPS,
      report_type: 'diagnostics',
      submit_anonymously: true,
      diagnostic_excerpt: 'one line'
    })

    expect(result.ok).toBe(false)
  })
})
