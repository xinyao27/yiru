import {
  type CrashReportBreadcrumbData,
  sanitizeCrashReportDetails,
  sanitizeCrashReportString
} from '~shared/crash-reporting'

import { startSpan } from '../observability/tracer'
import { recordCoalescedCrashBreadcrumb, recordCrashBreadcrumb } from './crash-breadcrumb-store'

const COALESCED_RENDERER_ERROR_BREADCRUMB_NAMES = new Set([
  'renderer_error',
  'renderer_unhandled_rejection'
])
const RENDERER_ERROR_BREADCRUMB_COALESCE_MS = 30_000

function sanitizeRendererBreadcrumbData(value: unknown): CrashReportBreadcrumbData | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  const primitiveData: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string' || typeof entry === 'boolean' || entry === null) {
      primitiveData[key] = entry
    } else if (typeof entry === 'number' && Number.isFinite(entry)) {
      primitiveData[key] = entry
    }
  }
  const sanitized = sanitizeCrashReportDetails(primitiveData)
  return Object.keys(sanitized).length > 0 ? sanitized : undefined
}

function recordRendererBreadcrumbTrace(
  name: string,
  data: CrashReportBreadcrumbData | undefined
): void {
  const span = startSpan('renderer.breadcrumb', {
    attributes: {
      kind: 'crash-breadcrumb',
      'breadcrumb.name': sanitizeCrashReportString(name),
      ...(data ? { 'breadcrumb.data': data } : {})
    }
  })
  // Why: native crashes cannot persist memory-only breadcrumbs, so this tiny
  // trace span gives the next crash report durable pre-crash context.
  span.end()
}

function rendererErrorBreadcrumbCoalesceKey(
  name: string,
  data: CrashReportBreadcrumbData | undefined
): string | undefined {
  const primaryMessage = name === 'renderer_error' ? data?.message : data?.reasonMessage
  const fallbackMessage = name === 'renderer_error' ? data?.errorMessage : undefined
  const message =
    typeof primaryMessage === 'string' && primaryMessage.length > 0
      ? primaryMessage
      : typeof fallbackMessage === 'string' && fallbackMessage.length > 0
        ? fallbackMessage
        : undefined
  if (!message) {
    // Why: message-less failures have no stable identity and could erase unrelated evidence.
    return undefined
  }

  const sourceIdentity =
    name === 'renderer_error'
      ? [
          data?.errorStack,
          data?.filename,
          data?.lineno,
          data?.colno,
          data?.errorType,
          data?.errorName,
          data?.errorMessage
        ]
      : [data?.reasonStack, data?.reasonType, data?.reasonName]
  return JSON.stringify([name, message, ...sourceIdentity])
}

export function recordRendererBreadcrumb(args?: { name?: unknown; data?: unknown }): void {
  if (!args || typeof args.name !== 'string') {
    return
  }
  const data = sanitizeRendererBreadcrumbData(args.data)
  if (!COALESCED_RENDERER_ERROR_BREADCRUMB_NAMES.has(args.name)) {
    recordCrashBreadcrumb(args.name, data)
    recordRendererBreadcrumbTrace(args.name, data)
    return
  }

  const coalesceKey = rendererErrorBreadcrumbCoalesceKey(args.name, data)
  if (!coalesceKey) {
    recordCrashBreadcrumb(args.name, data)
    recordRendererBreadcrumbTrace(args.name, data)
    return
  }
  const coalesceResult = recordCoalescedCrashBreadcrumb({
    name: args.name,
    data,
    coalesceKey,
    minIntervalMs: RENDERER_ERROR_BREADCRUMB_COALESCE_MS
  })
  // Why: tracing suppressed duplicates would preserve the same disk churn that
  // breadcrumb coalescing removes.
  if (coalesceResult) {
    recordRendererBreadcrumbTrace(
      args.name,
      coalesceResult.suppressedSinceLast > 0
        ? { ...data, suppressedSinceLast: coalesceResult.suppressedSinceLast }
        : data
    )
  }
}
