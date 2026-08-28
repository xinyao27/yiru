import { chmodSync, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

import type {
  DiagnosticsBundle,
  DiagnosticsUploadResult
} from '@yiru/runtime-protocol/workbench/support-report'

import type { CollectedDiagnosticBundle } from '../observability/bundle'
import { collectDiagnosticBundle, getDiagnosticsStatus } from '../observability/service'
import { getRuntimeHostPathsProvider } from '../runtime/host/paths-provider'
import { buildSupportReportDraft } from '../support-report/payload'
import { submitSupportReport } from '../telemetry/client'

const BUNDLE_TTL_MS = 15 * 60 * 1000
const MAX_PENDING_BUNDLES = 8
const BUNDLE_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/

type PendingBundle = {
  bundle: CollectedDiagnosticBundle
  createdAt: number
  previewFilePath: string
  previewOpened: boolean
  expiry: ReturnType<typeof setTimeout>
}

export function createDiagnosticsService(openFile: (path: string) => Promise<boolean>) {
  const pendingBundles = new Map<string, PendingBundle>()

  const remove = (bundleSubmissionId: string): void => {
    const pending = pendingBundles.get(bundleSubmissionId)
    if (!pending) {
      return
    }
    clearTimeout(pending.expiry)
    try {
      if (existsSync(pending.previewFilePath)) {
        unlinkSync(pending.previewFilePath)
      }
    } catch {}
    pendingBundles.delete(bundleSubmissionId)
  }

  const prune = (): void => {
    const now = Date.now()
    for (const [id, pending] of pendingBundles) {
      if (now - pending.createdAt > BUNDLE_TTL_MS) {
        remove(id)
      }
    }
    while (pendingBundles.size >= MAX_PENDING_BUNDLES) {
      const oldestId = pendingBundles.keys().next().value
      if (typeof oldestId !== 'string') {
        return
      }
      remove(oldestId)
    }
  }

  const requirePending = (bundleSubmissionId: string): PendingBundle => {
    if (!BUNDLE_ID_PATTERN.test(bundleSubmissionId)) {
      throw new Error('bundleSubmissionId has invalid format')
    }
    prune()
    const pending = pendingBundles.get(bundleSubmissionId)
    if (!pending) {
      throw new Error('review file has expired; create a new one')
    }
    return pending
  }

  return {
    getStatus: getDiagnosticsStatus,
    collect: async (lookbackMinutes?: number): Promise<DiagnosticsBundle> => {
      const boundedLookback =
        typeof lookbackMinutes === 'number' && Number.isFinite(lookbackMinutes)
          ? Math.max(1, Math.min(30 * 24 * 60, Math.floor(lookbackMinutes)))
          : undefined
      const bundle = await collectDiagnosticBundle(boundedLookback)
      prune()
      const previewDirectory = join(
        getRuntimeHostPathsProvider().tempPath(),
        'yiru-diagnostic-bundle-previews'
      )
      mkdirSync(previewDirectory, { recursive: true, mode: 0o700 })
      const previewFilePath = join(previewDirectory, `${bundle.bundleSubmissionId}.ndjson`)
      await Bun.write(previewFilePath, bundle.payload)
      try {
        chmodSync(previewFilePath, 0o600)
      } catch {}
      const expiry = setTimeout(() => remove(bundle.bundleSubmissionId), BUNDLE_TTL_MS)
      expiry.unref()
      pendingBundles.set(bundle.bundleSubmissionId, {
        bundle,
        createdAt: Date.now(),
        previewFilePath,
        previewOpened: false,
        expiry
      })
      return {
        bundleSubmissionId: bundle.bundleSubmissionId,
        bytes: bundle.bytes,
        spanCount: bundle.spanCount
      }
    },
    openPreview: async (bundleSubmissionId: string): Promise<void> => {
      const pending = requirePending(bundleSubmissionId)
      if (!(await openFile(pending.previewFilePath))) {
        throw new Error('could not open review file')
      }
      pending.previewOpened = true
    },
    discard: (bundleSubmissionId: string): void => {
      if (!BUNDLE_ID_PATTERN.test(bundleSubmissionId)) {
        throw new Error('bundleSubmissionId has invalid format')
      }
      remove(bundleSubmissionId)
    },
    upload: async (bundleSubmissionId: string): Promise<DiagnosticsUploadResult> => {
      const pending = requirePending(bundleSubmissionId)
      if (!pending.previewOpened) {
        throw new Error('open the review file before sending')
      }
      if (!getDiagnosticsStatus().bundleEnabled) {
        throw new Error('sending diagnostics is disabled')
      }
      const result = await submitSupportReport(
        buildSupportReportDraft({
          reportType: 'diagnostics',
          diagnosticBundle: {
            bundleSubmissionId: pending.bundle.bundleSubmissionId,
            content: pending.bundle.payload,
            bytes: pending.bundle.bytes,
            spanCount: pending.bundle.spanCount
          }
        })
      )
      if (!result.ok) {
        throw new Error(result.error)
      }
      remove(bundleSubmissionId)
      return { ticketId: result.reportId }
    }
  }
}
