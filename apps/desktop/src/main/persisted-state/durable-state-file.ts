import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { PersistedState } from '../../shared/types'
import { isStartupDiagnosticsEnabled, logStartupDiagnostic } from '../startup/startup-diagnostics'
import {
  hasDurableStateBackup,
  restoreDurableStateBackup,
  rotateDurableStateBackups,
  rotateDurableStateBackupsSync
} from './durable-state-backups'
import { decryptDurableStateSecrets, serializeDurableState } from './durable-state-secrets'

export type DurableStateDecodeInput = {
  value: unknown
  fileExistedOnLoad: boolean
}

type DurableStateFileOptions = {
  dataFile: string
  readState: () => PersistedState
}

const SAVE_DEBOUNCE_MS = 1_000
const SAVE_MAX_WAIT_MS = 5_000

export class DurableStateFile {
  private readonly dataFile: string
  private readonly readState: () => PersistedState
  private writeTimer: ReturnType<typeof setTimeout> | null = null
  private pendingWrite: Promise<void> | null = null
  private writeGeneration = 0
  private writesFrozen = false
  private lastWrittenStateHash: string | null = null
  private firstPendingSaveAt: number | null = null

  constructor(options: DurableStateFileOptions) {
    this.dataFile = options.dataFile
    this.readState = options.readState
  }

  get frozen(): boolean {
    return this.writesFrozen
  }

  readDecoded<T>(decode: (input: DurableStateDecodeInput) => T, allowBackupRecovery = true): T {
    const fileExistedOnLoad = existsSync(this.dataFile)
    this.logMilestone('persistence-load-start', { fileExists: fileExistedOnLoad })
    if (fileExistedOnLoad) {
      try {
        const readStartedAt = performance.now()
        const raw = readFileSync(this.dataFile, 'utf-8')
        this.logMilestone('persistence-read-done', {
          bytes: Buffer.byteLength(raw),
          durationMs: Math.round(performance.now() - readStartedAt)
        })
        this.logMilestone('persistence-json-parse-start')
        const value = decryptDurableStateSecrets(JSON.parse(raw))
        this.logMilestone('persistence-json-parse-done')
        // Why: shape validation belongs to the same candidate transaction as
        // JSON parsing, so semantic corruption can still fall back to backup.
        return decode({ value, fileExistedOnLoad })
      } catch (error) {
        console.error('[persistence] Failed to load primary state, trying backups:', error)
      }
    }
    if (
      allowBackupRecovery &&
      (fileExistedOnLoad || hasDurableStateBackup(this.dataFile)) &&
      restoreDurableStateBackup(this.dataFile)
    ) {
      return this.readDecoded(decode, false)
    }
    if (fileExistedOnLoad || hasDurableStateBackup(this.dataFile)) {
      console.error('[persistence] No usable state file or backup found, using defaults')
    }
    return decode({ value: undefined, fileExistedOnLoad })
  }

  scheduleSave(): void {
    const now = Date.now()
    this.firstPendingSaveAt ??= now
    if (this.writeTimer) {
      clearTimeout(this.writeTimer)
    }
    const untilMaxWait = Math.max(0, this.firstPendingSaveAt + SAVE_MAX_WAIT_MS - now)
    this.writeTimer = setTimeout(
      () => {
        this.writeTimer = null
        this.firstPendingSaveAt = null
        const previous = this.pendingWrite ?? Promise.resolve()
        const next = previous
          .then(() => this.writeAsync())
          .catch((error) => console.error('[persistence] Failed to write state:', error))
          .finally(() => {
            if (this.pendingWrite === next) {
              this.pendingWrite = null
            }
          })
        this.pendingWrite = next
      },
      Math.min(SAVE_DEBOUNCE_MS, untilMaxWait)
    )
  }

  flushOrThrow(): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer)
      this.writeTimer = null
    }
    this.firstPendingSaveAt = null
    const asyncWriteWasInFlight = this.pendingWrite !== null
    this.writeGeneration += 1
    this.pendingWrite = null
    this.writeSync(asyncWriteWasInFlight)
  }

  freezeWrites(): void {
    this.writesFrozen = true
    if (this.writeTimer) {
      clearTimeout(this.writeTimer)
      this.writeTimer = null
    }
  }

  logLoaded(state: PersistedState): void {
    this.logMilestone('persistence-load-done', {
      repos: state.repos.length,
      workspaceSessionBytes: Buffer.byteLength(JSON.stringify(state.workspaceSession))
    })
  }

  private stateHash(): string {
    const { githubCache: _memoryOnly, ...durable } = this.readState()
    return createHash('sha1').update(JSON.stringify(durable)).digest('hex')
  }

  private async writeAsync(): Promise<void> {
    if (this.writesFrozen) {
      return
    }
    const generation = this.writeGeneration
    const stateHash = this.stateHash()
    if (stateHash === this.lastWrittenStateHash) {
      return
    }
    const payload = serializeDurableState(this.readState())
    await mkdir(dirname(this.dataFile), { recursive: true }).catch(() => {})
    const temporary = this.temporaryPath()
    let renamed = false
    try {
      await writeFile(temporary, payload, 'utf-8')
      if (this.writeGeneration !== generation) {
        return
      }
      await rename(temporary, this.dataFile)
      renamed = true
      if (this.writeGeneration === generation) {
        this.lastWrittenStateHash = stateHash
      }
    } finally {
      if (!renamed) {
        await rm(temporary).catch(() => {})
      }
    }
    if (this.writeGeneration === generation) {
      await rotateDurableStateBackups(this.dataFile)
    }
  }

  private writeSync(force: boolean): void {
    if (this.writesFrozen) {
      return
    }
    const stateHash = this.stateHash()
    if (!force && stateHash === this.lastWrittenStateHash) {
      return
    }
    const directory = dirname(this.dataFile)
    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true })
    }
    const temporary = this.temporaryPath()
    let renamed = false
    try {
      writeFileSync(temporary, serializeDurableState(this.readState()), 'utf-8')
      renameSync(temporary, this.dataFile)
      renamed = true
      this.lastWrittenStateHash = stateHash
    } finally {
      if (!renamed) {
        try {
          unlinkSync(temporary)
        } catch {
          // Best-effort cleanup; preserve the original write error.
        }
      }
    }
    rotateDurableStateBackupsSync(this.dataFile)
  }

  private temporaryPath(): string {
    return `${this.dataFile}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
  }

  private logMilestone(event: string, details: Record<string, unknown> = {}): void {
    if (isStartupDiagnosticsEnabled()) {
      logStartupDiagnostic(event, { t: Math.round(performance.now()), ...details })
    }
  }
}
