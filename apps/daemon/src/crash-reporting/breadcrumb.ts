import {
  sanitizeCrashReportDetails,
  sanitizeCrashReportString,
  type CrashReportBreadcrumbData,
  type CrashReportBreadcrumbRecordArgs
} from '@yiru/runtime-protocol/workbench/crash-reporting'

import { startSpan } from '../observability/tracer'
import { recordCoalescedCrashBreadcrumb, recordCrashBreadcrumb } from './crash-breadcrumb-store'

const COALESCED_NAMES = new Set(['renderer_error', 'renderer_unhandled_rejection'])
const COALESCE_MS = 30_000

function sanitizeData(value: unknown): CrashReportBreadcrumbData | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  const primitiveData: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (
      typeof entry === 'string' ||
      typeof entry === 'boolean' ||
      entry === null ||
      (typeof entry === 'number' && Number.isFinite(entry))
    ) {
      primitiveData[key] = entry
    }
  }
  const sanitized = sanitizeCrashReportDetails(primitiveData)
  return Object.keys(sanitized).length > 0 ? sanitized : undefined
}

function recordTrace(name: string, data: CrashReportBreadcrumbData | undefined): void {
  const span = startSpan('renderer.breadcrumb', {
    attributes: {
      kind: 'crash-breadcrumb',
      'breadcrumb.name': sanitizeCrashReportString(name),
      ...(data ? { 'breadcrumb.data': data } : {})
    }
  })
  span.end()
}

function coalesceKey(name: string, data: CrashReportBreadcrumbData | undefined): string | null {
  const primary = name === 'renderer_error' ? data?.message : data?.reasonMessage
  const fallback = name === 'renderer_error' ? data?.errorMessage : undefined
  const message =
    typeof primary === 'string' && primary ? primary : typeof fallback === 'string' ? fallback : ''
  if (!message) {
    return null
  }
  const identity =
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
  return JSON.stringify([name, message, ...identity])
}

export function recordRendererBreadcrumb(args: CrashReportBreadcrumbRecordArgs): void {
  const data = sanitizeData(args.data)
  const key = COALESCED_NAMES.has(args.name) ? coalesceKey(args.name, data) : null
  if (!key) {
    recordCrashBreadcrumb(args.name, data)
    recordTrace(args.name, data)
    return
  }
  const result = recordCoalescedCrashBreadcrumb({
    name: args.name,
    data,
    coalesceKey: key,
    minIntervalMs: COALESCE_MS
  })
  if (result) {
    recordTrace(
      args.name,
      result.suppressedSinceLast > 0
        ? { ...data, suppressedSinceLast: result.suppressedSinceLast }
        : data
    )
  }
}
