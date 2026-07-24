import { randomUUID } from 'node:crypto'
import { arch as osArch, platform as osPlatform, release as osRelease } from 'node:os'

import { app } from 'electron'
import { PostHog } from 'posthog-node'

import type { SupportReportDraft } from '../../shared/telemetry-events'
import { consumeBurstToken } from '../telemetry/burst-cap'
import { validate } from '../telemetry/validator'

const POSTHOG_HOST = 'https://us.i.posthog.com'
const SUPPORT_REPORT_REQUEST_TIMEOUT_MS = 10_000

let supportReportInFlight = false

export type SupportReportSubmitResult =
  | { readonly ok: true; readonly reportId: string }
  | { readonly ok: false; readonly error: string }

export type SupportReportRuntime = {
  readonly enabled: boolean
  readonly shuttingDown: boolean
  readonly writeKey: string | null
  readonly channel: 'stable' | 'rc' | null
}

/** Send one user-approved report without joining it to the analytics identity. */
export async function sendSupportReport(
  draft: SupportReportDraft,
  runtime: SupportReportRuntime
): Promise<SupportReportSubmitResult> {
  if (!runtime.enabled || !runtime.writeKey || !runtime.channel) {
    return { ok: false, error: 'reporting is not configured for this build' }
  }
  if (runtime.shuttingDown) {
    return { ok: false, error: 'the app is shutting down' }
  }
  if (supportReportInFlight) {
    return { ok: false, error: 'another report is already being sent' }
  }
  if (!consumeBurstToken('support_report_submitted')) {
    return { ok: false, error: 'too many reports were submitted; try again later' }
  }

  const reportId = randomUUID()
  const result = validate('support_report_submitted', {
    ...draft,
    report_id: reportId,
    app_version: app.getVersion(),
    platform: osPlatform(),
    arch: osArch(),
    os_release: osRelease(),
    yiru_channel: runtime.channel
  })
  if (!result.ok) {
    return { ok: false, error: 'report content failed validation' }
  }

  const reportClient = new PostHog(runtime.writeKey, {
    host: POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
    // Why: this is an interactive send. SDK retries can otherwise hold the
    // single-report lock for about a minute after the UI's 10 second timeout.
    fetchRetryCount: 0,
    maxQueueSize: 10,
    requestTimeout: SUPPORT_REPORT_REQUEST_TIMEOUT_MS,
    disableGeoip: true,
    isServer: false
  })
  let submissionError: unknown = null
  // PostHog reports transport failures through the SDK error event even when
  // captureImmediate resolves, so observe both completion channels.
  const stopListeningForErrors = reportClient.on('error', (error: unknown) => {
    submissionError ??= error
  })
  supportReportInFlight = true
  try {
    // Why: this ID is fresh per click and never persisted, so reports cannot
    // be joined to an install, analytics session, or another report.
    await reportClient.captureImmediate({
      distinctId: reportId,
      event: 'support_report_submitted',
      properties: {
        ...result.props,
        $process_person_profile: false
      }
    })
    if (submissionError) {
      console.warn('[telemetry] support report submission failed:', submissionError)
      return { ok: false, error: 'could not send report to PostHog' }
    }
    return { ok: true, reportId }
  } catch (error) {
    console.warn('[telemetry] support report submission failed:', error)
    return { ok: false, error: 'could not send report to PostHog' }
  } finally {
    stopListeningForErrors()
    supportReportInFlight = false
    try {
      await reportClient._shutdown(1_000)
    } catch {
      /* captureImmediate already settled; shutdown is best effort */
    }
  }
}
