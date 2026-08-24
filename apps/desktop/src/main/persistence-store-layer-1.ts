import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'

import { isPathInsideOrEqual } from '@yiru/workbench-model/platform'
import { normalizeExecutionHostId } from '@yiru/workbench-model/workspace'
import { normalizeProjectRuntimePreference } from '~shared/project-execution-runtime'
import { clearMissingProjectGroupMemberships, createProjectGroup } from '~shared/project-groups'
import { isFolderRepo } from '~shared/repo-kind'
import type {
  PersistedState,
  Project,
  ProjectUpdateArgs,
  ProjectHostSetup,
  ProjectHostSetupCreateArgs,
  ProjectHostSetupCreateResult,
  Repo
} from '~shared/types'
import { pruneWorkspaceSessionBrowserHistory } from '~shared/workspace/session-browser-history'
import { pruneLocalTerminalScrollbackBuffers } from '~shared/workspace/session-terminal-buffers'

import { decodePersistedState } from './persisted-state/codec'
import {
  projectHostSetupCompatibilityStateEqual,
  mergeProjectHostSetupCompatibilityState,
  makeProjectHostSetupId
} from './persistence-compatibility'
import { gcStaleWorktreeMeta } from './persistence-data-path'
import { StoreContract } from './persistence-store-contract'
import { backfillFolderScopeConnectionIds } from './persistence-terminal-migration'
import { createNestedProjectGroupResolver } from './project-groups/nested-repo-import'
import { migrateWorkspaceSessionTerminalScrollbackSnapshots } from './terminal-scrollback-snapshots'

export abstract class StoreLayer1 extends StoreContract {
  protected adaptFlatFolderScanProjectGroups(): boolean {
    // Why: older folder imports persisted a real parent path but kept all repos
    // flat. Upgrade that shape into v1 sparse folder scopes on load.
    const groups = this.state.projectGroups ?? []
    const repos = this.state.repos
    if (groups.length === 0 || repos.length === 0) {
      return false
    }

    let changed = false
    let maxOrder = -1
    for (const group of groups) {
      maxOrder = Math.max(maxOrder, group.tabOrder)
    }

    const childGroupIds = new Set(
      groups.flatMap((group) => (group.parentGroupId ? [group.parentGroupId] : []))
    )
    const initialGroupCount = groups.length
    for (let groupIndex = 0; groupIndex < initialGroupCount; groupIndex += 1) {
      const rootGroup = groups[groupIndex]
      if (!rootGroup) {
        continue
      }
      if (
        rootGroup.createdFrom !== 'folder-scan' ||
        !rootGroup.parentPath ||
        rootGroup.parentGroupId ||
        childGroupIds.has(rootGroup.id)
      ) {
        continue
      }
      const rootPath = rootGroup.parentPath
      const repoCandidates = repos.filter(
        (repo) =>
          !isFolderRepo(repo) &&
          repo.projectGroupId === rootGroup.id &&
          isPathInsideOrEqual(rootPath, repo.path)
      )
      if (repoCandidates.length < 2) {
        continue
      }

      const resolver = createNestedProjectGroupResolver({
        parentPath: rootPath,
        groupName: rootGroup.name,
        mode: 'group',
        repoPaths: repoCandidates.map((repo) => repo.path),
        createGroup: (input) => {
          if (!input.parentGroupId) {
            return rootGroup
          }
          maxOrder += 1
          const group = createProjectGroup({
            ...input,
            tabOrder: maxOrder
          })
          groups.push(group)
          changed = true
          return group
        }
      })
      const nextOrderByGroupId = new Map<string, number>()
      for (const repo of repoCandidates) {
        const group = resolver.getGroupForRepo(repo.path)
        if (!group) {
          continue
        }
        const nextOrder = nextOrderByGroupId.get(group.id) ?? 0
        nextOrderByGroupId.set(group.id, nextOrder + 1)
        if (repo.projectGroupId !== group.id || repo.projectGroupOrder !== nextOrder) {
          repo.projectGroupId = group.id
          repo.projectGroupOrder = nextOrder
          changed = true
        }
      }
    }
    return changed
  }

  protected load(): PersistedState {
    // Capture once, at the top: this is the unambiguous "has the user run
    // Yiru before?" signal used by the telemetry cohort migration below.
    // Field-based inference (e.g., `settings.telemetry` presence) does not
    // work on the telemetry release itself — `telemetry` is new here, so it
    // would be absent on every pre-telemetry install and misclassify existing
    // users as fresh, flipping them to default-on in violation of the
    // social contract we installed them under.
    const decoded = this.durableStateFile.readDecoded(({ value, fileExistedOnLoad }) =>
      decodePersistedState(value, {
        homeDir: homedir(),
        platform: process.platform,
        fileExistedOnLoad,
        createInstallId: randomUUID
      })
    )
    this.loadNeedsSave ||= decoded.needsSave
    for (const warning of decoded.warnings) {
      const scope = warning.hostId ? ` for host ${warning.hostId}` : ''
      console.error(`[persistence] ${warning.code}${scope}:`, warning.detail)
    }
    let result = decoded.state

    const workspaceSession = pruneWorkspaceSessionBrowserHistory(
      pruneLocalTerminalScrollbackBuffers(result.workspaceSession, result.repos)
    )
    const migratedScrollback = migrateWorkspaceSessionTerminalScrollbackSnapshots(
      workspaceSession,
      this.terminalScrollbackSnapshotStorage
    )
    if (migratedScrollback.changed) {
      this.loadNeedsSave = true
    }

    const repos = clearMissingProjectGroupMemberships(result.repos, result.projectGroups ?? [])
    const projectHostSetupCompatibility = mergeProjectHostSetupCompatibilityState(result, repos)
    if (!projectHostSetupCompatibilityStateEqual(result, projectHostSetupCompatibility)) {
      this.loadNeedsSave = true
    }

    const folderScopeConnectionMigration = backfillFolderScopeConnectionIds({
      ...result,
      repos,
      ...projectHostSetupCompatibility,
      workspaceSession: migratedScrollback.session
    })
    if (folderScopeConnectionMigration.changed) {
      this.loadNeedsSave = true
    }
    result = folderScopeConnectionMigration.state

    if (gcStaleWorktreeMeta(result) > 0) {
      this.loadNeedsSave = true
    }

    // githubCache lives in a sidecar file now. A
    // legacy in-file cache (pre-sidecar build, or a downgrade round-trip) is
    // kept as this session's seed and stripped from the durable file by the
    // save scheduled below; otherwise seed from the sidecar snapshot.
    const legacyCache = result.githubCache
    const hasLegacyCache = Object.keys(legacyCache?.pr ?? {}).length > 0
    if (hasLegacyCache) {
      this.loadNeedsSave = true
      // Why: mark dirty so the first flush writes the sidecar even if no
      // poll refresh happens this session — the seed survives the migration.
      this.githubCacheFile.markDirty()
    } else {
      result.githubCache = this.githubCacheFile.read() ?? result.githubCache
    }

    this.durableStateFile.logLoaded(result)
    return result
  }

  protected scheduleSave(): void {
    this.durableStateFile.scheduleSave()
  }

  flushOrThrow(): void {
    this.durableStateFile.flushOrThrow()
  }

  // ── Repos ──────────────────────────────────────────────────────────

  getRepos(): Repo[] {
    return this.state.repos.map((repo) => this.hydrateRepo(repo))
  }

  getProjects(): Project[] {
    return [...this.state.projects]
  }

  updateProject(id: string, updates: ProjectUpdateArgs['updates']): Project | null {
    const project = this.state.projects.find((entry) => entry.id === id)
    if (!project) {
      return null
    }
    if ('localWindowsRuntimePreference' in updates) {
      if (updates.localWindowsRuntimePreference === undefined) {
        delete project.localWindowsRuntimePreference
      } else {
        project.localWindowsRuntimePreference = normalizeProjectRuntimePreference(
          updates.localWindowsRuntimePreference
        )
      }
    }
    project.updatedAt = Date.now()
    this.scheduleSave()
    return { ...project }
  }

  getProjectHostSetups(): ProjectHostSetup[] {
    return [...this.state.projectHostSetups]
  }

  createProjectHostSetup(args: ProjectHostSetupCreateArgs): ProjectHostSetupCreateResult | null {
    const project = this.state.projects.find((entry) => entry.id === args.projectId)
    if (!project) {
      return null
    }
    const hostId = normalizeExecutionHostId(args.hostId)
    if (!hostId) {
      throw new Error(`Invalid host ID: ${args.hostId}`)
    }
    const duplicateSetup = this.state.projectHostSetups.find(
      (entry) => entry.projectId === project.id && entry.hostId === hostId
    )
    if (duplicateSetup) {
      throw new Error(`Project host setup already exists: ${duplicateSetup.id}`)
    }
    const now = Date.now()
    const existingIds = new Set(this.state.projectHostSetups.map((entry) => entry.id))
    const setup: ProjectHostSetup = {
      id: makeProjectHostSetupId(project.id, hostId, existingIds, args.setupId),
      projectId: project.id,
      hostId,
      repoId: '',
      path: args.path?.trim() ?? '',
      displayName: args.displayName?.trim() || project.displayName,
      ...(args.kind ? { kind: args.kind } : {}),
      ...(args.worktreeBasePath?.trim() ? { worktreeBasePath: args.worktreeBasePath.trim() } : {}),
      ...(args.gitUsername?.trim() ? { gitUsername: args.gitUsername.trim() } : {}),
      setupState: args.setupState ?? 'not-set-up',
      setupMethod: args.setupMethod ?? 'provisioned',
      createdAt: now,
      updatedAt: now
    }
    // Why: this is the first non-repo-backed setup creation path; it must
    // persist independently so future repo projection sync does not erase it.
    this.state.projectHostSetups.push(setup)
    this.scheduleSave()
    return { project, setup }
  }
}
