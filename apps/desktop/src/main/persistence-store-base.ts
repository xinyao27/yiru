import type { PersistedState } from '~shared/types'

import {
  setMigrationUnsupportedPty,
  setMigrationUnsupportedPtyPersistenceListener
} from './agent-hooks/migration-unsupported-pty-state'
import { agentHookServer } from './agent-hooks/server'
import { DurableStateFile } from './persisted-state/durable-state-file'
import { GitHubCacheFile } from './persisted-state/github-cache-file'
import { PersistedStateNotifications } from './persisted-state/notifications'
import { registerPersistedPaneKeyAlias } from './persistence-compatibility'
import { getDataFile } from './persistence-data-path'
import { normalizePersistedPaneIdentityState } from './persistence-pane-identity'
import type { StoreOptions } from './persistence-store-types'
import {
  getProfileTerminalScrollbackSnapshotRoot,
  type TerminalScrollbackSnapshotStorage
} from './terminal-scrollback-snapshots'

export abstract class StoreBase {
  protected state: PersistedState
  protected readonly dataFile: string
  protected readonly terminalScrollbackSnapshotStorage: TerminalScrollbackSnapshotStorage
  protected readonly durableStateFile: DurableStateFile
  protected readonly githubCacheFile: GitHubCacheFile
  protected readonly notifications = new PersistedStateNotifications()
  protected loadNeedsSave = false

  constructor(options: StoreOptions = {}) {
    // Why: profile switching creates more than one possible state path. Capture
    // the path per Store instance so late async writes cannot follow a global path.
    this.dataFile = options.dataFile ?? getDataFile()
    this.durableStateFile = new DurableStateFile({
      dataFile: this.dataFile,
      readState: () => this.state
    })
    this.githubCacheFile = new GitHubCacheFile(this.dataFile)
    const profileSnapshotRoot = getProfileTerminalScrollbackSnapshotRoot(this.dataFile)
    const legacySnapshotRoot = getProfileTerminalScrollbackSnapshotRoot(getDataFile())
    this.terminalScrollbackSnapshotStorage = {
      snapshotRoot: profileSnapshotRoot,
      fallbackSnapshotRoot: legacySnapshotRoot === profileSnapshotRoot ? null : legacySnapshotRoot
    }
    const loaded = this.load()
    const normalized = normalizePersistedPaneIdentityState(loaded)
    this.state = normalized.state
    const adaptedProjectGroups = this.adaptFlatFolderScanProjectGroups()
    for (const entry of normalized.migrationUnsupportedEntries) {
      setMigrationUnsupportedPty(entry)
    }
    for (const entry of normalized.legacyPaneKeyAliasEntries) {
      registerPersistedPaneKeyAlias(entry)
    }
    setMigrationUnsupportedPtyPersistenceListener((entries) => {
      this.state.migrationUnsupportedPtyEntries = entries
      this.scheduleSave()
    })
    agentHookServer.setPaneKeyAliasPersistenceListener((entries) => {
      this.state.legacyPaneKeyAliasEntries = entries
      this.scheduleSave()
    })
    if (normalized.changed || this.loadNeedsSave || adaptedProjectGroups) {
      // Why: upgraded sessions may contain legacy pane:1 leaves. Rewrite them at
      // the main persistence boundary so older renderer writes cannot revive them.
      // Other one-shot load migrations also set loadNeedsSave to persist their
      // guard flags before the next restart.
      this.scheduleSave()
    }
  }

  protected abstract adaptFlatFolderScanProjectGroups(): boolean
  protected abstract load(): PersistedState
  protected abstract scheduleSave(): void
}
