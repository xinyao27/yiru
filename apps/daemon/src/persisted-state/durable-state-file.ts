import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { PersistedState } from '@yiru/runtime-protocol/workbench/types'

import { isStartupDiagnosticsEnabled, logStartupDiagnostic } from '../startup/diagnostics'
import { rotateDurableStateBackups, rotateDurableStateBackupsSync } from './durable-state-backups'
import { isDurableStateDocument, readDurableStateDocument } from './durable-state-document'
import { decryptDurableStateSecrets } from './durable-state-secrets'
import {
  getPersistenceRegionPath,
  PERSISTENCE_REGIONS,
  type PersistenceRegion,
  serializePersistenceRegion
} from './regions'

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
  private readonly dirtyRegions = new Set<PersistenceRegion>()
  private readonly lastWrittenPayloads = new Map<PersistenceRegion, string>()
  private legacyMigrationPending = false
  private firstPendingSaveAt: number | null = null

  constructor(options: DurableStateFileOptions) {
    this.dataFile = options.dataFile
    this.readState = options.readState
  }
  get frozen(): boolean {
    return this.writesFrozen
  }

  get requiresLegacyMigration(): boolean {
    return this.legacyMigrationPending
  }

  readDecoded<T>(decode: (input: DurableStateDecodeInput) => T, allowBackupRecovery = true): T {
    const legacyFileExisted = existsSync(this.dataFile)
    const regionFilesExisted = PERSISTENCE_REGIONS.some((region) =>
      existsSync(getPersistenceRegionPath(this.dataFile, region))
    )
    const fileExistedOnLoad = legacyFileExisted || regionFilesExisted
    this.logMilestone('persistence-load-start', { fileExists: fileExistedOnLoad })
    const legacy = legacyFileExisted
      ? readDurableStateDocument(this.dataFile, allowBackupRecovery, this.logMilestone)
      : undefined
    const combined = isDurableStateDocument(legacy) ? { ...legacy } : {}
    let hasReadableDocument = isDurableStateDocument(legacy)
    for (const region of PERSISTENCE_REGIONS) {
      const path = getPersistenceRegionPath(this.dataFile, region)
      if (!existsSync(path)) {
        continue
      }
      const document = readDurableStateDocument(path, allowBackupRecovery, this.logMilestone)
      if (isDurableStateDocument(document)) {
        Object.assign(combined, document)
        hasReadableDocument = true
      }
    }
    this.legacyMigrationPending = legacyFileExisted
    // Why: shape validation happens after all regional overlays so a partially
    // completed legacy migration still decodes as one candidate transaction.
    return decode({
      value: hasReadableDocument ? decryptDurableStateSecrets(combined) : undefined,
      fileExistedOnLoad
    })
  }

  scheduleSave(region: PersistenceRegion): void {
    this.dirtyRegions.add(region)
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

  flushRegion(region: PersistenceRegion): void {
    if (this.writesFrozen) {
      return
    }
    this.dirtyRegions.delete(region)
    const payload = serializePersistenceRegion(this.readState(), region)
    if (payload === this.lastWrittenPayloads.get(region)) {
      return
    }
    const generation = this.writeGeneration
    const previous = this.pendingWrite ?? Promise.resolve()
    const next = previous
      .then(async () => {
        await mkdir(dirname(this.dataFile), { recursive: true }).catch(() => {})
        await this.writeRegionAsync(region, payload, generation)
      })
      .catch((error) => console.error(`[persistence] Failed to write ${region} region:`, error))
      .finally(() => {
        if (this.pendingWrite === next) {
          this.pendingWrite = null
        }
      })
    this.pendingWrite = next
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
    if (asyncWriteWasInFlight) {
      for (const region of PERSISTENCE_REGIONS) {
        this.dirtyRegions.add(region)
      }
    }
    this.writeSync()
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

  private async writeAsync(): Promise<void> {
    if (this.writesFrozen) {
      return
    }
    const generation = this.writeGeneration
    const writes = this.takeDirtyWrites()
    await mkdir(dirname(this.dataFile), { recursive: true }).catch(() => {})
    for (const write of writes) {
      await this.writeRegionAsync(write.region, write.payload, generation)
    }
    if (this.writeGeneration === generation) {
      await this.finishLegacyMigrationAsync()
    }
  }

  private writeSync(): void {
    if (this.writesFrozen) {
      return
    }
    const directory = dirname(this.dataFile)
    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true })
    }
    for (const write of this.takeDirtyWrites()) {
      this.writeRegionSync(write.region, write.payload)
    }
    this.finishLegacyMigrationSync()
  }

  private takeDirtyWrites(): { region: PersistenceRegion; payload: string }[] {
    const state = this.readState()
    const writes: { region: PersistenceRegion; payload: string }[] = []
    for (const region of this.dirtyRegions) {
      const payload = serializePersistenceRegion(state, region)
      if (payload !== this.lastWrittenPayloads.get(region)) {
        writes.push({ region, payload })
      }
    }
    this.dirtyRegions.clear()
    return writes
  }

  private async writeRegionAsync(
    region: PersistenceRegion,
    payload: string,
    generation: number
  ): Promise<void> {
    const target = getPersistenceRegionPath(this.dataFile, region)
    const temporary = this.temporaryPath(target)
    let renamed = false
    try {
      await writeFile(temporary, payload, 'utf-8')
      if (this.writeGeneration !== generation) {
        return
      }
      await rename(temporary, target)
      renamed = true
      if (this.writeGeneration === generation) {
        this.lastWrittenPayloads.set(region, payload)
      }
    } finally {
      if (!renamed) {
        await rm(temporary).catch(() => {})
      }
    }
    if (this.writeGeneration === generation) {
      await rotateDurableStateBackups(target)
    }
  }

  private writeRegionSync(region: PersistenceRegion, payload: string): void {
    const target = getPersistenceRegionPath(this.dataFile, region)
    const temporary = this.temporaryPath(target)
    let renamed = false
    try {
      writeFileSync(temporary, payload, 'utf-8')
      renameSync(temporary, target)
      renamed = true
      this.lastWrittenPayloads.set(region, payload)
    } finally {
      if (!renamed) {
        try {
          unlinkSync(temporary)
        } catch {
          // Best-effort cleanup; preserve the original write error.
        }
      }
    }
    rotateDurableStateBackupsSync(target)
  }

  private temporaryPath(target: string): string {
    return `${target}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
  }

  private async finishLegacyMigrationAsync(): Promise<void> {
    if (!this.legacyMigrationPending) {
      return
    }
    const allRegionsExist = PERSISTENCE_REGIONS.every((region) =>
      existsSync(getPersistenceRegionPath(this.dataFile, region))
    )
    if (!allRegionsExist) {
      return
    }
    await rm(this.dataFile)
    this.legacyMigrationPending = false
  }

  private finishLegacyMigrationSync(): void {
    if (
      !this.legacyMigrationPending ||
      !PERSISTENCE_REGIONS.every((region) =>
        existsSync(getPersistenceRegionPath(this.dataFile, region))
      )
    ) {
      return
    }
    unlinkSync(this.dataFile)
    this.legacyMigrationPending = false
  }

  private readonly logMilestone = (event: string, details: Record<string, unknown> = {}): void => {
    if (isStartupDiagnosticsEnabled()) {
      logStartupDiagnostic(event, { t: Math.round(performance.now()), ...details })
    }
  }
}
