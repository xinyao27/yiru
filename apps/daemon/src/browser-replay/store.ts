import type { BrowserReplay } from '@yiru/runtime-protocol/contract'

import type { DaemonDatabase } from '../store/database'

type BrowserReplayRow = {
  createdAt: number
  endedAt: number
  eventsJson: string
  id: string
  pageTitle: string
  pageUrl: string
  projectId: string
  startedAt: number
  videoArtifactId: string | null
}

export class BrowserReplayStore {
  private readonly database: DaemonDatabase

  constructor(database: DaemonDatabase) {
    this.database = database
  }

  save(
    input: Omit<BrowserReplay, 'createdAt' | 'id' | 'videoArtifactId'> & {
      videoArtifactId?: string | null
    }
  ): BrowserReplay {
    const recording: BrowserReplay = {
      ...input,
      createdAt: Date.now(),
      id: crypto.randomUUID(),
      videoArtifactId: input.videoArtifactId ?? null
    }
    this.database.sqlite
      .query(
        `INSERT INTO browser_replay(
           id, project_id, page_url, page_title, started_at, ended_at, events_json,
           video_artifact_id, created_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
      )
      .run(
        recording.id,
        recording.projectId,
        recording.pageUrl,
        recording.pageTitle,
        recording.startedAt,
        recording.endedAt,
        JSON.stringify(recording.events),
        recording.videoArtifactId,
        recording.createdAt
      )
    return recording
  }

  list(projectId: string, limit = 20): BrowserReplay[] {
    return this.database.sqlite
      .query<BrowserReplayRow, [string, number]>(
        `SELECT id, project_id AS projectId, page_url AS pageUrl, page_title AS pageTitle,
                started_at AS startedAt, ended_at AS endedAt, events_json AS eventsJson,
                video_artifact_id AS videoArtifactId, created_at AS createdAt
         FROM browser_replay
         WHERE project_id = ?1
         ORDER BY created_at DESC
         LIMIT ?2`
      )
      .all(projectId, Math.max(1, Math.min(Math.floor(limit), 100)))
      .map(hydrateReplay)
  }

  get(id: string): BrowserReplay | null {
    const row = this.database.sqlite
      .query<BrowserReplayRow, [string]>(
        `SELECT id, project_id AS projectId, page_url AS pageUrl, page_title AS pageTitle,
                started_at AS startedAt, ended_at AS endedAt, events_json AS eventsJson,
                video_artifact_id AS videoArtifactId, created_at AS createdAt
         FROM browser_replay
         WHERE id = ?1`
      )
      .get(id)
    return row ? hydrateReplay(row) : null
  }
}

function hydrateReplay(row: BrowserReplayRow): BrowserReplay {
  return {
    createdAt: row.createdAt,
    endedAt: row.endedAt,
    events: parseEvents(row.eventsJson),
    id: row.id,
    pageTitle: row.pageTitle,
    pageUrl: row.pageUrl,
    projectId: row.projectId,
    startedAt: row.startedAt,
    videoArtifactId: row.videoArtifactId
  }
}

function parseEvents(serialized: string): BrowserReplay['events'] {
  const value: unknown = JSON.parse(serialized)
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      return []
    }
    const at = Reflect.get(entry, 'at')
    const kind = Reflect.get(entry, 'kind')
    const selector = Reflect.get(entry, 'selector')
    const key = Reflect.get(entry, 'key')
    const eventValue = Reflect.get(entry, 'value')
    if (
      typeof at !== 'number' ||
      !['click', 'input', 'keydown'].includes(typeof kind === 'string' ? kind : '') ||
      typeof selector !== 'string'
    ) {
      return []
    }
    return [
      {
        at,
        kind: kind === 'click' ? 'click' : kind === 'input' ? 'input' : 'keydown',
        selector,
        ...(typeof key === 'string' ? { key } : {}),
        ...(typeof eventValue === 'string' ? { value: eventValue } : {})
      }
    ]
  })
}
