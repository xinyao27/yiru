import type { PersistedState } from '@yiru/runtime-protocol/workbench/types'
import {
  setMigrationUnsupportedPty,
  setMigrationUnsupportedPtyPersistenceListener
} from '~main/agents/hooks/migration-unsupported-pty-state'
import { agentHookServer } from '~main/agents/hooks/server'
import { DurableStateFile } from '~main/persisted-state/durable-state-file'
import { GitHubCacheFile } from '~main/persisted-state/github-cache-file'
import { PersistedStateNotifications } from '~main/persisted-state/notifications'
import { PERSISTENCE_REGIONS, type PersistenceRegion } from '~main/persisted-state/regions'
import {
  getProfileTerminalScrollbackSnapshotRoot,
  type TerminalScrollbackSnapshotStorage
} from '~main/terminal/scrollback-snapshots'

import { registerPersistedPaneKeyAlias } from './compatibility'
import { attachStoreSlices, createStoreMethodLookup } from './composition'
import { getDataFile } from './data-path'
import { runLoadPipeline } from './load-pipeline'
import { FolderWorkspaceSlice } from './projects/folder-workspaces'
import { ProjectGroupSlice } from './projects/groups'
import { ProjectRecordSlice } from './projects/project-records'
import { RepoUpdateSlice } from './projects/repo-updates'
import { ProjectRepoSlice } from './projects/repos'
import { SettingsSlice } from './settings/preferences'
import { RateLimitResumeSlice } from './settings/rate-limit-resumes'
import type { PublicSlice } from './slice'
import type { PersistenceRuntime } from './slice'
import type { StoreOptions } from './store-options'
import { StateLifecycleSlice } from './ui-state/lifecycle'
import { UiStateSlice } from './ui-state/state'
import { PtyBindingSlice } from './workspace-sessions/pty-bindings'
import { WorkspaceSessionSlice } from './workspace-sessions/session'
import { WorktreeIdentitySlice } from './worktree-records/identity'
import { WorktreeRecordSlice } from './worktree-records/records'

type StoreSlices = PublicSlice<ProjectRepoSlice> &
  PublicSlice<ProjectGroupSlice> &
  PublicSlice<FolderWorkspaceSlice> &
  PublicSlice<RepoUpdateSlice> &
  PublicSlice<ProjectRecordSlice> &
  PublicSlice<WorktreeRecordSlice> &
  PublicSlice<WorktreeIdentitySlice> &
  PublicSlice<SettingsSlice> &
  PublicSlice<RateLimitResumeSlice> &
  PublicSlice<UiStateSlice> &
  PublicSlice<WorkspaceSessionSlice> &
  PublicSlice<PtyBindingSlice> &
  PublicSlice<StateLifecycleSlice>

class StoreImplementation {
  private readonly durableStateFile: DurableStateFile
  private readonly githubCacheFile: GitHubCacheFile
  private readonly notifications = new PersistedStateNotifications()
  private state: PersistedState
  private readonly terminalScrollbackSnapshotStorage: TerminalScrollbackSnapshotStorage

  constructor(options: StoreOptions = {}) {
    const dataFile = options.dataFile ?? getDataFile()
    this.durableStateFile = new DurableStateFile({
      dataFile,
      readState: () => this.state
    })
    this.githubCacheFile = new GitHubCacheFile(dataFile)
    const profileSnapshotRoot = getProfileTerminalScrollbackSnapshotRoot(dataFile)
    const legacySnapshotRoot = getProfileTerminalScrollbackSnapshotRoot(getDataFile())
    this.terminalScrollbackSnapshotStorage = {
      snapshotRoot: profileSnapshotRoot,
      fallbackSnapshotRoot: legacySnapshotRoot === profileSnapshotRoot ? null : legacySnapshotRoot
    }
    const loaded = runLoadPipeline({
      durableStateFile: this.durableStateFile,
      githubCacheFile: this.githubCacheFile,
      terminalScrollbackSnapshotStorage: this.terminalScrollbackSnapshotStorage
    })
    this.state = loaded.state

    const runtime: PersistenceRuntime = {
      state: this.state,
      scheduleSave: (region) => this.scheduleSave(region),
      flushRegion: (region) => this.durableStateFile.flushRegion(region),
      flushOrThrow: () => this.flushOrThrow()
    }
    const lookupStoreMethod = createStoreMethodLookup(this)
    attachStoreSlices(this, [
      new ProjectRepoSlice(runtime, lookupStoreMethod),
      new ProjectGroupSlice(runtime, lookupStoreMethod),
      new FolderWorkspaceSlice(runtime, lookupStoreMethod),
      new RepoUpdateSlice(runtime, lookupStoreMethod),
      new ProjectRecordSlice(runtime, lookupStoreMethod),
      new WorktreeRecordSlice(runtime, lookupStoreMethod),
      new WorktreeIdentitySlice(runtime, lookupStoreMethod),
      new SettingsSlice(runtime, lookupStoreMethod, this.notifications),
      new RateLimitResumeSlice(runtime, lookupStoreMethod),
      new UiStateSlice(runtime, lookupStoreMethod, this.githubCacheFile, this.notifications),
      new WorkspaceSessionSlice(runtime, lookupStoreMethod, this.terminalScrollbackSnapshotStorage),
      new PtyBindingSlice(runtime, lookupStoreMethod),
      new StateLifecycleSlice(
        runtime,
        lookupStoreMethod,
        this.durableStateFile,
        this.githubCacheFile
      )
    ])
    for (const entry of loaded.migrationUnsupportedEntries) {
      setMigrationUnsupportedPty(entry)
    }
    for (const entry of loaded.legacyPaneKeyAliasEntries) {
      registerPersistedPaneKeyAlias(entry)
    }
    this.registerPersistenceListeners()
    if (loaded.changed || this.durableStateFile.requiresLegacyMigration) {
      // Why: all one-shot migrations share this single durable save decision.
      for (const region of PERSISTENCE_REGIONS) {
        this.scheduleSave(region)
      }
    }
  }

  flushOrThrow(): void {
    this.durableStateFile.flushOrThrow()
  }

  private registerPersistenceListeners(): void {
    setMigrationUnsupportedPtyPersistenceListener((entries) => {
      this.state.migrationUnsupportedPtyEntries = entries
      this.scheduleSave('runtime')
    })
    agentHookServer.setPaneKeyAliasPersistenceListener((entries) => {
      this.state.legacyPaneKeyAliasEntries = entries
      this.scheduleSave('runtime')
    })
  }

  private scheduleSave(region: PersistenceRegion): void {
    this.durableStateFile.scheduleSave(region)
  }
}

export type Store = StoreImplementation & StoreSlices

type StoreConstructor = new (options?: StoreOptions) => Store

// Why: runtime composition keeps slice ownership narrow while preserving `new Store()`.
export const Store = StoreImplementation as unknown as StoreConstructor
