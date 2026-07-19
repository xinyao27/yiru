import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { hardenExistingSecureFile, writeSecureJsonFile } from '../../shared/secure-file'
import { collectLegacyProvenanceCandidates } from './spool-legacy-provenance-merge'
import {
  sameSpoolSessionProvenance,
  spoolLegacyAttestationKey,
  spoolSessionProvenanceKey
} from './spool-session-provenance-identity'

const SPOOL_SESSION_PROVENANCE_FILENAME = 'spool-session-provenance.json'
const SPOOL_SESSION_PROVENANCE_VERSION = 3
const MAX_PROVENANCE_FILE_BYTES = 8 * 1024 * 1024
export const SPOOL_SESSION_PROVENANCE_MAX_ENTRIES = 50_000
const MAX_LEGACY_ATTESTATIONS = 10_000

export type SpoolProvenanceProvider = 'claude' | 'codex'

export type SpoolSessionProvenanceKey = {
  actualHostScope: string
  provider: SpoolProvenanceProvider
  providerSessionId: string
}

export type SpoolSessionProvenance = SpoolSessionProvenanceKey & {
  worktreeInstanceId: string
  spoolIncarnationId: string
}

export type SpoolLegacyPublicationAttestation = {
  actualHostScope: string
  worktreeInstanceId: string
  spoolIncarnationId: string
}

export type SpoolLegacyPublicationProof = {
  attestation: SpoolLegacyPublicationAttestation
  entries: readonly SpoolSessionProvenance[]
  forceRefresh?: boolean
}

type SpoolSessionProvenanceFile = {
  version: typeof SPOOL_SESSION_PROVENANCE_VERSION
  entries: SpoolSessionProvenance[]
  legacyAttestations: SpoolLegacyPublicationAttestation[]
}

type LegacySpoolSessionProvenanceFile = {
  version: 1 | 2
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
      this.entries.set(spoolSessionProvenanceKey(entry), entry)
    }
    for (const attestation of loaded.legacyAttestations) {
      this.legacyAttestations.set(spoolLegacyAttestationKey(attestation), attestation)
    }
  }

  resolve(key: SpoolSessionProvenanceKey): SpoolSessionProvenance | null {
    const entry = this.entries.get(spoolSessionProvenanceKey(key))
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
    return this.legacyAttestations.has(spoolLegacyAttestationKey(attestation))
  }

  attestLegacyPublicationProofs(publications: readonly SpoolLegacyPublicationProof[]): boolean {
    const pending = publications.filter(({ attestation, forceRefresh }) => {
      requireValidLegacyAttestation(attestation)
      return forceRefresh || !this.legacyAttestations.has(spoolLegacyAttestationKey(attestation))
    })
    if (pending.length === 0) {
      return false
    }
    for (const { entries } of pending) {
      for (const entry of entries) {
        requireValidEntry(entry)
      }
    }
    const candidates = collectLegacyProvenanceCandidates(pending)
    const nextEntries = new Map(this.entries)
    for (const [key, entry] of candidates) {
      // Why: a live/current durable proof always wins over a stale legacy scan.
      if (entry && !nextEntries.has(key)) {
        nextEntries.set(key, { ...entry })
      }
    }
    if (nextEntries.size === this.entries.size) {
      return false
    }
    this.commit(nextEntries, new Map(this.legacyAttestations))
    return true
  }

  completeLegacyPublications(attestations: readonly SpoolLegacyPublicationAttestation[]): boolean {
    const nextAttestations = new Map(this.legacyAttestations)
    for (const attestation of attestations) {
      requireValidLegacyAttestation(attestation)
      nextAttestations.set(spoolLegacyAttestationKey(attestation), { ...attestation })
    }
    if (nextAttestations.size === this.legacyAttestations.size) {
      return false
    }
    this.commit(new Map(this.entries), nextAttestations)
    return true
  }

  remove(key: SpoolSessionProvenanceKey): void {
    const nextEntries = new Map(this.entries)
    if (nextEntries.delete(spoolSessionProvenanceKey(key))) {
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
      nextEntries.size > SPOOL_SESSION_PROVENANCE_MAX_ENTRIES ||
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
      // Why: old route-only host keys cannot distinguish native, WSL, or paired inner hosts.
      return { entries: [], legacyAttestations: [] }
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
  return record.version === 1 || record.version === 2
}

function isValidEntryArray(value: unknown): value is SpoolSessionProvenance[] {
  return (
    Array.isArray(value) &&
    value.length <= SPOOL_SESSION_PROVENANCE_MAX_ENTRIES &&
    value.every(isValidEntry)
  )
}

function isValidEntry(value: unknown): value is SpoolSessionProvenance {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    isBoundedActualHostScope(record.actualHostScope) &&
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
    isBoundedActualHostScope(record.actualHostScope) &&
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
    const key = spoolSessionProvenanceKey(entry)
    const existing = target.get(key)
    if (!existing || !sameSpoolSessionProvenance(existing, entry)) {
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
  return (
    typeof value === 'string' && value.length > 0 && value.length <= 2048 && !value.includes('\0')
  )
}

function isBoundedActualHostScope(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= 4096 && !value.includes('\0')
  )
}
