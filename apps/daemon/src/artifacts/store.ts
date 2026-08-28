import {
  appendFileSync,
  chmodSync,
  existsSync,
  closeSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'

import type { RuntimeArtifact } from '@yiru/runtime-protocol/contract'

import type { DaemonDatabase } from '../store/database'

const MAX_ARTIFACT_BYTES = 100 * 1024 * 1024
const MAX_CHUNK_BYTES = 512 * 1024
const DOWNLOAD_TICKET_TTL_MS = 5 * 60_000

type ArtifactRow = {
  byteLength: number
  createdAt: number
  fileName: string
  id: string
  mimeType: string
  projectId: string
  status: RuntimeArtifact['status']
}

export type ReadyArtifactFile = RuntimeArtifact & { path: string }

export class ArtifactStore {
  private readonly database: DaemonDatabase
  private readonly directory: string
  private readonly downloadTickets = new Map<string, { artifactId: string; expiresAt: number }>()

  constructor(database: DaemonDatabase, userDataPath: string) {
    this.database = database
    this.directory = join(userDataPath, 'artifacts')
    mkdirSync(this.directory, { mode: 0o700, recursive: true })
    this.clearInterruptedWrites()
  }

  begin(input: { fileName: string; mimeType: string; projectId: string }): RuntimeArtifact {
    const artifact: RuntimeArtifact = {
      byteLength: 0,
      createdAt: Date.now(),
      fileName: input.fileName,
      id: crypto.randomUUID(),
      mimeType: input.mimeType,
      projectId: input.projectId,
      status: 'writing'
    }
    const path = this.writingPath(artifact.id)
    writeFileSync(path, new Uint8Array(), { mode: 0o600 })
    try {
      this.database.sqlite
        .query(
          `INSERT INTO artifact(
             id, project_id, file_name, mime_type, byte_length, status, created_at
           ) VALUES (?1, ?2, ?3, ?4, 0, 'writing', ?5)`
        )
        .run(
          artifact.id,
          artifact.projectId,
          artifact.fileName,
          artifact.mimeType,
          artifact.createdAt
        )
    } catch (error) {
      unlinkSync(path)
      throw error
    }
    return artifact
  }

  abort(id: string): boolean {
    const artifact = this.getOrNull(id)
    if (!artifact || artifact.status !== 'writing') {
      return false
    }
    const path = this.writingPath(id)
    if (existsSync(path)) {
      unlinkSync(path)
    }
    this.database.sqlite.query("DELETE FROM artifact WHERE id = ?1 AND status = 'writing'").run(id)
    return true
  }

  append(input: { dataBase64: string; id: string; offset: number }): RuntimeArtifact {
    const artifact = this.get(input.id)
    if (artifact.status !== 'writing' || artifact.byteLength !== input.offset) {
      throw new Error('artifact_append_offset_conflict')
    }
    const bytes = decodeBase64(input.dataBase64)
    if (
      bytes.byteLength === 0 ||
      bytes.byteLength > MAX_CHUNK_BYTES ||
      artifact.byteLength + bytes.byteLength > MAX_ARTIFACT_BYTES
    ) {
      throw new Error('artifact_chunk_size_invalid')
    }
    appendFileSync(this.writingPath(input.id), bytes)
    const byteLength = artifact.byteLength + bytes.byteLength
    this.database.sqlite
      .query("UPDATE artifact SET byte_length = ?2 WHERE id = ?1 AND status = 'writing'")
      .run(input.id, byteLength)
    return { ...artifact, byteLength }
  }

  complete(id: string): RuntimeArtifact {
    const artifact = this.get(id)
    if (artifact.status !== 'writing') {
      return artifact
    }
    const writingPath = this.writingPath(id)
    if (statSync(writingPath).size !== artifact.byteLength) {
      throw new Error('artifact_byte_length_mismatch')
    }
    const readyPath = this.readyPath(id)
    renameSync(writingPath, readyPath)
    chmodSync(readyPath, 0o600)
    this.database.sqlite
      .query("UPDATE artifact SET status = 'ready' WHERE id = ?1 AND status = 'writing'")
      .run(id)
    return { ...artifact, status: 'ready' }
  }

  issueDownloadTicket(id: string): { expiresAt: number; ticket: string } {
    if (!this.readyFile(id)) {
      throw new Error('artifact_not_found')
    }
    const expiresAt = Date.now() + DOWNLOAD_TICKET_TTL_MS
    const ticket = crypto.getRandomValues(new Uint8Array(24)).toHex()
    this.downloadTickets.set(ticket, { artifactId: id, expiresAt })
    for (const [candidate, entry] of this.downloadTickets) {
      if (entry.expiresAt < Date.now()) {
        this.downloadTickets.delete(candidate)
      }
    }
    return { expiresAt, ticket }
  }

  consumeDownloadTicket(id: string, ticket: string | null): ReadyArtifactFile | null {
    if (!ticket) {
      return null
    }
    const entry = this.downloadTickets.get(ticket)
    this.downloadTickets.delete(ticket)
    return entry?.artifactId === id && entry.expiresAt >= Date.now() ? this.readyFile(id) : null
  }

  list(projectId: string, limit = 50): RuntimeArtifact[] {
    return this.database.sqlite
      .query<ArtifactRow, [string, number]>(
        `SELECT id, project_id AS projectId, file_name AS fileName, mime_type AS mimeType,
                byte_length AS byteLength, status, created_at AS createdAt
         FROM artifact WHERE project_id = ?1 AND status = 'ready'
         ORDER BY created_at DESC LIMIT ?2`
      )
      .all(projectId, Math.max(1, Math.min(Math.floor(limit), 100)))
  }

  readyFile(id: string): ReadyArtifactFile | null {
    const artifact = this.getOrNull(id)
    const path = this.readyPath(id)
    return artifact?.status === 'ready' && existsSync(path) ? { ...artifact, path } : null
  }

  read(input: { id: string; limit: number; offset: number }): {
    dataBase64: string
    eof: boolean
    mimeType: string
    nextOffset: number
  } {
    const artifact = this.readyFile(input.id)
    if (!artifact) {
      throw new Error('artifact_not_found')
    }
    if (input.offset > artifact.byteLength) {
      throw new Error('artifact_read_offset_invalid')
    }
    const length = Math.min(input.limit, artifact.byteLength - input.offset)
    const bytes = Buffer.allocUnsafe(length)
    const descriptor = openSync(artifact.path, 'r')
    try {
      const readLength = readSync(descriptor, bytes, 0, length, input.offset)
      const nextOffset = input.offset + readLength
      return {
        dataBase64: bytes.subarray(0, readLength).toString('base64'),
        eof: nextOffset >= artifact.byteLength,
        mimeType: artifact.mimeType,
        nextOffset
      }
    } finally {
      closeSync(descriptor)
    }
  }

  private get(id: string): RuntimeArtifact {
    const artifact = this.getOrNull(id)
    if (!artifact) {
      throw new Error('artifact_not_found')
    }
    return artifact
  }

  private getOrNull(id: string): RuntimeArtifact | null {
    return (
      this.database.sqlite
        .query<ArtifactRow, [string]>(
          `SELECT id, project_id AS projectId, file_name AS fileName, mime_type AS mimeType,
                  byte_length AS byteLength, status, created_at AS createdAt
           FROM artifact WHERE id = ?1`
        )
        .get(id) ?? null
    )
  }

  private writingPath(id: string): string {
    return join(this.directory, `${id}.part`)
  }

  private readyPath(id: string): string {
    return join(this.directory, `${id}.artifact`)
  }

  private clearInterruptedWrites(): void {
    this.database.sqlite.query("DELETE FROM artifact WHERE status = 'writing'").run()
    for (const fileName of readdirSync(this.directory)) {
      if (fileName.endsWith('.part')) {
        unlinkSync(join(this.directory, fileName))
      }
    }
  }
}

function decodeBase64(value: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new Error('artifact_base64_invalid')
  }
  const bytes = Buffer.from(value, 'base64')
  if (bytes.toString('base64') !== value) {
    throw new Error('artifact_base64_invalid')
  }
  return bytes
}
