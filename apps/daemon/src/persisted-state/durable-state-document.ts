import { existsSync, readFileSync } from 'node:fs'

import { hasDurableStateBackup, restoreDurableStateBackup } from './durable-state-backups'

type LogMilestone = (event: string, details?: Record<string, unknown>) => void

export function readDurableStateDocument(
  path: string,
  allowBackupRecovery: boolean,
  logMilestone: LogMilestone
): unknown {
  try {
    const readStartedAt = performance.now()
    const raw = readFileSync(path, 'utf-8')
    logMilestone('persistence-read-done', {
      bytes: Buffer.byteLength(raw),
      durationMs: Math.round(performance.now() - readStartedAt)
    })
    logMilestone('persistence-json-parse-start')
    const value: unknown = JSON.parse(raw)
    logMilestone('persistence-json-parse-done')
    return value
  } catch (error) {
    console.error(`[persistence] Failed to load ${path}, trying backups:`, error)
  }
  if (
    allowBackupRecovery &&
    (existsSync(path) || hasDurableStateBackup(path)) &&
    restoreDurableStateBackup(path)
  ) {
    return readDurableStateDocument(path, false, logMilestone)
  }
  if (existsSync(path) || hasDurableStateBackup(path)) {
    console.error(`[persistence] No usable state file or backup found for ${path}`)
  }
  return undefined
}

export function isDurableStateDocument(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
