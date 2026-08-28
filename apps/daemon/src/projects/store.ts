import type { RuntimeRepo } from '@yiru/runtime-protocol/contract'
import type { ExecutionHostId } from '@yiru/runtime-protocol/model/workspace'

import { normalizeGitRemote, type GitRemoteIdentity } from '../git/repo/remote-identity'
import { runGit } from '../git/runner/command'
import type { Host } from '../hosts/contract'
import type { HostRegistry } from '../hosts/registry'
import type { DaemonDatabase } from '../store/database'

const DEFAULT_PROJECT_BADGE_COLOR = '#737373'

type ProjectRow = {
  addedAt: number
  badgeColor: string
  displayName: string
  id: string
  kind: 'git' | 'folder'
  hostId: ExecutionHostId
  path: string
  remoteUrl: string | null
}

export class ProjectStore {
  private readonly database: DaemonDatabase
  private readonly hosts: HostRegistry

  constructor(database: DaemonDatabase, hosts: HostRegistry) {
    this.database = database
    this.hosts = hosts
  }

  list(): RuntimeRepo[] {
    return this.database.sqlite
      .query<ProjectRow, []>(
        `SELECT id, path, host_id AS hostId, display_name AS displayName, badge_color AS badgeColor,
                kind, remote_url AS remoteUrl, added_at AS addedAt
         FROM project
         ORDER BY added_at ASC`
      )
      .all()
      .map(toRuntimeRepo)
  }

  syncWorkbenchCatalog(repos: RuntimeRepo[]): void {
    const repoIds = new Set(repos.map((repo) => repo.id))
    this.database.sqlite.transaction(() => {
      const upsert = this.database.sqlite.query(
        `INSERT INTO project(
           id, path, host_id, display_name, badge_color, kind, remote_url, added_at, authority
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'workbench')
         ON CONFLICT(id) DO UPDATE SET
           path = excluded.path,
           host_id = excluded.host_id,
           display_name = excluded.display_name,
           badge_color = excluded.badge_color,
           kind = excluded.kind,
           remote_url = excluded.remote_url,
           added_at = excluded.added_at,
           authority = 'workbench'`
      )
      for (const repo of repos) {
        upsert.run(
          repo.id,
          repo.path,
          repo.executionHostId ?? 'local',
          repo.displayName,
          repo.badgeColor,
          repo.kind ?? 'git',
          repo.gitRemoteIdentity?.remoteUrl ?? null,
          repo.addedAt
        )
        this.replaceProjectedRemote(repo)
      }
      const projected = this.database.sqlite
        .query<{ id: string }, []>("SELECT id FROM project WHERE authority = 'workbench'")
        .all()
      const remove = this.database.sqlite.query('DELETE FROM project WHERE id = ?1')
      for (const project of projected) {
        if (!repoIds.has(project.id)) {
          remove.run(project.id)
        }
      }
    })()
  }

  get(selector: string): RuntimeRepo {
    const normalized = selector.startsWith('id:') ? selector.slice(3) : selector
    const matches = this.list().filter(
      (project) =>
        project.id === normalized ||
        project.path === normalized ||
        project.displayName === normalized
    )
    if (matches.length !== 1) {
      throw new Error(matches.length === 0 ? 'project_not_found' : 'project_selector_ambiguous')
    }
    return matches[0]
  }

  async add(
    path: string,
    kind: 'git' | 'folder' = 'git',
    hostId: ExecutionHostId = 'local'
  ): Promise<RuntimeRepo> {
    const host = this.hosts.get(hostId)
    const canonicalPath = await host.canonicalDirectory(path)
    if (kind === 'git') {
      await runGit(canonicalPath, ['rev-parse', '--show-toplevel'], undefined, host)
    }
    const existing = this.list().find(
      (project) => project.path === canonicalPath && project.executionHostId === host.id
    )
    if (existing) {
      return existing
    }
    const remotes = kind === 'git' ? await readRemotes(canonicalPath, host) : []
    const primaryRemote = remotes.find((remote) => remote.remoteName === 'origin') ?? remotes[0]
    const project: RuntimeRepo = {
      addedAt: Date.now(),
      badgeColor: DEFAULT_PROJECT_BADGE_COLOR,
      displayName: host.basename(canonicalPath),
      executionHostId: host.id,
      externalWorktreeVisibility: 'hide',
      id: crypto.randomUUID(),
      kind,
      path: canonicalPath,
      ...(primaryRemote
        ? {
            gitRemoteIdentity: primaryRemote
          }
        : {})
    }
    this.database.sqlite
      .query(
        `INSERT INTO project(id, path, host_id, display_name, badge_color, kind, remote_url, added_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
      )
      .run(
        project.id,
        project.path,
        host.id,
        project.displayName,
        project.badgeColor,
        kind,
        primaryRemote?.remoteUrl ?? null,
        project.addedAt
      )
    this.replaceRemotes(project.id, remotes)
    return project
  }

  async resolveByRemote(canonicalKey: string): Promise<RuntimeRepo[]> {
    const projects = this.list()
    await Promise.all(
      projects
        .filter((project) => project.kind !== 'folder')
        .map(async (project) =>
          this.replaceRemotes(
            project.id,
            await readRemotes(project.path, this.hosts.get(project.executionHostId))
          )
        )
    )
    const rows = this.database.sqlite
      .query<{ projectId: string }, [string]>(
        `SELECT DISTINCT project_id AS projectId
         FROM project_remote
         WHERE canonical_key = ?1`
      )
      .all(canonicalKey)
    const ids = new Set(rows.map((row) => row.projectId))
    return projects.filter((project) => ids.has(project.id))
  }

  private replaceRemotes(projectId: string, remotes: GitRemoteIdentity[]): void {
    this.database.sqlite.transaction(() => {
      this.database.sqlite.query('DELETE FROM project_remote WHERE project_id = ?1').run(projectId)
      const insert = this.database.sqlite.query(
        `INSERT INTO project_remote(project_id, remote_name, remote_url, canonical_key)
         VALUES (?1, ?2, ?3, ?4)`
      )
      for (const remote of remotes) {
        insert.run(projectId, remote.remoteName, remote.remoteUrl, remote.canonicalKey)
      }
    })()
  }

  private replaceProjectedRemote(repo: RuntimeRepo): void {
    this.database.sqlite.query('DELETE FROM project_remote WHERE project_id = ?1').run(repo.id)
    const identity = repo.gitRemoteIdentity
    if (!identity) {
      return
    }
    this.database.sqlite
      .query(
        `INSERT INTO project_remote(project_id, remote_name, remote_url, canonical_key)
         VALUES (?1, ?2, ?3, ?4)`
      )
      .run(repo.id, identity.remoteName, identity.remoteUrl, identity.canonicalKey)
  }
}

async function readRemotes(path: string, host: Host): Promise<GitRemoteIdentity[]> {
  try {
    const names = (await runGit(path, ['remote'], undefined, host)).stdout
      .split('\n')
      .map((name) => name.trim())
      .filter(Boolean)
    const remoteGroups = await Promise.all(
      names.map(async (name) => {
        const urls = (
          await runGit(path, ['remote', 'get-url', '--all', name], undefined, host)
        ).stdout
          .split('\n')
          .map((url) => url.trim())
          .filter(Boolean)
        return urls.flatMap((url) => {
          const identity = normalizeGitRemote(name, url)
          return identity ? [identity] : []
        })
      })
    )
    return remoteGroups.flat()
  } catch {
    return []
  }
}

function toRuntimeRepo(row: ProjectRow): RuntimeRepo {
  return {
    addedAt: row.addedAt,
    badgeColor: row.badgeColor,
    displayName: row.displayName,
    executionHostId: row.hostId,
    externalWorktreeVisibility: 'hide',
    id: row.id,
    kind: row.kind,
    path: row.path,
    ...(row.remoteUrl ? { gitRemoteIdentity: normalizeGitRemote('origin', row.remoteUrl) } : {})
  }
}
