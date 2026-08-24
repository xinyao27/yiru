import { appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { getRuntimeHostPathsProvider } from '../runtime/host/paths-provider'

// Why: writing to userData instead of tmpdir() so the diag log is only
// readable by the current user, not world-readable in /tmp.
let _diagLog: string | null = null
function getDiagLogPath(): string {
  if (!_diagLog) {
    try {
      _diagLog = join(getRuntimeHostPathsProvider().userDataPath(), 'cookie-import-diag.log')
    } catch {
      _diagLog = join(tmpdir(), 'yiru-cookie-import-diag.log')
    }
  }
  return _diagLog
}
export function reasonWithDiagLog(reason: string): string {
  return `${reason} Details were written to ${getDiagLogPath()}.`
}
const COOKIE_IMPORT_ERROR_SUMMARY_MAX_CHARS = 180
const COOKIE_IMPORT_ERROR_SCAN_MAX_CHARS = 512

// Why: imported cookie errors can include pasted or file-derived payloads;
// diagnostics only need a short preview, not a full-string whitespace pass.
export function summarizeCookieImportError(err: unknown): string {
  const raw = err instanceof Error && err.message ? err.message : String(err)
  let summary = ''
  let previousWasWhitespace = false
  const scanLimit = Math.min(raw.length, COOKIE_IMPORT_ERROR_SCAN_MAX_CHARS)
  for (let index = 0; index < scanLimit; index += 1) {
    const code = raw.charCodeAt(index)
    if (code === 32 || (code >= 9 && code <= 13)) {
      if (summary.length > 0 && !previousWasWhitespace) {
        summary += ' '
      }
      previousWasWhitespace = true
      continue
    }
    summary += raw.charAt(index)
    if (summary.length >= COOKIE_IMPORT_ERROR_SUMMARY_MAX_CHARS) {
      return summary.slice(0, COOKIE_IMPORT_ERROR_SUMMARY_MAX_CHARS)
    }
    previousWasWhitespace = false
  }
  return summary
}
export function diag(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  try {
    appendFileSync(getDiagLogPath(), line)
  } catch {
    /* best-effort */
  }
  console.log('[cookie-import]', msg)
}
