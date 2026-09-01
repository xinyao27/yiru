import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'

import type { MigrationUnsupportedPtyEntry } from '@yiru/runtime-protocol/model/agent'
import { clearMissingProjectGroupMemberships } from '@yiru/runtime-protocol/workbench/project-groups'
import type {
  LegacyPaneKeyAliasEntry,
  PersistedState
} from '@yiru/runtime-protocol/workbench/types'
import { pruneWorkspaceSessionBrowserHistory } from '@yiru/runtime-protocol/workbench/workspace/session-browser-history'
import { pruneLocalTerminalScrollbackBuffers } from '@yiru/runtime-protocol/workbench/workspace/session-terminal-buffers'
import { decodePersistedState } from '~main/persisted-state/codec'
import type { DurableStateFile } from '~main/persisted-state/durable-state-file'
import type { GitHubCacheFile } from '~main/persisted-state/github-cache-file'
import {
  migrateWorkspaceSessionTerminalScrollbackSnapshots,
  type TerminalScrollbackSnapshotStorage
} from '~main/terminal/scrollback-snapshots'

import {
  mergeProjectHostSetupCompatibilityState,
  projectHostSetupCompatibilityStateEqual
} from './compatibility'
import { gcStaleWorktreeMeta } from './data-path'
import { normalizePersistedPaneIdentityState } from './pane-identity'
import { adaptFlatFolderScanProjectGroups } from './projects/load-migration'
import { backfillFolderScopeConnectionIds } from './terminal-migration'

type LoadPipelineContext = {
  githubCacheFile: GitHubCacheFile
  terminalScrollbackSnapshotStorage: TerminalScrollbackSnapshotStorage
  migrationUnsupportedEntries: MigrationUnsupportedPtyEntry[]
  legacyPaneKeyAliasEntries: LegacyPaneKeyAliasEntry[]
}

type LoadStepResult = {
  state: PersistedState
  changed: boolean
}

type LoadStep = (state: PersistedState, context: LoadPipelineContext) => LoadStepResult

export type LoadPipelineResult = LoadStepResult & {
  migrationUnsupportedEntries: MigrationUnsupportedPtyEntry[]
  legacyPaneKeyAliasEntries: LegacyPaneKeyAliasEntry[]
}

const pruneSessionStep: LoadStep = (state, context) => {
  const session = pruneWorkspaceSessionBrowserHistory(
    pruneLocalTerminalScrollbackBuffers(state.workspaceSession, state.repos)
  )
  const migrated = migrateWorkspaceSessionTerminalScrollbackSnapshots(
    session,
    context.terminalScrollbackSnapshotStorage
  )
  return {
    state: { ...state, workspaceSession: migrated.session },
    changed: migrated.changed
  }
}

const projectCompatibilityStep: LoadStep = (state) => {
  const repos = clearMissingProjectGroupMemberships(state.repos, state.projectGroups ?? [])
  const compatibility = mergeProjectHostSetupCompatibilityState(state, repos)
  const changed = !projectHostSetupCompatibilityStateEqual(state, compatibility)
  return {
    state: changed ? { ...state, repos, ...compatibility } : state,
    changed
  }
}

const folderConnectionStep: LoadStep = (state) => backfillFolderScopeConnectionIds(state)

const staleWorktreeStep: LoadStep = (state) => ({
  state,
  changed: gcStaleWorktreeMeta(state) > 0
})

const githubCacheStep: LoadStep = (state, context) => {
  const hasLegacyCache = Object.keys(state.githubCache?.pr ?? {}).length > 0
  if (hasLegacyCache) {
    // Why: the seed must reach the sidecar even if no poll refresh occurs this session.
    context.githubCacheFile.markDirty()
    return { state, changed: true }
  }
  const githubCache = context.githubCacheFile.read()
  return {
    state: githubCache ? { ...state, githubCache } : state,
    changed: false
  }
}

const paneIdentityStep: LoadStep = (state, context) => {
  const normalized = normalizePersistedPaneIdentityState(state)
  context.migrationUnsupportedEntries = normalized.migrationUnsupportedEntries
  context.legacyPaneKeyAliasEntries = normalized.legacyPaneKeyAliasEntries
  return { state: normalized.state, changed: normalized.changed }
}

const flatFolderGroupStep: LoadStep = (state) => ({
  state,
  changed: adaptFlatFolderScanProjectGroups(state)
})

const LOAD_STEPS: readonly LoadStep[] = [
  pruneSessionStep,
  projectCompatibilityStep,
  folderConnectionStep,
  staleWorktreeStep,
  githubCacheStep,
  paneIdentityStep,
  flatFolderGroupStep
]

export function runLoadPipeline(args: {
  durableStateFile: DurableStateFile
  githubCacheFile: GitHubCacheFile
  terminalScrollbackSnapshotStorage: TerminalScrollbackSnapshotStorage
}): LoadPipelineResult {
  const decoded = args.durableStateFile.readDecoded(({ value, fileExistedOnLoad }) =>
    decodePersistedState(value, {
      homeDir: homedir(),
      platform: process.platform,
      fileExistedOnLoad,
      createInstallId: randomUUID
    })
  )
  for (const warning of decoded.warnings) {
    const scope = warning.hostId ? ` for host ${warning.hostId}` : ''
    console.error(`[persistence] ${warning.code}${scope}:`, warning.detail)
  }
  const context: LoadPipelineContext = {
    githubCacheFile: args.githubCacheFile,
    terminalScrollbackSnapshotStorage: args.terminalScrollbackSnapshotStorage,
    migrationUnsupportedEntries: [],
    legacyPaneKeyAliasEntries: []
  }
  let state = decoded.state
  let changed = decoded.needsSave
  for (const step of LOAD_STEPS) {
    const result = step(state, context)
    state = result.state
    changed ||= result.changed
  }
  args.durableStateFile.logLoaded(state)
  return { state, changed, ...context }
}
