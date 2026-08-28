import { randomUUID } from 'node:crypto'
import { chmod, mkdir, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import {
  formatCrashReportText,
  sanitizeCrashReportBreadcrumbs,
  sanitizeCrashReportDetails,
  type CrashReportCreateInput,
  type CrashReportRecord,
  type CrashReportStatus
} from '@yiru/runtime-protocol/workbench/crash-reporting'

import { decodeCrashReports } from './codec'

const MAX_REPORTS = 5
const RELATED_CRASH_WINDOW_MS = 5_000

type StoreMutation<T> = { reports: CrashReportRecord[]; result: T }

function isRelatedCrashEvent(anchor: CrashReportRecord, candidate: CrashReportRecord): boolean {
  if (anchor.id === candidate.id || candidate.status !== 'pending') {
    return false
  }
  const anchorTime = Date.parse(anchor.createdAt)
  const candidateTime = Date.parse(candidate.createdAt)
  return (
    Number.isFinite(anchorTime) &&
    Number.isFinite(candidateTime) &&
    Math.abs(anchorTime - candidateTime) <= RELATED_CRASH_WINDOW_MS &&
    anchor.reason === candidate.reason &&
    anchor.exitCode === candidate.exitCode &&
    anchor.appVersion === candidate.appVersion &&
    anchor.platform === candidate.platform
  )
}

export class CrashReportStore {
  private readonly filePath: string
  private writeChain = Promise.resolve()

  constructor(userDataPath: string) {
    this.filePath = join(userDataPath, 'crash-reports.json')
  }

  record(input: CrashReportCreateInput): Promise<CrashReportRecord> {
    return this.withWrite((reports) => {
      const report: CrashReportRecord = {
        ...input,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        status: 'pending',
        details: sanitizeCrashReportDetails(input.details),
        breadcrumbs: sanitizeCrashReportBreadcrumbs(input.breadcrumbs)
      }
      return { reports: [report, ...reports].slice(0, MAX_REPORTS), result: report }
    })
  }

  async getLatestPending(): Promise<CrashReportRecord | null> {
    return (await this.listRecent()).find((report) => report.status === 'pending') ?? null
  }

  async listRecent(): Promise<CrashReportRecord[]> {
    await this.writeChain
    return this.readReportsFromDisk()
  }

  markSent(id: string): Promise<CrashReportRecord | null> {
    return this.transitionStatus(id, 'pending', 'sent')
  }

  markDismissedSent(id: string): Promise<CrashReportRecord | null> {
    return this.transitionStatus(id, 'dismissed', 'sent')
  }

  dismiss(id: string): Promise<CrashReportRecord | null> {
    return this.transitionStatus(id, 'pending', 'dismissed')
  }

  async getById(id: string): Promise<CrashReportRecord | null> {
    return (await this.listRecent()).find((report) => report.id === id) ?? null
  }

  async formatDiagnosticText(id: string, notes?: string): Promise<string | null> {
    const report = await this.getById(id)
    return report ? formatCrashReportText(report, notes) : null
  }

  private transitionStatus(
    id: string,
    from: CrashReportStatus,
    status: Exclude<CrashReportStatus, 'pending'>
  ): Promise<CrashReportRecord | null> {
    return this.withWrite((reports) => {
      let result: CrashReportRecord | null = null
      const anchor = reports.find((report) => report.id === id)
      const nextReports = reports.map((report) => {
        if (report.id !== id) {
          if (anchor?.status === from && isRelatedCrashEvent(anchor, report)) {
            return { ...report, status: 'dismissed' as const }
          }
          return report
        }
        if (report.status !== from) {
          result = report
          return report
        }
        result = { ...report, status }
        return result
      })
      return { reports: nextReports, result }
    })
  }

  private withWrite<T>(mutate: (reports: CrashReportRecord[]) => StoreMutation<T>): Promise<T> {
    const run = this.writeChain.then(async () => {
      const mutation = mutate(await this.readReportsFromDisk())
      await this.writeReports(mutation.reports)
      return mutation.result
    })
    this.writeChain = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }

  private async readReportsFromDisk(): Promise<CrashReportRecord[]> {
    try {
      return decodeCrashReports(JSON.parse(await Bun.file(this.filePath).text()), MAX_REPORTS)
    } catch (error) {
      if (typeof error === 'object' && error !== null && Reflect.get(error, 'code') !== 'ENOENT') {
        console.warn('[crash-reporting] Failed to read crash reports:', error)
      }
      return []
    }
  }

  private async writeReports(reports: CrashReportRecord[]): Promise<void> {
    const directory = dirname(this.filePath)
    const temporary = `${this.filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`
    await mkdir(directory, { recursive: true, mode: 0o700 })
    try {
      await Bun.write(temporary, `${JSON.stringify({ reports }, null, 2)}\n`)
      await chmod(temporary, 0o600).catch(() => {})
      await rename(temporary, this.filePath)
    } finally {
      await rm(temporary, { force: true }).catch(() => {})
    }
  }
}
