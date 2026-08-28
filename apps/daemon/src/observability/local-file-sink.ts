import {
  chmodSync,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { dirname } from 'node:path'

const FLUSH_THRESHOLD = 32
const BATCH_WINDOW_MS = 200
const MAX_BYTES = 10 * 1024 * 1024
export const TRACE_MAX_FILES = 10

export type LocalFileSink = {
  push: (record: unknown) => void
  flush: () => void
  close: () => void
}

export function createLocalFileSink(filePath: string): LocalFileSink {
  mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 })
  tightenPermissions(filePath)
  let pending: string[] = []
  let timer: ReturnType<typeof setTimeout> | null = null
  let closed = false

  const flush = (): void => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (closed || pending.length === 0) {
      return
    }
    const lines = pending
    pending = []
    for (const line of lines) {
      const bytes = Buffer.byteLength(line)
      if (bytes > MAX_BYTES) {
        continue
      }
      const currentBytes = fileSize(filePath)
      if (currentBytes > 0 && currentBytes + bytes > MAX_BYTES) {
        rotate(filePath)
      }
      try {
        writeFileSync(filePath, line, { encoding: 'utf8', flag: 'a', mode: 0o600 })
      } catch {
        // Why: diagnostics are optional and must never turn an app error into a daemon crash.
      }
    }
  }

  return {
    push(record): void {
      if (closed) {
        return
      }
      try {
        pending.push(`${JSON.stringify(record)}\n`)
      } catch {
        return
      }
      if (pending.length >= FLUSH_THRESHOLD) {
        flush()
        return
      }
      if (!timer) {
        timer = setTimeout(flush, BATCH_WINDOW_MS)
        timer.unref()
      }
    },
    flush,
    close(): void {
      flush()
      closed = true
    }
  }
}

export function traceFamilySize(filePath: string): number {
  return rotatedTraceFiles(filePath).reduce((total, path) => total + fileSize(path), 0)
}

export function rotatedTraceFiles(filePath: string): string[] {
  const paths: string[] = []
  for (let index = 0; index < TRACE_MAX_FILES; index += 1) {
    const path = index === 0 ? filePath : `${filePath}.${index}`
    if (existsSync(path)) {
      paths.push(path)
    }
  }
  return paths
}

function rotate(filePath: string): void {
  for (let index = TRACE_MAX_FILES - 1; index >= 1; index -= 1) {
    const source = index === 1 ? filePath : `${filePath}.${index - 1}`
    const destination = `${filePath}.${index}`
    if (!existsSync(source)) {
      continue
    }
    try {
      if (existsSync(destination)) {
        unlinkSync(destination)
      }
      renameSync(source, destination)
    } catch {
      // Why: a partial rotation still preserves more evidence than failing the caller.
    }
  }
  tightenPermissions(filePath)
}

function fileSize(path: string): number {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}

function tightenPermissions(filePath: string): void {
  for (const path of [dirname(filePath), ...rotatedTraceFiles(filePath)]) {
    try {
      chmodSync(path, path === dirname(filePath) ? 0o700 : 0o600)
    } catch {
      // Why: Windows can reject POSIX modes; access control remains platform-owned there.
    }
  }
}
