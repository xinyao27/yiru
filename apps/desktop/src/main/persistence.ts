import { randomUUID } from 'node:crypto'
import { mkdirSync, existsSync, copyFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, isAbsolute, resolve } from 'node:path'

import type {
  RemovedSshTargetTombstone,
  SshRemotePtyLease,
  SshTarget
} from '@yiru/runtime-protocol/ssh-connection'
import type { MigrationUnsupportedPtyEntry } from '@yiru/workbench-model/agent'
import { isPathInsideOrEqual, isWindowsAbsolutePathLike } from '@yiru/workbench-model/platform'
import { isWslUncPath } from '@yiru/workbench-model/platform'
import { getRepoExecutionHostId, parseExecutionHostId } from '@yiru/workbench-model/workspace'
import {
  LOCAL_EXECUTION_HOST_ID,
  normalizeExecutionHostId,
  toSshExecutionHostId,
  type ExecutionHostId
} from '@yiru/workbench-model/workspace'
import { sanitizeRepoIcon } from '@yiru/workbench-model/workspace'
import {
  FOLDER_WORKSPACE_INSTANCE_SEPARATOR,
  getRepoIdFromWorktreeId,
  getWorktreePathBasenameFromId
} from '@yiru/workbench-model/workspace'
/* eslint-disable max-lines -- Why: Store remains the single mutation authority
while its codecs, file mechanics, and notifications are extracted incrementally. */
import { app } from 'electron'

import { normalizeAutomationPrecheck } from '../shared/automation-precheck'
import { getAutomationLegacyRepoId } from '../shared/automation-run-identity'
import { nextAutomationRunNumber, pruneAutomationRuns } from '../shared/automation-run-retention'
import {
  latestAutomationOccurrenceAtOrBefore,
  nextAutomationOccurrenceAfter
} from '../shared/automation-schedules'
import type {
  Automation,
  AutomationCreateInput,
  AutomationDispatchResult,
  AutomationPrecheckResult,
  AutomationRunOutputSnapshot,
  AutomationRun,
  AutomationSchedulerOwner,
  AutomationRunTrigger,
  AutomationUpdateInput
} from '../shared/automations-types'
import {
  getDefaultOnboardingState,
  getDefaultRepoHookSettings,
  getDefaultWorkspaceSession
} from '../shared/constants'
import {
  compareFeatureInteractionUsageBuckets,
  getFeatureInteractionCategory,
  getFeatureInteractionUsageBucket,
  normalizeFeatureInteractions,
  normalizeFeatureInteractionTelemetryBuckets,
  type FeatureInteractionId
} from '../shared/feature-interactions'
import { normalizeFolderWorkspaceName } from '../shared/folder-workspaces'
import type { GitRemoteIdentity } from '../shared/git-remote-identity'
import { normalizeProjectRuntimePreference } from '../shared/project-execution-runtime'
import {
  clearMissingProjectGroupMemberships,
  createProjectGroup,
  getNextProjectGroupOrder,
  getProjectGroupSubtreeIds,
  normalizeProjectGroupName
} from '../shared/project-groups'
import { projectHostSetupProjectionFromRepos } from '../shared/project-host-setup-projection'
import {
  buildProjectSourceContextFromRepo,
  buildWorkspaceRunContext
} from '../shared/project-source-context'
import { normalizeRepoBadgeColor } from '../shared/repo-badge-color'
import { isFolderRepo } from '../shared/repo-kind'
import { hardenExistingSecureFile } from '../shared/secure-file'
import { normalizeRepoSourceControlAiOverrides } from '../shared/source-control-ai'
import {
  isTerminalLeafId,
  makePaneKey,
  parseLegacyNumericPaneKey,
  parsePaneKey
} from '../shared/stable-pane-id'
import type {
  PersistedState,
  Project,
  ProjectUpdateArgs,
  ProjectHostSetup,
  ProjectHostSetupCreateArgs,
  ProjectHostSetupCreateResult,
  ProjectHostSetupDeleteArgs,
  ProjectHostSetupDeleteResult,
  ProjectHostSetupUpdateArgs,
  ProjectHostSetupUpdateResult,
  RepoProjectHostSetupMethod,
  Repo,
  ProjectGroup,
  FolderWorkspace,
  SparsePreset,
  WorktreeMeta,
  WorktreeLineage,
  WorkspaceLineage,
  WorkspaceKey,
  GlobalSettings,
  OnboardingChecklistState,
  LegacyPaneKeyAliasEntry,
  TerminalPaneLayoutNode,
  TerminalLayoutSnapshot,
  TerminalTab,
  WorkspaceSessionPatch,
  WorkspaceSessionState
} from '../shared/types'
import {
  folderWorkspaceKey,
  parseWorkspaceKey,
  worktreeWorkspaceKey
} from '../shared/workspace-scope'
import { pruneWorkspaceSessionBrowserHistory } from '../shared/workspace-session-browser-history'
import { pruneLocalTerminalScrollbackBuffers } from '../shared/workspace-session-terminal-buffers'
import { DEFAULT_WORKSPACE_STATUS_ID } from '../shared/workspace-statuses'
import { isLegacyRepoForExternalWorktreeVisibility } from '../shared/worktree-ownership'
import {
  setMigrationUnsupportedPty,
  setMigrationUnsupportedPtyPersistenceListener
} from './agent-hooks/migration-unsupported-pty-state'
import { agentHookServer } from './agent-hooks/server'
import { DurableStateFile } from './persisted-state/durable-state-file'
import { GitHubCacheFile } from './persisted-state/github-cache-file'
import { applyPersistedSettingsUpdate } from './persisted-state/persisted-settings-mutations'
import { normalizePersistedSshTarget as normalizeSshTarget } from './persisted-state/persisted-ssh-codec'
import { decodePersistedState } from './persisted-state/persisted-state-codec'
import { PersistedStateNotifications } from './persisted-state/persisted-state-notifications'
import {
  MAX_CLAUDE_LIVE_PTY_SESSION_IDS,
  normalizePersistedLegacyPaneKeyAliasEntries as normalizeLegacyPaneKeyAliasEntries,
  normalizePersistedMigrationUnsupportedPtyEntries as normalizeMigrationUnsupportedPtyEntries
} from './persisted-state/persisted-terminal-session-codec'
import { applyPersistedUiUpdate, readPersistedUi } from './persisted-state/persisted-ui-mutations'
import {
  removeRepoFromWorkspaceSessionsForHost,
  removeWorkspaceSessionOwner
} from './persisted-state/workspace-session-owner-removal'
import { createNestedProjectGroupResolver } from './project-groups/nested-repo-import'
import { toRelaySshPtyId } from './providers/ssh-pty-id'
import { MOBILE_PAIRING_USERDATA_FILES } from './runtime/mobile-pairing-files'
import {
  migrateUiHostScopeSshTargetId,
  migrateWorkspaceSessionSshTargetId
} from './ssh/ssh-target-id-migration'
import { track } from './telemetry/client'
import { getCohortAtEmit } from './telemetry/cohort-classifier'
import {
  collectTerminalScrollbackSnapshotRefs,
  deleteTerminalScrollbackSnapshotSync,
  getProfileTerminalScrollbackSnapshotRoot,
  migrateWorkspaceSessionTerminalScrollbackSnapshots,
  readTerminalScrollbackSnapshotSync,
  type TerminalScrollbackSnapshotStorage
} from './terminal-scrollback-snapshots'

export { sanitizeOnboardingUpdate } from './persisted-state/persisted-onboarding-codec'

// Why: the data-file path must not be a module-level constant. Module-level
// code runs at import time — before configureDevUserDataPath() redirects the
// userData path in index.ts — so a constant would capture the default (non-dev)
// path, causing dev and production instances to share the same file and silently
// overwrite each other.
//
// It also must not be resolved lazily on every call, because app.setName('Yiru')
// runs before the Store constructor and would change the resolved path from
// lowercase 'yiru' to uppercase 'Yiru'. On case-sensitive filesystems (Linux)
// this would look in the wrong directory and lose existing user data.
//
// Solution: index.ts calls initDataPath() right after configureDevUserDataPath()
// but before app.setName(), capturing the correct path at the right moment.
let _dataFile: string | null = null
let _userDataDir: string | null = null

export function initDataPath(): void {
  const userDataDir = app.getPath('userData')
  _userDataDir = userDataDir
  _dataFile = join(userDataDir, 'yiru-data.json')
}

function getDataFile(): string {
  if (!_dataFile) {
    // Safety fallback — should not be hit in normal startup.
    const userDataDir = app.getPath('userData')
    _userDataDir = userDataDir
    _dataFile = join(userDataDir, 'yiru-data.json')
  }
  return _dataFile
}

// Why: worktrees deleted outside Yiru (git CLI worktree remove, rm -rf,
// agent scripts) purge renderer session state but nothing removed their
// worktreeMeta, so the map grew monotonically (63% dead entries measured on
// a heavy install). GC is deliberately narrow: local-host entries only
// (SSH/runtime metas embed remote paths a local existsSync would falsely
// condemn; WSL UNC paths are skipped the same way), and only after a
// 30-day idle grace so pushTarget cleanup for recently-vanished worktrees
// and quick recreations keep their metadata.
const WORKTREE_META_GC_GRACE_MS = 30 * 24 * 60 * 60 * 1000

function gcStaleWorktreeMeta(state: PersistedState): number {
  // Why: a hand-corrupted file with `"worktreeMeta": null` overrides the
  // defaults merge; normalize instead of throwing outside the parse guard.
  state.worktreeMeta ??= {}
  const repoById = new Map(state.repos.map((repo) => [repo.id, repo]))
  const projectIds = new Set((state.projects ?? []).map((project) => project.id))
  const now = Date.now()
  let removed = 0
  for (const key of Object.keys(state.worktreeMeta)) {
    // Why: folder-project workspace instances are keyed
    // `repoId::path::workspace:<uuid>` and their meta IS the workspace
    // record — never a filesystem-checkout row. Skip them entirely.
    if (key.includes(FOLDER_WORKSPACE_INSTANCE_SEPARATOR)) {
      continue
    }
    const separator = key.indexOf('::')
    if (separator === -1) {
      continue
    }
    const ownerId = key.slice(0, separator)
    const worktreePath = key.slice(separator + 2)
    const meta = state.worktreeMeta[key]
    const repo = repoById.get(ownerId)
    if (repo) {
      if (repo.connectionId || getRepoExecutionHostId(repo) !== LOCAL_EXECUTION_HOST_ID) {
        continue
      }
    } else if (projectIds.has(ownerId)) {
      // Project-owned metas keep project/host semantics on the entry itself;
      // stay conservative and leave them to their own lifecycle.
      continue
    }
    // Unowned entries (repo removed before removeProject pruned metas) fall
    // through to the same missing-path + idle-grace gate.
    if (meta?.hostId && meta.hostId !== LOCAL_EXECUTION_HOST_ID) {
      continue
    }
    if (!isAbsolute(worktreePath) || isWslUncPath(worktreePath)) {
      continue
    }
    // Why: WSL linked worktrees on Windows carry Linux-style paths from git
    // porcelain; a Windows existsSync cannot probe those and would falsely
    // condemn live worktrees.
    if (process.platform === 'win32' && !isWindowsAbsolutePathLike(worktreePath)) {
      continue
    }
    // Why keep timestamp-less entries: without lastActivityAt/createdAt we
    // cannot prove the 30-day idle grace elapsed; the measured dead entries
    // all carry timestamps, so this costs almost nothing in reclaimed bytes.
    // Grace runs before the stat so healthy profiles skip the existsSync
    // fan-out (and its slow-NFS tail) for active entries entirely.
    const newestTouch = Math.max(meta?.lastActivityAt ?? 0, meta?.createdAt ?? 0)
    if (newestTouch === 0 || now - newestTouch < WORKTREE_META_GC_GRACE_MS) {
      continue
    }
    if (existsSync(worktreePath)) {
      continue
    }
    delete state.worktreeMeta[key]
    delete state.worktreeLineageById[key]
    delete state.workspaceLineageByChildKey[worktreeWorkspaceKey(key)]
    removed++
  }
  return removed
}

/**
 * Return the userData directory captured at initDataPath() time, before
 * app.setName() can change how app.getPath('userData') resolves.
 *
 * Subsystems that must share storage with yiru-data.json (mobile pairing's
 * DeviceRegistry, E2EE keypair, runtime metadata) read this instead of
 * resolving the path late, which on case-sensitive filesystems can land in a
 * different directory and lose paired devices across restarts/updates.
 */
export function getCanonicalUserDataPath(): string {
  if (!_userDataDir) {
    // Safety fallback — should not be hit in normal startup.
    _userDataDir = app.getPath('userData')
  }
  return _userDataDir
}

/**
 * Copy legacy mobile pairing credentials into the canonical userData directory.
 *
 * Existing installs may already have credentials in the late app.getPath('userData')
 * directory. Before switching the runtime server to the canonical path, copy the
 * registry and E2EE keypair forward as a pair so an update does not force one
 * last re-pair or mix devices with the wrong key.
 */
export function migrateMobilePairingDataToCanonicalUserDataPath(sourceUserDataDir: string): void {
  const targetUserDataDir = getCanonicalUserDataPath()
  if (resolve(sourceUserDataDir) === resolve(targetUserDataDir)) {
    return
  }

  const migrations = MOBILE_PAIRING_USERDATA_FILES.map((fileName) => ({
    sourcePath: join(sourceUserDataDir, fileName),
    targetPath: join(targetUserDataDir, fileName)
  }))
  if (migrations.some(({ sourcePath }) => !existsSync(sourcePath))) {
    return
  }
  if (migrations.some(({ targetPath }) => existsSync(targetPath))) {
    return
  }

  mkdirSync(targetUserDataDir, { recursive: true })
  for (const { sourcePath, targetPath } of migrations) {
    copyFileSync(sourcePath, targetPath)
    // Why: these are credential files (device tokens, E2EE secret key). copyFileSync
    // does not carry Windows ACLs, so re-assert the current-user-only restriction on
    // the copy instead of relying on the runtime's later lazy re-harden on read.
    hardenExistingSecureFile(targetPath)
  }
}

const WORKSPACE_SESSION_PATCH_FULL_NORMALIZATION_KEYS = new Set<keyof WorkspaceSessionState>([
  'tabsByWorktree',
  'terminalLayoutsByTabId'
])

function workspaceSessionPatchNeedsFullNormalization(patch: WorkspaceSessionPatch): boolean {
  return Object.keys(patch).some((key) =>
    WORKSPACE_SESSION_PATCH_FULL_NORMALIZATION_KEYS.has(key as keyof WorkspaceSessionState)
  )
}

function normalizeAutomationRunWorkspaceDisplayName(value: string | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function normalizeAutomationRunTerminalPaneKey(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed && parsePaneKey(trimmed) ? trimmed : null
}

function normalizeAutomationRunTerminalPtyId(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed || null
}

function normalizeAutomationRunOutputSnapshot(
  value: AutomationRunOutputSnapshot | null | undefined
): AutomationRunOutputSnapshot | null {
  if (!value || value.format !== 'plain_text') {
    return null
  }
  const content = typeof value.content === 'string' ? value.content : ''
  if (!content.trim()) {
    return null
  }
  return {
    format: 'plain_text',
    content,
    capturedAt:
      typeof value.capturedAt === 'number' && Number.isFinite(value.capturedAt)
        ? value.capturedAt
        : Date.now(),
    truncated: value.truncated === true
  }
}

function normalizeAutomationPrecheckResult(
  value: AutomationPrecheckResult | null | undefined
): AutomationPrecheckResult | null {
  if (!value || typeof value.command !== 'string' || !value.command.trim()) {
    return null
  }
  const startedAt =
    typeof value.startedAt === 'number' && Number.isFinite(value.startedAt)
      ? value.startedAt
      : Date.now()
  const completedAt =
    typeof value.completedAt === 'number' && Number.isFinite(value.completedAt)
      ? value.completedAt
      : startedAt
  return {
    command: value.command.trim(),
    exitCode:
      typeof value.exitCode === 'number' && Number.isFinite(value.exitCode) ? value.exitCode : null,
    timedOut: value.timedOut === true,
    durationMs:
      typeof value.durationMs === 'number' && Number.isFinite(value.durationMs)
        ? Math.max(0, value.durationMs)
        : Math.max(0, completedAt - startedAt),
    stdout: typeof value.stdout === 'string' ? value.stdout : '',
    stderr: typeof value.stderr === 'string' ? value.stderr : '',
    stdoutTruncated: value.stdoutTruncated === true,
    stderrTruncated: value.stderrTruncated === true,
    error: typeof value.error === 'string' && value.error.trim() ? value.error : null,
    startedAt,
    completedAt
  }
}

function normalizeAutomationSessionReuse(automation: Automation): Automation {
  const setupDecision = normalizeAutomationSetupDecisionForWorkspaceMode(
    automation.workspaceMode,
    automation.setupDecision
  )
  return {
    ...automation,
    precheck: normalizeAutomationPrecheck(automation.precheck),
    setupDecision,
    reuseSession: automation.workspaceMode === 'existing' && automation.reuseSession === true
  }
}

function normalizeAutomationSetupDecisionForWorkspaceMode(
  workspaceMode: Automation['workspaceMode'],
  setupDecision: unknown
): Automation['setupDecision'] {
  return workspaceMode === 'new_per_run' && (setupDecision === 'run' || setupDecision === 'skip')
    ? setupDecision
    : undefined
}

function getAutomationContextsForRepo(
  repo: Repo | undefined,
  projectHostSetups: readonly ProjectHostSetup[]
): Pick<Automation, 'runContext' | 'sourceContext'> {
  if (!repo) {
    return {
      runContext: null,
      sourceContext: null
    }
  }
  const projection = projectHostSetupProjectionFromRepos([repo])
  const projectedProject = projection.projects[0]
  const projectedSetup = projection.setups[0]
  const setup =
    projectHostSetups.find((candidate) => candidate.repoId === repo.id) ?? projectedSetup
  const runContext = setup
    ? buildWorkspaceRunContext({
        projectId: setup.projectId,
        hostId: setup.hostId,
        projectHostSetupId: setup.id,
        repoId: repo.id,
        path: setup.path
      })
    : null
  const providerIdentity = projectedProject?.providerIdentity
  const sourceContext = providerIdentity
    ? buildProjectSourceContextFromRepo({
        provider: providerIdentity.provider,
        projectId: providerIdentity.provider === 'github' ? (setup?.projectId ?? repo.id) : repo.id,
        repo,
        projectHostSetupId: setup?.id,
        providerIdentity
      })
    : null
  return {
    runContext,
    sourceContext
  }
}

function getAutomationSchedulerOwner(repo: Repo | undefined): AutomationSchedulerOwner {
  if (!repo) {
    return 'local_host_service'
  }
  const host = parseExecutionHostId(getRepoExecutionHostId(repo))
  if (host?.kind === 'ssh') {
    return 'ssh_bridge'
  }
  if (host?.kind === 'runtime') {
    return 'remote_host_service'
  }
  return 'local_host_service'
}

function backfillLegacyAutomationContexts(
  state: Pick<PersistedState, 'automations' | 'automationRuns' | 'repos' | 'projectHostSetups'>
): {
  state: Pick<PersistedState, 'automations' | 'automationRuns' | 'repos' | 'projectHostSetups'>
  changed: boolean
} {
  let changed = false
  const contextsByAutomationId = new Map<string, Pick<Automation, 'runContext' | 'sourceContext'>>()
  const automations = (state.automations ?? []).map((automation) => {
    const contexts = getAutomationContextsForRepo(
      state.repos.find((repo) => repo.id === getAutomationLegacyRepoId(automation)),
      state.projectHostSetups ?? []
    )
    const next: Automation = { ...automation }
    if (!Object.hasOwn(next, 'runContext')) {
      // Why: pre-host-context automations only stored a repo id. Backfill the
      // explicit run target once so dispatch/precheck no longer infer it later.
      next.runContext = contexts.runContext
      changed = true
    }
    if (!Object.hasOwn(next, 'sourceContext')) {
      next.sourceContext = contexts.sourceContext
      changed = true
    }
    contextsByAutomationId.set(next.id, {
      runContext: next.runContext ?? null,
      sourceContext: next.sourceContext ?? null
    })
    return next
  })
  const automationRuns = (state.automationRuns ?? []).map((run) => {
    const automationContexts = contextsByAutomationId.get(run.automationId)
    const next: AutomationRun = { ...run }
    if (!Object.hasOwn(next, 'runContext')) {
      next.runContext = automationContexts?.runContext ?? null
      changed = true
    }
    if (!Object.hasOwn(next, 'sourceContext')) {
      next.sourceContext = automationContexts?.sourceContext ?? null
      changed = true
    }
    if (!Object.hasOwn(next, 'terminalPaneKey')) {
      next.terminalPaneKey = null
      changed = true
    }
    if (!Object.hasOwn(next, 'terminalPtyId')) {
      next.terminalPtyId = null
      changed = true
    }
    return next
  })
  if (!changed) {
    return { state, changed: false }
  }
  return {
    state: {
      ...state,
      automations,
      automationRuns
    },
    changed: true
  }
}

function sanitizeRepoUpstream(value: unknown): Repo['upstream'] | undefined {
  if (value === undefined) {
    return undefined
  }
  if (value === null) {
    return null
  }
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const candidate = value as { owner?: unknown; repo?: unknown }
  const owner = typeof candidate.owner === 'string' ? candidate.owner.trim() : ''
  const repo = typeof candidate.repo === 'string' ? candidate.repo.trim() : ''
  return owner && repo ? { owner, repo } : undefined
}

function sanitizeGitRemoteIdentity(value: unknown): GitRemoteIdentity | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const candidate = value as {
    canonicalKey?: unknown
    remoteName?: unknown
    remoteUrl?: unknown
  }
  const canonicalKey =
    typeof candidate.canonicalKey === 'string' ? candidate.canonicalKey.trim() : ''
  const remoteName = typeof candidate.remoteName === 'string' ? candidate.remoteName.trim() : ''
  const remoteUrl = typeof candidate.remoteUrl === 'string' ? candidate.remoteUrl.trim() : ''
  return canonicalKey && remoteName && remoteUrl
    ? { canonicalKey, remoteName, remoteUrl }
    : undefined
}

function sanitizeRepoProjectHostSetupMethod(
  value: unknown
): RepoProjectHostSetupMethod | undefined {
  return value === 'imported-existing-folder' || value === 'cloned' ? value : undefined
}

function sanitizeForkSyncMode(value: unknown): Repo['forkSyncMode'] | undefined {
  return value === 'ask' || value === 'safe-auto' || value === 'off' ? value : undefined
}

function sanitizeRepoUpdatesForPersistence<
  T extends Partial<
    Pick<
      Repo,
      | 'badgeColor'
      | 'repoIcon'
      | 'upstream'
      | 'gitRemoteIdentity'
      | 'worktreeBasePath'
      | 'projectHostSetupMethod'
      | 'forkSyncMode'
    >
  >
>(updates: T): T {
  const sanitized = { ...updates }
  if ('badgeColor' in sanitized) {
    const badgeColor = normalizeRepoBadgeColor(sanitized.badgeColor)
    if (!badgeColor) {
      delete sanitized.badgeColor
    } else {
      sanitized.badgeColor = badgeColor
    }
  }
  if ('repoIcon' in sanitized) {
    const repoIcon = sanitizeRepoIcon(sanitized.repoIcon)
    if (repoIcon === undefined) {
      delete sanitized.repoIcon
    } else {
      sanitized.repoIcon = repoIcon
    }
  }
  // Why: `null` is a valid "not a fork" marker; only drop malformed shapes.
  if ('upstream' in sanitized) {
    const upstream = sanitizeRepoUpstream(sanitized.upstream)
    if (upstream === undefined) {
      delete sanitized.upstream
    } else {
      sanitized.upstream = upstream
    }
  }
  if ('gitRemoteIdentity' in sanitized) {
    const gitRemoteIdentity = sanitizeGitRemoteIdentity(sanitized.gitRemoteIdentity)
    if (gitRemoteIdentity === undefined) {
      delete sanitized.gitRemoteIdentity
    } else {
      sanitized.gitRemoteIdentity = gitRemoteIdentity
    }
  }
  if ('worktreeBasePath' in sanitized && sanitized.worktreeBasePath !== undefined) {
    if (typeof sanitized.worktreeBasePath === 'string') {
      sanitized.worktreeBasePath = sanitized.worktreeBasePath.trim() || undefined
    } else {
      delete sanitized.worktreeBasePath
    }
  }
  if ('projectHostSetupMethod' in sanitized) {
    const setupMethod = sanitizeRepoProjectHostSetupMethod(sanitized.projectHostSetupMethod)
    if (setupMethod === undefined) {
      delete sanitized.projectHostSetupMethod
    } else {
      sanitized.projectHostSetupMethod = setupMethod
    }
  }
  if ('forkSyncMode' in sanitized) {
    const forkSyncMode = sanitizeForkSyncMode(sanitized.forkSyncMode)
    if (forkSyncMode === undefined) {
      delete sanitized.forkSyncMode
    } else {
      sanitized.forkSyncMode = forkSyncMode
    }
  }
  return sanitized
}

type LayoutLeafNormalization = {
  snapshot: TerminalLayoutSnapshot
  changed: boolean
  leafIdByInputLeafId: Map<string, string>
}

function collectLayoutLeafCounts(
  node: TerminalPaneLayoutNode,
  counts: Map<string, number> = new Map()
): Map<string, number> {
  if (node.type === 'leaf') {
    counts.set(node.leafId, (counts.get(node.leafId) ?? 0) + 1)
    return counts
  }
  collectLayoutLeafCounts(node.first, counts)
  collectLayoutLeafCounts(node.second, counts)
  return counts
}

function collectLayoutLeafIdsInOrder(node: TerminalPaneLayoutNode | null | undefined): string[] {
  if (!node) {
    return []
  }
  if (node.type === 'leaf') {
    return [node.leafId]
  }
  return [...collectLayoutLeafIdsInOrder(node.first), ...collectLayoutLeafIdsInOrder(node.second)]
}

function firstLayoutLeafId(node: TerminalPaneLayoutNode | null): string | null {
  if (!node) {
    return null
  }
  return node.type === 'leaf' ? node.leafId : firstLayoutLeafId(node.first)
}

function layoutContainsLeafId(node: TerminalPaneLayoutNode | null, leafId: string): boolean {
  if (!node) {
    return false
  }
  if (node.type === 'leaf') {
    return node.leafId === leafId
  }
  return layoutContainsLeafId(node.first, leafId) || layoutContainsLeafId(node.second, leafId)
}

function cloneLayoutNode(node: TerminalPaneLayoutNode): TerminalPaneLayoutNode {
  if (node.type === 'leaf') {
    return { type: 'leaf', leafId: node.leafId }
  }
  return {
    ...node,
    first: cloneLayoutNode(node.first),
    second: cloneLayoutNode(node.second)
  }
}

function cloneLayoutWithLeafIds(
  node: TerminalPaneLayoutNode,
  leafIdByInputLeafId: Map<string, string>,
  duplicatedInputLeafIds: Set<string>
): TerminalPaneLayoutNode {
  if (node.type === 'leaf') {
    return {
      type: 'leaf',
      leafId: duplicatedInputLeafIds.has(node.leafId)
        ? randomUUID()
        : (leafIdByInputLeafId.get(node.leafId) ?? randomUUID())
    }
  }
  return {
    ...node,
    first: cloneLayoutWithLeafIds(node.first, leafIdByInputLeafId, duplicatedInputLeafIds),
    second: cloneLayoutWithLeafIds(node.second, leafIdByInputLeafId, duplicatedInputLeafIds)
  }
}

function remapLeafRecordForPersistence(
  source: Record<string, string> | undefined,
  leafIdByInputLeafId: Map<string, string>,
  duplicatedInputLeafIds: Set<string>
): Record<string, string> | undefined {
  if (!source) {
    return undefined
  }
  const next: Record<string, string> = {}
  for (const [leafId, value] of Object.entries(source)) {
    if (duplicatedInputLeafIds.has(leafId)) {
      continue
    }
    const nextLeafId = leafIdByInputLeafId.get(leafId)
    if (nextLeafId) {
      next[nextLeafId] = value
    }
  }
  return Object.keys(next).length > 0 ? next : undefined
}

function leafRecordEquivalent(
  left: Record<string, string> | undefined,
  right: Record<string, string> | undefined
): boolean {
  const leftEntries = Object.entries(left ?? {})
  const rightRecord = right ?? {}
  if (leftEntries.length !== Object.keys(rightRecord).length) {
    return false
  }
  return leftEntries.every(([key, value]) => rightRecord[key] === value)
}

function preserveMissingLeafRecordEntries(
  priorRecord: Record<string, string> | undefined,
  incomingRecord: Record<string, string> | undefined,
  liveLeafIds: Set<string>
): Record<string, string> | undefined {
  const preserved = Object.fromEntries(
    Object.entries(priorRecord ?? {}).filter(
      ([leafId]) => liveLeafIds.has(leafId) && incomingRecord?.[leafId] === undefined
    )
  )
  const next = { ...preserved, ...incomingRecord }
  return Object.keys(next).length > 0 ? next : undefined
}

function findWorktreeIdForTab(session: WorkspaceSessionState, tabId: string): string | undefined {
  for (const [worktreeId, tabs] of Object.entries(session.tabsByWorktree ?? {})) {
    if (tabs.some((tab) => tab.id === tabId)) {
      return worktreeId
    }
  }
  return undefined
}

type PaneIdentityMigrationEntries = {
  migrationUnsupportedEntries: MigrationUnsupportedPtyEntry[]
  legacyPaneKeyAliasEntries: LegacyPaneKeyAliasEntry[]
}

function collectMigrationUnsupportedPtyEntries(args: {
  session: WorkspaceSessionState
  tabId: string
  inputLayout: TerminalLayoutSnapshot
  normalizedLayout: TerminalLayoutSnapshot
  leafIdByInputLeafId: Map<string, string>
}): PaneIdentityMigrationEntries {
  const worktreeId = findWorktreeIdForTab(args.session, args.tabId)
  const tab = worktreeId
    ? args.session.tabsByWorktree?.[worktreeId]?.find((entry) => entry.id === args.tabId)
    : undefined
  const legacyPaneKeyAliasEntries: LegacyPaneKeyAliasEntry[] = []
  const registeredLegacyPaneKeys = new Set<string>()
  const hasLeafPtyBindings = Object.keys(args.inputLayout.ptyIdsByLeafId ?? {}).length > 0
  const fallbackPtyId =
    !hasLeafPtyBindings && typeof tab?.ptyId === 'string' ? tab.ptyId : undefined
  const registerLegacyAlias = (inputLeafId: string, leafId: string, ptyId?: string): boolean => {
    if (!isTerminalLeafId(leafId)) {
      return false
    }
    let paneKey: string
    try {
      paneKey = makePaneKey(args.tabId, leafId)
    } catch {
      return false
    }
    const numeric = /^(?:pane:)?(\d+)$/.exec(inputLeafId)?.[1]
    if (!numeric) {
      return false
    }
    // Why: persisted PaneManager ids are 1-based. A zero-based alias in split
    // layouts would make tab:1 ambiguous and can route the first pane to the second.
    const legacyPaneKey = `${args.tabId}:${numeric}`
    agentHookServer.registerPaneKeyAlias(legacyPaneKey, paneKey, ptyId)
    registeredLegacyPaneKeys.add(legacyPaneKey)
    if (ptyId) {
      legacyPaneKeyAliasEntries.push({
        ptyId,
        legacyPaneKey,
        stablePaneKey: paneKey,
        updatedAt: Date.now()
      })
      return true
    }
    return false
  }
  const inputLeafIds = new Set([
    ...collectLayoutLeafIdsInOrder(args.inputLayout.root),
    ...Object.keys(args.inputLayout.ptyIdsByLeafId ?? {})
  ])
  for (const inputLeafId of inputLeafIds) {
    if (isTerminalLeafId(inputLeafId)) {
      continue
    }
    const leafId = args.leafIdByInputLeafId.get(inputLeafId)
    if (leafId) {
      registerLegacyAlias(
        inputLeafId,
        leafId,
        args.inputLayout.ptyIdsByLeafId?.[inputLeafId] ?? fallbackPtyId
      )
    }
  }
  if (tab?.ptyId && !hasLeafPtyBindings) {
    const fallbackLeafId =
      args.normalizedLayout.activeLeafId ?? firstLayoutLeafId(args.normalizedLayout.root)
    if (fallbackLeafId && isTerminalLeafId(fallbackLeafId)) {
      const paneKey = makePaneKey(args.tabId, fallbackLeafId)
      for (const legacyPaneKey of [`${args.tabId}:0`, `${args.tabId}:1`]) {
        if (registeredLegacyPaneKeys.has(legacyPaneKey)) {
          continue
        }
        agentHookServer.registerPaneKeyAlias(legacyPaneKey, paneKey, tab.ptyId)
        legacyPaneKeyAliasEntries.push({
          ptyId: tab.ptyId,
          legacyPaneKey,
          stablePaneKey: paneKey,
          updatedAt: Date.now()
        })
      }
    }
  }
  // Why: legacy numeric pane keys are now bridged by aliases instead of
  // persisted as restart-required rows. Existing saved rows are pruned during
  // normalizePersistedPaneIdentityState.
  return { migrationUnsupportedEntries: [], legacyPaneKeyAliasEntries }
}

function legacyMigrationUnsupportedRowsToAliasEntries(
  entries: MigrationUnsupportedPtyEntry[]
): LegacyPaneKeyAliasEntry[] {
  const normalizedEntries = normalizeMigrationUnsupportedPtyEntries(entries).filter(
    (entry) => entry.tabId && entry.paneKey && parsePaneKey(entry.paneKey)
  )
  const entriesByTabId = new Map<string, MigrationUnsupportedPtyEntry[]>()
  for (const entry of normalizedEntries) {
    const tabId = entry.tabId
    if (!tabId) {
      continue
    }
    entriesByTabId.set(tabId, [...(entriesByTabId.get(tabId) ?? []), entry])
  }
  const aliasEntries: LegacyPaneKeyAliasEntry[] = []
  for (const [tabId, tabEntries] of entriesByTabId) {
    if (tabEntries.length !== 1) {
      continue
    }
    const [entry] = tabEntries
    if (!entry.paneKey) {
      continue
    }
    // Why: pre-stable dev/RC migration rows did not store the old numeric
    // key. Only synthesize the single-pane aliases when the row is unambiguous
    // for its tab; split rows need layout-derived aliases instead of a guess.
    for (const legacyPaneKey of [`${tabId}:0`, `${tabId}:1`]) {
      aliasEntries.push({
        ptyId: entry.ptyId,
        legacyPaneKey,
        stablePaneKey: entry.paneKey,
        updatedAt: entry.updatedAt
      })
    }
  }
  return aliasEntries
}

function normalizeTerminalLayoutSnapshotForPersistence(
  snapshot: TerminalLayoutSnapshot,
  preferredLayout?: TerminalLayoutSnapshot
): LayoutLeafNormalization {
  let inputSnapshot = snapshot
  let changed = false
  if (!inputSnapshot.root) {
    if (!preferredLayout?.root) {
      return { snapshot, changed: false, leafIdByInputLeafId: new Map() }
    }
    const root = cloneLayoutNode(preferredLayout.root)
    const rootLeafIds = new Set(collectLayoutLeafIdsInOrder(root))
    const activeLeafId =
      (inputSnapshot.activeLeafId && rootLeafIds.has(inputSnapshot.activeLeafId)
        ? inputSnapshot.activeLeafId
        : null) ??
      (preferredLayout.activeLeafId && rootLeafIds.has(preferredLayout.activeLeafId)
        ? preferredLayout.activeLeafId
        : null) ??
      firstLayoutLeafId(root)
    const expandedLeafId =
      (inputSnapshot.expandedLeafId && rootLeafIds.has(inputSnapshot.expandedLeafId)
        ? inputSnapshot.expandedLeafId
        : null) ??
      (preferredLayout.expandedLeafId && rootLeafIds.has(preferredLayout.expandedLeafId)
        ? preferredLayout.expandedLeafId
        : null)
    inputSnapshot = { ...inputSnapshot, root, activeLeafId, expandedLeafId }
    // Why: a debounced renderer writer can still hold the createTab-era empty
    // layout after persistPtyBinding has already sync-flushed the UUID root.
    changed = true
  }
  const inputRoot = inputSnapshot.root
  if (!inputRoot) {
    return { snapshot, changed: false, leafIdByInputLeafId: new Map() }
  }
  const counts = collectLayoutLeafCounts(inputRoot)
  const duplicatedInputLeafIds = new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([leafId]) => leafId)
  )
  const inputLeafIdsInOrder = collectLayoutLeafIdsInOrder(inputRoot)
  const preferredLeafIdsInOrder = collectLayoutLeafIdsInOrder(preferredLayout?.root)
  const usePreferredLeafIds = preferredLeafIdsInOrder.length === inputLeafIdsInOrder.length
  const leafIdByInputLeafId = new Map<string, string>()
  for (const [index, leafId] of inputLeafIdsInOrder.entries()) {
    const count = counts.get(leafId) ?? 0
    if (count !== 1 || leafIdByInputLeafId.has(leafId)) {
      changed = true
      continue
    }
    if (isTerminalLeafId(leafId)) {
      leafIdByInputLeafId.set(leafId, leafId)
      continue
    }
    changed = true
    const preferredLeafId = usePreferredLeafIds ? preferredLeafIdsInOrder[index] : undefined
    leafIdByInputLeafId.set(
      leafId,
      preferredLeafId && isTerminalLeafId(preferredLeafId) ? preferredLeafId : randomUUID()
    )
  }
  const root = changed
    ? cloneLayoutWithLeafIds(inputRoot, leafIdByInputLeafId, duplicatedInputLeafIds)
    : inputRoot
  const activeLeafId =
    inputSnapshot.activeLeafId && !duplicatedInputLeafIds.has(inputSnapshot.activeLeafId)
      ? (leafIdByInputLeafId.get(inputSnapshot.activeLeafId) ?? firstLayoutLeafId(root))
      : inputSnapshot.activeLeafId === null
        ? null
        : firstLayoutLeafId(root)
  const expandedLeafId =
    inputSnapshot.expandedLeafId && !duplicatedInputLeafIds.has(inputSnapshot.expandedLeafId)
      ? (leafIdByInputLeafId.get(inputSnapshot.expandedLeafId) ?? null)
      : null
  const ptyIdsByLeafId = remapLeafRecordForPersistence(
    inputSnapshot.ptyIdsByLeafId,
    leafIdByInputLeafId,
    duplicatedInputLeafIds
  )
  const buffersByLeafId = remapLeafRecordForPersistence(
    inputSnapshot.buffersByLeafId,
    leafIdByInputLeafId,
    duplicatedInputLeafIds
  )
  const scrollbackRefsByLeafId = remapLeafRecordForPersistence(
    inputSnapshot.scrollbackRefsByLeafId,
    leafIdByInputLeafId,
    duplicatedInputLeafIds
  )
  const titlesByLeafId = remapLeafRecordForPersistence(
    inputSnapshot.titlesByLeafId,
    leafIdByInputLeafId,
    duplicatedInputLeafIds
  )
  const recordsChanged =
    !leafRecordEquivalent(inputSnapshot.ptyIdsByLeafId, ptyIdsByLeafId) ||
    !leafRecordEquivalent(inputSnapshot.buffersByLeafId, buffersByLeafId) ||
    !leafRecordEquivalent(inputSnapshot.scrollbackRefsByLeafId, scrollbackRefsByLeafId) ||
    !leafRecordEquivalent(inputSnapshot.titlesByLeafId, titlesByLeafId)
  const metadataChanged =
    activeLeafId !== inputSnapshot.activeLeafId || expandedLeafId !== inputSnapshot.expandedLeafId
  if (!changed && !recordsChanged && !metadataChanged) {
    return { snapshot, changed: false, leafIdByInputLeafId }
  }
  const {
    ptyIdsByLeafId: _oldPtyIdsByLeafId,
    buffersByLeafId: _oldBuffersByLeafId,
    scrollbackRefsByLeafId: _oldScrollbackRefsByLeafId,
    titlesByLeafId: _oldTitlesByLeafId,
    ...snapshotWithoutLeafRecords
  } = inputSnapshot
  return {
    snapshot: {
      ...snapshotWithoutLeafRecords,
      root,
      activeLeafId,
      expandedLeafId,
      ...(ptyIdsByLeafId ? { ptyIdsByLeafId } : {}),
      ...(buffersByLeafId ? { buffersByLeafId } : {}),
      ...(scrollbackRefsByLeafId ? { scrollbackRefsByLeafId } : {}),
      ...(titlesByLeafId ? { titlesByLeafId } : {})
    },
    changed: true,
    leafIdByInputLeafId
  }
}

function normalizeWorkspaceSessionPaneIdentities(
  session: WorkspaceSessionState,
  priorLayoutsByTabId: Record<string, TerminalLayoutSnapshot> = {}
): {
  session: WorkspaceSessionState
  changed: boolean
  leafIdByInputLeafIdByTabId: Map<string, Map<string, string>>
  leafIdByPtyIdByTabId: Map<string, Map<string, string>>
  migrationUnsupportedEntries: MigrationUnsupportedPtyEntry[]
  legacyPaneKeyAliasEntries: LegacyPaneKeyAliasEntry[]
} {
  let changed = false
  const leafIdByInputLeafIdByTabId = new Map<string, Map<string, string>>()
  const leafIdByPtyIdByTabId = new Map<string, Map<string, string>>()
  const migrationUnsupportedEntries: MigrationUnsupportedPtyEntry[] = []
  const legacyPaneKeyAliasEntries: LegacyPaneKeyAliasEntry[] = []
  const terminalLayoutsByTabId: Record<string, TerminalLayoutSnapshot> = {}
  for (const [tabId, layout] of Object.entries(session.terminalLayoutsByTabId ?? {})) {
    const normalized = normalizeTerminalLayoutSnapshotForPersistence(
      layout,
      priorLayoutsByTabId[tabId]
    )
    terminalLayoutsByTabId[tabId] = normalized.snapshot
    leafIdByInputLeafIdByTabId.set(tabId, normalized.leafIdByInputLeafId)
    const migrationEntries = collectMigrationUnsupportedPtyEntries({
      session,
      tabId,
      inputLayout: layout,
      normalizedLayout: normalized.snapshot,
      leafIdByInputLeafId: normalized.leafIdByInputLeafId
    })
    // Why: old persisted split layouts can generate enough alias rows to
    // exceed V8's argument limit if the arrays are spread into push().
    for (const entry of migrationEntries.migrationUnsupportedEntries) {
      migrationUnsupportedEntries.push(entry)
    }
    for (const entry of migrationEntries.legacyPaneKeyAliasEntries) {
      legacyPaneKeyAliasEntries.push(entry)
    }
    const leafIdByPtyId = new Map<string, string>()
    const duplicatePtyIds = new Set<string>()
    for (const [leafId, ptyId] of Object.entries(normalized.snapshot.ptyIdsByLeafId ?? {})) {
      if (duplicatePtyIds.has(ptyId)) {
        continue
      }
      if (leafIdByPtyId.has(ptyId)) {
        leafIdByPtyId.delete(ptyId)
        duplicatePtyIds.add(ptyId)
        continue
      }
      leafIdByPtyId.set(ptyId, leafId)
    }
    leafIdByPtyIdByTabId.set(tabId, leafIdByPtyId)
    changed ||= normalized.changed
  }
  return {
    session: changed ? { ...session, terminalLayoutsByTabId } : session,
    changed,
    leafIdByInputLeafIdByTabId,
    leafIdByPtyIdByTabId,
    migrationUnsupportedEntries,
    legacyPaneKeyAliasEntries
  }
}

function remapSshRemotePtyLeaseLeafIds(
  leases: SshRemotePtyLease[],
  leafIdByInputLeafIdByTabId: Map<string, Map<string, string>>,
  leafIdByPtyIdByTabId: Map<string, Map<string, string>>
): { leases: SshRemotePtyLease[]; changed: boolean } {
  let changed = false
  const nextLeases = leases.map((lease) => {
    if (lease.leafId === undefined || isTerminalLeafId(lease.leafId)) {
      return lease
    }
    const remappedLeafId = lease.tabId
      ? leafIdByInputLeafIdByTabId.get(lease.tabId)?.get(lease.leafId)
      : undefined
    const leafIdForPty = lease.tabId
      ? leafIdByPtyIdByTabId.get(lease.tabId)?.get(lease.ptyId)
      : undefined
    changed = true
    const nextLeafId = remappedLeafId ?? leafIdForPty
    if (nextLeafId) {
      return { ...lease, leafId: nextLeafId }
    }
    const next = { ...lease }
    // Why: unmatched legacy leaf ids are ambiguous after migration; do not
    // re-persist them as durable pane identity.
    delete next.leafId
    return next
  })
  return { leases: nextLeases, changed }
}

function normalizePersistedPaneIdentityState(state: PersistedState): {
  state: PersistedState
  changed: boolean
  migrationUnsupportedEntries: MigrationUnsupportedPtyEntry[]
  legacyPaneKeyAliasEntries: LegacyPaneKeyAliasEntry[]
} {
  const normalizedSession = normalizeWorkspaceSessionPaneIdentities(state.workspaceSession, {})
  const remappedLeases = remapSshRemotePtyLeaseLeafIds(
    state.sshRemotePtyLeases ?? [],
    normalizedSession.leafIdByInputLeafIdByTabId,
    normalizedSession.leafIdByPtyIdByTabId
  )
  const mergedMigrationUnsupportedEntries: MigrationUnsupportedPtyEntry[] = []
  const mergedLegacyPaneKeyAliasEntries = mergeLegacyPaneKeyAliasEntries([
    ...normalizeLegacyPaneKeyAliasEntries(state.legacyPaneKeyAliasEntries),
    ...legacyMigrationUnsupportedRowsToAliasEntries(state.migrationUnsupportedPtyEntries ?? []),
    ...normalizedSession.legacyPaneKeyAliasEntries
  ])
  const remappedAcknowledgements = remapAcknowledgedAgentPaneKeys(
    state.ui?.acknowledgedAgentsByPaneKey,
    normalizedSession.leafIdByInputLeafIdByTabId
  )
  const migrationUnsupportedChanged = !migrationUnsupportedEntriesEqual(
    state.migrationUnsupportedPtyEntries ?? [],
    mergedMigrationUnsupportedEntries
  )
  const legacyAliasesChanged = !legacyPaneKeyAliasEntriesEqual(
    state.legacyPaneKeyAliasEntries ?? [],
    mergedLegacyPaneKeyAliasEntries
  )
  if (
    !normalizedSession.changed &&
    !remappedLeases.changed &&
    !migrationUnsupportedChanged &&
    !legacyAliasesChanged &&
    !remappedAcknowledgements.changed
  ) {
    return {
      state,
      changed: false,
      migrationUnsupportedEntries: mergedMigrationUnsupportedEntries,
      legacyPaneKeyAliasEntries: mergedLegacyPaneKeyAliasEntries
    }
  }
  return {
    state: {
      ...state,
      workspaceSession: normalizedSession.session,
      sshRemotePtyLeases: remappedLeases.leases,
      migrationUnsupportedPtyEntries: mergedMigrationUnsupportedEntries,
      legacyPaneKeyAliasEntries: mergedLegacyPaneKeyAliasEntries,
      ...(remappedAcknowledgements.changed
        ? {
            ui: {
              ...state.ui,
              acknowledgedAgentsByPaneKey: remappedAcknowledgements.acknowledgements
            }
          }
        : {})
    },
    changed: true,
    migrationUnsupportedEntries: mergedMigrationUnsupportedEntries,
    legacyPaneKeyAliasEntries: mergedLegacyPaneKeyAliasEntries
  }
}

function remapAcknowledgedAgentPaneKeys(
  acknowledgements: PersistedState['ui']['acknowledgedAgentsByPaneKey'],
  leafIdByInputLeafIdByTabId: Map<string, Map<string, string>>
): { acknowledgements: PersistedState['ui']['acknowledgedAgentsByPaneKey']; changed: boolean } {
  if (!acknowledgements || Object.keys(acknowledgements).length === 0) {
    return { acknowledgements, changed: false }
  }

  let changed = false
  const next: NonNullable<PersistedState['ui']['acknowledgedAgentsByPaneKey']> = {}
  const setAcknowledgement = (paneKey: string, acknowledgedAt: number): void => {
    const existing = next[paneKey]
    next[paneKey] = existing === undefined ? acknowledgedAt : Math.max(existing, acknowledgedAt)
  }
  for (const [paneKey, acknowledgedAt] of Object.entries(acknowledgements)) {
    const parsed = parsePaneKey(paneKey)
    if (parsed) {
      setAcknowledgement(paneKey, acknowledgedAt)
      continue
    }

    const delimiter = paneKey.indexOf(':')
    if (delimiter <= 0 || delimiter === paneKey.length - 1) {
      setAcknowledgement(paneKey, acknowledgedAt)
      continue
    }

    const tabId = paneKey.slice(0, delimiter)
    const legacyLeafId = paneKey.slice(delimiter + 1)
    const remappedLeafId = leafIdByInputLeafIdByTabId.get(tabId)?.get(legacyLeafId)
    if (!remappedLeafId || !isTerminalLeafId(remappedLeafId)) {
      setAcknowledgement(paneKey, acknowledgedAt)
      continue
    }

    try {
      // Why: UI acks are keyed by paneKey just like hook rows. When a legacy
      // numeric/pane:* leaf is promoted to a UUID, carry the read marker over
      // so already-seen Activity/sidebar rows do not come back unread.
      setAcknowledgement(makePaneKey(tabId, remappedLeafId), acknowledgedAt)
      changed = true
    } catch {
      setAcknowledgement(paneKey, acknowledgedAt)
    }
  }

  return { acknowledgements: next, changed }
}

// Why: bound the removed-SSH-target history so remove/re-add churn can't grow
// the state file without limit. Re-adoption only needs recent removals.
const MAX_REMOVED_SSH_TARGET_TOMBSTONES = 50

function registerPersistedPaneKeyAlias(entry: LegacyPaneKeyAliasEntry): void {
  if (parseLegacyNumericPaneKey(entry.legacyPaneKey)) {
    agentHookServer.registerPaneKeyAlias(
      entry.legacyPaneKey,
      entry.stablePaneKey,
      entry.ptyId,
      entry.updatedAt,
      { overwriteExisting: false }
    )
    return
  }
  // Why: detached agents keep their original UUID pane key across restarts;
  // restore the physical-to-current-owner mapping before hook replay begins.
  agentHookServer.transferPaneAuthority(
    entry.legacyPaneKey,
    entry.stablePaneKey,
    entry.ptyId,
    entry.updatedAt,
    { authorityVerified: false }
  )
}

function mergeLegacyPaneKeyAliasEntries(
  entries: LegacyPaneKeyAliasEntry[]
): LegacyPaneKeyAliasEntry[] {
  const byLegacyPaneKey = new Map<string, LegacyPaneKeyAliasEntry>()
  for (const entry of normalizeLegacyPaneKeyAliasEntries(entries)) {
    const existing = byLegacyPaneKey.get(entry.legacyPaneKey)
    if (!existing || existing.updatedAt <= entry.updatedAt) {
      byLegacyPaneKey.set(entry.legacyPaneKey, entry)
    }
  }
  return [...byLegacyPaneKey.values()]
}

function legacyPaneKeyAliasEntriesEqual(
  left: LegacyPaneKeyAliasEntry[],
  right: LegacyPaneKeyAliasEntry[]
): boolean {
  if (left.length !== right.length) {
    return false
  }
  const rightByLegacyPaneKey = new Map(right.map((entry) => [entry.legacyPaneKey, entry]))
  return left.every((entry) => {
    const other = rightByLegacyPaneKey.get(entry.legacyPaneKey)
    return other ? JSON.stringify(entry) === JSON.stringify(other) : false
  })
}

function migrationUnsupportedEntriesEqual(
  left: MigrationUnsupportedPtyEntry[],
  right: MigrationUnsupportedPtyEntry[]
): boolean {
  if (left.length !== right.length) {
    return false
  }
  const rightByPtyId = new Map(right.map((entry) => [entry.ptyId, entry]))
  return left.every((entry) => {
    const other = rightByPtyId.get(entry.ptyId)
    return other ? JSON.stringify(entry) === JSON.stringify(other) : false
  })
}

function projectHostSetupCompatibilityStateEqual(
  state: Pick<PersistedState, 'projects' | 'projectHostSetups'>,
  nextState: Pick<PersistedState, 'projects' | 'projectHostSetups'>
): boolean {
  return (
    JSON.stringify(state.projects ?? []) === JSON.stringify(nextState.projects) &&
    JSON.stringify(state.projectHostSetups ?? []) === JSON.stringify(nextState.projectHostSetups)
  )
}

function isRepoBackedProjectHostSetup(
  setup: ProjectHostSetup,
  currentRepoIds: ReadonlySet<string>
): boolean {
  const repoId = typeof setup.repoId === 'string' ? setup.repoId : ''
  return repoId.length > 0 && (currentRepoIds.has(repoId) || setup.id === repoId)
}

function mergeProjectHostSetupCompatibilityState(
  state: Pick<PersistedState, 'projects' | 'projectHostSetups'>,
  repos: readonly Repo[]
): Pick<PersistedState, 'projects' | 'projectHostSetups'> {
  const projection = projectHostSetupProjectionFromRepos(repos)
  const existingProjectsById = new Map(
    (state.projects ?? []).map((project) => [project.id, project])
  )
  const currentRepoIds = new Set(repos.map((repo) => repo.id))
  const projectedProjectIds = new Set(projection.projects.map((project) => project.id))
  const projectedSetupIds = new Set(projection.setups.map((setup) => setup.id))
  // Why: legacy/repo-backed setup rows use the repo id as the setup id. Keep
  // only independent setup rows here so repo deletion does not leave ghosts.
  const independentSetups = (state.projectHostSetups ?? []).filter((setup) => {
    if (projectedSetupIds.has(setup.id)) {
      return false
    }
    return !isRepoBackedProjectHostSetup(setup, currentRepoIds)
  })
  const independentProjectIds = new Set(independentSetups.map((setup) => setup.projectId))
  const independentProjects = (state.projects ?? [])
    .filter(
      (project) => independentProjectIds.has(project.id) && !projectedProjectIds.has(project.id)
    )
    .map((project) => ({
      ...project,
      sourceRepoIds: project.sourceRepoIds.filter((repoId) => currentRepoIds.has(repoId))
    }))
  const projectedProjects = projection.projects.map((project) => {
    const existingProject = existingProjectsById.get(project.id)
    return existingProject?.localWindowsRuntimePreference
      ? {
          ...project,
          localWindowsRuntimePreference: existingProject.localWindowsRuntimePreference,
          updatedAt: Math.max(project.updatedAt, existingProject.updatedAt)
        }
      : project
  })
  return {
    projects: [...projectedProjects, ...independentProjects],
    projectHostSetups: [...projection.setups, ...independentSetups]
  }
}

function makeProjectHostSetupId(
  projectId: string,
  hostId: ExecutionHostId,
  existingIds: ReadonlySet<string>,
  requestedId?: string
): string {
  const baseId = requestedId?.trim() || `${projectId}::${hostId}`
  if (!existingIds.has(baseId)) {
    return baseId
  }
  let suffix = 2
  let candidate = `${baseId}::${suffix}`
  while (existingIds.has(candidate)) {
    suffix++
    candidate = `${baseId}::${suffix}`
  }
  return candidate
}

function createMinimalPersistedTerminalTab(args: {
  worktreeId: string
  worktreeInstanceId?: string | null
  tabId: string
  ptyId: string
  existingTabCount: number
  startupCwd?: string
}): TerminalTab {
  const ordinal = args.existingTabCount + 1
  const defaultTitle = `Terminal ${ordinal}`
  return {
    id: args.tabId,
    ptyId: args.ptyId,
    worktreeId: args.worktreeId,
    ...(args.worktreeInstanceId ? { worktreeInstanceId: args.worktreeInstanceId } : {}),
    title: defaultTitle,
    defaultTitle,
    customTitle: null,
    color: null,
    sortOrder: args.existingTabCount,
    createdAt: Date.now(),
    ...(args.startupCwd ? { startupCwd: args.startupCwd } : {}),
    pendingActivationSpawn: true
  }
}

function inferFolderScopeConnectionIdForMigration(args: {
  folderPath: string
  projectGroupId: string
  projectGroups: readonly ProjectGroup[]
  repos: readonly Repo[]
}): string | null {
  const groupIds = getProjectGroupSubtreeIds(args.projectGroups, args.projectGroupId)
  const groupRepos = args.repos.filter(
    (repo) => typeof repo.projectGroupId === 'string' && groupIds.has(repo.projectGroupId)
  )
  const candidateRepos =
    groupRepos.length > 0
      ? groupRepos
      : args.repos.filter((repo) => isPathInsideOrEqual(args.folderPath, repo.path))
  if (candidateRepos.length === 0) {
    return null
  }
  let hasLocalRepo = false
  const connectionIds = new Set<string>()
  for (const repo of candidateRepos) {
    if (repo.connectionId) {
      connectionIds.add(repo.connectionId)
    } else {
      hasLocalRepo = true
    }
  }
  if (hasLocalRepo || connectionIds.size !== 1) {
    return null
  }
  return [...connectionIds][0]
}

function backfillFolderScopeConnectionIds(state: PersistedState): {
  state: PersistedState
  changed: boolean
} {
  const groups = state.projectGroups ?? []
  const repos = state.repos ?? []
  let changed = false
  const projectGroups = groups.map((group) => {
    if (group.connectionId || !group.parentPath) {
      return group
    }
    const connectionId = inferFolderScopeConnectionIdForMigration({
      folderPath: group.parentPath,
      projectGroupId: group.id,
      projectGroups: groups,
      repos
    })
    if (!connectionId) {
      return group
    }
    changed = true
    return { ...group, connectionId }
  })
  const groupsById = new Map(projectGroups.map((group) => [group.id, group]))
  const folderWorkspaces = (state.folderWorkspaces ?? []).map((workspace) => {
    if (workspace.connectionId) {
      return workspace
    }
    const groupConnectionId = groupsById.get(workspace.projectGroupId)?.connectionId ?? null
    const connectionId =
      groupConnectionId ??
      inferFolderScopeConnectionIdForMigration({
        folderPath: workspace.folderPath,
        projectGroupId: workspace.projectGroupId,
        projectGroups,
        repos
      })
    if (!connectionId) {
      return workspace
    }
    changed = true
    return { ...workspace, connectionId }
  })
  return {
    changed,
    state: changed ? { ...state, projectGroups, folderWorkspaces } : state
  }
}

function deleteRemovedTerminalScrollbackSnapshots(
  prior: WorkspaceSessionState | undefined,
  next: WorkspaceSessionState,
  storage?: TerminalScrollbackSnapshotStorage
): void {
  if (!prior) {
    return
  }
  const nextRefs = collectTerminalScrollbackSnapshotRefs(next)
  for (const ref of collectTerminalScrollbackSnapshotRefs(prior)) {
    if (!nextRefs.has(ref)) {
      deleteTerminalScrollbackSnapshotSync(ref, storage)
    }
  }
}

export type StoreOptions = {
  dataFile?: string
}

type SpoolVisibilityCommitBase = {
  worktreeId: string
  expectedInstanceId: string
}

export type SpoolVisibilityCommitChange = SpoolVisibilityCommitBase &
  (
    | {
        visibility: 'public'
        spoolIncarnationId: string
        nextInstanceId?: never
      }
    | {
        visibility: 'private'
        spoolIncarnationId?: string
        nextInstanceId?: string
      }
  )

export class Store {
  private state: PersistedState
  private readonly dataFile: string
  private readonly terminalScrollbackSnapshotStorage: TerminalScrollbackSnapshotStorage
  private readonly durableStateFile: DurableStateFile
  private readonly githubCacheFile: GitHubCacheFile
  private readonly notifications = new PersistedStateNotifications()
  private gitUsernameCache = new Map<string, string>()
  private loadNeedsSave = false

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

  private adaptFlatFolderScanProjectGroups(): boolean {
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

  private load(): PersistedState {
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

    const automationContextMigration = backfillLegacyAutomationContexts({
      ...result,
      repos,
      ...projectHostSetupCompatibility
    })
    if (automationContextMigration.changed) {
      this.loadNeedsSave = true
    }
    result = {
      ...result,
      automations: automationContextMigration.state.automations,
      automationRuns: automationContextMigration.state.automationRuns
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

  private scheduleSave(): void {
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

  updateProjectHostSetup(args: ProjectHostSetupUpdateArgs): ProjectHostSetupUpdateResult | null {
    const setup = this.state.projectHostSetups.find((entry) => entry.id === args.setupId)
    if (!setup) {
      return null
    }
    const project = this.state.projects.find((entry) => entry.id === setup.projectId)
    if (!project) {
      return null
    }
    const repo = setup.repoId
      ? this.state.repos.find((entry) => entry.id === setup.repoId)
      : undefined
    if (repo) {
      const updated = this.updateRepoBackedProjectHostSetup(setup, repo, args.updates)
      const updatedProject = updated
        ? this.state.projects.find((entry) => entry.id === updated.setup.projectId)
        : undefined
      return updated && updatedProject
        ? { project: updatedProject, setup: updated.setup, repo: updated.repo }
        : null
    }
    const updatedSetup = this.updateIndependentProjectHostSetup(setup, args.updates)
    return { project, setup: updatedSetup }
  }

  deleteProjectHostSetup(args: ProjectHostSetupDeleteArgs): ProjectHostSetupDeleteResult | null {
    const setup = this.state.projectHostSetups.find((entry) => entry.id === args.setupId)
    if (!setup) {
      return null
    }
    const project = this.state.projects.find((entry) => entry.id === setup.projectId)
    if (!project) {
      return null
    }
    const repo = setup.repoId
      ? this.state.repos.find((entry) => entry.id === setup.repoId)
      : undefined
    if (repo) {
      this.removeProject(repo.id)
      return { project, setup, repo: this.hydrateRepo(repo) }
    }
    this.state.projectHostSetups = this.state.projectHostSetups.filter(
      (entry) => entry.id !== setup.id
    )
    this.scheduleSave()
    return { project, setup }
  }

  /**
   * O(1) read of the persisted repo count. Use this when you only need the
   * count (e.g. cohort-classifier) — `getRepos()` hydrates each repo, which
   * is wasteful when the caller only reads `.length`.
   */
  getRepoCount(): number {
    return this.state.repos.length
  }

  getRepo(id: string): Repo | undefined {
    const repo = this.state.repos.find((r) => r.id === id)
    return repo ? this.hydrateRepo(repo) : undefined
  }

  /**
   * Record a background-resolved git username (repo-git-username-enrichment).
   * Kept out of updateRepo's whitelist so the renderer-facing update surface
   * cannot write it directly. Returns true when the hydrated value changed.
   */
  setResolvedRepoGitUsername(id: string, username: string): boolean {
    const repo = this.state.repos.find((r) => r.id === id)
    if (!repo) {
      return false
    }
    const previous = this.gitUsernameCache.get(repo.path) ?? repo.gitUsername ?? ''
    this.gitUsernameCache.set(repo.path, username)
    if (previous === username) {
      return false
    }
    if (username) {
      // Why: persisting the resolved value lets the next launch hydrate repos
      // with the right branch prefix before enrichment has re-run.
      repo.gitUsername = username
    } else {
      delete repo.gitUsername
    }
    this.scheduleSave()
    return true
  }

  getProjectGroups(): ProjectGroup[] {
    return [...(this.state.projectGroups ?? [])].sort(
      (left, right) => left.tabOrder - right.tabOrder || left.name.localeCompare(right.name)
    )
  }

  createProjectGroup(input: {
    name: string
    parentPath?: string | null
    connectionId?: string | null
    parentGroupId?: string | null
    createdFrom: ProjectGroup['createdFrom']
  }): ProjectGroup {
    let maxOrder = -1
    // Why: persisted group lists can be large enough to exceed spread limits.
    for (const existingGroup of this.state.projectGroups ?? []) {
      maxOrder = Math.max(maxOrder, existingGroup.tabOrder)
    }
    const group = createProjectGroup({
      ...input,
      tabOrder: maxOrder + 1
    })
    this.state.projectGroups = [...(this.state.projectGroups ?? []), group]
    this.scheduleSave()
    return group
  }

  updateProjectGroup(
    groupId: string,
    updates: Partial<Pick<ProjectGroup, 'name' | 'isCollapsed' | 'tabOrder' | 'color'>>
  ): ProjectGroup | null {
    const group = (this.state.projectGroups ?? []).find((entry) => entry.id === groupId)
    if (!group) {
      return null
    }
    if (updates.name !== undefined) {
      group.name = normalizeProjectGroupName(updates.name, group.name)
    }
    if (updates.isCollapsed !== undefined) {
      group.isCollapsed = updates.isCollapsed
    }
    if (updates.tabOrder !== undefined && Number.isFinite(updates.tabOrder)) {
      group.tabOrder = updates.tabOrder
    }
    if (updates.color !== undefined) {
      group.color = typeof updates.color === 'string' ? updates.color : null
    }
    group.updatedAt = Date.now()
    this.scheduleSave()
    return group
  }

  deleteProjectGroup(groupId: string): boolean {
    const before = this.state.projectGroups?.length ?? 0
    const deletedGroupIds = getProjectGroupSubtreeIds(this.state.projectGroups ?? [], groupId)
    this.state.projectGroups = (this.state.projectGroups ?? []).filter(
      (group) => !deletedGroupIds.has(group.id)
    )
    if ((this.state.projectGroups?.length ?? 0) === before) {
      return false
    }
    // Why: groups are sidebar organization only. Deleting one must not delete
    // repos or worktrees, so contained repos from the full subtree are ungrouped.
    this.state.repos = this.state.repos.map((repo) =>
      repo.projectGroupId && deletedGroupIds.has(repo.projectGroupId)
        ? { ...repo, projectGroupId: null }
        : repo
    )
    for (const workspace of this.state.folderWorkspaces ?? []) {
      if (deletedGroupIds.has(workspace.projectGroupId)) {
        this.state.workspaceSession = removeWorkspaceSessionOwner(
          this.state.workspaceSession,
          folderWorkspaceKey(workspace.id)
        )!
        this.removeWorkspaceLineageForFolderParent(workspace.id)
      }
    }
    this.state.folderWorkspaces = (this.state.folderWorkspaces ?? []).filter(
      (workspace) => !deletedGroupIds.has(workspace.projectGroupId)
    )
    this.scheduleSave()
    return true
  }

  getFolderWorkspaces(): FolderWorkspace[] {
    return [...(this.state.folderWorkspaces ?? [])].sort(
      (left, right) => right.sortOrder - left.sortOrder || left.name.localeCompare(right.name)
    )
  }

  getFolderWorkspace(id: string): FolderWorkspace | undefined {
    return (this.state.folderWorkspaces ?? []).find((workspace) => workspace.id === id)
  }

  createFolderWorkspace(input: {
    projectGroupId: string
    name?: string
    folderPath?: string | null
    linkedReview?: FolderWorkspace['linkedReview']
    connectionId?: string | null
    createdWithAgent?: FolderWorkspace['createdWithAgent']
    pendingFirstAgentMessageRename?: boolean
  }): FolderWorkspace {
    const group = (this.state.projectGroups ?? []).find(
      (entry) => entry.id === input.projectGroupId
    )
    const folderPath =
      typeof input.folderPath === 'string' && input.folderPath.trim().length > 0
        ? input.folderPath
        : group?.parentPath
    if (!group || !folderPath) {
      throw new Error('Folder-backed project group not found.')
    }
    const now = Date.now()
    const workspace: FolderWorkspace = {
      id: randomUUID(),
      projectGroupId: group.id,
      name: normalizeFolderWorkspaceName(input.name, `${group.name} workspace`),
      folderPath,
      connectionId: input.connectionId ?? group.connectionId ?? null,
      linkedReview: input.linkedReview ?? null,
      comment: '',
      isArchived: false,
      isUnread: false,
      isPinned: false,
      sortOrder: now,
      ...(input.createdWithAgent ? { createdWithAgent: input.createdWithAgent } : {}),
      ...(input.pendingFirstAgentMessageRename === true && input.createdWithAgent
        ? { pendingFirstAgentMessageRename: true }
        : {}),
      lastActivityAt: 0,
      createdAt: now,
      updatedAt: now
    }
    this.state.folderWorkspaces = [workspace, ...(this.state.folderWorkspaces ?? [])]
    this.scheduleSave()
    return workspace
  }

  updateFolderWorkspace(
    id: string,
    updates: Partial<
      Pick<
        FolderWorkspace,
        | 'name'
        | 'folderPath'
        | 'linkedReview'
        | 'comment'
        | 'isArchived'
        | 'isUnread'
        | 'isPinned'
        | 'sortOrder'
        | 'manualOrder'
        | 'workspaceStatus'
        | 'createdWithAgent'
        | 'pendingFirstAgentMessageRename'
        | 'firstAgentMessageRenameError'
        | 'lastActivityAt'
      >
    >
  ): FolderWorkspace | null {
    const workspace = this.getFolderWorkspace(id)
    if (!workspace) {
      return null
    }
    if (updates.name !== undefined) {
      workspace.name = normalizeFolderWorkspaceName(updates.name, workspace.name)
    }
    if (typeof updates.folderPath === 'string' && updates.folderPath.trim().length > 0) {
      workspace.folderPath = updates.folderPath
    }
    if (updates.linkedReview !== undefined) {
      workspace.linkedReview = updates.linkedReview
    }
    if (updates.comment !== undefined) {
      workspace.comment = updates.comment
    }
    if (updates.isArchived !== undefined) {
      workspace.isArchived = updates.isArchived
    }
    if (updates.isUnread !== undefined) {
      workspace.isUnread = updates.isUnread
    }
    if (updates.isPinned !== undefined) {
      workspace.isPinned = updates.isPinned
    }
    if (updates.sortOrder !== undefined && Number.isFinite(updates.sortOrder)) {
      workspace.sortOrder = updates.sortOrder
    }
    if (updates.manualOrder !== undefined) {
      if (Number.isFinite(updates.manualOrder)) {
        workspace.manualOrder = updates.manualOrder
      } else {
        delete workspace.manualOrder
      }
    }
    if (updates.workspaceStatus !== undefined) {
      workspace.workspaceStatus = updates.workspaceStatus
    }
    if (updates.createdWithAgent !== undefined) {
      workspace.createdWithAgent = updates.createdWithAgent
    }
    if (updates.pendingFirstAgentMessageRename !== undefined) {
      workspace.pendingFirstAgentMessageRename = updates.pendingFirstAgentMessageRename
    }
    if (updates.firstAgentMessageRenameError !== undefined) {
      workspace.firstAgentMessageRenameError = updates.firstAgentMessageRenameError
    }
    if (updates.lastActivityAt !== undefined && Number.isFinite(updates.lastActivityAt)) {
      workspace.lastActivityAt = updates.lastActivityAt
    }
    workspace.updatedAt = Date.now()
    this.scheduleSave()
    return workspace
  }

  removeFolderWorkspace(id: string): boolean {
    const before = this.state.folderWorkspaces?.length ?? 0
    this.state.folderWorkspaces = (this.state.folderWorkspaces ?? []).filter(
      (workspace) => workspace.id !== id
    )
    if ((this.state.folderWorkspaces?.length ?? 0) === before) {
      return false
    }
    this.state.workspaceSession = removeWorkspaceSessionOwner(
      this.state.workspaceSession,
      folderWorkspaceKey(id)
    )!
    this.removeWorkspaceLineageForFolderParent(id)
    this.scheduleSave()
    return true
  }

  moveProjectToGroup(repoId: string, groupId: string | null, order?: number): Repo | null {
    const repo = this.state.repos.find((entry) => entry.id === repoId)
    if (!repo) {
      return null
    }
    const normalizedGroupId =
      groupId && (this.state.projectGroups ?? []).some((group) => group.id === groupId)
        ? groupId
        : null
    const siblingRepos = this.state.repos.filter((entry) => entry.id !== repoId)
    repo.projectGroupId = normalizedGroupId
    repo.projectGroupOrder =
      typeof order === 'number' && Number.isFinite(order)
        ? order
        : getNextProjectGroupOrder(siblingRepos, normalizedGroupId)
    this.scheduleSave()
    return this.hydrateRepo(repo)
  }

  addRepo(repo: Repo): void {
    this.state.repos.push(repo)
    this.syncProjectHostSetupCompatibilityState()
    this.scheduleSave()
  }

  // Why: returns false on a stale permutation (concurrent add/remove races
  // the renderer's drag) so the caller can tell the renderer to resync rather
  // than persist an order that drops or duplicates ids.
  reorderRepos(orderedIds: string[]): boolean {
    const current = this.state.repos
    if (orderedIds.length !== current.length) {
      return false
    }
    const seen = new Set<string>()
    for (const id of orderedIds) {
      if (typeof id !== 'string' || seen.has(id)) {
        return false
      }
      seen.add(id)
    }
    const byId = new Map<string, Repo>()
    for (const r of current) {
      byId.set(r.id, r)
    }
    const next: Repo[] = []
    for (const id of orderedIds) {
      const repo = byId.get(id)
      if (!repo) {
        return false
      }
      next.push(repo)
    }
    this.state.repos = next
    this.syncProjectHostSetupCompatibilityState()
    this.scheduleSave()
    return true
  }

  // Why: repo ids are unique only within an execution host, and renderer drags
  // persist one complete permutation per host when local and SSH repos coexist.
  reorderReposForHost(orderedIds: string[], hostId: ExecutionHostId): boolean {
    const current = this.state.repos
    const hostRepos = current.filter((repo) => getRepoExecutionHostId(repo) === hostId)
    if (orderedIds.length !== hostRepos.length) {
      return false
    }
    const byId = new Map(hostRepos.map((repo) => [repo.id, repo]))
    if (byId.size !== hostRepos.length) {
      return false
    }
    const seen = new Set<string>()
    const reorderedHostRepos: Repo[] = []
    for (const id of orderedIds) {
      const repo = typeof id === 'string' && !seen.has(id) ? byId.get(id) : undefined
      if (!repo) {
        return false
      }
      seen.add(id)
      reorderedHostRepos.push(repo)
    }
    let nextHostIndex = 0
    this.state.repos = current.map((repo) =>
      getRepoExecutionHostId(repo) === hostId ? reorderedHostRepos[nextHostIndex++] : repo
    )
    this.syncProjectHostSetupCompatibilityState()
    this.scheduleSave()
    return true
  }

  removeProject(id: string): void {
    this.state.repos = this.state.repos.filter((r) => r.id !== id)
    this.syncProjectHostSetupCompatibilityState()
    // Why: presets are repo-scoped, so removing the repo means the presets
    // can never be referenced again — drop them with the parent.
    delete this.state.sparsePresetsByRepo[id]
    this.pruneWorktreeStateForRepo(id, null)
    this.scheduleSave()
  }

  // Why: the same repo id can exist on more than one execution host (local, an
  // SSH target, a re-added SSH target). Forgetting one host's copy must remove
  // only that host's repo row and worktree metadata — never the local or
  // another host's records that happen to share the id.
  removeProjectForHost(id: string, hostId: ExecutionHostId): void {
    this.state.repos = this.state.repos.filter(
      (r) => !(r.id === id && getRepoExecutionHostId(r) === hostId)
    )
    const idStillPresent = this.state.repos.some((r) => r.id === id)
    // Why: presets are repo-id-scoped (not host-scoped); only drop them once the
    // last host's copy of this repo is gone, or a surviving host loses its presets.
    if (!idStillPresent) {
      delete this.state.sparsePresetsByRepo[id]
    }
    this.syncProjectHostSetupCompatibilityState()
    // Why: if the id survives on another host, prune only this host's worktree
    // metas; otherwise prune everything for the id (matches removeProject).
    this.pruneWorktreeStateForRepo(id, idStillPresent ? hostId : null)
    this.scheduleSave()
  }

  // Clean up worktree meta, lineage, and workspace lineage for a repo id.
  // When hostId is null, prune all of the repo's entries; when a hostId is
  // given, prune only entries whose meta.hostId resolves to that host (a
  // missing hostId is treated as local).
  private pruneWorktreeStateForRepo(id: string, hostId: ExecutionHostId | null): void {
    const prefix = `${id}::`
    // Why: owner ids do not encode their execution host, so only the selected
    // host partition may be pruned while another host still owns the repo id.
    const sessions = removeRepoFromWorkspaceSessionsForHost({
      workspaceSession: this.state.workspaceSession,
      workspaceSessionsByHostId: this.state.workspaceSessionsByHostId,
      repoId: id,
      hostId
    })
    this.state.workspaceSession = sessions.workspaceSession
    this.state.workspaceSessionsByHostId = sessions.workspaceSessionsByHostId
    // Why: snapshot host membership up front. Lineage pruning below checks the
    // meta.hostId of worktree keys that may already have been deleted from
    // worktreeMeta in the first loop, so reading hostId live would misclassify
    // an SSH worktree as local once its meta is gone.
    const hostMembership = new Map<string, boolean>()
    const belongsToHost = (key: string): boolean => {
      if (!key.startsWith(prefix)) {
        return false
      }
      if (hostId === null) {
        return true
      }
      const cached = hostMembership.get(key)
      if (cached !== undefined) {
        return cached
      }
      // Why default to local: worktree metas created on/after host-ownership
      // stamping carry hostId. A metas without it predates that and is treated as
      // local, so a host-scoped (non-local) prune conservatively leaves it — it
      // may leak a stale entry for a legacy SSH worktree sharing a repo id with a
      // local repo, but it never deletes the wrong host's live meta.
      const metaHostId = this.state.worktreeMeta[key]?.hostId ?? LOCAL_EXECUTION_HOST_ID
      const result = metaHostId === hostId
      hostMembership.set(key, result)
      return result
    }
    for (const key of Object.keys(this.state.worktreeMeta)) {
      if (belongsToHost(key)) {
        delete this.state.worktreeMeta[key]
      }
    }
    for (const [childId, lineage] of Object.entries(this.state.worktreeLineageById)) {
      if (belongsToHost(childId) || belongsToHost(lineage.parentWorktreeId)) {
        delete this.state.worktreeLineageById[childId]
      }
    }
    for (const [childKey, lineage] of Object.entries(this.state.workspaceLineageByChildKey)) {
      const childScope = parseWorkspaceKey(childKey)
      const parentScope = parseWorkspaceKey(lineage.parentWorkspaceKey)
      if (childScope?.type === 'worktree' && belongsToHost(childScope.worktreeId)) {
        delete this.state.workspaceLineageByChildKey[childKey as WorkspaceKey]
        continue
      }
      if (parentScope?.type === 'worktree' && belongsToHost(parentScope.worktreeId)) {
        delete this.state.workspaceLineageByChildKey[childKey as WorkspaceKey]
      }
    }
  }

  updateRepo(
    id: string,
    updates: Partial<
      Pick<
        Repo,
        | 'displayName'
        | 'badgeColor'
        | 'repoIcon'
        | 'upstream'
        | 'gitRemoteIdentity'
        | 'hookSettings'
        | 'worktreeBaseRef'
        | 'worktreeBasePath'
        | 'kind'
        | 'executionHostId'
        | 'symlinkPaths'
        | 'forgeRemotePreference'
        | 'forkSyncMode'
        | 'externalWorktreeVisibility'
        | 'externalWorktreeVisibilityPromptDismissedAt'
        | 'externalWorktreeInboxBaselinePaths'
        | 'importedExternalWorktreePaths'
        | 'projectGroupId'
        | 'projectGroupOrder'
        | 'projectHostSetupMethod'
      >
    > & {
      sourceControlAi?: Repo['sourceControlAi'] | null
      externalWorktreeDiscoverySuppressedAt?: Repo['externalWorktreeDiscoverySuppressedAt'] | null
    }
  ): Repo | null {
    const repo = this.state.repos.find((r) => r.id === id)
    if (!repo) {
      return null
    }
    const sanitizedUpdates = sanitizeRepoUpdatesForPersistence(updates)
    if ('projectGroupId' in sanitizedUpdates) {
      const nextGroupId = sanitizedUpdates.projectGroupId
      if (
        typeof nextGroupId !== 'string' ||
        nextGroupId.trim().length === 0 ||
        !this.state.projectGroups.some((group) => group.id === nextGroupId)
      ) {
        sanitizedUpdates.projectGroupId = null
      }
    }
    if (
      'projectGroupOrder' in sanitizedUpdates &&
      (typeof sanitizedUpdates.projectGroupOrder !== 'number' ||
        !Number.isFinite(sanitizedUpdates.projectGroupOrder))
    ) {
      delete sanitizedUpdates.projectGroupOrder
    }
    const externalWorktreeVisibilityLegacy =
      'externalWorktreeVisibility' in sanitizedUpdates &&
      repo.externalWorktreeVisibilityLegacy === undefined
        ? isLegacyRepoForExternalWorktreeVisibility(repo)
        : undefined
    // Why: selected repo fields use `undefined` as an explicit clear signal,
    // so delete them before assigning the rest of the patch.
    if (
      'forgeRemotePreference' in sanitizedUpdates &&
      sanitizedUpdates.forgeRemotePreference === undefined
    ) {
      delete repo.forgeRemotePreference
      delete sanitizedUpdates.forgeRemotePreference
    }
    if ('worktreeBasePath' in sanitizedUpdates && sanitizedUpdates.worktreeBasePath === undefined) {
      delete repo.worktreeBasePath
      delete sanitizedUpdates.worktreeBasePath
    }
    if (
      'externalWorktreeVisibility' in sanitizedUpdates &&
      repo.externalWorktreeVisibilityLegacy === undefined
    ) {
      // Why: old persisted repos have no explicit marker. Stamp it the first
      // time visibility changes so later hide/show choices keep legacy safety.
      repo.externalWorktreeVisibilityLegacy = externalWorktreeVisibilityLegacy
    }
    if (
      'externalWorktreeDiscoverySuppressedAt' in sanitizedUpdates &&
      (sanitizedUpdates.externalWorktreeDiscoverySuppressedAt === undefined ||
        sanitizedUpdates.externalWorktreeDiscoverySuppressedAt === null)
    ) {
      delete repo.externalWorktreeDiscoverySuppressedAt
      delete sanitizedUpdates.externalWorktreeDiscoverySuppressedAt
    }
    if (
      'sourceControlAi' in sanitizedUpdates &&
      (sanitizedUpdates.sourceControlAi === undefined || sanitizedUpdates.sourceControlAi === null)
    ) {
      delete repo.sourceControlAi
      delete sanitizedUpdates.sourceControlAi
    } else if ('sourceControlAi' in sanitizedUpdates) {
      const normalizedSourceControlAi = normalizeRepoSourceControlAiOverrides(
        sanitizedUpdates.sourceControlAi
      )
      if (normalizedSourceControlAi === undefined) {
        delete sanitizedUpdates.sourceControlAi
      } else {
        sanitizedUpdates.sourceControlAi = normalizedSourceControlAi
      }
    }
    Object.assign(repo, sanitizedUpdates)
    this.syncProjectHostSetupCompatibilityState()
    this.scheduleSave()
    return this.hydrateRepo(repo)
  }

  private syncProjectHostSetupCompatibilityState(): void {
    const compatibilityState = mergeProjectHostSetupCompatibilityState(this.state, this.state.repos)
    this.state.projects = compatibilityState.projects
    this.state.projectHostSetups = compatibilityState.projectHostSetups
  }

  private updateRepoBackedProjectHostSetup(
    setup: ProjectHostSetup,
    repo: Repo,
    updates: ProjectHostSetupUpdateArgs['updates']
  ): { setup: ProjectHostSetup; repo: Repo } | null {
    if (updates.path !== undefined && updates.path !== repo.path) {
      throw new Error(
        'Repo-backed project host setup paths must be changed by re-importing the project.'
      )
    }
    if (updates.setupState !== undefined && updates.setupState !== 'ready') {
      throw new Error('Repo-backed project host setups cannot be marked unavailable.')
    }
    const repoUpdates: Parameters<Store['updateRepo']>[1] = {}
    if (updates.displayName !== undefined) {
      repoUpdates.displayName = updates.displayName
    }
    if (updates.worktreeBasePath !== undefined) {
      repoUpdates.worktreeBasePath = updates.worktreeBasePath
    }
    if (updates.kind !== undefined) {
      repoUpdates.kind = updates.kind
    }
    if (updates.setupMethod === 'provisioned') {
      throw new Error('Repo-backed project host setups cannot be marked provisioned.')
    }
    if (updates.setupMethod !== undefined && updates.setupMethod !== 'legacy-repo') {
      repoUpdates.projectHostSetupMethod = updates.setupMethod
    }
    const updatedRepo =
      Object.keys(repoUpdates).length > 0 ? this.updateRepo(repo.id, repoUpdates) : repo
    if (!updatedRepo) {
      return null
    }
    return {
      setup: this.state.projectHostSetups.find((entry) => entry.id === setup.id) ?? setup,
      repo: updatedRepo
    }
  }

  private updateIndependentProjectHostSetup(
    setup: ProjectHostSetup,
    updates: ProjectHostSetupUpdateArgs['updates']
  ): ProjectHostSetup {
    if (updates.displayName !== undefined) {
      setup.displayName = updates.displayName.trim() || setup.displayName
    }
    if (updates.path !== undefined) {
      setup.path = updates.path.trim() || setup.path
    }
    if (updates.worktreeBasePath !== undefined) {
      const worktreeBasePath = updates.worktreeBasePath.trim()
      if (worktreeBasePath) {
        setup.worktreeBasePath = worktreeBasePath
      } else {
        delete setup.worktreeBasePath
      }
    }
    if (updates.kind !== undefined) {
      setup.kind = updates.kind
    }
    if (updates.gitUsername !== undefined) {
      const gitUsername = updates.gitUsername.trim()
      if (gitUsername) {
        setup.gitUsername = gitUsername
      } else {
        delete setup.gitUsername
      }
    }
    if (updates.setupState !== undefined) {
      setup.setupState = updates.setupState
    }
    if (updates.setupMethod !== undefined) {
      setup.setupMethod = updates.setupMethod
    }
    setup.updatedAt = Date.now()
    this.scheduleSave()
    return setup
  }

  private hydrateRepo(repo: Repo): Repo {
    const {
      repoIcon: rawRepoIcon,
      upstream: rawUpstream,
      gitRemoteIdentity: rawGitRemoteIdentity,
      sourceControlAi: rawSourceControlAi,
      projectHostSetupMethod: rawProjectHostSetupMethod,
      forkSyncMode: rawForkSyncMode,
      ...repoWithoutIcon
    } = repo
    const repoIcon = sanitizeRepoIcon(rawRepoIcon)
    const upstream = sanitizeRepoUpstream(rawUpstream)
    const gitRemoteIdentity = sanitizeGitRemoteIdentity(rawGitRemoteIdentity)
    const sourceControlAi = normalizeRepoSourceControlAiOverrides(rawSourceControlAi)
    const projectHostSetupMethod = sanitizeRepoProjectHostSetupMethod(rawProjectHostSetupMethod)
    const forkSyncMode = sanitizeForkSyncMode(rawForkSyncMode)
    // Why: username resolution spawns git/gh subprocesses, so it must never
    // run inside hydration — the first getRepos() of a launch executes on the
    // Electron main thread and a stuck probe froze startup for minutes on
    // Windows (issue #7225). Hydration only reads the enrichment cache or the
    // value persisted by a previous launch; repo-git-username-enrichment.ts
    // refreshes both in the background.
    const gitUsername = isFolderRepo(repo)
      ? ''
      : (this.gitUsernameCache.get(repo.path) ?? repo.gitUsername ?? '')

    return {
      ...repoWithoutIcon,
      ...(repoIcon !== undefined ? { repoIcon } : {}),
      ...(upstream !== undefined ? { upstream } : {}),
      ...(gitRemoteIdentity !== undefined ? { gitRemoteIdentity } : {}),
      ...(sourceControlAi !== undefined ? { sourceControlAi } : {}),
      ...(projectHostSetupMethod !== undefined ? { projectHostSetupMethod } : {}),
      ...(forkSyncMode !== undefined ? { forkSyncMode } : {}),
      kind: isFolderRepo(repo) ? 'folder' : 'git',
      gitUsername,
      hookSettings: {
        ...getDefaultRepoHookSettings(),
        ...repo.hookSettings,
        scripts: {
          ...getDefaultRepoHookSettings().scripts,
          ...repo.hookSettings?.scripts
        }
      }
    }
  }

  // ── Sparse Presets ─────────────────────────────────────────────────

  getSparsePresets(repoId: string): SparsePreset[] {
    return [...(this.state.sparsePresetsByRepo[repoId] ?? [])].sort((left, right) =>
      left.name.localeCompare(right.name)
    )
  }

  saveSparsePreset(preset: SparsePreset): SparsePreset {
    const existing = this.state.sparsePresetsByRepo[preset.repoId] ?? []
    const index = existing.findIndex((entry) => entry.id === preset.id)
    this.state.sparsePresetsByRepo[preset.repoId] =
      index === -1
        ? [...existing, preset]
        : existing.map((entry, i) => (i === index ? preset : entry))
    this.scheduleSave()
    return preset
  }

  removeSparsePreset(repoId: string, presetId: string): void {
    const existing = this.state.sparsePresetsByRepo[repoId] ?? []
    this.state.sparsePresetsByRepo[repoId] = existing.filter((entry) => entry.id !== presetId)
    this.scheduleSave()
  }

  // ── Automations ───────────────────────────────────────────────────

  listAutomations(): Automation[] {
    return (this.state.automations ?? [])
      .map((automation) => normalizeAutomationSessionReuse(automation))
      .sort((left, right) => left.name.localeCompare(right.name))
  }

  listAutomationRuns(automationId?: string): AutomationRun[] {
    const runs = this.state.automationRuns ?? []
    return [...(automationId ? runs.filter((run) => run.automationId === automationId) : runs)]
      .map((run) => ({
        ...run,
        precheckResult: normalizeAutomationPrecheckResult(run.precheckResult)
      }))
      .sort((left, right) => right.createdAt - left.createdAt)
  }

  createAutomation(input: AutomationCreateInput): Automation {
    const repo = this.state.repos.find((entry) => entry.id === input.projectId)
    const now = Date.now()
    const executionTargetType = repo?.connectionId ? 'ssh' : 'local'
    const schedulerOwner = getAutomationSchedulerOwner(repo)
    const contexts = getAutomationContextsForRepo(repo, this.state.projectHostSetups ?? [])
    const automation: Automation = {
      id: randomUUID(),
      name: input.name.trim() || 'Untitled automation',
      prompt: input.prompt,
      precheck: normalizeAutomationPrecheck(input.precheck),
      agentId: input.agentId,
      runContext: input.runContext ?? contexts.runContext,
      sourceContext: input.sourceContext ?? contexts.sourceContext,
      projectId: input.projectId,
      executionTargetType,
      executionTargetId: executionTargetType === 'ssh' ? (repo?.connectionId ?? '') : 'local',
      schedulerOwner,
      workspaceMode: input.workspaceMode,
      workspaceId: input.workspaceMode === 'existing' ? (input.workspaceId ?? null) : null,
      baseBranch: input.workspaceMode === 'new_per_run' ? (input.baseBranch ?? null) : null,
      setupDecision: normalizeAutomationSetupDecisionForWorkspaceMode(
        input.workspaceMode,
        input.setupDecision
      ),
      reuseSession: input.workspaceMode === 'existing' ? (input.reuseSession ?? false) : false,
      timezone: input.timezone,
      rrule: input.rrule,
      dtstart: input.dtstart,
      enabled: input.enabled ?? true,
      nextRunAt: nextAutomationOccurrenceAfter(input.rrule, input.dtstart, now),
      missedRunPolicy: 'run_once_within_grace',
      missedRunGraceMinutes: input.missedRunGraceMinutes ?? 720,
      createdAt: now,
      updatedAt: now
    }
    this.state.automations = [...(this.state.automations ?? []), automation]
    this.recordFeatureInteraction('automation-created')
    this.flush()
    return automation
  }

  updateAutomation(id: string, updates: AutomationUpdateInput): Automation {
    const index = (this.state.automations ?? []).findIndex((entry) => entry.id === id)
    if (index === -1) {
      throw new Error('Automation not found.')
    }
    const current = this.state.automations[index]
    const repoId = updates.projectId ?? current.projectId
    const repo = this.state.repos.find((entry) => entry.id === repoId)
    const executionTargetType = repo?.connectionId ? 'ssh' : 'local'
    const schedulerOwner = getAutomationSchedulerOwner(repo)
    const contexts = getAutomationContextsForRepo(repo, this.state.projectHostSetups ?? [])
    const rrule = updates.rrule ?? current.rrule
    const dtstart = updates.dtstart ?? current.dtstart
    const scheduleChanged = updates.rrule !== undefined || updates.dtstart !== undefined
    const workspaceMode = updates.workspaceMode ?? current.workspaceMode
    const updated: Automation = {
      ...current,
      ...updates,
      name:
        updates.name !== undefined ? updates.name.trim() || 'Untitled automation' : current.name,
      precheck: Object.hasOwn(updates, 'precheck')
        ? normalizeAutomationPrecheck(updates.precheck)
        : normalizeAutomationPrecheck(current.precheck),
      projectId: repoId,
      runContext: Object.hasOwn(updates, 'runContext')
        ? (updates.runContext ?? null)
        : updates.projectId !== undefined
          ? contexts.runContext
          : (current.runContext ?? contexts.runContext),
      sourceContext: Object.hasOwn(updates, 'sourceContext')
        ? (updates.sourceContext ?? null)
        : updates.projectId !== undefined
          ? contexts.sourceContext
          : (current.sourceContext ?? contexts.sourceContext),
      executionTargetType,
      executionTargetId: executionTargetType === 'ssh' ? (repo?.connectionId ?? '') : 'local',
      schedulerOwner,
      workspaceMode,
      workspaceId:
        workspaceMode === 'existing'
          ? Object.hasOwn(updates, 'workspaceId')
            ? (updates.workspaceId ?? null)
            : current.workspaceId
          : null,
      baseBranch:
        workspaceMode === 'new_per_run'
          ? Object.hasOwn(updates, 'baseBranch')
            ? (updates.baseBranch ?? null)
            : (current.baseBranch ?? null)
          : null,
      setupDecision:
        workspaceMode === 'new_per_run'
          ? Object.hasOwn(updates, 'setupDecision')
            ? normalizeAutomationSetupDecisionForWorkspaceMode(workspaceMode, updates.setupDecision)
            : normalizeAutomationSetupDecisionForWorkspaceMode(workspaceMode, current.setupDecision)
          : undefined,
      reuseSession:
        workspaceMode === 'existing'
          ? (updates.reuseSession ?? current.reuseSession ?? false)
          : false,
      rrule,
      dtstart,
      nextRunAt: scheduleChanged
        ? nextAutomationOccurrenceAfter(rrule, dtstart, Date.now())
        : current.nextRunAt,
      updatedAt: Date.now()
    }
    this.state.automations[index] = updated
    this.flush()
    return updated
  }

  deleteAutomation(id: string): void {
    this.state.automations = (this.state.automations ?? []).filter((entry) => entry.id !== id)
    this.state.automationRuns = (this.state.automationRuns ?? []).filter(
      (entry) => entry.automationId !== id
    )
    this.flush()
  }

  createAutomationRun(
    automation: Automation,
    scheduledFor: number,
    trigger: AutomationRunTrigger = 'scheduled'
  ): AutomationRun {
    const existing = (this.state.automationRuns ?? []).find(
      (run) => run.automationId === automation.id && run.scheduledFor === scheduledFor
    )
    if (existing) {
      return existing
    }
    const now = Date.now()
    // Why: retention prunes old runs, so the count of retained runs is no longer
    // the run's ordinal — carry the number forward from the newest survivor.
    const runNumber = nextAutomationRunNumber(
      (this.state.automationRuns ?? []).filter((run) => run.automationId === automation.id)
    )
    const run: AutomationRun = {
      id: randomUUID(),
      automationId: automation.id,
      runNumber,
      runContext: automation.runContext ?? null,
      sourceContext: automation.sourceContext ?? null,
      title: `${automation.name} run ${runNumber}`,
      scheduledFor,
      status: 'pending',
      trigger,
      workspaceId: automation.workspaceId,
      workspaceDisplayName: this.getAutomationRunWorkspaceDisplayName(automation.workspaceId),
      sessionKind: 'terminal',
      chatSessionId: null,
      terminalSessionId: null,
      terminalPaneKey: null,
      terminalPtyId: null,
      outputSnapshot: null,
      precheckResult: null,
      usage: null,
      error: null,
      startedAt: null,
      dispatchedAt: null,
      createdAt: now
    }
    this.state.automationRuns = pruneAutomationRuns([...(this.state.automationRuns ?? []), run])
    if (trigger === 'manual') {
      this.recordFeatureInteraction('automation-run')
    }
    this.flush()
    return run
  }

  updateAutomationRun(result: AutomationDispatchResult): AutomationRun {
    const index = (this.state.automationRuns ?? []).findIndex((entry) => entry.id === result.runId)
    if (index === -1) {
      throw new Error('Automation run not found.')
    }
    const now = Date.now()
    const current = this.state.automationRuns[index]
    const workspaceId = result.workspaceId ?? current.workspaceId
    const workspaceDisplayName = Object.hasOwn(result, 'workspaceDisplayName')
      ? normalizeAutomationRunWorkspaceDisplayName(result.workspaceDisplayName ?? null)
      : null
    const updated: AutomationRun = {
      ...current,
      status: result.status,
      workspaceId,
      workspaceDisplayName:
        workspaceDisplayName ??
        normalizeAutomationRunWorkspaceDisplayName(current.workspaceDisplayName ?? null) ??
        this.getAutomationRunWorkspaceDisplayName(workspaceId),
      terminalSessionId: Object.hasOwn(result, 'terminalSessionId')
        ? (result.terminalSessionId ?? null)
        : current.terminalSessionId,
      terminalPaneKey: Object.hasOwn(result, 'terminalPaneKey')
        ? normalizeAutomationRunTerminalPaneKey(result.terminalPaneKey)
        : normalizeAutomationRunTerminalPaneKey(current.terminalPaneKey),
      terminalPtyId: Object.hasOwn(result, 'terminalPtyId')
        ? normalizeAutomationRunTerminalPtyId(result.terminalPtyId)
        : normalizeAutomationRunTerminalPtyId(current.terminalPtyId),
      outputSnapshot: Object.hasOwn(result, 'outputSnapshot')
        ? normalizeAutomationRunOutputSnapshot(result.outputSnapshot)
        : normalizeAutomationRunOutputSnapshot(current.outputSnapshot),
      precheckResult: Object.hasOwn(result, 'precheckResult')
        ? normalizeAutomationPrecheckResult(result.precheckResult)
        : normalizeAutomationPrecheckResult(current.precheckResult),
      usage: Object.hasOwn(result, 'usage') ? (result.usage ?? null) : (current.usage ?? null),
      error: result.error ?? null,
      startedAt: current.startedAt ?? now,
      dispatchedAt: result.status === 'dispatched' ? now : current.dispatchedAt
    }
    this.state.automationRuns[index] = updated
    const automation = this.state.automations.find((entry) => entry.id === updated.automationId)
    if (automation) {
      automation.lastRunAt = now
      automation.updatedAt = now
    }
    this.flush()
    return updated
  }

  snapshotAutomationRunWorkspaceDisplayName(workspaceId: string, displayName: string): number {
    const normalizedDisplayName = normalizeAutomationRunWorkspaceDisplayName(displayName)
    if (!normalizedDisplayName) {
      return 0
    }
    let updatedCount = 0
    this.state.automationRuns = (this.state.automationRuns ?? []).map((run) => {
      if (run.workspaceId !== workspaceId || run.workspaceDisplayName === normalizedDisplayName) {
        return run
      }
      updatedCount += 1
      return { ...run, workspaceDisplayName: normalizedDisplayName }
    })
    if (updatedCount > 0) {
      this.flush()
    }
    return updatedCount
  }

  private getAutomationRunWorkspaceDisplayName(
    workspaceId: string | null | undefined
  ): string | null {
    if (!workspaceId) {
      return null
    }
    return normalizeAutomationRunWorkspaceDisplayName(
      this.state.worktreeMeta[workspaceId]?.displayName ??
        getWorktreePathBasenameFromId(workspaceId)
    )
  }

  advanceAutomationNextRun(id: string, now = Date.now()): Automation {
    const index = (this.state.automations ?? []).findIndex((entry) => entry.id === id)
    if (index === -1) {
      throw new Error('Automation not found.')
    }
    const current = this.state.automations[index]
    const nextRunAt = nextAutomationOccurrenceAfter(current.rrule, current.dtstart, now)
    const updated = { ...current, nextRunAt, updatedAt: Date.now() }
    this.state.automations[index] = updated
    this.flush()
    return updated
  }

  getLatestAutomationOccurrence(automation: Automation, now = Date.now()): number | null {
    return latestAutomationOccurrenceAtOrBefore(automation.rrule, automation.dtstart, now)
  }

  // ── Worktree Meta ──────────────────────────────────────────────────

  getWorktreeMeta(worktreeId: string): WorktreeMeta | undefined {
    return this.state.worktreeMeta[worktreeId]
  }

  getAllWorktreeMeta(): Record<string, WorktreeMeta> {
    return this.state.worktreeMeta
  }

  setWorktreeMeta(worktreeId: string, meta: Partial<WorktreeMeta>): WorktreeMeta {
    const existing = this.state.worktreeMeta[worktreeId] || getDefaultWorktreeMeta()
    const updated = { ...existing, ...meta }
    if (!updated.instanceId) {
      updated.instanceId = randomUUID()
    }
    this.state.worktreeMeta[worktreeId] = updated
    this.scheduleSave()
    return updated
  }

  commitSpoolVisibility(changes: readonly SpoolVisibilityCommitChange[]): readonly WorktreeMeta[] {
    if (changes.length === 0) {
      return []
    }
    if (this.durableStateFile.frozen) {
      throw new Error('spool_visibility_store_frozen')
    }
    const previousMeta = this.state.worktreeMeta
    const previousWorktreeLineage = this.state.worktreeLineageById
    const previousWorkspaceLineage = this.state.workspaceLineageByChildKey
    const nextMeta = { ...previousMeta }
    const nextWorktreeLineage = { ...previousWorktreeLineage }
    const nextWorkspaceLineage = { ...previousWorkspaceLineage }
    const committed: WorktreeMeta[] = []
    const changedWorktreeIds = new Set<string>()
    const existingInstanceIds = new Set(
      Object.values(previousMeta).flatMap((meta) => (meta.instanceId ? [meta.instanceId] : []))
    )
    const nextInstanceIds = new Set<string>()

    for (const change of changes) {
      if (changedWorktreeIds.has(change.worktreeId)) {
        throw new Error('spool_visibility_duplicate_change')
      }
      changedWorktreeIds.add(change.worktreeId)
      const existing = nextMeta[change.worktreeId]
      if (!existing || existing.instanceId !== change.expectedInstanceId) {
        throw new Error('spool_visibility_stale_instance')
      }
      if (change.visibility === 'public' && !change.spoolIncarnationId?.trim()) {
        throw new Error('spool_visibility_missing_incarnation')
      }
      if (
        change.nextInstanceId !== undefined &&
        (!change.nextInstanceId.trim() ||
          existingInstanceIds.has(change.nextInstanceId) ||
          nextInstanceIds.has(change.nextInstanceId))
      ) {
        throw new Error('spool_visibility_invalid_next_instance')
      }
      if (change.nextInstanceId) {
        nextInstanceIds.add(change.nextInstanceId)
        // Why: path reuse creates a new authorization identity; retaining
        // lineage would let the replacement inherit provenance from the old instance.
        for (const [worktreeId, lineage] of Object.entries(nextWorktreeLineage)) {
          if (
            lineage.worktreeInstanceId === change.expectedInstanceId ||
            lineage.parentWorktreeInstanceId === change.expectedInstanceId
          ) {
            delete nextWorktreeLineage[worktreeId]
          }
        }
        for (const [workspaceKey, lineage] of Object.entries(nextWorkspaceLineage)) {
          if (
            lineage.childInstanceId === change.expectedInstanceId ||
            lineage.parentInstanceId === change.expectedInstanceId
          ) {
            delete nextWorkspaceLineage[workspaceKey as WorkspaceKey]
          }
        }
      }
      const updated: WorktreeMeta = {
        ...existing,
        spoolVisibility: change.visibility,
        ...(change.spoolIncarnationId === undefined
          ? {}
          : { spoolIncarnationId: change.spoolIncarnationId }),
        ...(change.nextInstanceId === undefined ? {} : { instanceId: change.nextInstanceId })
      }
      nextMeta[change.worktreeId] = updated
      committed.push(updated)
    }

    this.state.worktreeMeta = nextMeta
    this.state.worktreeLineageById = nextWorktreeLineage
    this.state.workspaceLineageByChildKey = nextWorkspaceLineage
    try {
      // Why: Public/Private is an authorization boundary, so callers must not
      // observe success before the complete batch is durably replaced on disk.
      this.flushOrThrow()
      return committed
    } catch (error) {
      this.state.worktreeMeta = previousMeta
      this.state.worktreeLineageById = previousWorktreeLineage
      this.state.workspaceLineageByChildKey = previousWorkspaceLineage
      throw error
    }
  }

  removeWorktreeMeta(worktreeId: string): void {
    delete this.state.worktreeMeta[worktreeId]
    delete this.state.worktreeLineageById[worktreeId]
    delete this.state.workspaceLineageByChildKey[worktreeWorkspaceKey(worktreeId)]
    this.scheduleSave()
  }

  getWorktreeLineage(worktreeId: string): WorktreeLineage | undefined {
    return this.state.worktreeLineageById[worktreeId]
  }

  getAllWorktreeLineage(): Record<string, WorktreeLineage> {
    return this.state.worktreeLineageById
  }

  setWorktreeLineage(worktreeId: string, lineage: WorktreeLineage): WorktreeLineage {
    this.state.worktreeLineageById[worktreeId] = lineage
    this.scheduleSave()
    return lineage
  }

  removeWorktreeLineage(worktreeId: string): void {
    delete this.state.worktreeLineageById[worktreeId]
    this.scheduleSave()
  }

  /**
   * Move every worktreeId-keyed record from `oldWorktreeId` to `newWorktreeId`
   * after the worktree's folder (and thus its `${repoId}::${path}` id) was
   * renamed on disk, so a post-move refresh re-binds the worktree's state under
   * the new id instead of orphaning it. Records the old id on the new meta's
   * `priorWorktreeIds` so the session GC/hydration can still recognize PTY
   * sessions minted under the old (path-derived) id. No-op when the ids match.
   *
   * Renderer counterpart: `buildWorktreeRenameState` in store/slices/worktrees.ts
   * re-keys the renderer's own worktree-scoped maps for the same id change.
   */
  migrateWorktreeIdentity(oldWorktreeId: string, newWorktreeId: string): void {
    if (oldWorktreeId === newWorktreeId) {
      return
    }
    const oldWorkspaceKey = worktreeWorkspaceKey(oldWorktreeId)
    const newWorkspaceKey = worktreeWorkspaceKey(newWorktreeId)
    const moveKey = <T>(
      record: Record<string, T>,
      mapValue: (value: T) => T = (value) => value
    ): boolean => {
      if (!(oldWorktreeId in record)) {
        return false
      }
      record[newWorktreeId] = mapValue(record[oldWorktreeId])
      delete record[oldWorktreeId]
      return true
    }
    const withNewWorktreeId = <T extends { worktreeId: string }>(value: T): T =>
      value.worktreeId === oldWorktreeId ? { ...value, worktreeId: newWorktreeId } : value
    const migrateSession = (session: WorkspaceSessionState | undefined): boolean => {
      if (!session) {
        return false
      }
      let sessionChanged = false
      const moveSessionKey = <T>(
        record: Record<string, T> | undefined,
        mapValue: (value: T) => T = (value) => value
      ): boolean => {
        if (!record) {
          return false
        }
        let moved = false
        const pairs: [string, string][] = [
          [oldWorktreeId, newWorktreeId],
          [oldWorkspaceKey, newWorkspaceKey]
        ]
        for (const [oldKey, newKey] of pairs) {
          if (!(oldKey in record)) {
            continue
          }
          record[newKey] = mapValue(record[oldKey])
          delete record[oldKey]
          moved = true
        }
        return moved
      }

      sessionChanged =
        moveSessionKey(session.tabsByWorktree, (tabs) => tabs.map(withNewWorktreeId)) ||
        sessionChanged
      sessionChanged =
        moveSessionKey(session.openFilesByWorktree, (files) => files.map(withNewWorktreeId)) ||
        sessionChanged
      sessionChanged = moveSessionKey(session.activeFileIdByWorktree) || sessionChanged
      sessionChanged =
        moveSessionKey(session.browserTabsByWorktree, (workspaces) =>
          workspaces.map(withNewWorktreeId)
        ) || sessionChanged
      if (session.browserPagesByWorkspace) {
        let pagesChanged = false
        const nextPagesByWorkspace = { ...session.browserPagesByWorkspace }
        for (const [workspaceId, pages] of Object.entries(nextPagesByWorkspace)) {
          if (!pages.some((page) => page.worktreeId === oldWorktreeId)) {
            continue
          }
          nextPagesByWorkspace[workspaceId] = pages.map(withNewWorktreeId)
          pagesChanged = true
        }
        if (pagesChanged) {
          session.browserPagesByWorkspace = nextPagesByWorkspace
          sessionChanged = true
        }
      }
      sessionChanged = moveSessionKey(session.activeBrowserTabIdByWorktree) || sessionChanged
      sessionChanged = moveSessionKey(session.activeTabTypeByWorktree) || sessionChanged
      sessionChanged = moveSessionKey(session.activeTabIdByWorktree) || sessionChanged
      sessionChanged =
        moveSessionKey(session.unifiedTabs, (tabs) => tabs.map(withNewWorktreeId)) || sessionChanged
      sessionChanged =
        moveSessionKey(session.tabGroups, (groups) => groups.map(withNewWorktreeId)) ||
        sessionChanged
      sessionChanged = moveSessionKey(session.tabGroupLayouts) || sessionChanged
      sessionChanged = moveSessionKey(session.activeGroupIdByWorktree) || sessionChanged
      sessionChanged = moveSessionKey(session.lastVisitedAtByWorktreeId) || sessionChanged
      sessionChanged =
        moveSessionKey(session.defaultTerminalTabsAppliedByWorktreeId) || sessionChanged
      if (session.activeWorktreeIdsOnShutdown?.includes(oldWorktreeId)) {
        session.activeWorktreeIdsOnShutdown = session.activeWorktreeIdsOnShutdown.map((id) =>
          id === oldWorktreeId ? newWorktreeId : id
        )
        sessionChanged = true
      }
      if (session.activeWorktreeId === oldWorktreeId) {
        session.activeWorktreeId = newWorktreeId
        sessionChanged = true
      }
      if (session.activeWorkspaceKey === oldWorkspaceKey) {
        session.activeWorkspaceKey = newWorkspaceKey
        sessionChanged = true
      }
      if (session.sleepingAgentSessionsByPaneKey) {
        let sleepingChanged = false
        const nextSleeping = { ...session.sleepingAgentSessionsByPaneKey }
        for (const [paneKey, record] of Object.entries(nextSleeping)) {
          if (record.worktreeId !== oldWorktreeId) {
            continue
          }
          nextSleeping[paneKey] = { ...record, worktreeId: newWorktreeId }
          sleepingChanged = true
        }
        if (sleepingChanged) {
          session.sleepingAgentSessionsByPaneKey = nextSleeping
          sessionChanged = true
        }
      }
      return sessionChanged
    }

    let changed = moveKey(this.state.worktreeMeta)
    // Record the prior id so a session minted under it isn't reaped as an orphan.
    const newMeta = this.state.worktreeMeta[newWorktreeId]
    if (newMeta) {
      const prior = newMeta.priorWorktreeIds ?? []
      if (!prior.includes(oldWorktreeId)) {
        newMeta.priorWorktreeIds = [...prior, oldWorktreeId]
        changed = true
      }
    }

    changed = moveKey(this.state.worktreeLineageById) || changed
    const movedLineage = this.state.worktreeLineageById[newWorktreeId]
    if (movedLineage && movedLineage.worktreeId === oldWorktreeId) {
      movedLineage.worktreeId = newWorktreeId
    }
    // Why: other worktrees created from this one carry it as parentWorktreeId;
    // the stable parentWorktreeInstanceId is unaffected, but keep the denormalized
    // path-derived id consistent too.
    for (const lineage of Object.values(this.state.worktreeLineageById)) {
      if (lineage.parentWorktreeId === oldWorktreeId) {
        lineage.parentWorktreeId = newWorktreeId
        changed = true
      }
    }

    if (oldWorkspaceKey in this.state.workspaceLineageByChildKey) {
      const lineage = this.state.workspaceLineageByChildKey[oldWorkspaceKey]
      this.state.workspaceLineageByChildKey[newWorkspaceKey] = {
        ...lineage,
        childWorkspaceKey: newWorkspaceKey
      }
      delete this.state.workspaceLineageByChildKey[oldWorkspaceKey]
      changed = true
    }
    for (const [childKey, lineage] of Object.entries(this.state.workspaceLineageByChildKey)) {
      if (lineage.parentWorkspaceKey === oldWorkspaceKey) {
        this.state.workspaceLineageByChildKey[childKey as WorkspaceKey] = {
          ...lineage,
          parentWorkspaceKey: newWorkspaceKey
        }
        changed = true
      }
    }

    changed = migrateSession(this.state.workspaceSession) || changed
    for (const session of Object.values(this.state.workspaceSessionsByHostId ?? {})) {
      changed = migrateSession(session) || changed
    }
    const showDotfiles = this.state.ui?.showDotfilesByWorktree
    if (showDotfiles) {
      changed = moveKey(showDotfiles) || changed
    }

    if (changed) {
      this.scheduleSave()
    }
  }

  getWorkspaceLineage(childWorkspaceKey: WorkspaceKey): WorkspaceLineage | undefined {
    return this.state.workspaceLineageByChildKey[childWorkspaceKey]
  }

  getAllWorkspaceLineage(): Record<WorkspaceKey, WorkspaceLineage> {
    return this.state.workspaceLineageByChildKey
  }

  setWorkspaceLineage(lineage: WorkspaceLineage): WorkspaceLineage {
    this.state.workspaceLineageByChildKey[lineage.childWorkspaceKey] = lineage
    this.scheduleSave()
    return lineage
  }

  removeWorkspaceLineage(childWorkspaceKey: WorkspaceKey): void {
    delete this.state.workspaceLineageByChildKey[childWorkspaceKey]
    this.scheduleSave()
  }

  private removeWorkspaceLineageForFolderParent(folderWorkspaceId: string): void {
    const parentKey = folderWorkspaceKey(folderWorkspaceId)
    for (const [childKey, lineage] of Object.entries(this.state.workspaceLineageByChildKey)) {
      if (lineage.parentWorkspaceKey === parentKey) {
        delete this.state.workspaceLineageByChildKey[childKey as WorkspaceKey]
      }
    }
  }

  // ── Settings ───────────────────────────────────────────────────────

  getSettings(): GlobalSettings {
    return this.state.settings
  }

  onSettingsChanged(
    listener: (
      updates: Partial<GlobalSettings>,
      settings: GlobalSettings,
      originWebContentsId?: number
    ) => void
  ): () => void {
    return this.notifications.onSettingsChanged(listener)
  }

  // Why: UI view-state (group/sort/filters etc.) is written from both the
  // desktop renderer and mobile (via the ui.set RPC) into one shared store.
  // Without this, a mobile change persisted but the desktop renderer — which
  // hydrates UI state once — never learned of it, breaking bi-directional sync.
  onUIChanged(listener: (ui: PersistedState['ui']) => void): () => void {
    return this.notifications.onUiChanged(listener)
  }

  updateSettings(
    updates: Partial<GlobalSettings>,
    options: { notifyListeners?: boolean; originWebContentsId?: number } = {}
  ): GlobalSettings {
    const mutation = applyPersistedSettingsUpdate(this.state.settings, updates)
    this.state.settings = mutation.settings
    this.scheduleSave()
    this.notifications.publishSettingsMutation(
      mutation,
      options.notifyListeners === true,
      options.originWebContentsId
    )
    return mutation.settings
  }

  // ── UI State ───────────────────────────────────────────────────────

  getUI(): PersistedState['ui'] {
    return readPersistedUi(this.state.ui)
  }

  updateUI(updates: Partial<PersistedState['ui']>): void {
    const mutation = applyPersistedUiUpdate(this.state.ui, updates)
    if (!mutation.changed) {
      return
    }
    this.state.ui = mutation.ui
    this.scheduleSave()
    this.notifications.publishUiMutation(() => this.getUI())
  }

  recordFeatureInteraction(id: FeatureInteractionId): PersistedState['ui'] {
    const featureInteractions = normalizeFeatureInteractions(this.state.ui?.featureInteractions)
    const telemetryBuckets = normalizeFeatureInteractionTelemetryBuckets(
      this.state.featureInteractionTelemetryBuckets
    )
    const existing = featureInteractions[id]
    const previousCount = existing?.interactionCount ?? 0
    const nextCount = previousCount + 1
    const previousBucket = getFeatureInteractionUsageBucket(previousCount)
    const nextBucket = getFeatureInteractionUsageBucket(nextCount)
    const lastEmittedBucket = telemetryBuckets[id] ?? null
    const shouldEmit =
      nextBucket !== null &&
      (lastEmittedBucket === null ||
        compareFeatureInteractionUsageBuckets(nextBucket, lastEmittedBucket) > 0)

    this.updateUI({
      featureInteractions: {
        ...featureInteractions,
        [id]: {
          firstInteractedAt: existing?.firstInteractedAt ?? Date.now(),
          interactionCount: nextCount
        }
      }
    })
    this.state.featureInteractionTelemetryBuckets = shouldEmit
      ? { ...telemetryBuckets, [id]: nextBucket }
      : telemetryBuckets
    this.scheduleSave()

    if (shouldEmit) {
      track('feature_interaction_usage_bucket_reached', {
        feature_id: id,
        feature_category: getFeatureInteractionCategory(id),
        count_bucket: nextBucket,
        bucket_source:
          lastEmittedBucket === null && previousBucket !== null && previousBucket === nextBucket
            ? 'observed_existing'
            : 'crossed_now',
        ...getCohortAtEmit()
      })
    }
    return this.getUI()
  }

  // ── Onboarding ────────────────────────────────────────────────────

  getOnboarding(): PersistedState['onboarding'] {
    const defaults = getDefaultOnboardingState()
    return {
      ...defaults,
      ...this.state.onboarding,
      checklist: {
        ...defaults.checklist,
        ...this.state.onboarding?.checklist
      }
    }
  }

  updateOnboarding(
    updates: Partial<Omit<PersistedState['onboarding'], 'checklist'>> & {
      checklist?: Partial<OnboardingChecklistState>
    }
  ): PersistedState['onboarding'] {
    const current = this.getOnboarding()
    this.state.onboarding = {
      ...current,
      ...updates,
      checklist: {
        ...current.checklist,
        ...updates.checklist
      }
    }
    this.scheduleSave()
    return this.getOnboarding()
  }

  // ── GitHub Cache ──────────────────────────────────────────────────

  getGitHubCache(): PersistedState['githubCache'] {
    return this.state.githubCache
  }

  setGitHubCache(cache: PersistedState['githubCache']): void {
    // Why no scheduleSave: the cache is memory-only during the session and
    // snapshotted to its sidecar file at flush (quit/reload) time. Every poll
    // refresh restamps fetchedAt, so persisting here rewrote the whole
    // durable state file once per poll cycle for refetchable data.
    this.state.githubCache = cache
    this.githubCacheFile.markDirty()
  }

  // ── Workspace Session ─────────────────────────────────────────────

  /** Resolve an execution host argument to a canonical id. Unknown/empty
   *  values fall back to 'local' so legacy callers without a hostId keep
   *  reading and writing the local partition exactly as before. */
  private resolveHostId(hostId?: string | null): ExecutionHostId {
    return normalizeExecutionHostId(hostId) ?? LOCAL_EXECUTION_HOST_ID
  }

  getWorkspaceSession(hostId?: string | null): PersistedState['workspaceSession'] {
    const resolved = this.resolveHostId(hostId)
    if (resolved === LOCAL_EXECUTION_HOST_ID) {
      return this.state.workspaceSession ?? getDefaultWorkspaceSession()
    }
    return this.state.workspaceSessionsByHostId?.[resolved] ?? getDefaultWorkspaceSession()
  }

  readTerminalScrollbackSnapshot(ref: string): string | null {
    return readTerminalScrollbackSnapshotSync(ref, this.terminalScrollbackSnapshotStorage)
  }

  /** Resolve the worktree a terminal tab belongs to, from the session's
   *  tab→worktree map. More reliable than agent-echoed hook fields. */
  getWorktreeIdForTab(tabId: string): string | undefined {
    return findWorktreeIdForTab(this.getWorkspaceSession(), tabId)
  }

  setWorkspaceSession(session: PersistedState['workspaceSession'], hostId?: string | null): void {
    const resolved = this.resolveHostId(hostId)
    if (resolved === LOCAL_EXECUTION_HOST_ID) {
      this.setLocalWorkspaceSession(session)
      return
    }
    this.setHostWorkspaceSession(resolved, session)
  }

  /** Persist a non-'local' host partition. The PTY-binding race protections in
   *  setLocalWorkspaceSession only apply to the local daemon, so remote hosts
   *  take the lighter prune-and-store path. */
  private setHostWorkspaceSession(hostId: ExecutionHostId, session: WorkspaceSessionState): void {
    const pruned = pruneWorkspaceSessionBrowserHistory(
      pruneLocalTerminalScrollbackBuffers(session, this.state.repos)
    )
    this.state.workspaceSessionsByHostId = {
      ...this.state.workspaceSessionsByHostId,
      [hostId]: pruned
    }
    this.scheduleSave()
  }

  private setLocalWorkspaceSession(session: PersistedState['workspaceSession']): void {
    session = pruneWorkspaceSessionBrowserHistory(
      pruneLocalTerminalScrollbackBuffers(session, this.state.repos)
    )

    // Why: closes the second half of the SIGKILL race (Issue #217). The
    // renderer's debounced session writer captures its state BEFORE pty:spawn
    // returns, so the snapshot it later flushes via session:set has no
    // tab.ptyId / ptyIdsByLeafId for the just-spawned PTY. If that stale
    // snapshot lands AFTER persistPtyBinding's sync flush, it would overwrite
    // the durable binding and re-open the orphan window. Merge in any
    // existing bindings whenever the incoming snapshot's binding is empty.
    const prior = this.state.workspaceSession
    const normalized = normalizeWorkspaceSessionPaneIdentities(
      session,
      prior?.terminalLayoutsByTabId
    )
    for (const entry of normalized.migrationUnsupportedEntries) {
      setMigrationUnsupportedPty(entry)
    }
    const remappedAcknowledgements = remapAcknowledgedAgentPaneKeys(
      this.state.ui?.acknowledgedAgentsByPaneKey,
      normalized.leafIdByInputLeafIdByTabId
    )
    if (remappedAcknowledgements.changed) {
      this.state.ui = {
        ...this.state.ui,
        acknowledgedAgentsByPaneKey: remappedAcknowledgements.acknowledgements
      }
    }
    for (const entry of normalized.legacyPaneKeyAliasEntries) {
      registerPersistedPaneKeyAlias(entry)
    }
    session = normalized.session
    const remappedLeases = remapSshRemotePtyLeaseLeafIds(
      this.state.sshRemotePtyLeases ?? [],
      normalized.leafIdByInputLeafIdByTabId,
      normalized.leafIdByPtyIdByTabId
    )
    if (remappedLeases.changed) {
      this.state.sshRemotePtyLeases = remappedLeases.leases
    }
    if (session && prior) {
      const priorTabs = prior.tabsByWorktree ?? {}
      const nextTabs = session.tabsByWorktree ?? {}
      const worktreeIdByTabId = new Map<string, string>()
      for (const [worktreeId, tabs] of Object.entries({ ...priorTabs, ...nextTabs })) {
        for (const tab of tabs) {
          worktreeIdByTabId.set(tab.id, worktreeId)
        }
      }
      for (const [worktreeId, tabs] of Object.entries(nextTabs)) {
        const priorList = priorTabs[worktreeId]
        if (!priorList) {
          continue
        }
        for (const tab of tabs) {
          const priorTab = priorList.find((t) => t.id === tab.id)
          if (
            !tab.ptyId &&
            priorTab?.ptyId &&
            this.isRestorablePtyBinding({
              ptyId: priorTab.ptyId,
              worktreeId,
              targetId: this.getConnectionIdForWorktree(worktreeId),
              tabId: tab.id
            })
          ) {
            tab.ptyId = priorTab.ptyId
          }
          if (
            !tab.worktreeInstanceId &&
            priorTab?.worktreeInstanceId &&
            priorTab.ptyId &&
            tab.ptyId === priorTab.ptyId &&
            this.isRestorablePtyBinding({
              ptyId: priorTab.ptyId,
              worktreeId,
              targetId: this.getConnectionIdForWorktree(worktreeId),
              tabId: tab.id
            })
          ) {
            // Why: a stale renderer snapshot must not erase the spawn-time safety binding.
            tab.worktreeInstanceId = priorTab.worktreeInstanceId
          }
        }
      }
      const priorLayouts = prior.terminalLayoutsByTabId ?? {}
      const nextLayouts = session.terminalLayoutsByTabId ?? {}
      for (const [tabId, layout] of Object.entries(nextLayouts)) {
        const priorLayout = priorLayouts[tabId]
        if (!priorLayout?.ptyIdsByLeafId) {
          continue
        }
        const incoming = layout.ptyIdsByLeafId ?? {}
        const incomingHasAnyBinding = Object.keys(incoming).length > 0
        const liveLeafIds = this.getTerminalLayoutLeafIds(layout.root)
        const worktreeId = worktreeIdByTabId.get(tabId)
        const targetId = worktreeId ? this.getConnectionIdForWorktree(worktreeId) : null
        const restorableBindings = Object.fromEntries(
          Object.entries(priorLayout.ptyIdsByLeafId).filter(
            ([leafId, ptyId]) =>
              liveLeafIds.has(leafId) &&
              incoming[leafId] === undefined &&
              // Why: an empty layout map can be a stale pre-spawn snapshot; a
              // partial map is intentional unless a durable SSH lease proves it.
              (incomingHasAnyBinding
                ? this.hasRestorableSshRemotePtyLease({
                    ptyId,
                    targetId,
                    worktreeId,
                    tabId,
                    leafId
                  })
                : this.isRestorablePtyBinding({ ptyId, targetId, worktreeId, tabId, leafId }))
          )
        )
        if (Object.keys(restorableBindings).length > 0) {
          layout.ptyIdsByLeafId = { ...restorableBindings, ...incoming }
          // Why: the same stale session write that drops ptyIdsByLeafId can
          // also be from an older renderer that lacks UUID-keyed metadata.
          const buffersByLeafId = preserveMissingLeafRecordEntries(
            priorLayout.buffersByLeafId,
            layout.buffersByLeafId,
            liveLeafIds
          )
          const scrollbackRefsByLeafId = preserveMissingLeafRecordEntries(
            priorLayout.scrollbackRefsByLeafId,
            layout.scrollbackRefsByLeafId,
            liveLeafIds
          )
          const titlesByLeafId = preserveMissingLeafRecordEntries(
            priorLayout.titlesByLeafId,
            layout.titlesByLeafId,
            liveLeafIds
          )
          if (buffersByLeafId) {
            layout.buffersByLeafId = buffersByLeafId
          }
          if (scrollbackRefsByLeafId) {
            layout.scrollbackRefsByLeafId = scrollbackRefsByLeafId
          }
          if (titlesByLeafId) {
            layout.titlesByLeafId = titlesByLeafId
          }
        }
      }
    }
    session = pruneLocalTerminalScrollbackBuffers(session, this.state.repos)
    const migratedScrollback = migrateWorkspaceSessionTerminalScrollbackSnapshots(
      session,
      this.terminalScrollbackSnapshotStorage
    )
    session = migratedScrollback.session
    deleteRemovedTerminalScrollbackSnapshots(prior, session, this.terminalScrollbackSnapshotStorage)
    this.state.workspaceSession = session
    this.scheduleSave()
  }

  patchWorkspaceSession(patch: WorkspaceSessionPatch, hostId?: string | null): void {
    const resolved = this.resolveHostId(hostId)
    // Why: the renderer's debounced hot path sends only changed top-level
    // session slices. Scalar/UI patches avoid the terminal normalization path;
    // terminal topology/layout patches still reuse the stale-PTY protections.
    let next: WorkspaceSessionState = {
      ...this.getWorkspaceSession(resolved),
      ...patch
    }
    if (workspaceSessionPatchNeedsFullNormalization(patch)) {
      this.setWorkspaceSession(next, resolved)
      return
    }
    if (Object.hasOwn(patch, 'browserUrlHistory')) {
      next = pruneWorkspaceSessionBrowserHistory(next)
    }
    if (resolved === LOCAL_EXECUTION_HOST_ID) {
      this.state.workspaceSession = next
    } else {
      this.state.workspaceSessionsByHostId = {
        ...this.state.workspaceSessionsByHostId,
        [resolved]: next
      }
    }
    this.scheduleSave()
  }

  private getTerminalLayoutLeafIds(root: TerminalPaneLayoutNode | null): Set<string> {
    const leafIds = new Set<string>()
    const visit = (node: TerminalPaneLayoutNode | null): void => {
      if (!node) {
        return
      }
      if (node.type === 'leaf') {
        if (isTerminalLeafId(node.leafId)) {
          leafIds.add(node.leafId)
        }
        return
      }
      visit(node.first)
      visit(node.second)
    }
    visit(root)
    return leafIds
  }

  private isRestorablePtyBinding(binding: {
    ptyId: string
    targetId?: string | null
    worktreeId?: string
    tabId?: string
    leafId?: string
  }): boolean {
    const leases = this.state.sshRemotePtyLeases?.filter((entry) =>
      this.sshRemotePtyLeaseMatchesBinding(entry, binding)
    )
    return !leases?.some((lease) => lease.state === 'terminated' || lease.state === 'expired')
  }

  private getRelayPtyIdForSshLeaseComparison(targetId: string, ptyId: string): string {
    try {
      return toRelaySshPtyId(targetId, ptyId)
    } catch {
      return ptyId
    }
  }

  private getRelayPtyIdForSshLeaseStorage(targetId: string, ptyId: string): string {
    return toRelaySshPtyId(targetId, ptyId)
  }

  private sshRemotePtyLeaseMatchesBinding(
    lease: SshRemotePtyLease,
    binding: {
      ptyId: string
      targetId?: string | null
      worktreeId?: string
      tabId?: string
      leafId?: string
    }
  ): boolean {
    const bindingPtyId = this.getRelayPtyIdForSshLeaseComparison(lease.targetId, binding.ptyId)
    if (lease.ptyId !== bindingPtyId) {
      return false
    }
    // Why: remote PTY ids are scoped to a relay target. Workspace PTY bindings
    // only store the id, so derive target/context when possible and require
    // stored lease context to match instead of treating missing fields as
    // wildcards that can tombstone unrelated panes.
    return (
      (binding.targetId === undefined ||
        binding.targetId === null ||
        lease.targetId === binding.targetId) &&
      (binding.worktreeId === undefined || lease.worktreeId === binding.worktreeId) &&
      (binding.tabId === undefined || lease.tabId === binding.tabId) &&
      (binding.leafId === undefined || lease.leafId === binding.leafId)
    )
  }

  private hasRestorableSshRemotePtyLease(binding: {
    ptyId: string
    targetId?: string | null
    worktreeId?: string
    tabId?: string
    leafId?: string
  }): boolean {
    return (
      this.state.sshRemotePtyLeases?.some(
        (lease) =>
          this.sshRemotePtyLeaseMatchesBinding(lease, binding) &&
          lease.state !== 'terminated' &&
          lease.state !== 'expired'
      ) ?? false
    )
  }

  private sshRemotePtyLeaseMayReferenceBinding(
    lease: SshRemotePtyLease,
    binding: {
      ptyId: string
      targetId: string
      worktreeId?: string
      tabId?: string
      leafId?: string
    }
  ): boolean {
    const bindingPtyId = this.getRelayPtyIdForSshLeaseComparison(binding.targetId, binding.ptyId)
    if (lease.targetId !== binding.targetId || lease.ptyId !== bindingPtyId) {
      return false
    }
    // Why: target removal is destructive. Legacy/contextless leases should
    // scrub matching workspace bindings before the lease record is deleted,
    // otherwise removing the tombstone can let stale PTY ids revive later.
    return (
      (binding.worktreeId === undefined ||
        lease.worktreeId === undefined ||
        lease.worktreeId === binding.worktreeId) &&
      (binding.tabId === undefined || lease.tabId === undefined || lease.tabId === binding.tabId) &&
      (binding.leafId === undefined ||
        lease.leafId === undefined ||
        lease.leafId === binding.leafId)
    )
  }

  private getConnectionIdForWorktree(worktreeId: string): string | null {
    const repoId = getRepoIdFromWorktreeId(worktreeId)
    return this.state.repos.find((repo) => repo.id === repoId)?.connectionId ?? null
  }

  // Why: closes the SIGKILL-between-spawn-and-persist race (Issue #217). The
  // renderer's debounced session writer (~450 ms total) is normally the only
  // path that writes tab.ptyId / ptyIdsByLeafId; a force-quit inside that
  // window orphans the daemon's history dir. Patching + sync flushing here
  // before pty:spawn returns guarantees the renderer cannot observe a
  // spawn-success without the binding already being durable on disk.
  persistPtyBinding(args: {
    worktreeId: string
    worktreeInstanceId?: string | null
    tabId: string
    leafId: string
    ptyId: string
    startupCwd?: string
  }): void {
    const session = this.state.workspaceSession
    if (!session) {
      return
    }
    const sessionBeforeBinding = structuredClone(session)
    const tabs = session.tabsByWorktree?.[args.worktreeId]
    const tab = tabs?.find((t) => t.id === args.tabId)
    if (tab) {
      tab.ptyId = args.ptyId
      if (args.worktreeInstanceId !== undefined) {
        if (args.worktreeInstanceId === null) {
          delete tab.worktreeInstanceId
        } else {
          tab.worktreeInstanceId = args.worktreeInstanceId
        }
      }
    } else {
      // Why: pty:spawn can beat the debounced session writer for a newly
      // created tab. Persist a minimal tab so hydration does not prune the
      // crash-safe layout binding below as an orphaned tab id.
      const nextTabs = [
        ...(tabs ?? []),
        createMinimalPersistedTerminalTab({
          ...args,
          existingTabCount: tabs?.length ?? 0
        })
      ]
      session.tabsByWorktree = {
        ...session.tabsByWorktree,
        [args.worktreeId]: nextTabs
      }
      session.activeWorktreeId ??= args.worktreeId
      session.activeTabId ??= args.tabId
      session.activeTabIdByWorktree = {
        ...session.activeTabIdByWorktree,
        [args.worktreeId]: session.activeTabIdByWorktree?.[args.worktreeId] ?? args.tabId
      }
    }
    if (!isTerminalLeafId(args.leafId)) {
      // Why: legacy renderer-local pane ids may arrive from older callers; keep
      // them out of durable leaf-keyed layout state after the UUID migration.
      try {
        this.flushOrThrow()
      } catch (err) {
        this.state.workspaceSession = sessionBeforeBinding
        throw err
      }
      return
    }
    const layout = session.terminalLayoutsByTabId?.[args.tabId]
    if (layout) {
      if (!layout.root) {
        // Why: createTab can persist an empty layout before TerminalPane mounts.
        // The sync spawn binding must still leave a durable UUID root behind.
        layout.root = { type: 'leaf', leafId: args.leafId }
        layout.activeLeafId = args.leafId
        layout.expandedLeafId = null
      } else if (!layoutContainsLeafId(layout.root, args.leafId)) {
        // Why: splitPane publishes the new pane and starts pty:spawn before the
        // debounced full layout snapshot reaches main. Add a minimal leaf so a
        // crash in that window cannot make the new pane's binding unreachable.
        layout.root = {
          type: 'split',
          direction: 'vertical',
          first: cloneLayoutNode(layout.root),
          second: { type: 'leaf', leafId: args.leafId }
        }
        layout.activeLeafId = args.leafId
        if (layout.expandedLeafId && !layoutContainsLeafId(layout.root, layout.expandedLeafId)) {
          layout.expandedLeafId = null
        }
      }
      layout.ptyIdsByLeafId = {
        ...layout.ptyIdsByLeafId,
        [args.leafId]: args.ptyId
      }
    } else {
      // Why: first-spawn-ever for a new tab — the renderer's debounced writer
      // creates the layout entry on PaneManager init, but the binding has to
      // be on disk before pty:spawn returns or a SIGKILL inside the same
      // window would lose ptyIdsByLeafId for split-pane cold restore. The
      // renderer will overwrite this minimal layout once persistLayoutSnapshot
      // fires.
      session.terminalLayoutsByTabId = {
        ...session.terminalLayoutsByTabId,
        [args.tabId]: {
          root: { type: 'leaf', leafId: args.leafId },
          activeLeafId: args.leafId,
          expandedLeafId: null,
          ptyIdsByLeafId: { [args.leafId]: args.ptyId }
        }
      }
    }
    try {
      this.flushOrThrow()
    } catch (err) {
      this.state.workspaceSession = sessionBeforeBinding
      throw err
    }
  }

  // ── SSH Targets ────────────────────────────────────────────────────

  getSshTargets(): SshTarget[] {
    return (this.state.sshTargets ?? []).map(normalizeSshTarget)
  }

  getSshTarget(id: string): SshTarget | undefined {
    const target = this.state.sshTargets?.find((t) => t.id === id)
    return target ? normalizeSshTarget(target) : undefined
  }

  addSshTarget(target: SshTarget): void {
    this.state.sshTargets ??= []
    this.state.sshTargets.push(normalizeSshTarget(target))
    this.scheduleSave()
  }

  updateSshTarget(id: string, updates: Partial<Omit<SshTarget, 'id'>>): SshTarget | null {
    const target = this.state.sshTargets?.find((t) => t.id === id)
    if (!target) {
      return null
    }
    const normalized = normalizeSshTarget({ ...target, ...updates })
    Object.assign(target, updates, normalized)
    if (!Object.hasOwn(normalized, 'relayGracePeriodSeconds')) {
      delete target.relayGracePeriodSeconds
    }
    if (!Object.hasOwn(normalized, 'systemSshConnectionReuse')) {
      delete target.systemSshConnectionReuse
    }
    this.scheduleSave()
    return { ...target }
  }

  removeSshTarget(id: string): void {
    if (!this.state.sshTargets) {
      return
    }
    this.state.sshTargets = this.state.sshTargets.filter((t) => t.id !== id)
    this.scheduleSave()
  }

  // ── Live Claude PTY sessions ───────────────────────────────────────

  getClaudeLivePtySessionIds(): string[] {
    return [...(this.state.claudeLivePtySessionIds ?? [])]
  }

  addClaudeLivePtySessionId(sessionId: string): void {
    if (sessionId.length === 0 || sessionId.length > 512) {
      return
    }
    const ids = this.state.claudeLivePtySessionIds ?? []
    if (ids.includes(sessionId)) {
      return
    }
    // Why: drop the oldest entry at the cap — stale ids are pruned against the
    // daemon at startup anyway, so recency is the only thing worth keeping.
    this.state.claudeLivePtySessionIds = [...ids, sessionId].slice(-MAX_CLAUDE_LIVE_PTY_SESSION_IDS)
    // Why: flush synchronously — a force-quit right after a Claude spawn must
    // still seed the live-PTY gate on the next launch.
    this.flush()
  }

  removeClaudeLivePtySessionId(sessionId: string): void {
    const ids = this.state.claudeLivePtySessionIds ?? []
    if (!ids.includes(sessionId)) {
      return
    }
    this.state.claudeLivePtySessionIds = ids.filter((id) => id !== sessionId)
    this.scheduleSave()
  }

  getDeletedSshConfigAliases(): string[] {
    return [...(this.state.deletedSshConfigAliases ?? [])]
  }

  addDeletedSshConfigAlias(alias: string): void {
    this.state.deletedSshConfigAliases ??= []
    if (!this.state.deletedSshConfigAliases.includes(alias)) {
      this.state.deletedSshConfigAliases.push(alias)
      this.scheduleSave()
    }
  }

  removeDeletedSshConfigAlias(alias: string): void {
    const current = this.state.deletedSshConfigAliases
    if (!current || !current.includes(alias)) {
      return
    }
    this.state.deletedSshConfigAliases = current.filter((entry) => entry !== alias)
    this.scheduleSave()
  }

  clearDeletedSshConfigAliases(): void {
    if (this.state.deletedSshConfigAliases && this.state.deletedSshConfigAliases.length > 0) {
      this.state.deletedSshConfigAliases = []
      this.scheduleSave()
    }
  }

  getRemovedSshTargetTombstones(): RemovedSshTargetTombstone[] {
    return [...(this.state.removedSshTargetTombstones ?? [])]
  }

  addRemovedSshTargetTombstone(tombstone: RemovedSshTargetTombstone): void {
    const existing = this.state.removedSshTargetTombstones ?? []
    // Why: dedupe by oldTargetId so a remove/re-remove of the same id can't
    // stack duplicate tombstones. Newest wins.
    const filtered = existing.filter((t) => t.oldTargetId !== tombstone.oldTargetId)
    // Cap the history so pathological churn can't grow the state file unbounded.
    this.state.removedSshTargetTombstones = [...filtered, tombstone].slice(
      -MAX_REMOVED_SSH_TARGET_TOMBSTONES
    )
    this.scheduleSave()
  }

  removeRemovedSshTargetTombstone(oldTargetId: string): void {
    const existing = this.state.removedSshTargetTombstones
    if (!existing?.some((t) => t.oldTargetId === oldTargetId)) {
      return
    }
    this.state.removedSshTargetTombstones = existing.filter((t) => t.oldTargetId !== oldTargetId)
    this.scheduleSave()
  }

  /**
   * Re-point every repo and worktree meta pinned to a removed SSH target id
   * onto a re-added target's id, so orphaned workspaces reattach to the live
   * host instead of remaining un-removable ghosts. Returns the ids of repos
   * re-pointed (empty when nothing referenced the old id).
   */
  reassignSshTargetId(oldTargetId: string, newTargetId: string): string[] {
    if (oldTargetId === newTargetId) {
      return []
    }
    const oldHostId = toSshExecutionHostId(oldTargetId)
    const newHostId = toSshExecutionHostId(newTargetId)
    const repoIds = new Set<string>()
    for (const repo of this.state.repos) {
      const matchesConnection = repo.connectionId === oldTargetId
      const matchesHost = repo.executionHostId === oldHostId
      if (!matchesConnection && !matchesHost) {
        continue
      }
      if (matchesConnection) {
        repo.connectionId = newTargetId
      }
      // Why: only rewrite executionHostId when it was actually set to the old
      // SSH host. SSH repos created via addRemoteRepoFromPath leave it unset and
      // derive the host from connectionId, so we must not stamp a value where
      // there wasn't one.
      if (matchesHost) {
        repo.executionHostId = newHostId
      }
      repoIds.add(repo.id)
    }
    // Re-point worktree metas whose hostId pointed at the old SSH host.
    let metaChanged = false
    for (const meta of Object.values(this.state.worktreeMeta)) {
      if (meta.hostId === oldHostId) {
        meta.hostId = newHostId
        metaChanged = true
      }
    }
    // Why: the old id also survives in session pty ids, the startup reconnect
    // list, sleeping-agent records, host setups, host-scope UI, and pty leases;
    // any un-migrated carrier later throws `SSH target not found` (STA-1468).
    let carrierChanged = migrateWorkspaceSessionSshTargetId(
      this.state.workspaceSession,
      oldTargetId,
      newTargetId
    )
    for (const session of Object.values(this.state.workspaceSessionsByHostId ?? {})) {
      if (session && migrateWorkspaceSessionSshTargetId(session, oldTargetId, newTargetId)) {
        carrierChanged = true
      }
    }
    // Why: partitions are read by host id, so one stored under the removed id
    // would be orphaned. No writer keys partitions by ssh host today, but the
    // schema tolerates it — re-key rather than strand it. If the new key
    // already has a partition, that one is live; drop the dead old one.
    const partitions = this.state.workspaceSessionsByHostId
    const oldPartition = partitions?.[oldHostId]
    if (partitions && oldPartition) {
      delete partitions[oldHostId]
      partitions[newHostId] ??= oldPartition
      carrierChanged = true
    }
    if (migrateUiHostScopeSshTargetId(this.state.ui, oldTargetId, newTargetId)) {
      carrierChanged = true
    }
    for (const lease of this.state.sshRemotePtyLeases ?? []) {
      if (lease.targetId === oldTargetId) {
        lease.targetId = newTargetId
        carrierChanged = true
      }
    }
    let setupsChanged = false
    const keptSetups: ProjectHostSetup[] = []
    for (const setup of this.state.projectHostSetups) {
      if (setup.hostId !== oldHostId) {
        keptSetups.push(setup)
        continue
      }
      const duplicate = this.state.projectHostSetups.some(
        (entry) =>
          entry !== setup && entry.projectId === setup.projectId && entry.hostId === newHostId
      )
      // Why: a setup already exists for the re-added host — the old row is a
      // stale ghost that would violate the (projectId, hostId) uniqueness.
      if (duplicate) {
        setupsChanged = true
        continue
      }
      setup.hostId = newHostId
      setup.updatedAt = Date.now()
      keptSetups.push(setup)
      setupsChanged = true
    }
    if (setupsChanged) {
      this.state.projectHostSetups = keptSetups
    }
    // Why: repo-row and host-setup rewrites can affect host-setup compatibility,
    // but meta-only rewrites cannot — keep that sync under this gate. Persist
    // whenever anything changed, so partial re-points aren't lost on quit.
    if (repoIds.size > 0 || setupsChanged) {
      this.syncProjectHostSetupCompatibilityState()
    }
    if (repoIds.size > 0 || metaChanged || carrierChanged || setupsChanged) {
      this.scheduleSave()
    }
    return [...repoIds]
  }

  // ── SSH Remote PTY Leases ──────────────────────────────────────────

  getSshRemotePtyLeases(targetId?: string): SshRemotePtyLease[] {
    const leases = this.state.sshRemotePtyLeases ?? []
    return leases.filter((lease) => targetId === undefined || lease.targetId === targetId)
  }

  upsertSshRemotePtyLease(
    lease: Omit<SshRemotePtyLease, 'createdAt' | 'updatedAt' | 'worktreeInstanceId'> & {
      worktreeInstanceId?: string | null
    } & Partial<Pick<SshRemotePtyLease, 'createdAt' | 'updatedAt'>>
  ): void {
    this.state.sshRemotePtyLeases ??= []
    const { worktreeInstanceId, ...normalizedLease } = lease
    const clearWorktreeInstanceId = worktreeInstanceId === null
    if (normalizedLease.leafId !== undefined && !isTerminalLeafId(normalizedLease.leafId)) {
      delete normalizedLease.leafId
    }
    // Why: app-facing SSH PTY ids are globally scoped; durable relay leases
    // stay target-local so reconnect can call relay pty.attach with raw ids.
    normalizedLease.ptyId = this.getRelayPtyIdForSshLeaseStorage(
      normalizedLease.targetId,
      normalizedLease.ptyId
    )
    const now = Date.now()
    const existingIndex = this.state.sshRemotePtyLeases.findIndex(
      (entry) =>
        entry.targetId === normalizedLease.targetId && entry.ptyId === normalizedLease.ptyId
    )
    const existing = existingIndex >= 0 ? this.state.sshRemotePtyLeases[existingIndex] : undefined
    const next: SshRemotePtyLease = {
      ...existing,
      ...normalizedLease,
      ...(worktreeInstanceId ? { worktreeInstanceId } : {}),
      createdAt: existing?.createdAt ?? normalizedLease.createdAt ?? now,
      updatedAt: normalizedLease.updatedAt ?? now
    }
    if (clearWorktreeInstanceId) {
      // Why: unknown or conflicting reattach evidence must not revive a prior trusted binding.
      delete next.worktreeInstanceId
    }
    if (existingIndex >= 0) {
      this.state.sshRemotePtyLeases[existingIndex] = next
    } else {
      this.state.sshRemotePtyLeases.push(next)
    }
    this.flush()
  }

  markSshRemotePtyLeases(targetId: string, state: SshRemotePtyLease['state']): void {
    const now = Date.now()
    let changed = false
    const shouldClearBindings = state === 'terminated' || state === 'expired'
    const leasesToClear: SshRemotePtyLease[] = []
    this.state.sshRemotePtyLeases ??= []
    for (const lease of this.state.sshRemotePtyLeases) {
      if (lease.targetId !== targetId) {
        continue
      }
      if (state === 'detached' && lease.state !== 'attached') {
        continue
      }
      if (lease.state !== state) {
        lease.state = state
        lease.updatedAt = now
        if (state === 'attached') {
          lease.lastAttachedAt = now
        } else if (state === 'detached') {
          lease.lastDetachedAt = now
        }
        changed = true
      }
      if (shouldClearBindings) {
        leasesToClear.push(lease)
      }
    }
    const bindingsChanged = shouldClearBindings
      ? this.clearSshRemotePtyBindingsForLeases(targetId, leasesToClear)
      : false
    if (changed || bindingsChanged) {
      this.flush()
    }
  }

  markSshRemotePtyLease(targetId: string, ptyId: string, state: SshRemotePtyLease['state']): void {
    const relayPtyId = this.getRelayPtyIdForSshLeaseStorage(targetId, ptyId)
    const lease = this.state.sshRemotePtyLeases?.find(
      (entry) => entry.targetId === targetId && entry.ptyId === relayPtyId
    )
    if (!lease) {
      return
    }
    const shouldClearBindings = state === 'terminated' || state === 'expired'
    if (lease.state === state) {
      if (shouldClearBindings && this.clearSshRemotePtyBindingsForLeases(targetId, [lease])) {
        this.flush()
      }
      return
    }
    const now = Date.now()
    lease.state = state
    lease.updatedAt = now
    if (state === 'attached') {
      lease.lastAttachedAt = now
    } else if (state === 'detached') {
      lease.lastDetachedAt = now
    }
    if (shouldClearBindings) {
      this.clearSshRemotePtyBindingsForLeases(targetId, [lease])
    }
    this.flush()
  }

  removeSshRemotePtyLease(targetId: string, ptyId: string): void {
    const relayPtyId = this.getRelayPtyIdForSshLeaseStorage(targetId, ptyId)
    const leases = (this.state.sshRemotePtyLeases ?? []).filter(
      (lease) => lease.targetId === targetId && lease.ptyId === relayPtyId
    )
    const before = this.state.sshRemotePtyLeases?.length ?? 0
    this.clearSshRemotePtyBindingsForLeases(targetId, leases)
    this.state.sshRemotePtyLeases = (this.state.sshRemotePtyLeases ?? []).filter(
      (lease) => lease.targetId !== targetId || lease.ptyId !== relayPtyId
    )
    if (this.state.sshRemotePtyLeases.length !== before) {
      this.flush()
    }
  }

  removeSshRemotePtyLeases(targetId: string): void {
    this.state.sshRemotePtyLeases ??= []
    this.clearSshRemotePtyBindingsForTarget(targetId)
    const before = this.state.sshRemotePtyLeases.length
    this.state.sshRemotePtyLeases = this.state.sshRemotePtyLeases.filter(
      (lease) => lease.targetId !== targetId
    )
    if (this.state.sshRemotePtyLeases.length !== before) {
      this.flush()
    }
  }

  private clearSshRemotePtyBindingsForTarget(targetId: string): void {
    const leases = this.state.sshRemotePtyLeases?.filter((lease) => lease.targetId === targetId)
    this.clearSshRemotePtyBindingsForLeases(targetId, leases ?? [])
  }

  private clearSshRemotePtyBindingsForLeases(
    targetId: string,
    leases: SshRemotePtyLease[]
  ): boolean {
    const session = this.state.workspaceSession
    if (!leases?.length || !session) {
      return false
    }
    let changed = false
    for (const [worktreeId, tabs] of Object.entries(session.tabsByWorktree ?? {})) {
      for (const tab of tabs) {
        if (
          tab.ptyId &&
          leases.some((lease) =>
            this.sshRemotePtyLeaseMayReferenceBinding(lease, {
              ptyId: tab.ptyId!,
              worktreeId,
              targetId,
              tabId: tab.id
            })
          )
        ) {
          tab.ptyId = null
          changed = true
        }
      }
    }
    for (const [tabId, layout] of Object.entries(session.terminalLayoutsByTabId ?? {})) {
      const bindings = layout.ptyIdsByLeafId
      if (!bindings) {
        continue
      }
      const worktreeId = Object.entries(session.tabsByWorktree ?? {}).find(([, tabs]) =>
        tabs.some((tab) => tab.id === tabId)
      )?.[0]
      const nextBindings = Object.fromEntries(
        Object.entries(bindings).filter(
          ([leafId, ptyId]) =>
            !leases.some((lease) =>
              this.sshRemotePtyLeaseMayReferenceBinding(lease, {
                ptyId,
                targetId,
                worktreeId,
                tabId,
                leafId
              })
            )
        )
      )
      if (Object.keys(nextBindings).length !== Object.keys(bindings).length) {
        layout.ptyIdsByLeafId = nextBindings
        changed = true
      }
    }
    if (changed) {
      this.scheduleSave()
    }
    return changed
  }

  // ── Flush (for shutdown) ───────────────────────────────────────────

  flush(): void {
    try {
      this.flushOrThrow()
    } catch (err) {
      console.error('[persistence] Failed to flush state:', err)
    }
    this.githubCacheFile.writeIfDirty(this.state.githubCache)
  }

  // Why: called after a project move rewrote this store's data file directly.
  // From that point until relaunch, the in-memory state is stale and any
  // write (debounced, sync, or shutdown flush) would undo the transfer.
  freezeWrites(): void {
    this.durableStateFile.freezeWrites()
  }
}

function getDefaultWorktreeMeta(): WorktreeMeta {
  return {
    instanceId: randomUUID(),
    displayName: '',
    comment: '',
    linkedPR: null,
    linkedGitLabMR: null,
    linkedBitbucketPR: null,
    linkedAzureDevOpsPR: null,
    linkedGiteaPR: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: Date.now(),
    lastActivityAt: 0,
    workspaceStatus: DEFAULT_WORKSPACE_STATUS_ID
  }
}
