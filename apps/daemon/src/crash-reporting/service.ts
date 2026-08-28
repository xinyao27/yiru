import { arch, release } from 'node:os'

import {
  assertClipboardTextWriteWithinLimit,
  isClipboardTextWriteTooLargeError
} from '@yiru/runtime-protocol/model/ui'
import {
  formatCrashReportText,
  formatUncapturedCrashReportText,
  type CrashReportBreadcrumbRecordArgs,
  type CrashReportCopyDiagnosticsArgs,
  type CrashReportCopyDiagnosticsResult,
  type CrashReportDiagnosticBundle,
  type CrashReportRecord,
  type CrashReportSubmitArgs,
  type CrashReportSubmitResult,
  type RendererErrorReportArgs,
  type RendererErrorReportResult
} from '@yiru/runtime-protocol/workbench/crash-reporting'

import { getRuntimeHostPathsProvider } from '../runtime/host/paths-provider'
import { buildSupportReportDraft } from '../support-report/payload'
import { submitSupportReport } from '../telemetry/client'
import { recordRendererBreadcrumb } from './breadcrumb'
import { formatCrashReportCopyText } from './copy-text'
import {
  prepareCrashDiagnosticAttachment,
  resolveSubmittedDiagnosticBundle
} from './diagnostic-attachment'
import { recordRendererError } from './renderer-error'
import { CrashReportStore } from './store'

const MAX_SUBMITTED_REPORT_IDS = 256

export class CrashReportService {
  private readonly store: CrashReportStore
  private readonly inFlightSubmissions = new Set<string>()
  private readonly submittedReportIds = new Set<string>()

  constructor(userDataPath: string) {
    this.store = new CrashReportStore(userDataPath)
  }

  async getLatestPending(): Promise<CrashReportRecord | null> {
    const reports = await this.store.listRecent()
    return (
      reports.find(
        (report) => report.status === 'pending' && !this.submittedReportIds.has(report.id)
      ) ?? null
    )
  }

  async getLatestReport(): Promise<CrashReportRecord | null> {
    const reports = await this.store.listRecent()
    return (
      reports.find(
        (report) =>
          (report.status === 'pending' || report.status === 'dismissed') &&
          !this.submittedReportIds.has(report.id)
      ) ?? null
    )
  }

  async dismiss(reportId: string): Promise<CrashReportRecord | null> {
    if (this.inFlightSubmissions.has(reportId)) {
      return this.store.getById(reportId)
    }
    if (this.submittedReportIds.has(reportId)) {
      const report = await this.store.getById(reportId)
      return report ? { ...report, status: 'sent' } : null
    }
    return this.store.dismiss(reportId)
  }

  recordBreadcrumb(args: CrashReportBreadcrumbRecordArgs): void {
    recordRendererBreadcrumb(args)
  }

  async recordRendererError(args: RendererErrorReportArgs): Promise<RendererErrorReportResult> {
    try {
      return await recordRendererError(this.store, args)
    } catch (error) {
      console.error('[crash-reporting] Failed to record renderer error report:', error)
      return { ok: false, error: 'Failed to record renderer error report.' }
    }
  }

  async copyLatestDiagnostics(
    args?: CrashReportCopyDiagnosticsArgs
  ): Promise<CrashReportCopyDiagnosticsResult> {
    const report = await this.getRequestedReport(args)
    const baseText = report
      ? formatCrashReportText(report, args?.notes)
      : this.formatUncapturedReport(args?.notes)
    try {
      return {
        ok: true,
        text: assertClipboardTextWriteWithinLimit(
          formatCrashReportCopyText(baseText, args?.submissionFailure)
        )
      }
    } catch (error) {
      if (isClipboardTextWriteTooLargeError(error)) {
        return { ok: false, error: 'Crash diagnostics are too large to copy safely.' }
      }
      throw error
    }
  }

  async submit(args: CrashReportSubmitArgs): Promise<CrashReportSubmitResult> {
    const report = await this.getRequestedReport(args)
    if (
      report &&
      ((report.status !== 'pending' && !(args.reportId && report.status === 'dismissed')) ||
        this.submittedReportIds.has(report.id))
    ) {
      return {
        ok: true,
        report: this.submittedReportIds.has(report.id) ? { ...report, status: 'sent' } : report
      }
    }
    if (report && this.inFlightSubmissions.has(report.id)) {
      return {
        ok: false,
        status: null,
        error: 'Crash report submission already in progress.',
        report
      }
    }

    if (report) {
      this.inFlightSubmissions.add(report.id)
    }
    try {
      return await this.submitReport(args, report)
    } finally {
      if (report) {
        this.inFlightSubmissions.delete(report.id)
      }
    }
  }

  private async submitReport(
    args: CrashReportSubmitArgs,
    report: CrashReportRecord | null
  ): Promise<CrashReportSubmitResult> {
    const attachment = await prepareCrashDiagnosticAttachment(args.includeDiagnosticLogs !== false)
    const diagnosticBundle = attachment.diagnosticBundle
    const reportText = report
      ? formatCrashReportText(report, args.notes, diagnosticBundle)
      : this.formatUncapturedReport(args.notes, diagnosticBundle, args.chromeVersion)
    const result = await submitSupportReport(
      buildSupportReportDraft({
        reportType: 'crash',
        reportText,
        submitAnonymously: args.submitAnonymously,
        githubLogin: args.githubLogin,
        githubEmail: args.githubEmail,
        ...(attachment.supportBundle ? { diagnosticBundle: attachment.supportBundle } : {})
      })
    )
    const submittedBundle = resolveSubmittedDiagnosticBundle(attachment, result)
    if (!result.ok) {
      return {
        ok: false,
        status: null,
        error: result.error,
        report,
        diagnosticBundle: submittedBundle
      }
    }
    if (!report) {
      return { ok: true, report: null, diagnosticBundle: submittedBundle }
    }
    this.rememberSubmittedReportId(report.id)
    try {
      const sent =
        report.status === 'dismissed'
          ? await this.store.markDismissedSent(report.id)
          : await this.store.markSent(report.id)
      return {
        ok: true,
        report: sent ?? { ...report, status: 'sent' },
        diagnosticBundle: submittedBundle
      }
    } catch (error) {
      console.error('[crash-reporting] Failed to mark submitted report sent:', error)
      return {
        ok: true,
        report: { ...report, status: 'sent' },
        diagnosticBundle: submittedBundle
      }
    }
  }

  private getRequestedReport(args?: { reportId?: string }): Promise<CrashReportRecord | null> {
    if (args?.reportId) {
      return this.store.getById(args.reportId)
    }
    // Why: Help > Report Crash intentionally sends an uncaptured report.
    return args ? Promise.resolve(null) : this.getLatestPending()
  }

  private formatUncapturedReport(
    notes?: string,
    diagnosticBundle?: CrashReportDiagnosticBundle,
    chromeVersion = 'unknown'
  ): string {
    return formatUncapturedCrashReportText(
      {
        createdAt: new Date().toISOString(),
        appVersion: getRuntimeHostPathsProvider().version(),
        platform: process.platform,
        osRelease: release(),
        arch: arch(),
        electronVersion: 'not-applicable',
        chromeVersion
      },
      notes,
      diagnosticBundle
    )
  }

  private rememberSubmittedReportId(reportId: string): void {
    this.submittedReportIds.delete(reportId)
    this.submittedReportIds.add(reportId)
    while (this.submittedReportIds.size > MAX_SUBMITTED_REPORT_IDS) {
      const oldest = this.submittedReportIds.keys().next().value
      if (oldest === undefined) {
        return
      }
      this.submittedReportIds.delete(oldest)
    }
  }
}
