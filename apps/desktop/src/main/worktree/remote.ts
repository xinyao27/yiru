/* eslint-disable max-lines */
// Why: worktree creation and Git-remote setup share base selection, fetch
// coordination, and post-create metadata. Keeping that flow together prevents
// the IPC wiring from duplicating lifecycle invariants.

import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'

import type { BrowserWindow } from 'electron'
import { getProjectHostSetupWorktreeMeta } from '~shared/project-host-setup-projection'
import { TUI_AGENT_CONFIG, isTuiAgent } from '~shared/tui-agent/config'
import type {
  AutomationWorkspaceProvenance,
  CreateWorktreeArgs,
  CreateWorktreeResult,
  GitPushTarget,
  GlobalSettings,
  Repo,
  Worktree,
  WorktreeHeadIdentity,
  WorktreeMeta
} from '~shared/types'
import { resolveWorktreeAddBaseRef } from '~shared/workspace/worktree-base-ref'

import { hasCommitObjectViaGitExec } from '../git/commit-object-ref'
import { validateGitPushTarget } from '../git/push-target-validation'
import { getBranchConflictKind, resolveDefaultBaseRefWithLocalGit } from '../git/repo'
import { gitExecFileAsync } from '../git/runner'
import { resolveLocalGitUsername } from '../git/username'
import { listWorktrees, addWorktree, addSparseWorktree } from '../git/worktree'
import type { AddWorktreeOptions, AddWorktreeResult } from '../git/worktree'
import { getPRForBranch } from '../github/client'
import {
  createSetupRunnerScript,
  getDefaultTabsLaunch,
  getEffectiveHooks,
  getEffectiveHooksFromConfig,
  loadHooks,
  shouldRunSetupForCreate
} from '../hooks'
import type { Store } from '../persistence'
import type { YiruRuntimeService } from '../runtime/yiru-runtime'
import type { RemoteFetchResult, RemoteTrackingBase } from '../runtime/yiru-runtime'
import type { ForgeProviderId } from '../source-control/forge-provider'
import { getHostedReviewForBranch } from '../source-control/hosted-review'
import { resolveWorktreeCreateBase } from '../worktree-create-base'
import { runWorktreeChangeInvalidators } from './change-invalidators'
import { formatWorktreeIncludeCopyWarning } from './include-copy-budget'
import { resolveWorktreeIncludePaths } from './include-file'

type CreateWorktreeArgsWithSystemProvenance = CreateWorktreeArgs & {
  automationProvenance?: AutomationWorkspaceProvenance
}
import { getRepoIdFromWorktreeId } from '@yiru/workbench-model/workspace'
import type { BranchPrefixSettings } from '~shared/branch-prefix'
import { createSequencedSetupAgentCommands } from '~shared/setup/agent-sequencing'
import {
  buildSetupRunnerCommand,
  getSetupRunnerCommandPlatformForPath
} from '~shared/setup/runner-command'
import { parseWorkspaceKey, worktreeWorkspaceKey } from '~shared/workspace/scope'

import {
  markCodexProjectTrusted,
  markCopilotFolderTrusted,
  markCursorWorkspaceTrusted
} from '../agent-trust-presets'
import { registerWorktreeRootsForRepo } from '../filesystem/auth'
import {
  getLocalProjectGitExecOptions,
  getLocalProjectWorktreeGitOptions
} from '../project-runtime-git-options'
import { normalizeSparseDirectories } from '../sparse-checkout-directories'
import {
  getBranchNameOverrideCandidate,
  getWorktreeCreateCandidate,
  WORKTREE_CREATE_MAX_SUFFIX_ATTEMPTS
} from '../worktree-create-candidates'
import { createWorktreeCreateTimingRecorder } from '../worktree-create-timing'
import {
  sanitizeWorktreeName,
  sanitizeWorktreeDisplayName,
  computeValidatedBranchName,
  computeWorktreePath,
  computeWorkspaceRoot,
  ensurePathWithinWorkspace,
  getWorktreeCreationLayout,
  getWorktreePathSettings,
  shouldSetDisplayName,
  mergeWorktree,
  areWorktreePathsEqual
} from './logic'
import {
  cleanupUnusedWorktreePushTargetRemoteWithExec,
  sameGitHubRemoteUrl,
  type WorktreePushTargetStore
} from './push-target-cleanup'
import {
  configureCreatedWorktreePushTargetWithExec,
  prepareWorktreePushTargetWithExec
} from './push-target-setup'
import { resolveWorktreeSharedDirectories } from './shared-directories'
import {
  createWorktreeCopiedPaths,
  createWorktreeLinkedPaths,
  createWorktreeSharedPaths
} from './symlinks'

// Why: bound the create-path fallback `git fetch origin` so a Windows
// credential-manager GUI hang (STA-1292) can't wedge worktree creation forever.
const CREATE_BASE_FALLBACK_FETCH_TIMEOUT_MS = 60_000

type StagedStartupResult = {
  startupTerminal?: CreateWorktreeResult['startupTerminal']
  activationSetup?: CreateWorktreeResult['setup']
  didSpawnSetup: boolean
  warning?: string
}

function appendWorktreeCreateWarning(current: string | undefined, next: string): string {
  return current ? `${current} Also ${next[0]?.toLowerCase() ?? ''}${next.slice(1)}` : next
}

function validateWorkspaceLineageParentBeforeCreate(
  store: Store,
  parentWorkspace: CreateWorktreeArgs['parentWorkspace'],
  childWorkspaceKey: ReturnType<typeof worktreeWorkspaceKey>
): void {
  if (!parentWorkspace) {
    return
  }
  if (parentWorkspace === childWorkspaceKey) {
    throw new Error('A worktree cannot be attached to itself.')
  }
  const parentScope = parseWorkspaceKey(parentWorkspace)
  if (!parentScope) {
    throw new Error(`Invalid parent workspace: ${parentWorkspace}`)
  }
  if (parentScope.type === 'folder' && !store.getFolderWorkspace(parentScope.folderWorkspaceId)) {
    throw new Error(`Parent folder workspace not found: ${parentWorkspace}`)
  }
  if (parentScope.type === 'worktree' && !store.getWorktreeMeta(parentScope.worktreeId)) {
    throw new Error(`Parent worktree workspace not found: ${parentWorkspace}`)
  }
}

function recordWorkspaceLineageForCreatedWorktree(
  store: Store,
  args: CreateWorktreeArgs,
  worktree: Worktree,
  createdAt: number
): CreateWorktreeResult['workspaceLineage'] {
  if (!args.parentWorkspace || !worktree.instanceId) {
    return null
  }
  const childWorkspaceKey = worktreeWorkspaceKey(worktree.id)
  if (args.parentWorkspace === childWorkspaceKey) {
    console.warn(`[worktree-create] refusing to attach ${worktree.id} to itself`)
    return null
  }
  const parentScope = parseWorkspaceKey(args.parentWorkspace)
  if (!parentScope) {
    console.warn(`[worktree-create] ignoring invalid parent workspace ${args.parentWorkspace}`)
    return null
  }
  if (parentScope.type === 'folder' && !store.getFolderWorkspace(parentScope.folderWorkspaceId)) {
    console.warn(`[worktree-create] parent folder workspace disappeared: ${args.parentWorkspace}`)
    return null
  }
  const parentWorktreeMeta =
    parentScope.type === 'worktree' ? store.getWorktreeMeta(parentScope.worktreeId) : null
  if (parentScope.type === 'worktree' && !parentWorktreeMeta) {
    console.warn(`[worktree-create] parent worktree workspace disappeared: ${args.parentWorkspace}`)
    return null
  }
  return store.setWorkspaceLineage({
    childWorkspaceKey,
    childInstanceId: worktree.instanceId,
    parentWorkspaceKey: args.parentWorkspace,
    parentInstanceId: parentWorktreeMeta?.instanceId ?? null,
    origin: 'manual',
    capture: { source: 'active-workspace', confidence: 'explicit' },
    createdAt
  })
}

async function spawnLocalStartupAndSetupTerminals(args: {
  runtime: YiruRuntimeService | undefined
  worktree: Pick<Worktree, 'id' | 'path'>
  startup: CreateWorktreeArgs['startup']
  setup: CreateWorktreeResult['setup']
  defaultTabs: CreateWorktreeResult['defaultTabs']
  settings: GlobalSettings
  createdWithAgent: CreateWorktreeArgs['createdWithAgent']
}): Promise<StagedStartupResult> {
  const { runtime, worktree, startup, setup, defaultTabs, settings, createdWithAgent } = args
  if (!runtime || !startup || defaultTabs?.tabs.length) {
    return { didSpawnSetup: false }
  }

  let warning: string | undefined
  let startupTerminalHandle: string | null = null
  let startupTerminal: CreateWorktreeResult['startupTerminal']

  let sequencedStartup = startup
  let wrappedSetupCommandStr: string | undefined
  if (startup && setup?.waitForAgentStartup === true) {
    const platform = getSetupRunnerCommandPlatformForPath(
      setup.runnerScriptPath,
      process.platform === 'win32' ? 'windows' : 'posix'
    )
    const sequenced = createSequencedSetupAgentCommands({
      runnerScriptPath: setup.runnerScriptPath,
      startupCommand: startup.command,
      platform
    })
    sequencedStartup = {
      ...startup,
      command: sequenced.startupCommand,
      ...(sequenced.startupEnv ? { env: { ...startup.env, ...sequenced.startupEnv } } : {})
    }
    wrappedSetupCommandStr = sequenced.setupCommand
  }

  try {
    // Why: after `git worktree add` and metadata registration, a runtime-owned
    // PTY can begin booting the selected agent while setup runs in a sibling
    // terminal. Earlier than this, the worktree path is not yet safe for agents.
    if (isTuiAgent(createdWithAgent)) {
      const preset = TUI_AGENT_CONFIG[createdWithAgent].preflightTrust
      try {
        if (preset === 'cursor') {
          markCursorWorkspaceTrusted(worktree.path)
        } else if (preset === 'copilot') {
          markCopilotFolderTrusted(worktree.path)
        } else if (preset === 'codex') {
          markCodexProjectTrusted(worktree.path)
        }
      } catch {
        // Best-effort: launch still proceeds and the agent can ask interactively.
      }
    }
    const terminal = await runtime.createTerminal(`id:${worktree.id}`, {
      command: sequencedStartup.command,
      ...(setup ? { claudeAgentTeamsSourceCommand: startup.command } : {}),
      env: sequencedStartup.env,
      ...(sequencedStartup.launchConfig ? { launchConfig: sequencedStartup.launchConfig } : {}),
      ...(isTuiAgent(createdWithAgent) ? { launchAgent: createdWithAgent } : {}),
      startupCommandDelivery: sequencedStartup.startupCommandDelivery,
      telemetry: sequencedStartup.telemetry,
      activate: true
    })
    startupTerminalHandle = terminal.handle
    startupTerminal = {
      spawned: true,
      surface: terminal.surface
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    warning = `Failed to create the startup terminal for ${worktree.path}: ${message}`
    console.warn(`[worktree-create] ${warning}`)
    return { didSpawnSetup: false, warning }
  }

  let didSpawnSetup = false
  if (setup) {
    try {
      const setupCommand =
        wrappedSetupCommandStr ??
        buildSetupRunnerCommand(
          setup.runnerScriptPath,
          getSetupRunnerCommandPlatformForPath(
            setup.runnerScriptPath,
            process.platform === 'win32' ? 'windows' : 'posix'
          )
        )
      const setupLaunchMode =
        (settings as Partial<Pick<GlobalSettings, 'setupScriptLaunchMode'>>)
          .setupScriptLaunchMode ?? 'new-tab'
      if (setupLaunchMode === 'split-vertical' || setupLaunchMode === 'split-horizontal') {
        if (!startupTerminalHandle) {
          throw new Error('startup_terminal_missing')
        }
        await runtime.splitTerminal(startupTerminalHandle, {
          direction: setupLaunchMode === 'split-horizontal' ? 'horizontal' : 'vertical',
          command: setupCommand,
          env: setup.envVars,
          activate: false
        })
      } else {
        await runtime.createTerminal(`id:${worktree.id}`, {
          title: 'Setup',
          command: setupCommand,
          env: setup.envVars,
          activate: false
        })
      }
      didSpawnSetup = true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const nextWarning = `failed to create the setup terminal for ${worktree.path}: ${message}`
      warning = appendWorktreeCreateWarning(warning, nextWarning)
      console.warn(`[worktree-create] ${warning}`)
    }
  }

  return {
    ...(setup && !didSpawnSetup
      ? {
          activationSetup: {
            ...setup,
            ...(startupTerminalHandle && wrappedSetupCommandStr
              ? { command: wrappedSetupCommandStr }
              : {})
          }
        }
      : {}),
    ...(startupTerminal ? { startupTerminal } : {}),
    didSpawnSetup,
    ...(warning ? { warning } : {})
  }
}

async function resolveCreateBranchName(
  repoPath: string,
  branchNameOverride: string | undefined,
  sanitizedName: string,
  settings: BranchPrefixSettings,
  username: string | null,
  gitOptions: { wslDistro?: string } = {}
): Promise<string> {
  if (!branchNameOverride) {
    return computeValidatedBranchName(sanitizedName, settings, username)
  }
  if (branchNameOverride.startsWith('-')) {
    throw new Error('Branch name must not start with "-"')
  }
  await gitExecFileAsync(['check-ref-format', '--branch', branchNameOverride], {
    cwd: repoPath,
    ...gitOptions
  })
  return branchNameOverride
}

function normalizeLocalBranchName(branchName: string | undefined): string {
  return branchName?.replace(/^refs\/heads\//, '') ?? ''
}

async function canCheckoutExistingLocalBranch(
  repoPath: string,
  branchName: string,
  baseBranch: string,
  gitOptions: { wslDistro?: string } = {}
): Promise<boolean> {
  let localHead = ''
  try {
    const { stdout } = await gitExecFileAsync(
      ['rev-parse', '--verify', '--quiet', `refs/heads/${branchName}^{commit}`],
      {
        cwd: repoPath,
        ...gitOptions
      }
    )
    localHead = stdout.trim()
  } catch {
    return false
  }
  if (normalizeLocalBranchName(baseBranch) !== branchName) {
    if (!localHead) {
      return false
    }
    try {
      const { stdout } = await gitExecFileAsync(
        ['rev-parse', '--verify', '--quiet', `${baseBranch}^{commit}`],
        { cwd: repoPath, ...gitOptions }
      )
      if (stdout.trim() !== localHead) {
        return false
      }
    } catch {
      return false
    }
  }
  const worktrees = await listWorktrees(repoPath, gitOptions)
  return !worktrees.some((worktree) => normalizeLocalBranchName(worktree.branch) === branchName)
}

function hasLocalGitOptions(gitOptions: { wslDistro?: string }): boolean {
  return Object.keys(gitOptions).length > 0
}

function hasLocalCommitObjectWithOptions(
  repoPath: string,
  ref: string,
  gitOptions: { wslDistro?: string }
): Promise<boolean> {
  return hasCommitObjectViaGitExec(
    (gitArgs) => gitExecFileAsync(gitArgs, { cwd: repoPath, ...gitOptions }),
    ref
  )
}

async function hasLocalWorktreeBaseRefWithOptions(
  repoPath: string,
  baseRef: string,
  gitOptions: { wslDistro?: string }
): Promise<boolean> {
  const refExists = async (qualifiedRef: string) => {
    try {
      const { stdout } = await gitExecFileAsync(
        ['rev-parse', '--verify', '--quiet', `${qualifiedRef}^{commit}`],
        {
          cwd: repoPath,
          ...gitOptions
        }
      )
      return stdout.trim().length > 0
    } catch {
      return false
    }
  }
  const resolvedBaseRef = await resolveWorktreeAddBaseRef(baseRef, refExists)
  if (resolvedBaseRef !== baseRef) {
    return true
  }
  if (baseRef.startsWith('refs/')) {
    return refExists(baseRef)
  }
  return hasLocalCommitObjectWithOptions(repoPath, baseRef, gitOptions)
}

function getLocalGitHubPrForBranch(
  repoPath: string,
  branchName: string,
  gitOptions: { wslDistro?: string }
): ReturnType<typeof getPRForBranch> {
  return hasLocalGitOptions(gitOptions)
    ? getPRForBranch(repoPath, branchName, null, null, null, { localGitExecOptions: gitOptions })
    : getPRForBranch(repoPath, branchName)
}

type SelectedReviewBranchInput = Pick<
  CreateWorktreeArgs,
  | 'branchNameOverride'
  | 'linkedPR'
  | 'linkedGitLabMR'
  | 'linkedBitbucketPR'
  | 'linkedAzureDevOpsPR'
  | 'linkedGiteaPR'
  | 'pushTarget'
>

type SelectedReviewBranch = {
  provider: ForgeProviderId
  number: number
}

function getSelectedReviewBranch(args: SelectedReviewBranchInput): SelectedReviewBranch | null {
  if (typeof args.linkedPR === 'number') {
    return { provider: 'github', number: args.linkedPR }
  }
  if (typeof args.linkedGitLabMR === 'number') {
    return { provider: 'gitlab', number: args.linkedGitLabMR }
  }
  if (typeof args.linkedBitbucketPR === 'number') {
    return { provider: 'bitbucket', number: args.linkedBitbucketPR }
  }
  if (typeof args.linkedAzureDevOpsPR === 'number') {
    return { provider: 'azure-devops', number: args.linkedAzureDevOpsPR }
  }
  if (typeof args.linkedGiteaPR === 'number') {
    return { provider: 'gitea', number: args.linkedGiteaPR }
  }
  return null
}

function isSelectedGitHubPrBranchOverride(
  args: SelectedReviewBranchInput,
  branchName: string
): boolean {
  return typeof args.linkedPR === 'number' && args.branchNameOverride === branchName
}

function isSelectedReviewBranchOverride(
  args: SelectedReviewBranchInput,
  branchName: string
): boolean {
  return getSelectedReviewBranch(args) !== null && args.branchNameOverride === branchName
}

function isMatchingSelectedGitHubPr(
  existingPR: Awaited<ReturnType<typeof getPRForBranch>>,
  args: SelectedReviewBranchInput,
  branchName: string
): boolean {
  return Boolean(
    existingPR &&
    isSelectedGitHubPrBranchOverride(args, branchName) &&
    existingPR.number === args.linkedPR
  )
}

function isAllowedPushTargetRemoteConflict(
  conflictKind: 'local' | 'remote' | null,
  branchName: string,
  args: SelectedReviewBranchInput
): boolean {
  return (
    conflictKind === 'remote' &&
    isSelectedReviewBranchOverride(args, branchName) &&
    args.pushTarget?.branchName === branchName
  )
}

function getSelectedReviewLookupHints(args: SelectedReviewBranchInput): {
  linkedGitHubPR?: number | null
  linkedGitLabMR?: number | null
  linkedBitbucketPR?: number | null
  linkedAzureDevOpsPR?: number | null
  linkedGiteaPR?: number | null
} {
  return {
    linkedGitHubPR: args.linkedPR ?? null,
    linkedGitLabMR: args.linkedGitLabMR ?? null,
    linkedBitbucketPR: args.linkedBitbucketPR ?? null,
    linkedAzureDevOpsPR: args.linkedAzureDevOpsPR ?? null,
    linkedGiteaPR: args.linkedGiteaPR ?? null
  }
}

async function getSelectedHostedReviewForBranch(
  repo: Pick<Repo, 'path'>,
  branchName: string,
  args: SelectedReviewBranchInput
): Promise<{ matchesSelected: boolean; number: number } | null> {
  const selectedReview = getSelectedReviewBranch(args)
  if (!selectedReview) {
    return null
  }
  const review = await getHostedReviewForBranch({
    repoPath: repo.path,
    connectionId: null,
    branch: branchName,
    ...getSelectedReviewLookupHints(args)
  })
  if (!review) {
    return null
  }
  return {
    matchesSelected:
      review.provider === selectedReview.provider && review.number === selectedReview.number,
    number: review.number
  }
}

export async function prepareWorktreePushTarget(
  repoPath: string,
  target: GitPushTarget,
  store?: WorktreePushTargetStore,
  repoId?: string,
  gitOptions: { wslDistro?: string } = {}
): Promise<GitPushTarget> {
  await validateGitPushTarget(repoPath, target, gitOptions)
  return prepareWorktreePushTargetWithExec(
    (args, cwd) => gitExecFileAsync(args, { cwd, ...gitOptions }),
    repoPath,
    target,
    (existingRemote) =>
      store
        ? isPushTargetRemoteCreatedByKnownWorktree(
            store,
            { ...target, remoteName: existingRemote },
            repoId
          )
        : false
  )
}

function isPushTargetRemoteCreatedByKnownWorktree(
  store: WorktreePushTargetStore,
  target: GitPushTarget,
  repoId?: string
): boolean {
  return Object.entries(store.getAllWorktreeMeta()).some(([worktreeId, meta]) => {
    if (repoId && getRepoIdFromWorktreeId(worktreeId) !== repoId) {
      return false
    }
    if (!meta.pushTarget?.remoteCreated) {
      return false
    }
    const otherRemoteUrl = meta.pushTarget.remoteUrl
    const targetRemoteUrl = target.remoteUrl
    return (
      meta.pushTarget.remoteName === target.remoteName ||
      (typeof otherRemoteUrl === 'string' &&
        typeof targetRemoteUrl === 'string' &&
        sameGitHubRemoteUrl(otherRemoteUrl, targetRemoteUrl))
    )
  })
}

export async function cleanupUnusedWorktreePushTargetRemote(
  repoPath: string,
  removedWorktreeId: string,
  target: GitPushTarget | undefined,
  store: WorktreePushTargetStore,
  gitOptions: { wslDistro?: string } = {}
): Promise<void> {
  try {
    await cleanupUnusedWorktreePushTargetRemoteWithExec(
      repoPath,
      removedWorktreeId,
      target,
      store,
      (args, cwd) => gitExecFileAsync(args, { cwd, ...gitOptions })
    )
  } catch (error) {
    console.warn(`[worktrees] Failed to clean up fork PR remote for ${removedWorktreeId}`, error)
  }
}

export async function configureCreatedWorktreePushTarget(
  worktreePath: string,
  branchName: string,
  target: GitPushTarget,
  gitOptions: { wslDistro?: string } = {}
): Promise<GitPushTarget> {
  return configureCreatedWorktreePushTargetWithExec(
    (args, cwd) => gitExecFileAsync(args, { cwd, ...gitOptions }),
    worktreePath,
    branchName,
    target
  )
}

export function notifyWorktreesChanged(mainWindow: BrowserWindow, repoId: string): void {
  // Why: invalidate detected-worktree caches before renderer observers react,
  // so follow-up listDetected reads post-change state.
  runWorktreeChangeInvalidators(repoId)
  if (!mainWindow.isDestroyed()) {
    mainWindow.webContents.send('worktrees:changed', { repoId })
  }
}

export function notifyWorktreeGitStatusMetadataChanged(
  mainWindow: BrowserWindow,
  repoId: string
): void {
  // Why: index churn is a Source Control freshness hint, not a worktree graph
  // mutation; keep structural caches and runtime/mobile events untouched.
  if (!mainWindow.isDestroyed()) {
    mainWindow.webContents.send('worktrees:gitStatusMetadataChanged', { repoId })
  }
}

export function notifyWorktreeHeadIdentitiesChanged(
  mainWindow: BrowserWindow,
  repoId: string,
  identities: WorktreeHeadIdentity[]
): void {
  // Why: background worktrees have no active-scoped status refresh, so head
  // moves detected from metadata files ride this targeted desktop event
  // instead of re-entering the structural fanout or runtime/mobile events.
  if (!mainWindow.isDestroyed()) {
    mainWindow.webContents.send('worktrees:headIdentitiesChanged', { repoId, identities })
  }
}

// Why: two-phase spinner. Main process fires `'fetching'` before waiting on
// pre-create fetch work and `'creating'` immediately before `git worktree add`.
// Renderer swaps its spinner label in response; fallback is the static
// "Creating worktree..." label if no event arrives.
export function emitCreateWorktreeProgress(
  mainWindow: BrowserWindow,
  phase: 'fetching' | 'creating',
  creationId?: string
): void {
  if (!mainWindow.isDestroyed()) {
    mainWindow.webContents.send('createWorktree:progress', { creationId, phase })
  }
}

export async function createLocalWorktree(
  args: CreateWorktreeArgsWithSystemProvenance,
  repo: Repo,
  store: Store,
  mainWindow: BrowserWindow,
  runtime?: YiruRuntimeService
): Promise<CreateWorktreeResult> {
  const timing = createWorktreeCreateTimingRecorder()
  const settings = store.getSettings()
  const worktreePathSettings = getWorktreePathSettings(repo, settings)
  const localGitExecOptions = getLocalProjectGitExecOptions(store, repo)
  const localWorktreeGitOptions = getLocalProjectWorktreeGitOptions(store, repo)
  const hasLocalWorktreeGitOptions = Object.keys(localWorktreeGitOptions).length > 0
  const localWorktreeGitOptionArgs: [] | [{ wslDistro?: string }] = hasLocalWorktreeGitOptions
    ? [localWorktreeGitOptions]
    : []
  const addProjectGitOptions = (options?: AddWorktreeOptions): AddWorktreeOptions | undefined => {
    if (!hasLocalWorktreeGitOptions) {
      return options
    }
    return { ...options, ...localWorktreeGitOptions }
  }

  const requestedName = args.name
  const sanitizedName = sanitizeWorktreeName(args.name)
  const requestedDisplayName = args.displayName
    ? sanitizeWorktreeDisplayName(args.displayName)
    : undefined
  // Why: explicit branches and non-username prefix modes never consume this
  // value; skipping the probes preserves the exact generated branch name.
  const username =
    !args.branchNameOverride && settings.branchPrefix === 'git-username'
      ? await resolveLocalGitUsername(repo.path)
      : ''

  const baseBranch = await resolveWorktreeCreateBase({
    requestedBaseBranch: args.baseBranch,
    repoWorktreeBaseRef: repo.worktreeBaseRef,
    resolveDefaultBaseRef: () => resolveDefaultBaseRefWithLocalGit(localGitExecOptions),
    isBaseUsable: async (baseBranchCandidate) => {
      if (runtime) {
        const remoteTrackingBase = await runtime.resolveRemoteTrackingBase(
          repo.path,
          baseBranchCandidate,
          ...localWorktreeGitOptionArgs
        )
        if (remoteTrackingBase) {
          if (
            await runtime.hasRemoteTrackingRef(
              repo.path,
              remoteTrackingBase,
              ...localWorktreeGitOptionArgs
            )
          ) {
            return true
          }
          return hasLocalWorktreeBaseRefWithOptions(
            repo.path,
            baseBranchCandidate,
            localGitExecOptions
          )
        }
      }
      return hasLocalWorktreeBaseRefWithOptions(repo.path, baseBranchCandidate, localGitExecOptions)
    }
  })
  if (!baseBranch) {
    // Why: resolveDefaultBaseRefViaExec may return null when none of origin/HEAD,
    // origin/main, origin/master, local main, or local master exist. Don't
    // fall back to a hardcoded 'origin/main' — passing a non-existent ref to
    // `git worktree add` produces an opaque error. Fail here with a clear
    // message so the UI can prompt the user to pick a base branch explicitly.
    throw new Error(
      'Could not resolve a default base ref for this repo. Pick a base branch explicitly and try again.'
    )
  }

  let remoteTrackingBase: RemoteTrackingBase | null = null
  let remoteTrackingRefresh: {
    base: RemoteTrackingBase
    hadLocalBaseRef: boolean
    promise: Promise<RemoteFetchResult>
  } | null = null
  let legacyFetchPromise: Promise<void> | null = null

  if (runtime) {
    remoteTrackingBase = await runtime.resolveRemoteTrackingBase(
      repo.path,
      baseBranch,
      ...localWorktreeGitOptionArgs
    )
    if (remoteTrackingBase) {
      const hasRemoteTrackingBaseRef = await runtime.hasRemoteTrackingRef(
        repo.path,
        remoteTrackingBase,
        ...localWorktreeGitOptionArgs
      )
      const hasLocalBaseRef =
        hasRemoteTrackingBaseRef ||
        (await hasLocalWorktreeBaseRefWithOptions(repo.path, baseBranch, localGitExecOptions))
      if (!hasRemoteTrackingBaseRef && hasLocalBaseRef) {
        remoteTrackingBase = null
      } else {
        emitCreateWorktreeProgress(mainWindow, 'fetching', args.creationId)
        remoteTrackingRefresh = {
          base: remoteTrackingBase,
          hadLocalBaseRef: hasRemoteTrackingBaseRef,
          promise: runtime.getOrStartRemoteTrackingBaseRefresh(
            repo.path,
            remoteTrackingBase,
            ...localWorktreeGitOptionArgs
          )
        }
      }
    } else if (
      !(await hasLocalWorktreeBaseRefWithOptions(repo.path, baseBranch, localWorktreeGitOptions))
    ) {
      // Why: when the base branch does not match a configured remote prefix
      // (e.g. plain `main`, `master`, or any local branch), the legacy path
      // still ran a best-effort `git fetch origin`. Verified PR SHA bases
      // already have the needed commit object, so skip that broad fetch.
      legacyFetchPromise = runtime
        .fetchRemoteWithCache(repo.path, 'origin', ...localWorktreeGitOptionArgs)
        .then(() => undefined)
        .catch(() => undefined)
      emitCreateWorktreeProgress(mainWindow, 'fetching', args.creationId)
    }
  } else {
    if (
      !(await hasLocalWorktreeBaseRefWithOptions(repo.path, baseBranch, localWorktreeGitOptions))
    ) {
      legacyFetchPromise = gitExecFileAsync(['fetch', 'origin'], {
        ...localGitExecOptions,
        timeout: CREATE_BASE_FALLBACK_FETCH_TIMEOUT_MS
      })
        .then(() => undefined)
        .catch(() => undefined)
      emitCreateWorktreeProgress(mainWindow, 'fetching', args.creationId)
    }
  }
  const workspaceRoot = computeWorkspaceRoot(repo.path, worktreePathSettings)

  // Why: this validation does not depend on remote refs, so it can overlap a
  // required remote-tracking base refresh.
  const primarySetupScript = getEffectiveHooks(repo)?.scripts.setup
  if (primarySetupScript) {
    shouldRunSetupForCreate(repo, args.setupDecision)
  }
  const sparseDirectories = args.sparseCheckout
    ? normalizeSparseDirectories(args.sparseCheckout.directories)
    : []
  if (args.sparseCheckout && sparseDirectories.length === 0) {
    throw new Error('Sparse checkout requires at least one repo-relative directory.')
  }
  let sparsePresetId: string | undefined
  if (args.sparseCheckout?.presetId) {
    const preset = store
      .getSparsePresets(repo.id)
      .find((entry) => entry.id === args.sparseCheckout?.presetId)
    if (preset?.repoId === repo.id) {
      try {
        const presetDirectories = normalizeSparseDirectories(preset.directories)
        // Why: use Set-based comparison so directory order does not affect
        // attribution — matches the renderer's sparseDirectoriesMatch logic.
        const presetSet = new Set(presetDirectories)
        const directoriesMatch =
          presetDirectories.length === sparseDirectories.length &&
          sparseDirectories.every((entry) => presetSet.has(entry))
        sparsePresetId = directoriesMatch ? preset.id : undefined
      } catch {
        // Why: corrupt preset data should not block creation or falsely label the new worktree.
      }
    }
  }

  let effectiveRequestedName = requestedName
  let effectiveSanitizedName = sanitizedName
  let branchName = ''
  let worktreePath = ''

  const branchConflictSubject = args.branchNameOverride ? 'branch name' : 'worktree name'
  let resolved = false
  let checkoutExistingBranch = false
  let selectedExistingLocalBranchName: string | null = null
  let lastBranchConflictKind: 'local' | 'remote' | null = null
  let lastExistingPR: Awaited<ReturnType<typeof getPRForBranch>> | null = null
  let lastExistingReviewNumber: number | null = null
  // Why: create-from-review can provide an exact branch override that already
  // exists locally; suffix both branch and path instead of blocking the user.
  for (let suffix = 1; suffix <= WORKTREE_CREATE_MAX_SUFFIX_ATTEMPTS; suffix += 1) {
    effectiveSanitizedName = getWorktreeCreateCandidate(sanitizedName, suffix)
    effectiveRequestedName = requestedName.trim()
      ? getWorktreeCreateCandidate(requestedName, suffix)
      : effectiveSanitizedName
    lastExistingReviewNumber = null

    branchName = await resolveCreateBranchName(
      repo.path,
      selectedExistingLocalBranchName
        ? selectedExistingLocalBranchName
        : getBranchNameOverrideCandidate(args.branchNameOverride, suffix),
      effectiveSanitizedName,
      settings,
      username,
      localWorktreeGitOptions
    )
    checkoutExistingBranch = await canCheckoutExistingLocalBranch(
      repo.path,
      branchName,
      baseBranch,
      localWorktreeGitOptions
    )
    if (checkoutExistingBranch && !selectedExistingLocalBranchName) {
      // Why: suffix retries may need a new path, but an existing branch checkout
      // must keep using the user-selected branch instead of creating a sibling.
      selectedExistingLocalBranchName = branchName
    }
    lastBranchConflictKind = checkoutExistingBranch
      ? null
      : await getBranchConflictKind(repo.path, branchName, baseBranch, localWorktreeGitOptions)
    const allowedPushTargetRemoteConflict =
      lastBranchConflictKind &&
      isAllowedPushTargetRemoteConflict(lastBranchConflictKind, branchName, args)
    if (lastBranchConflictKind) {
      if (allowedPushTargetRemoteConflict) {
        lastExistingPR = null
        let lookupFailed = false
        const selectedReview = getSelectedReviewBranch(args)
        if (selectedReview?.provider === 'github') {
          try {
            lastExistingPR = await getLocalGitHubPrForBranch(
              repo.path,
              branchName,
              localWorktreeGitOptions
            )
          } catch {
            lookupFailed = true
          }
          if (!lookupFailed && isMatchingSelectedGitHubPr(lastExistingPR, args, branchName)) {
            lastBranchConflictKind = null
          } else if (lastExistingPR) {
            lastExistingReviewNumber = lastExistingPR.number
          }
        } else if (selectedReview) {
          let hostedReview: Awaited<ReturnType<typeof getSelectedHostedReviewForBranch>> = null
          try {
            hostedReview = await getSelectedHostedReviewForBranch(repo, branchName, args)
          } catch {
            lookupFailed = true
          }
          if (!lookupFailed && hostedReview?.matchesSelected) {
            lastBranchConflictKind = null
          } else if (hostedReview) {
            lastExistingReviewNumber = hostedReview.number
          }
        }
      }
    }
    if (lastBranchConflictKind) {
      continue
    }

    // Why: `gh pr list` is a network round-trip that previously ran on every
    // create, adding ~1–3s to the happy path even when no conflict exists. We
    // only probe PR conflicts once a local/remote branch collision has already
    // forced us past the first suffix — at that point uniqueness matters
    // enough to justify the GitHub call. The common case (brand-new branch
    // name, no collisions) skips the network entirely.
    if (suffix > 1 && !checkoutExistingBranch) {
      lastExistingPR = null
      try {
        lastExistingPR = await getLocalGitHubPrForBranch(
          repo.path,
          branchName,
          localWorktreeGitOptions
        )
      } catch {
        // GitHub API may be unreachable, rate-limited, or token missing
      }
      if (lastExistingPR && !isMatchingSelectedGitHubPr(lastExistingPR, args, branchName)) {
        lastExistingReviewNumber = lastExistingPR.number
        continue
      }
    }

    worktreePath = ensurePathWithinWorkspace(
      computeWorktreePath(effectiveSanitizedName, repo.path, worktreePathSettings),
      workspaceRoot
    )
    if (existsSync(worktreePath)) {
      continue
    }

    resolved = true
    break
  }

  if (!resolved) {
    // Why: if every suffix in range collides, fall back to the original
    // "reject with a specific reason" behavior so the user sees why creation
    // failed instead of a generic error or (worse) an infinite spinner.
    if (lastExistingReviewNumber !== null) {
      throw new Error(
        `Branch "${branchName}" already has PR #${lastExistingReviewNumber}. Pick a different ${branchConflictSubject}.`
      )
    }
    if (lastBranchConflictKind) {
      throw new Error(
        `Branch "${branchName}" already exists ${lastBranchConflictKind === 'local' ? 'locally' : 'on a remote'}. Pick a different ${branchConflictSubject}.`
      )
    }
    throw new Error(
      `Could not find an available worktree name for "${sanitizedName}". Pick a different worktree name.`
    )
  }

  validateWorkspaceLineageParentBeforeCreate(
    store,
    args.parentWorkspace,
    worktreeWorkspaceKey(`${repo.id}::${worktreePath}`)
  )

  if (remoteTrackingRefresh) {
    await timing.time('refresh_base_ref', async () => {
      const result = await remoteTrackingRefresh.promise
      if (!result.ok && !remoteTrackingRefresh.hadLocalBaseRef) {
        // Why: only block creation when the refresh failed AND there is no local
        // base ref to fall back on. An existing local remote-tracking ref lets
        // `git worktree add` proceed from a possibly stale but valid base, so a
        // transient offline/auth failure must not make the workspace
        // uncreatable. The compare-to-base view reflects any drift once the
        // remote is reachable again.
        throw new Error(
          `Could not refresh base ref "${baseBranch}" from "${remoteTrackingRefresh.base.remote}". Check your network and try again.`
        )
      }
      if (
        !remoteTrackingRefresh.hadLocalBaseRef &&
        !(await runtime?.hasRemoteTrackingRef(
          repo.path,
          remoteTrackingRefresh.base,
          ...localWorktreeGitOptionArgs
        ))
      ) {
        throw new Error(`Base ref "${baseBranch}" was not found after fetching.`)
      }
    })
  }

  if (legacyFetchPromise) {
    await timing.time('refresh_base_ref', async () => {
      await legacyFetchPromise
    })
  }
  emitCreateWorktreeProgress(mainWindow, 'creating', args.creationId)

  let preparedPushTarget: GitPushTarget | undefined
  if (args.pushTarget) {
    // Why: validate and fetch the contributor remote before creating the
    // worktree. If this fails, retrying won't hit branch/path conflicts from a
    // half-created worktree.
    preparedPushTarget = await prepareWorktreePushTarget(
      repo.path,
      args.pushTarget,
      store,
      repo.id,
      localWorktreeGitOptions
    )
  }

  const suggestLocalBaseRefUpdate =
    !settings.refreshLocalBaseRefOnWorktreeCreate &&
    !settings.localBaseRefSuggestionDismissed &&
    Boolean(remoteTrackingBase)
  const remoteTrackingBaseOption = remoteTrackingBase ? { remoteTrackingBase } : undefined
  const existingBranchOption = {
    checkoutExistingBranch,
    ...remoteTrackingBaseOption,
    ...(suggestLocalBaseRefUpdate ? { suggestLocalBaseRefUpdate } : {})
  }
  const addResult: AddWorktreeResult =
    (await timing.time('git_worktree_add', async () => {
      if (sparseDirectories.length > 0) {
        if (checkoutExistingBranch) {
          return addSparseWorktree(
            repo.path,
            worktreePath,
            branchName,
            sparseDirectories,
            baseBranch,
            settings.refreshLocalBaseRefOnWorktreeCreate,
            addProjectGitOptions(existingBranchOption)
          )
        }
        if (suggestLocalBaseRefUpdate) {
          return addSparseWorktree(
            repo.path,
            worktreePath,
            branchName,
            sparseDirectories,
            baseBranch,
            settings.refreshLocalBaseRefOnWorktreeCreate,
            addProjectGitOptions({ ...remoteTrackingBaseOption, suggestLocalBaseRefUpdate })
          )
        }
        const sparseOptions = addProjectGitOptions(remoteTrackingBaseOption)
        return sparseOptions
          ? addSparseWorktree(
              repo.path,
              worktreePath,
              branchName,
              sparseDirectories,
              baseBranch,
              settings.refreshLocalBaseRefOnWorktreeCreate,
              sparseOptions
            )
          : addSparseWorktree(
              repo.path,
              worktreePath,
              branchName,
              sparseDirectories,
              baseBranch,
              settings.refreshLocalBaseRefOnWorktreeCreate
            )
      }

      if (checkoutExistingBranch) {
        return addWorktree(
          repo.path,
          worktreePath,
          branchName,
          baseBranch,
          settings.refreshLocalBaseRefOnWorktreeCreate,
          false,
          addProjectGitOptions(existingBranchOption)
        )
      }
      if (suggestLocalBaseRefUpdate) {
        return addWorktree(
          repo.path,
          worktreePath,
          branchName,
          baseBranch,
          settings.refreshLocalBaseRefOnWorktreeCreate,
          false,
          addProjectGitOptions({ ...remoteTrackingBaseOption, suggestLocalBaseRefUpdate })
        )
      }
      const worktreeOptions = addProjectGitOptions(remoteTrackingBaseOption)
      return worktreeOptions
        ? addWorktree(
            repo.path,
            worktreePath,
            branchName,
            baseBranch,
            settings.refreshLocalBaseRefOnWorktreeCreate,
            false,
            worktreeOptions
          )
        : addWorktree(
            repo.path,
            worktreePath,
            branchName,
            baseBranch,
            settings.refreshLocalBaseRefOnWorktreeCreate
          )
    })) ?? {}

  let configuredPushTarget: GitPushTarget | undefined
  if (preparedPushTarget) {
    // Why: fork-PR review worktrees should publish commits back to the PR
    // author's branch. Configure the branch upstream immediately so the
    // existing Push/Pull/Sync controls use the contributor remote instead of
    // silently defaulting to origin.
    configuredPushTarget = await configureCreatedWorktreePushTarget(
      worktreePath,
      branchName,
      preparedPushTarget,
      localWorktreeGitOptions
    )
  }

  // Re-list to get the freshly created worktree info
  const gitWorktrees = await timing.time('list_created_worktree', async () =>
    hasLocalWorktreeGitOptions
      ? listWorktrees(repo.path, localWorktreeGitOptions)
      : listWorktrees(repo.path)
  )
  const created = gitWorktrees.find((gw) => areWorktreePathsEqual(gw.path, worktreePath))
  if (!created) {
    throw new Error('Worktree created but not found in listing')
  }

  const worktreeId = `${repo.id}::${created.path}`
  const now = Date.now()
  // Why: PR/MR-created worktrees can start from a head ref/SHA while Source
  // Control must compare against the review target branch.
  const metadataBaseRef = args.compareBaseRef ?? remoteTrackingBase?.ref ?? baseBranch
  const metaUpdates: Partial<WorktreeMeta> = {
    // Why: path-derived worktree IDs can be reused after external deletion.
    // Fresh creations must rotate instance identity so stale lineage cannot
    // attach to the new occupant of the same path.
    instanceId: randomUUID(),
    ...(store.getProjectHostSetups
      ? getProjectHostSetupWorktreeMeta(store.getProjectHostSetups(), repo)
      : {}),
    // Stamp activity so the worktree sorts into its final position
    // immediately — prevents scroll-to-reveal racing with a later
    // bumpWorktreeActivity that would re-sort the list.
    lastActivityAt: now,
    // Why: createdAt protects the newly-created worktree from ambient PTY bumps
    // in other worktrees for CREATE_GRACE_MS.
    createdAt: now,
    yiruCreatedAt: now,
    yiruCreationSource: 'desktop',
    yiruCreationWorkspaceLayout: getWorktreeCreationLayout(repo, settings),
    ...(args.automationProvenance ? { automationProvenance: args.automationProvenance } : {}),
    baseRef: metadataBaseRef,
    ...(checkoutExistingBranch ? { preserveBranchOnDelete: true } : {}),
    ...(configuredPushTarget ? { pushTarget: configuredPushTarget } : {}),
    ...(requestedDisplayName
      ? { displayName: requestedDisplayName }
      : shouldSetDisplayName(effectiveRequestedName, branchName, effectiveSanitizedName)
        ? { displayName: effectiveRequestedName }
        : {}),
    ...(sparseDirectories.length > 0
      ? {
          sparseDirectories,
          sparseBaseRef: metadataBaseRef,
          sparsePresetId
        }
      : {}),
    ...(isTuiAgent(args.createdWithAgent) ? { createdWithAgent: args.createdWithAgent } : {}),
    ...(args.pendingFirstAgentMessageRename === true && isTuiAgent(args.createdWithAgent)
      ? { pendingFirstAgentMessageRename: true }
      : {}),
    ...(args.linkedPR !== undefined ? { linkedPR: args.linkedPR } : {}),
    ...(args.manualOrder !== undefined ? { manualOrder: args.manualOrder } : {}),
    ...(args.linkedGitLabMR !== undefined ? { linkedGitLabMR: args.linkedGitLabMR } : {}),
    ...(args.linkedBitbucketPR !== undefined ? { linkedBitbucketPR: args.linkedBitbucketPR } : {}),
    ...(args.linkedAzureDevOpsPR !== undefined
      ? { linkedAzureDevOpsPR: args.linkedAzureDevOpsPR }
      : {}),
    ...(args.linkedGiteaPR !== undefined ? { linkedGiteaPR: args.linkedGiteaPR } : {}),
    ...(args.workspaceStatus !== undefined ? { workspaceStatus: args.workspaceStatus } : {})
  }
  const { worktree } = timing.timeSync('persist_metadata', () => {
    const meta = store.setWorktreeMeta(worktreeId, metaUpdates)
    return { worktree: mergeWorktree(repo.id, created, meta) }
  })
  const workspaceLineage = recordWorkspaceLineageForCreatedWorktree(store, args, worktree, now)
  // Why: creation already paid for `git worktree list`; seed the exact roots
  // now so the next file/git IPC does not lazily rescan and trip macOS privacy
  // prompts for the newly-created workspace.
  registerWorktreeRootsForRepo(store, repo.id, [
    repo.path,
    ...gitWorktrees.map((worktree) => worktree.path)
  ])

  // Why: materialize user-configured paths from the primary checkout into the
  // new worktree before any setup script runs, so scripts that reuse shared
  // state (e.g. `node_modules`, `.env`) see those paths already in place.
  const symlinkPaths = repo.symlinkPaths ?? []
  if (symlinkPaths.length > 0) {
    await timing.time('create_symlinks', async () => {
      await createWorktreeLinkedPaths(repo.path, created.path, symlinkPaths)
    })
  }

  const sharedDirectories = await timing.time('resolve_shared_directories', () =>
    resolveWorktreeSharedDirectories(repo.path, localWorktreeGitOptions)
  )
  if (sharedDirectories.length > 0) {
    await timing.time('create_shared_directories', async () => {
      await createWorktreeSharedPaths(repo.path, created.path, sharedDirectories)
    })
  }

  const includePaths = await timing.time('resolve_worktreeinclude', () =>
    resolveWorktreeIncludePaths(repo.path, localWorktreeGitOptions)
  )
  const skippedIncludePaths = await timing.time('copy_worktreeinclude', () =>
    createWorktreeCopiedPaths(repo.path, created.path, includePaths)
  )
  const worktreeIncludeWarning = formatWorktreeIncludeCopyWarning(skippedIncludePaths)

  // Why: the worktree's own `yiru.yaml` (at the tip of the base branch) is
  // authoritative for what runs post-creation. The repo-level trust already
  // granted by the user in the pre-create flow covers execution of that
  // script; we intentionally do not re-gate on content equality with the
  // primary checkout's preview, because benign divergence (whitespace,
  // comments, or any setup-script edit that has landed on the base branch
  // but not yet been pulled into the primary checkout) was silently
  // disabling setup with no UI signal. See #1280 for the original gate and
  // the regression this replaced.
  let setup: CreateWorktreeResult['setup']
  let defaultTabs: CreateWorktreeResult['defaultTabs']
  await timing.time('prepare_setup', async () => {
    const createdYamlHooks = loadHooks(worktreePath)
    const createdEffectiveHooks = getEffectiveHooksFromConfig(repo, createdYamlHooks)
    try {
      defaultTabs = getDefaultTabsLaunch(createdYamlHooks, repo, args.setupDecision)
    } catch (error) {
      // Why: default tab commands share setup's run policy. If the target branch
      // adds commands without a renderer decision, create the tabs but don't run them.
      console.warn(`[hooks] default tab commands skipped for ${worktreePath}:`, error)
      defaultTabs = createdYamlHooks?.defaultTabs
        ? { tabs: createdYamlHooks.defaultTabs, runCommands: false }
        : undefined
    }
    const setupScript = createdEffectiveHooks?.scripts.setup
    let shouldLaunchSetup = false
    if (setupScript) {
      try {
        shouldLaunchSetup = shouldRunSetupForCreate(repo, args.setupDecision)
      } catch (error) {
        // Why: if the target branch introduces setup hooks that the primary
        // checkout did not expose, the renderer may not have collected an ask
        // decision. The worktree already exists, so skip setup instead of
        // turning successful git creation into an IPC failure.
        console.warn(`[hooks] setup hook skipped for ${worktreePath}:`, error)
      }
    }
    if (setupScript && shouldLaunchSetup) {
      try {
        // Why: setup now runs in a visible terminal owned by the renderer so users
        // can inspect failures, answer prompts, and rerun it. The main process only
        // resolves policy and writes the runner script; it must not execute setup
        // itself anymore or we would reintroduce the hidden background-hook behavior.
        //
        // Why: the git worktree already exists at this point. If runner generation
        // fails, surfacing the error as a hard create failure would lie to the UI
        // about the underlying git state and strand a real worktree on disk.
        // Degrade to "created without setup launch" instead.
        setup = createSetupRunnerScript(
          repo,
          worktreePath,
          setupScript,
          ...localWorktreeGitOptionArgs
        )
      } catch (error) {
        console.error(`[hooks] Failed to prepare setup runner for ${worktreePath}:`, error)
      }
    }
  })

  const stagedStartup = await timing.time('spawn_startup_terminal', () =>
    spawnLocalStartupAndSetupTerminals({
      runtime,
      worktree,
      startup: args.startup,
      setup,
      defaultTabs,
      settings,
      createdWithAgent: args.createdWithAgent
    })
  )

  notifyWorktreesChanged(mainWindow, repo.id)
  return {
    worktree: { ...worktree, workspaceLineage },
    ...(workspaceLineage ? { workspaceLineage } : {}),
    ...(stagedStartup.activationSetup
      ? { setup: stagedStartup.activationSetup }
      : setup && !stagedStartup.didSpawnSetup
        ? { setup }
        : {}),
    ...(defaultTabs ? { defaultTabs } : {}),
    ...(addResult.localBaseRefRefresh
      ? { localBaseRefRefresh: addResult.localBaseRefRefresh }
      : {}),
    ...(addResult.localBaseRefUpdateSuggestion
      ? { localBaseRefUpdateSuggestion: addResult.localBaseRefUpdateSuggestion }
      : {}),
    ...(stagedStartup.startupTerminal ? { startupTerminal: stagedStartup.startupTerminal } : {}),
    ...([worktreeIncludeWarning, stagedStartup.warning].filter(Boolean).join(' ')
      ? { warning: [worktreeIncludeWarning, stagedStartup.warning].filter(Boolean).join(' ') }
      : {}),
    timing: timing.finish()
  }
}
