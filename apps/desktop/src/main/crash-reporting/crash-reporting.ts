import os from 'node:os'

import {
  assertClipboardTextWriteWithinLimit,
  isClipboardTextWriteTooLargeError
} from '@yiru/workbench-model/ui'
import { app, clipboard } from 'electron'
import {
  type CrashReportCopyDiagnosticsArgs,
  type CrashReportDiagnosticBundle,
  type RendererErrorReportResult,
  type CrashReportSubmitArgs,
  type CrashReportSubmitResult,
  formatCrashReportText,
  formatUncapturedCrashReportText
} from '~shared/crash-reporting'

import {
  prepareCrashDiagnosticBundle,
  resolveSubmittedDiagnosticBundle
} from './crash-feedback-diagnostic-bundle'
import { formatCrashReportCopyText } from './crash-report-copy-text'
import type { CrashReportStore } from './crash-report-store'
import { submitFeedback } from './feedback'
import { recordRendererBreadcrumb } from './renderer-breadcrumb'
import { recordRendererErrorReport } from './renderer-error-report'

const inFlightSubmissions = new Set<string>()
const submittedReportIds = new Set<string>()
const MAX_SUBMITTED_REPORT_IDS = 256

function rememberSubmittedReportId(reportId: string): void {
  // Why: report ids are IPC input. Keep duplicate-send suppression useful for
  // recent reports without retaining every id a broken renderer can vary.
  submittedReportIds.delete(reportId)
  submittedReportIds.add(reportId)
  while (submittedReportIds.size > MAX_SUBMITTED_REPORT_IDS) {
    const oldestId = submittedReportIds.keys().next().value
    if (oldestId === undefined) {
      break
    }
    submittedReportIds.delete(oldestId)
  }
}

async function getLatestPendingReport(
  store: CrashReportStore
): Promise<Awaited<ReturnType<CrashReportStore['getLatestPending']>>> {
  const reports = await store.listRecent()
  return (
    reports.find((report) => report.status === 'pending' && !submittedReportIds.has(report.id)) ??
    null
  )
}

async function getLatestSendableReport(
  store: CrashReportStore
): Promise<Awaited<ReturnType<CrashReportStore['getLatestPending']>>> {
  const reports = await store.listRecent()
  return (
    reports.find(
      (report) =>
        (report.status === 'pending' || report.status === 'dismissed') &&
        !submittedReportIds.has(report.id)
    ) ?? null
  )
}

async function getRequestedCrashReport(
  store: CrashReportStore,
  args?: { reportId?: string }
): Promise<Awaited<ReturnType<CrashReportStore['getLatestPending']>>> {
  if (args?.reportId) {
    return store.getById(args.reportId)
  }
  // Why: Help > Report Crash can intentionally submit without a report ID.
  // Do not replace that uncaptured report with a pending crash that appears later.
  return args ? null : getLatestPendingReport(store)
}

function buildUncapturedCrashReportText(
  notes: string | undefined,
  diagnosticBundle?: CrashReportDiagnosticBundle
): string {
  return formatUncapturedCrashReportText(
    {
      createdAt: new Date().toISOString(),
      appVersion: app.getVersion(),
      platform: os.platform(),
      osRelease: os.release(),
      arch: os.arch(),
      electronVersion: process.versions.electron ?? 'unknown',
      chromeVersion: process.versions.chrome ?? 'unknown'
    },
    notes,
    diagnosticBundle
  )
}

let shellCrashReportStore: CrashReportStore | null = null

export function initializeShellCrashReportingService(store: CrashReportStore): void {
  shellCrashReportStore = store
}

function requireShellCrashReportStore(): CrashReportStore {
  if (!shellCrashReportStore) {
    throw new Error('unavailable_on_host: crash reporting is not initialized')
  }
  return shellCrashReportStore
}

export function getLatestPendingShellCrashReport() {
  return getLatestPendingReport(requireShellCrashReportStore())
}

export function getLatestShellCrashReport() {
  return getLatestSendableReport(requireShellCrashReportStore())
}

export async function dismissShellCrashReport(args: { reportId: string }) {
  const store = requireShellCrashReportStore()
  if (inFlightSubmissions.has(args.reportId)) {
    return store.getById(args.reportId)
  }
  if (submittedReportIds.has(args.reportId)) {
    const report = await store.getById(args.reportId)
    return report ? { ...report, status: 'sent' as const } : null
  }
  return store.dismiss(args.reportId)
}

export function recordShellCrashBreadcrumb(args?: { name?: unknown; data?: unknown }): void {
  recordRendererBreadcrumb(args)
}

export async function copyLatestShellCrashDiagnostics(args?: CrashReportCopyDiagnosticsArgs) {
  const store = requireShellCrashReportStore()
  const report = await getRequestedCrashReport(store, args)
  const baseText = report
    ? formatCrashReportText(report, args?.notes)
    : buildUncapturedCrashReportText(args?.notes)
  try {
    clipboard.writeText(
      assertClipboardTextWriteWithinLimit(
        formatCrashReportCopyText(baseText, args?.submissionFailure)
      )
    )
  } catch (error) {
    if (isClipboardTextWriteTooLargeError(error)) {
      return { ok: false as const, error: 'Crash diagnostics are too large to copy safely.' }
    }
    throw error
  }
  return { ok: true as const }
}

export async function recordShellRendererError(args: unknown): Promise<RendererErrorReportResult> {
  const store = requireShellCrashReportStore()
  try {
    return await recordRendererErrorReport(store, args)
  } catch (error) {
    console.error('[crash-reporting] Failed to record renderer error report:', error)
    return { ok: false, error: 'Failed to record renderer error report.' }
  }
}

export async function submitShellCrashReport(
  args: CrashReportSubmitArgs
): Promise<CrashReportSubmitResult> {
  const store = requireShellCrashReportStore()
  const report = await getRequestedCrashReport(store, args)
  if (!report) {
    const diagnosticUpload = prepareCrashDiagnosticBundle(args.includeDiagnosticLogs !== false)
    const diagnosticBundle = diagnosticUpload.diagnosticBundle
    const result = await submitFeedback({
      feedback: buildUncapturedCrashReportText(args.notes, diagnosticBundle),
      submissionType: 'crash',
      submitAnonymously: args.submitAnonymously,
      githubLogin: args.githubLogin,
      githubEmail: args.githubEmail,
      ...(diagnosticUpload.feedbackDiagnosticBundle
        ? {
            diagnosticBundle: diagnosticUpload.feedbackDiagnosticBundle
          }
        : {})
    })
    const submittedDiagnosticBundle = resolveSubmittedDiagnosticBundle(diagnosticUpload, result)
    return result.ok
      ? { ok: true, report: null, diagnosticBundle: submittedDiagnosticBundle }
      : {
          // Why: the transport-only attachment failure may contain raw
          // endpoint detail; only its sanitized bundle reason crosses IPC.
          ok: false,
          status: result.status,
          error: result.error,
          report: null,
          diagnosticBundle: submittedDiagnosticBundle
        }
  }
  const canSubmitDismissedReport = Boolean(args.reportId && report.status === 'dismissed')
  if (
    (!canSubmitDismissedReport && report.status !== 'pending') ||
    submittedReportIds.has(report.id)
  ) {
    return {
      ok: true,
      report: submittedReportIds.has(report.id) ? { ...report, status: 'sent' } : report
    }
  }
  if (inFlightSubmissions.has(report.id)) {
    return {
      ok: false,
      status: null,
      error: 'Crash report submission already in progress.',
      report
    }
  }

  inFlightSubmissions.add(report.id)
  try {
    const diagnosticUpload = prepareCrashDiagnosticBundle(args.includeDiagnosticLogs !== false)
    const diagnosticBundle = diagnosticUpload.diagnosticBundle
    const result = await submitFeedback({
      feedback: formatCrashReportText(report, args.notes, diagnosticBundle),
      submissionType: 'crash',
      submitAnonymously: args.submitAnonymously,
      githubLogin: args.githubLogin,
      githubEmail: args.githubEmail,
      ...(diagnosticUpload.feedbackDiagnosticBundle
        ? {
            diagnosticBundle: diagnosticUpload.feedbackDiagnosticBundle
          }
        : {})
    })
    const submittedDiagnosticBundle = resolveSubmittedDiagnosticBundle(diagnosticUpload, result)
    if (!result.ok) {
      return {
        // Why: keep the renderer contract allow-listed instead of leaking
        // the transport's internal diagnosticBundleFailure object.
        ok: false,
        status: result.status,
        error: result.error,
        report,
        diagnosticBundle: submittedDiagnosticBundle
      }
    }
    rememberSubmittedReportId(report.id)
    if (report.status === 'dismissed') {
      try {
        // Why: startup prompts are dismissed before the user can send from
        // the still-open dialog, so successful uploads must update storage.
        const sent = await store.markDismissedSent(report.id)
        return {
          ok: true,
          report: sent ?? { ...report, status: 'sent' },
          diagnosticBundle: submittedDiagnosticBundle
        }
      } catch (error) {
        console.error('[crash-reporting] Failed to mark dismissed crash report sent:', error)
        return {
          ok: true,
          report: { ...report, status: 'sent' },
          diagnosticBundle: submittedDiagnosticBundle
        }
      }
    }
    try {
      const sent = await store.markSent(report.id)
      return {
        ok: true,
        report: sent ?? { ...report, status: 'sent' },
        diagnosticBundle: submittedDiagnosticBundle
      }
    } catch (error) {
      // Why: the upstream submission already succeeded. A local persistence
      // failure must not present as upload failure or invite duplicate sends
      // during this app session.
      console.error('[crash-reporting] Failed to mark crash report sent:', error)
      return {
        ok: true,
        report: { ...report, status: 'sent' },
        diagnosticBundle: submittedDiagnosticBundle
      }
    }
  } finally {
    inFlightSubmissions.delete(report.id)
  }
}
