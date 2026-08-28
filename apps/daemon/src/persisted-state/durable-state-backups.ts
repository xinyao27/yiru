import {
  copyFileSync,
  existsSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
  mkdirSync
} from 'node:fs'
import { copyFile, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'

const BACKUP_COUNT = 5
const BACKUP_MIN_INTERVAL_MS = 60 * 60 * 1000

function backupPath(dataFile: string, index: number): string {
  return `${dataFile}.bak.${index}`
}

export function hasDurableStateBackup(dataFile: string): boolean {
  for (let index = 0; index < BACKUP_COUNT; index += 1) {
    if (existsSync(backupPath(dataFile, index))) {
      return true
    }
  }
  return false
}

export function restoreDurableStateBackup(dataFile: string): boolean {
  for (let index = 0; index < BACKUP_COUNT; index += 1) {
    const path = backupPath(dataFile, index)
    if (!existsSync(path)) {
      continue
    }
    try {
      const raw = readFileSync(path, 'utf-8')
      JSON.parse(raw)
      mkdirSync(dirname(dataFile), { recursive: true })
      writeFileSync(dataFile, raw, 'utf-8')
      console.warn(`[persistence] Recovered state from backup slot ${index}: ${path}`)
      return true
    } catch (error) {
      console.error(`[persistence] Backup slot ${index} unusable, trying next:`, error)
    }
  }
  return false
}

function shouldRotateBackups(now: number, dataFile: string): boolean {
  try {
    return now - statSync(backupPath(dataFile, 0)).mtimeMs >= BACKUP_MIN_INTERVAL_MS
  } catch {
    return true
  }
}

export async function rotateDurableStateBackups(dataFile: string): Promise<void> {
  if (!existsSync(dataFile) || !shouldRotateBackups(Date.now(), dataFile)) {
    return
  }
  await rm(backupPath(dataFile, BACKUP_COUNT - 1)).catch((error: unknown) => {
    if (error && (error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[persistence] Failed to remove oldest backup:', error)
    }
  })
  for (let index = BACKUP_COUNT - 2; index >= 0; index -= 1) {
    const source = backupPath(dataFile, index)
    const target = backupPath(dataFile, index + 1)
    if (existsSync(source)) {
      await rename(source, target).catch((error) => {
        console.error('[persistence] Failed to rotate backup', source, '->', target, error)
      })
    }
  }
  await copyFile(dataFile, backupPath(dataFile, 0)).catch((error) => {
    console.error('[persistence] Failed to snapshot current file to .bak.0:', error)
  })
}

export function rotateDurableStateBackupsSync(dataFile: string): void {
  if (!existsSync(dataFile) || !shouldRotateBackups(Date.now(), dataFile)) {
    return
  }
  try {
    unlinkSync(backupPath(dataFile, BACKUP_COUNT - 1))
  } catch (error) {
    if (error && (error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[persistence] Failed to remove oldest backup:', error)
    }
  }
  for (let index = BACKUP_COUNT - 2; index >= 0; index -= 1) {
    const source = backupPath(dataFile, index)
    const target = backupPath(dataFile, index + 1)
    if (!existsSync(source)) {
      continue
    }
    try {
      renameSync(source, target)
    } catch (error) {
      console.error('[persistence] Failed to rotate backup', source, '->', target, error)
    }
  }
  try {
    copyFileSync(dataFile, backupPath(dataFile, 0))
  } catch (error) {
    console.error('[persistence] Failed to snapshot current file to .bak.0:', error)
  }
}
