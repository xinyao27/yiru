import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { VisualRegressionCapture } from '@yiru/runtime-protocol/contract'

import type { ArtifactStore } from '../artifacts/store'
import type { DaemonDatabase } from '../store/database'

const PNG_SIGNATURE = '89504e470d0a1a0a'

type VisualCaptureRow = {
  createdAt: number
  diffRatio: number | null
  height: number
  id: string
  imageArtifactId: string | null
  pageUrl: string
  projectId: string
  width: number
  worktreeId: string
}

export class VisualRegressionStore {
  private readonly artifacts: ArtifactStore
  private readonly capturesPath: string
  private readonly database: DaemonDatabase

  constructor(database: DaemonDatabase, userDataPath: string, artifacts: ArtifactStore) {
    this.artifacts = artifacts
    this.database = database
    this.capturesPath = join(userDataPath, 'visual-captures')
  }

  latest(projectId: string, worktreeId: string): VisualRegressionCapture | null {
    const row = this.database.sqlite
      .query<VisualCaptureRow, [string, string]>(
        `SELECT id, project_id AS projectId, worktree_id AS worktreeId, page_url AS pageUrl,
                width, height, diff_ratio AS diffRatio, image_artifact_id AS imageArtifactId,
                created_at AS createdAt
         FROM visual_capture
         WHERE project_id = ?1 AND worktree_id = ?2
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get(projectId, worktreeId)
    if (!row) {
      return null
    }
    const imageArtifactId = row.imageArtifactId ?? this.migrateLegacyCapture(row)
    return { ...row, imageArtifactId }
  }

  save(input: Omit<VisualRegressionCapture, 'createdAt' | 'id'>): VisualRegressionCapture {
    const artifact = this.artifacts.readyFile(input.imageArtifactId)
    if (!artifact || artifact.projectId !== input.projectId || artifact.mimeType !== 'image/png') {
      throw new Error('visual_capture_artifact_invalid')
    }
    const capture: VisualRegressionCapture = {
      ...input,
      createdAt: Date.now(),
      id: crypto.randomUUID()
    }
    this.database.sqlite
      .query(
        `INSERT INTO visual_capture(
           id, project_id, worktree_id, page_url, width, height, diff_ratio,
           image_artifact_id, created_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
      )
      .run(
        capture.id,
        capture.projectId,
        capture.worktreeId,
        capture.pageUrl,
        capture.width,
        capture.height,
        capture.diffRatio,
        capture.imageArtifactId,
        capture.createdAt
      )
    return capture
  }

  private migrateLegacyCapture(row: VisualCaptureRow): string {
    const legacyPath = join(this.capturesPath, `${row.id}.png`)
    if (!existsSync(legacyPath)) {
      throw new Error('visual_capture_legacy_file_missing')
    }
    const bytes = readFileSync(legacyPath)
    if (bytes.length < 8 || bytes.subarray(0, 8).toString('hex') !== PNG_SIGNATURE) {
      throw new Error('visual_capture_legacy_file_invalid')
    }
    const artifact = this.artifacts.begin({
      fileName: `visual-regression-${row.id}.png`,
      mimeType: 'image/png',
      projectId: row.projectId
    })
    try {
      let offset = 0
      while (offset < bytes.byteLength) {
        const chunk = bytes.subarray(offset, offset + 384 * 1_024)
        this.artifacts.append({ dataBase64: chunk.toString('base64'), id: artifact.id, offset })
        offset += chunk.byteLength
      }
      this.artifacts.complete(artifact.id)
      this.database.sqlite
        .query('UPDATE visual_capture SET image_artifact_id = ?2 WHERE id = ?1')
        .run(row.id, artifact.id)
      return artifact.id
    } catch (error) {
      this.artifacts.abort(artifact.id)
      throw error
    }
  }
}
