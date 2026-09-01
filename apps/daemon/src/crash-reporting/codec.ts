import {
  sanitizeCrashReportBreadcrumbs,
  sanitizeCrashReportDetails,
  sanitizeCrashReportString,
  type CrashReportBreadcrumbInput,
  type CrashReportRecord,
  type CrashReportSource,
  type CrashReportStatus
} from '@yiru/runtime-protocol/workbench/crash-reporting'

const PLATFORMS: ReadonlySet<string> = new Set([
  'aix',
  'android',
  'cygwin',
  'darwin',
  'freebsd',
  'haiku',
  'linux',
  'netbsd',
  'openbsd',
  'sunos',
  'win32'
])

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null
}

function requiredString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? sanitizeCrashReportString(value, 4_000) : null
}

function crashStatus(value: unknown): CrashReportStatus | null {
  return value === 'pending' || value === 'sent' || value === 'dismissed' ? value : null
}

function crashSource(value: unknown): CrashReportSource | null {
  return value === 'renderer' || value === 'child' ? value : null
}

function platformValue(value: unknown): NodeJS.Platform | null {
  if (typeof value !== 'string' || !PLATFORMS.has(value)) {
    return null
  }
  // Why: membership in the complete NodeJS.Platform set above narrows a persisted string.
  return value as NodeJS.Platform
}

function breadcrumbInputs(value: unknown): CrashReportBreadcrumbInput[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  const inputs: CrashReportBreadcrumbInput[] = []
  for (const candidate of value) {
    const record = objectValue(candidate)
    if (!record || typeof record.createdAt !== 'string' || typeof record.name !== 'string') {
      continue
    }
    const data = objectValue(record.data)
    inputs.push({
      createdAt: record.createdAt,
      name: record.name,
      ...(data ? { data } : {})
    })
  }
  return inputs
}

function decodeCrashReport(value: unknown): CrashReportRecord | null {
  const record = objectValue(value)
  if (!record) {
    return null
  }
  const id = requiredString(record, 'id')
  const createdAt = requiredString(record, 'createdAt')
  const status = crashStatus(record.status)
  const source = crashSource(record.source)
  const processType = requiredString(record, 'processType')
  const reason = requiredString(record, 'reason')
  const appVersion = requiredString(record, 'appVersion')
  const platform = platformValue(record.platform)
  const osRelease = requiredString(record, 'osRelease')
  const arch = requiredString(record, 'arch')
  const chromeVersion = requiredString(record, 'chromeVersion')
  const exitCode = record.exitCode === null ? null : record.exitCode
  if (
    !id ||
    !createdAt ||
    !status ||
    !source ||
    !processType ||
    !reason ||
    !appVersion ||
    !platform ||
    !osRelease ||
    !arch ||
    !chromeVersion ||
    (exitCode !== null && (typeof exitCode !== 'number' || !Number.isFinite(exitCode)))
  ) {
    return null
  }
  const details = objectValue(record.details) ?? {}
  const breadcrumbs = sanitizeCrashReportBreadcrumbs(breadcrumbInputs(record.breadcrumbs))
  return {
    id,
    createdAt,
    status,
    source,
    processType,
    reason,
    exitCode,
    appVersion,
    platform,
    osRelease,
    arch,
    chromeVersion,
    details: sanitizeCrashReportDetails(details),
    ...(breadcrumbs ? { breadcrumbs } : {})
  }
}

export function decodeCrashReports(value: unknown, maxReports: number): CrashReportRecord[] {
  const root = objectValue(value)
  if (!root || !Array.isArray(root.reports)) {
    return []
  }
  return root.reports
    .slice(0, maxReports)
    .map(decodeCrashReport)
    .filter((report): report is CrashReportRecord => report !== null)
}
