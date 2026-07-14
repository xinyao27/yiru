import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { ExecutionHostId } from '../../shared/execution-host'
import { normalizeExecutionHostId } from '../../shared/execution-host'
import { hardenExistingSecureFile, writeSecureJsonFile } from '../../shared/secure-file'

const SPOOL_SESSION_PROVENANCE_FILENAME = 'spool-session-provenance.json'
const SPOOL_SESSION_PROVENANCE_VERSION = 2
const MAX_PROVENANCE_FILE_BYTES = 8 * 1024 * 1024
const MAX_PROVENANCE_ENTRIES = 50_000
const MAX_LEGACY_ATTESTATIONS = 10_000

export type SpoolProvenanceProvider = 'claude' | 'codex'

export type SpoolSessionProvenanceKey = {
  executionHostId: ExecutionHostId
  provider: SpoolProvenanceProvider
  providerSessionId: string
}

export type SpoolSessionProvenance = SpoolSessionProvenanceKey & {
  worktreeInstanceId: string
  spoolIncarnationId: string
}

export type SpoolLegacyPublicationAttestation = {
  executionHostId: ExecutionHostId
  worktreeInstanceId: string
  spoolIncarnationId: string
}

type SpoolSessionProvenanceFile = {
  version: typeof SPOOL_SESSION_PROVENANCE_VERSION
  entries: SpoolSessionProvenance[]
  legacyAttestations: SpoolLegacyPublicationAttestation[]
}

type LegacySpoolSessionProvenanceFile = {
  version: 1
  entries: SpoolSessionProvenance[]
}

type LoadedSpoolSessionProvenance = {
  entries: readonly SpoolSessionProvenance[]
  legacyAttestations: readonly SpoolLegacyPublicationAttestation[]
}

export class SpoolSessionProvenanceIndex {
  private readonly filePath: string
  private readonly entries = new Map<string, SpoolSessionProvenance>()
  private readonly legacyAttestations = new Map<string, SpoolLegacyPublicationAttestation>()

  constructor(userDataPath: string) {
    this.filePath = join(userDataPath, SPOOL_SESSION_PROVENANCE_FILENAME)
    const loaded = loadProvenance(this.filePath)
    for (const entry of loaded.entries) {
      this.entries.set(toSessionKey(entry), entry)
    }
    for (const attestation of loaded.legacyAttestations) {
      this.legacyAttestations.set(toLegacyAttestationKey(attestation), attestation)
    }
  }

  resolve(key: SpoolSessionProvenanceKey): SpoolSessionProvenance | null {
    const entry = this.entries.get(toSessionKey(key))
    return entry ? { ...entry } : null
  }

  attest(entries: readonly SpoolSessionProvenance[]): boolean {
    if (entries.length === 0) {
      return false
    }
    const nextEntries = new Map(this.entries)
    if (!addEntries(nextEntries, entries)) {
      return false
    }
    this.commit(nextEntries, new Map(this.legacyAttestations))
    return true
  }

  hasLegacyPublicationAttestation(attestation: SpoolLegacyPublicationAttestation): boolean {
    requireValidLegacyAttestation(attestation)
    return this.legacyAttestations.has(toLegacyAttestationKey(attestation))
  }

  attestLegacyPublication(
    attestation: SpoolLegacyPublicationAttestation,
    entries: readonly SpoolSessionProvenance[]
  ): boolean {
    requireValidLegacyAttestation(attestation)
    if (this.legacyAttestations.has(toLegacyAttestationKey(attestation))) {
      return false
    }
    for (const entry of entries) {
      requireValidEntry(entry)
      if (!belongsToAttestation(entry, attestation)) {
        throw new Error('Legacy Spool session provenance does not match its publication')
      }
    }
    const nextEntries = new Map(this.entries)
    const nextAttestations = new Map(this.legacyAttestations)
    addEntries(nextEntries, entries)
    nextAttestations.set(toLegacyAttestationKey(attestation), { ...attestation })
    this.commit(nextEntries, nextAttestations)
    return true
  }

  remove(key: SpoolSessionProvenanceKey): void {
    const nextEntries = new Map(this.entries)
    if (nextEntries.delete(toSessionKey(key))) {
      this.commit(nextEntries, new Map(this.legacyAttestations))
    }
  }

  purgeWorktree(worktreeInstanceId: string): void {
    this.purge(
      (entry) => entry.worktreeInstanceId === worktreeInstanceId,
      (entry) => entry.worktreeInstanceId === worktreeInstanceId
    )
  }

  private purge(
    entryPredicate: (entry: SpoolSessionProvenance) => boolean,
    attestationPredicate: (entry: SpoolLegacyPublicationAttestation) => boolean
  ): void {
    const nextEntries = filteredMap(this.entries, entryPredicate)
    const nextAttestations = filteredMap(this.legacyAttestations, attestationPredicate)
    if (
      nextEntries.size !== this.entries.size ||
      nextAttestations.size !== this.legacyAttestations.size
    ) {
      this.commit(nextEntries, nextAttestations)
    }
  }

  private commit(
    nextEntries: Map<string, SpoolSessionProvenance>,
    nextAttestations: Map<string, SpoolLegacyPublicationAttestation>
  ): void {
    if (
      nextEntries.size > MAX_PROVENANCE_ENTRIES ||
      nextAttestations.size > MAX_LEGACY_ATTESTATIONS
    ) {
      throw new Error('Spool session provenance limit exceeded')
    }
    const persisted: SpoolSessionProvenanceFile = {
      version: SPOOL_SESSION_PROVENANCE_VERSION,
      entries: [...nextEntries.values()],
      legacyAttestations: [...nextAttestations.values()]
    }
    if (
      Buffer.byteLength(JSON.stringify(persisted, null, 2), 'utf-8') > MAX_PROVENANCE_FILE_BYTES
    ) {
      throw new Error('Spool session provenance file limit exceeded')
    }
    writeSecureJsonFile(this.filePath, persisted)
    replaceMap(this.entries, nextEntries)
    replaceMap(this.legacyAttestations, nextAttestations)
  }
}

function loadProvenance(filePath: string): LoadedSpoolSessionProvenance {
  if (!existsSync(filePath)) {
    return { entries: [], legacyAttestations: [] }
  }
  try {
    hardenExistingSecureFile(filePath)
    if (statSync(filePath).size > MAX_PROVENANCE_FILE_BYTES) {
      return { entries: [], legacyAttestations: [] }
    }
    const value = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown
    if (isProvenanceFile(value)) {
      return value
    }
    if (isLegacyProvenanceFile(value)) {
      return { entries: value.entries, legacyAttestations: [] }
    }
  } catch {
    // Why: provenance is positive proof; corruption must hide sessions, never infer ownership.
  }
  return { entries: [], legacyAttestations: [] }
}

function isProvenanceFile(value: unknown): value is SpoolSessionProvenanceFile {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    record.version === SPOOL_SESSION_PROVENANCE_VERSION &&
    isValidEntryArray(record.entries) &&
    Array.isArray(record.legacyAttestations) &&
    record.legacyAttestations.length <= MAX_LEGACY_ATTESTATIONS &&
    record.legacyAttestations.every(isValidLegacyAttestation)
  )
}

function isLegacyProvenanceFile(value: unknown): value is LegacySpoolSessionProvenanceFile {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  return record.version === 1 && isValidEntryArray(record.entries)
}

function isValidEntryArray(value: unknown): value is SpoolSessionProvenance[] {
  return Array.isArray(value) && value.length <= MAX_PROVENANCE_ENTRIES && value.every(isValidEntry)
}

function isValidEntry(value: unknown): value is SpoolSessionProvenance {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    normalizeExecutionHostId(asString(record.executionHostId)) !== null &&
    (record.provider === 'claude' || record.provider === 'codex') &&
    isBoundedString(record.providerSessionId) &&
    isBoundedString(record.worktreeInstanceId) &&
    isBoundedString(record.spoolIncarnationId)
  )
}

function isValidLegacyAttestation(value: unknown): value is SpoolLegacyPublicationAttestation {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    normalizeExecutionHostId(asString(record.executionHostId)) !== null &&
    isBoundedString(record.worktreeInstanceId) &&
    isBoundedString(record.spoolIncarnationId)
  )
}

function addEntries(
  target: Map<string, SpoolSessionProvenance>,
  entries: readonly SpoolSessionProvenance[]
): boolean {
  let changed = false
  for (const entry of entries) {
    requireValidEntry(entry)
    const key = toSessionKey(entry)
    const existing = target.get(key)
    if (!existing || !sameEntry(existing, entry)) {
      target.set(key, { ...entry })
      changed = true
    }
  }
  return changed
}

function filteredMap<T>(source: ReadonlyMap<string, T>, predicate: (value: T) => boolean) {
  const next = new Map(source)
  for (const [key, value] of next) {
    if (predicate(value)) {
      next.delete(key)
    }
  }
  return next
}

function replaceMap<T>(target: Map<string, T>, source: ReadonlyMap<string, T>): void {
  target.clear()
  for (const [key, value] of source) {
    target.set(key, value)
  }
}

function belongsToAttestation(
  entry: SpoolSessionProvenance,
  attestation: SpoolLegacyPublicationAttestation
): boolean {
  return (
    entry.executionHostId === attestation.executionHostId &&
    entry.worktreeInstanceId === attestation.worktreeInstanceId &&
    entry.spoolIncarnationId === attestation.spoolIncarnationId
  )
}

function sameEntry(left: SpoolSessionProvenance, right: SpoolSessionProvenance): boolean {
  return (
    left.executionHostId === right.executionHostId &&
    left.provider === right.provider &&
    left.providerSessionId === right.providerSessionId &&
    left.worktreeInstanceId === right.worktreeInstanceId &&
    left.spoolIncarnationId === right.spoolIncarnationId
  )
}

function requireValidEntry(entry: SpoolSessionProvenance): void {
  if (!isValidEntry(entry)) {
    throw new Error('Invalid Spool session provenance')
  }
}

function requireValidLegacyAttestation(attestation: SpoolLegacyPublicationAttestation): void {
  if (!isValidLegacyAttestation(attestation)) {
    throw new Error('Invalid legacy Spool session attestation')
  }
}

function isBoundedString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 2048
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function toSessionKey(key: SpoolSessionProvenanceKey): string {
  return JSON.stringify([key.executionHostId, key.provider, key.providerSessionId])
}

function toLegacyAttestationKey(key: SpoolLegacyPublicationAttestation): string {
  return JSON.stringify([key.executionHostId, key.worktreeInstanceId, key.spoolIncarnationId])
}
