import { randomBytes } from 'node:crypto'

import { rotatedTraceFiles } from './local-file-sink'
import { redactValue } from './redactor'

const MAX_BUNDLE_BYTES = 4 * 1024 * 1024
const MAX_SOURCE_FILE_BYTES = 50 * 1024 * 1024
const DEFAULT_LOOKBACK_MINUTES = 30

export type CollectedDiagnosticBundle = {
  bundleSubmissionId: string
  payload: string
  bytes: number
  spanCount: number
}

type CollectDiagnosticBundleOptions = {
  traceFilePath: string
  lookbackMinutes?: number
  appVersion: string
  platform: string
  arch: string
  osRelease: string
  yiruChannel: 'stable' | 'rc' | 'dev'
}

export async function collectBundle(
  options: CollectDiagnosticBundleOptions
): Promise<CollectedDiagnosticBundle> {
  const lookbackMs = (options.lookbackMinutes ?? DEFAULT_LOOKBACK_MINUTES) * 60 * 1000
  const cutoffMs = Date.now() - lookbackMs
  const cutoffNanos = BigInt(cutoffMs) * 1_000_000n
  const bundleSubmissionId = randomBytes(16).toString('base64url')
  const headerLine = JSON.stringify({
    type: 'bundle-header',
    bundle_submission_id: bundleSubmissionId,
    app_version: options.appVersion,
    platform: options.platform,
    arch: options.arch,
    os_release: options.osRelease,
    yiru_channel: options.yiruChannel,
    collected_at: new Date().toISOString(),
    schema_version: 1
  })
  const lines = [headerLine]
  let bytes = Buffer.byteLength(`${headerLine}\n`)
  let spanCount = 0

  outer: for (const path of rotatedTraceFiles(options.traceFilePath)) {
    const file = Bun.file(path)
    if (file.size > MAX_SOURCE_FILE_BYTES) {
      continue
    }
    let text: string
    try {
      text = await file.text()
    } catch {
      continue
    }
    for (const raw of readLinesNewestFirst(text)) {
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        continue
      }
      if (!isRecord(parsed) || isOlderThan(parsed, cutoffMs, cutoffNanos)) {
        continue
      }
      const redacted = JSON.stringify(redactValue(parsed, 'server'))
      const recordBytes = Buffer.byteLength(redacted) + 1
      if (recordBytes > MAX_BUNDLE_BYTES - Buffer.byteLength(`${headerLine}\n`)) {
        continue
      }
      if (bytes + recordBytes > MAX_BUNDLE_BYTES) {
        break outer
      }
      lines.push(redacted)
      bytes += recordBytes
      spanCount += 1
    }
  }
  return { bundleSubmissionId, payload: `${lines.join('\n')}\n`, bytes, spanCount }
}

function* readLinesNewestFirst(text: string): Iterable<string> {
  let end = text.length
  while (end > 0) {
    const start = text.lastIndexOf('\n', end - 1)
    const rawLine = text.slice(start + 1, end)
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    if (line) {
      yield line
    }
    if (start === -1) {
      return
    }
    end = start
  }
}

function isOlderThan(
  record: Record<string, unknown>,
  cutoffMs: number,
  cutoffNanos: bigint
): boolean {
  const endTime = record.endTimeUnixNano
  if (typeof endTime === 'string') {
    try {
      return BigInt(endTime) < cutoffNanos
    } catch {
      return false
    }
  }
  const timestamp = record.ts
  if (typeof timestamp !== 'string') {
    return false
  }
  const timestampMs = Date.parse(timestamp)
  return Number.isFinite(timestampMs) && timestampMs < cutoffMs
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
