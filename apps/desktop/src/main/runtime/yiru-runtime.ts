import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

import {
  BROWSER_HEADLESS_RUNTIME_CAPABILITY,
  BROWSER_CERTIFICATE_TRUST_RUNTIME_CAPABILITY,
  EXTERNAL_EDITOR_REMOTE_SSH_RUNTIME_CAPABILITY,
  MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION,
  RUNTIME_CAPABILITIES,
  RUNTIME_PROTOCOL_VERSION,
  type RuntimeCapability
} from '@yiru/runtime-protocol/capabilities'
import type {
  RuntimeWorktreeAgentRow,
  RuntimeSpeechModelSummary,
  RuntimeSpeechSetupState
} from '@yiru/runtime-protocol/mobile-runtime-types'
import type { SshConnectionState } from '@yiru/runtime-protocol/ssh-connection'
import type { TerminalOscLinkRange } from '@yiru/runtime-protocol/terminal-osc-links'
import type { AiVaultListArgs, AiVaultListResult } from '@yiru/workbench-model/agent'
import type { SleepingAgentLaunchConfig } from '@yiru/workbench-model/agent'
import {
  AGENT_STATUS_STALE_AFTER_MS,
  isFreshNonDoneAgentStatus,
  type AgentStatusIpcPayload,
  type ParsedAgentStatusPayload,
  type AgentStatusOrchestrationContext,
  type AgentStatusEntry
} from '@yiru/workbench-model/agent'
import {
  isWindowsAbsolutePathLike,
  isPathInsideOrEqual,
  normalizeRuntimePathForComparison
} from '@yiru/workbench-model/platform'
import { isWslUncPath } from '@yiru/workbench-model/platform'
import { resolveLocalWindowsAgentStartupShell } from '@yiru/workbench-model/platform'
import { applyPRBotAuthorOverride } from '@yiru/workbench-model/review'
import type {
  CreateHostedReviewInput,
  CreateHostedReviewResult,
  HostedReviewCreationEligibility,
  HostedReviewCreationEligibilityArgs,
  HostedReviewInfo
} from '@yiru/workbench-model/review'
import {
  applyTerminalQuickCommandMutation,
  MAX_QUICK_COMMANDS,
  type TerminalQuickCommand,
  type TerminalQuickCommandMutation
} from '@yiru/workbench-model/ui'
import {
  getRepoExecutionHostId,
  parseExecutionHostId,
  type ExecutionHostId
} from '@yiru/workbench-model/workspace'
import { parsePtySessionId } from '@yiru/workbench-model/workspace'
import { githubAvatarIcon } from '@yiru/workbench-model/workspace'
import {
  FOLDER_WORKSPACE_INSTANCE_SEPARATOR,
  WORKTREE_ID_SEPARATOR,
  splitWorktreeId,
  splitWorktreeIdForFilesystem
} from '@yiru/workbench-model/workspace'
import { BrowserWindow, ipcMain } from 'electron'

/* eslint-disable max-lines -- Why: YiruRuntimeService still coordinates terminal output analysis, mobile session projections, worktree lifecycle, and automation. Terminal session state now lives behind TerminalSessionAuthority; later tickets split the remaining workflows before enforcing max-lines. */
/* eslint-disable unicorn/no-useless-spread -- Why: waiter sets and handle keys are cloned intentionally before mutation so resolution and rejection can safely remove entries while iterating. */
/* eslint-disable no-control-regex -- Why: terminal normalization must strip ANSI and OSC control sequences from PTY output before returning bounded text to agents. */
import {
  detectAgentStatusFromTitle,
  isClaudeManagementTitle,
  isCursorAgentTitle,
  isCursorNativeAgentTitle,
  isShellProcess,
  normalizeTerminalTitle
} from '../../shared/agent-detection'
import type { AgentStatus } from '../../shared/agent-detection'
import { repoIsRemote } from '../../shared/agent-launch-remote'
import {
  isAgentForegroundWrapperProcess,
  isExpectedAgentProcess,
  recognizeAgentProcess
} from '../../shared/agent-process-recognition'
import {
  AGENT_PROMPT_BRACKETED_PASTE_END,
  AGENT_PROMPT_SUBMIT,
  AGENT_PROMPT_SUBMIT_DELAY_MS,
  buildAgentPromptPasteBytes
} from '../../shared/agent-prompt-injection'
import {
  createAgentStatusOscProcessor,
  type ProcessedAgentStatusChunk
} from '../../shared/agent-status-osc'
import {
  hasCompatibleAgentTitleIdentity,
  normalizeCompatibleAgentStatusEntryForOwner,
  normalizeCompatibleAgentTitleForOwner
} from '../../shared/agent-title-owner'
import type {
  Automation,
  AutomationCreateInput,
  AutomationRun,
  AutomationUpdateInput,
  AutomationWorkspaceMode
} from '../../shared/automations-types'
import {
  addClaudeTeammateModeAuto,
  addClaudeTeammateModeInProcess,
  type ClaudeAgentTeamsMode
} from '../../shared/claude-agent-teams-tmux-compat'
import { createCommandCodeOutputStatusDetector } from '../../shared/command-code-output-status'
import {
  DEFAULT_REPO_BADGE_COLOR,
  FLOATING_TERMINAL_WORKTREE_ID,
  GLOBAL_ASSISTANT_WORKTREE_ID,
  getDefaultVoiceSettings
} from '../../shared/constants'
import { createDraftPasteReadyScanner } from '../../shared/draft-paste-ready-scanner'
import { mergeExternalWorktreeInboxPaths } from '../../shared/external-worktree-inbox'
import type { TerminalPaneSplitSource } from '../../shared/feature-education-telemetry'
import type { FeatureInteractionId } from '../../shared/feature-interactions'
import type {
  FolderWorkspacePathStatus,
  FolderWorkspacePathStatusRequest
} from '../../shared/folder-workspace-path-status'
import { folderWorkspaceToWorktree } from '../../shared/folder-workspace-worktree'
import { getGitCloneFailureMessage } from '../../shared/git-clone-failure-message'
import { GIT_FETCH_SKIP_AUTO_MAINTENANCE_CONFIG_ARGS } from '../../shared/git-fetch-auto-maintenance'
import { buildOrchestrationTaskDisplayMetadata } from '../../shared/orchestration-task-display'
import { extractOscTitleScanTail } from '../../shared/osc-title-scan-tail'
import { FIRST_PANE_ID } from '../../shared/pane-key'
import type { ProjectExecutionRuntimeResolution } from '../../shared/project-execution-runtime'
import {
  getProjectHostSetupForRepo,
  getProjectHostSetupWorktreeMeta
} from '../../shared/project-host-setup-projection'
import type { RateLimitState } from '../../shared/rate-limit-types'
import { isFolderRepo } from '../../shared/repo-kind'
import type { RuntimeClientEvent } from '../../shared/runtime-client-events'
import { toRuntimeActivateWorktreeEvent } from '../../shared/runtime-client-events'
import {
  HEADLESS_RUNTIME_WINDOW_ID,
  type RuntimeDesktopWindowStatus
} from '../../shared/runtime-types'
import type {
  RuntimeRepoSearchRefs,
  RuntimeTerminalRead,
  RuntimeTerminalRename,
  RuntimeTerminalAgentStatus,
  RuntimeTerminalSend,
  RuntimeTerminalCreate,
  RuntimeTerminalPresentation,
  RuntimeTerminalSplit,
  RuntimeTerminalFocus,
  RuntimeTerminalClose,
  RuntimeTerminalListResult,
  RuntimeTerminalResolvePane,
  RuntimeTerminalState,
  RuntimeStatus,
  RuntimeSyncWindowGraphResult,
  RuntimeTerminalWait,
  RuntimeTerminalWaitBlockedReason,
  RuntimeTerminalWaitCondition,
  RuntimeWorktreePsSummary,
  RuntimeWorktreeStatus,
  RuntimeTerminalShow,
  RuntimeTerminalSummary,
  RuntimeTerminalVisualGroupNode,
  RuntimeTerminalVisualLayout,
  RuntimeTerminalVisualLayoutNode,
  RuntimeTerminalVisualPaneNode,
  RuntimeTerminalVisualTab,
  RuntimeSyncedLeaf,
  RuntimeSyncedTab,
  RuntimeMarkdownReadTabResult,
  RuntimeMarkdownSaveTabResult,
  RuntimeMobileSessionCreateTerminalResult,
  RuntimeMobileSessionClientTab,
  RuntimeMobileSessionMarkdownTab,
  RuntimeMobileSessionTabMove,
  RuntimeMobileSessionTabMoveResult,
  RuntimeMobileSessionTabGroup,
  RuntimeMobileSessionSnapshotTab,
  RuntimeMobileSessionTerminalTab,
  RuntimeMobileSessionBrowserTab,
  RuntimeMobileSessionTabsRemovedResult,
  RuntimeMobileSessionTabsResult,
  RuntimeMobileSessionTabsSnapshot,
  RuntimeBrowserDriverState,
  RuntimeTerminalDriverState,
  RuntimeSyncWindowGraph,
  RuntimeWorktreeListResult,
  RuntimeWorkspaceOpenPathResult,
  BrowserTabInfo
} from '../../shared/runtime-types'
import {
  createSequencedSetupAgentCommands,
  SETUP_AGENT_SEQUENCE_STARTUP_COMMAND_ENV
} from '../../shared/setup-agent-sequencing'
import {
  buildSetupRunnerCommand,
  getSetupRunnerCommandPlatformForPath
} from '../../shared/setup-runner-command'
import { inspectSetupScriptImportCandidates } from '../../shared/setup-script-imports'
import type { VoiceSettings } from '../../shared/speech-types'
import type {
  SpoolPairedRuntimeResolvedWorktree,
  SpoolPairedRuntimeWorktreeSelector
} from '../../shared/spool/spool-paired-runtime-host-contract'
import { parseAppSshPtyId } from '../../shared/ssh-pty-id'
import { isTerminalLeafId, makePaneKey, parsePaneKey } from '../../shared/stable-pane-id'
import type { TerminalGitHubPRLink } from '../../shared/terminal-github-pr-link-detector'
import {
  isTerminalInputTooLargeWithYield,
  TERMINAL_INPUT_TOO_LARGE_ERROR,
  iterateTerminalInputChunks
} from '../../shared/terminal-input'
import { TerminalKittyKeyboardModeTracker } from '../../shared/terminal-kitty-keyboard-mode-tracker'
import {
  createTerminalTitleTracker,
  stripBrailleSpinnerGlyphs,
  type TerminalTitleTracker
} from '../../shared/terminal-output-side-effects'
import type {
  TerminalSideEffectBatch,
  TerminalSideEffectFact
} from '../../shared/terminal-side-effect-facts'
import { resolveTerminalStartupCwd } from '../../shared/terminal-startup-cwd'
import { isValidHostTerminalTabId, isValidTerminalTabId } from '../../shared/terminal-tab-id'
import {
  getTuiAgentLaunchCommand,
  isTuiAgent,
  TUI_AGENT_CONFIG
} from '../../shared/tui-agent-config'
import {
  resolveTuiAgentLaunchArgs,
  resolveTuiAgentLaunchEnv
} from '../../shared/tui-agent-launch-defaults'
import { isTuiAgentEnabled, pickTuiAgent } from '../../shared/tui-agent-selection'
import { buildAgentDraftLaunchPlan, buildAgentStartupPlan } from '../../shared/tui-agent-startup'
import type {
  AutomationWorkspaceProvenance,
  BaseRefSearchResult,
  CreateWorktreeResult,
  DetectedWorktree,
  DetectedWorktreeListResult,
  ForceDeleteWorktreeBranchResult,
  GitHubPrStartPoint,
  GitPushTarget,
  GitWorktreeInfo,
  GitHubOwnerRepo,
  GlobalSettings,
  PersistedUIState,
  Project,
  ProjectUpdateArgs,
  ProjectHostSetup,
  ProjectHostSetupCloneArgs,
  ProjectHostSetupCreateArgs,
  ProjectHostSetupCreateResult,
  ProjectHostSetupDeleteArgs,
  ProjectHostSetupDeleteResult,
  ProjectHostSetupExistingFolderArgs,
  ProjectHostSetupResult,
  ProjectHostSetupUpdateArgs,
  ProjectHostSetupUpdateResult,
  Repo,
  RemoveWorktreeResult,
  StatsSummary,
  Worktree,
  WorktreeLineage,
  WorkspaceLineage,
  WorkspaceKey,
  WorktreeLineageWarning,
  WorktreeMeta,
  WorktreeBaseStatusEvent,
  WorktreeRemoteBranchConflictEvent,
  WorktreeStartupLaunch,
  NestedRepoScanResult,
  ProjectGroup,
  FolderWorkspace,
  ProjectGroupImportMode,
  ProjectGroupImportResult,
  MemorySnapshot,
  Tab,
  TabGroupLayoutNode,
  TerminalLayoutSnapshot,
  TerminalPaneLayoutNode,
  TerminalTab,
  TuiAgent,
  WorkspaceCreateTelemetrySource,
  WorkspaceSessionState,
  DirEntry
} from '../../shared/types'
import type {
  GitHubPullRequestStateUpdate,
  GitHubPRFile,
  GitHubPRReviewCommentInput,
  GitLabMRInlineCommentInput,
  GitLabProjectRef,
  ListWorkItemsResult,
  MRListState
} from '../../shared/types'
import type { ClaudeRateLimitAccountsState, CodexRateLimitAccountsState } from '../../shared/types'
import type {
  WorkspacePortKillRequest,
  WorkspacePortKillResult,
  WorkspacePortProbe,
  WorkspacePortScanResult
} from '../../shared/workspace-ports'
import {
  folderWorkspaceKey,
  isWorkspaceKey,
  parseWorkspaceKey,
  worktreeWorkspaceKey
} from '../../shared/workspace-scope'
import { closeTerminalTabInWorkspaceSession } from '../../shared/workspace-session-terminal-tab-close'
import { DEFAULT_WORKSPACE_STATUS_ID } from '../../shared/workspace-statuses'
import { resolveWorktreeAddBaseRef } from '../../shared/worktree-base-ref'
import {
  buildKnownYiruWorkspaceLayouts,
  isLegacyRepoForExternalWorktreeVisibility,
  toDetectedWorktree
} from '../../shared/worktree-ownership'
import { assertWorktreeUnlockedForRemoval } from '../../shared/worktree-removal'
import { applyAgentStatusHooksEnabled } from '../agent-hooks/managed-agent-hook-controls'
import {
  markCodexProjectTrusted,
  markCopilotFolderTrusted,
  markCursorWorkspaceTrusted
} from '../agent-trust-presets'
import {
  configureAiVaultSessionSources,
  listAiVaultSessions
} from '../ai-vault/cached-session-list'
import type { AiVaultSessionRuntimeTarget } from '../ai-vault/session-root-configuration'
import type { AutomationService } from '../automations/service'
import type { AgentBrowserBridge } from '../browser/agent-browser-bridge'
import type { BrowserBackend } from '../browser/browser-backend'
import type { ClaudeAccountService } from '../claude-accounts/service'
import type { CodexAccountService } from '../codex-accounts/service'
import { HeadlessEmulator } from '../daemon/headless-emulator'
import { parseFileUriPathParts } from '../daemon/osc7-file-uri'
import { extractLastOsc7Uri, extractOscScanTail } from '../daemon/osc7-uri-extraction'
import type { EmulatorBridge } from '../emulator/emulator-bridge'
import { hasCommitObjectViaGitExec } from '../git/commit-object-ref'
import { getSshGitCapabilityCache } from '../git/git-capability-state'
import { resolveLocalGitUsername } from '../git/git-username'
import {
  getBaseRefDefault,
  getDefaultRemote,
  getBranchConflictKind,
  getGitRepoRoot,
  isGitRepo,
  getRepoName,
  searchBaseRefDetails,
  getRemoteCount,
  normalizeRefSearchQuery,
  parseAndFilterSearchRefDetails,
  parseRemoteCount,
  resolveDefaultBaseRefViaExec,
  resolveDefaultBaseRefWithLocalGit,
  buildSearchBaseRefsArgv,
  isForEachRefExcludeUnsupportedError,
  mergeBaseRefSearchResultGroups,
  getRemoteDrift,
  getRecentDriftSubjects
} from '../git/repo'
import {
  cleanupClaimedCloneTarget,
  claimCloneTarget,
  deriveValidatedClonePath,
  getClonePathComparisonKey
} from '../git/repo-clone-path'
import { gitExecFileAsync, gitSpawn, nonInteractiveGitEnv } from '../git/runner'
import { runWithGitReadCacheInvalidation } from '../git/status'
import {
  listWorktrees,
  listWorktreesStrict,
  addWorktree,
  addSparseWorktree,
  assertWorktreeCleanForRemoval,
  forceDeleteLocalBranch,
  removeWorktree
} from '../git/worktree'
import type { AddWorktreeOptions, AddWorktreeResult } from '../git/worktree'
import { hasWorktreeBaseCommitRef } from '../git/worktree-base-ref-probe'
import {
  getPRForBranch,
  getRepoSlug,
  getRepoUpstream,
  getWorkItem,
  listWorkItems,
  getPRChecks,
  getPRCheckDetails,
  rerunPRChecks,
  getPRComments,
  resolveReviewThread,
  setPRFileViewed,
  getWorkItemByOwnerRepo,
  updatePRTitle,
  updatePRDetails,
  mergePR,
  setPRAutoMerge,
  updatePRState,
  requestPRReviewers,
  removePRReviewers,
  addPullRequestComment,
  addPRReviewComment,
  addPRReviewCommentReply,
  listPullRequestLabels,
  listPullRequestAssignableUsers,
  type MainWorkItem
} from '../github/client'
import type { GitHubPRBranchLookupOptions } from '../github/client'
import { fetchPrHeadTrackingRef } from '../github/pr-head-tracking-ref'
import { resolveGitHubPrStartPoint } from '../github/pr-start-point'
import { getRateLimit } from '../github/rate-limit'
import { getWorkItemDetails, getPRFileContents } from '../github/work-item-details'
import {
  closeMR as closeGitLabMR,
  diagnoseAuth as diagnoseGitLabAuthClient,
  getJobTrace as getGitLabJobTrace,
  getProjectRefForRemote as getGitLabProjectRefForRemote,
  getRateLimit as getGitLabRateLimit,
  getWorkItemByProjectRef as getGitLabWorkItemByProjectRef,
  addMRInlineComment as addGitLabMRInlineComment,
  addMRComment as addGitLabMRComment,
  listLabels as listGitLabLabels,
  listMergeRequests as listGitLabMergeRequests,
  mergeMR as mergeGitLabMR,
  reopenMR as reopenGitLabMR,
  resolveMRDiscussion as resolveGitLabMRDiscussion,
  retryJob as retryGitLabJob,
  updateMR as updateGitLabMR,
  updateMRReviewers as updateGitLabMRReviewers
} from '../gitlab/client'
import {
  normalizeGitLabMRListState,
  normalizeGitLabPositiveInteger
} from '../gitlab/gitlab-preload-args'
import { getGlabKnownHosts } from '../gitlab/gl-utils'
import { getWorkItemDetails as getGitLabWorkItemDetails } from '../gitlab/work-item-details'
import {
  createSetupRunnerScript,
  getDefaultTabCommandTrustContent,
  getDefaultTabsLaunch,
  getEffectiveHooks,
  getEffectiveSetupRunPolicy,
  hasUnrecognizedYiruYamlKeys,
  hasHooksFile,
  loadHooks,
  parseYiruYaml,
  runHook,
  shouldRunSetupForCreate
} from '../hooks'
import { isENOENT } from '../ipc/filesystem-auth'
import { invalidateAuthorizedRootsCache } from '../ipc/filesystem-auth'
import {
  closeLocalWatcherForWorktreePath,
  closeRemoteWatcherForWorktreePath,
  forgetLocalWatcherRemovalSnapshot,
  forgetRemoteWatcherRemovalSnapshot,
  restoreLocalWatcherAfterFailedRemoval,
  restoreRemoteWatcherAfterFailedRemoval
} from '../ipc/filesystem-watcher'
import { detectInstalledAgentsWithShellPathHydration, detectRemoteAgents } from '../ipc/preflight'
import { normalizeSparseDirectories } from '../ipc/sparse-checkout-directories'
import { acquireWatcherRemovalGate } from '../ipc/watcher-removal-gate'
import {
  computeBranchName,
  computeWorktreePath,
  computeWorkspaceRoot,
  ensurePathWithinWorkspace,
  formatWorktreeRemovalError,
  getWorktreeCreationLayout,
  getWorktreePathSettings,
  isOrphanCompatiblePreflightError,
  isOrphanedWorktreeError,
  mergeWorktree,
  sanitizeWorktreeName,
  shouldSetDisplayName,
  areWorktreePathsEqual
} from '../ipc/worktree-logic'
import { worktreePathComparisonKey } from '../ipc/worktree-path-comparison'
import {
  cleanupUnusedWorktreePushTargetRemote,
  cleanupUnusedWorktreePushTargetRemoteSsh,
  createRemoteWorktree,
  configureCreatedWorktreePushTarget,
  prepareWorktreePushTarget
} from '../ipc/worktree-remote'
import {
  createWorktreeLinkedPaths,
  findExistingWorktreeSymlinkPaths,
  removeWorktreeLinkedPaths
} from '../ipc/worktree-symlinks'
import { LanguageServerManager } from '../language-server-manager'
import { resolveLocalProjectRuntimeForWorktreeId } from '../local-project-runtime-resolution'
import {
  getLocalWorktreePathAccess,
  removeLocalWorktreePath,
  toLocalWorktreeRuntimePath
} from '../local-worktree-filesystem'
import {
  removeStaleLocalWorktreeRegistrationAfterFilesystemRemoval,
  recoverLocalWindowsWorktreeRemoval
} from '../local-worktree-removal-recovery'
import { collectMemorySnapshot } from '../memory/collector'
import type { Store } from '../persistence'
import { advertisedUrlWatcher } from '../ports/advertised-url-watcher'
import {
  filterWorkspacePortProbes,
  killWorkspacePort,
  scanWorkspacePortProbes
} from '../ports/workspace-port-ownership'
import {
  assertFolderWorkspacePathUsable,
  getFolderWorkspacePathStatus,
  getFolderWorkspacePathStatusForPath,
  inferFolderWorkspacePathConnection
} from '../project-groups/folder-workspace-path-status'
import { scanNestedRepos } from '../project-groups/nested-repo-discovery'
import {
  createNestedProjectGroupResolver,
  resolveNestedRepoSelection
} from '../project-groups/nested-repo-import'
import { createNestedRepoImportTargetResolver } from '../project-groups/nested-repo-import-target'
import {
  getLocalProjectGitExecOptions,
  getLocalProjectWorktreeGitOptions,
  getLocalProjectWorktreeGitOptionsForRuntime,
  resolveLocalProjectRuntimeForRepo,
  resolveLocalProjectRuntimesForRepos
} from '../project-runtime-git-options'
import { getSshFilesystemProvider } from '../providers/ssh-filesystem-dispatch'
import { getSshGitProvider, requireSshGitProvider } from '../providers/ssh-git-dispatch'
import type { PtyProviderBufferSnapshot } from '../providers/types'
import type { IPtyProvider, PtyProcessInfo, PtyTransientFact } from '../providers/types'
import type { RateLimitService } from '../rate-limits/service'
import { markRemoteAgentWorkspaceTrusted } from '../remote-agent-trust-presets'
import { enrichMissingRepoGitRemoteIdentities } from '../repo-git-remote-identity-enrichment'
import { detectRepoIconAndUpstream } from '../repo-icon-autodetect'
import { listRepoWorktrees } from '../repo-worktrees'
import type { ForgeProviderId } from '../source-control/forge-provider'
import { getHostedReviewForBranch as getHostedReviewForBranchFromRepo } from '../source-control/hosted-review'
import {
  createHostedReview as createHostedReviewFromRepo,
  getHostedReviewCreationEligibility as getHostedReviewCreationEligibilityFromRepo
} from '../source-control/hosted-review-creation'
import { getCatalogModel, isLocalSpeechModel, SPEECH_MODEL_CATALOG } from '../speech/model-catalog'
import {
  deleteLocalSpeechModel,
  getSpeechModelDeletionErrorCode
} from '../speech/speech-model-deletion'
import { getSpeechModelManager, getSpeechSttService } from '../speech/speech-runtime-service'
import { AgentDetector } from '../stats/agent-detector'
import type { StatsCollector } from '../stats/collector'
import { deleteWorktreeHistoryDir } from '../terminal-history'
import type { CommitMessageAgentEnvironmentResolvers } from '../text-generation/commit-message-agent-environment'
import {
  findWorkspaceOpenWorktree,
  resolveWorkspaceOpenDirectoryPath,
  WorkspacePathOpenError
} from '../workspace-path-opening'
import { resolveWorktreeCreateBase } from '../worktree-create-base'
import { prefetchWorktreeCreateBase } from '../worktree-create-base-prefetch'
import {
  getBranchNameOverrideCandidate,
  getWorktreeCreateCandidate,
  WORKTREE_CREATE_MAX_SUFFIX_ATTEMPTS
} from '../worktree-create-candidates'
import {
  assertWorktreeDoesNotContainRegisteredWorktree,
  canCleanupUnregisteredYiruLeftoverDirectory,
  canCleanupUnregisteredYiruWorktreeDirectory,
  canSafelyRemoveOrphanedWorktreeDirectory,
  findRegisteredDeletableWorktree,
  isDangerousWorktreeRemovalPath,
  isWorktreePathMissing,
  ORPHANED_WORKTREE_DIRECTORY_MESSAGE,
  stripYiruProvenanceMetaUpdates,
  UNREGISTERED_MISSING_WORKTREE_MESSAGE
} from '../worktree-removal-safety'
import { prepareLocalWorktreeRootForRepo } from '../worktree-root-preparation'
import { ClaudeAgentTeamsService } from './claude-agent-teams-service'
import type {
  AgentTeamsTmuxCompatRequest,
  AgentTeamsTmuxCompatResponse
} from './claude-agent-teams-service'
import {
  buildClaudeAgentTeamsLaunchPlan,
  ensureClaudeAgentTeamsShimDir,
  resolveClaudeAgentTeamsShimBin
} from './claude-agent-teams-shim-env'
import {
  buildHeadlessTabGroupMove,
  buildHeadlessTabGroupSplit
} from './headless-tab-group-split-layout'
import { buildHeadlessTerminalSplitLayout } from './headless-terminal-split-layout'
import { MobileNotificationChannel } from './mobile-notification-channel'
import {
  createMobileSessionTabsNotifyCoalescer,
  type MobileSessionTabsNotifyCoalescer
} from './mobile-session-tabs-notify-coalescer'
import { resolveTerminalOrchestrationCliCommand } from './orchestration/cli-command'
import { OrchestrationDb } from './orchestration/db'
import { formatMessagesForInjection } from './orchestration/formatter'
import { joinWorktreeRelativePath } from './runtime-relative-paths'
import { MOBILE_SUBSCRIBE_SCROLLBACK_ROWS } from './scrollback-limits'
import {
  isNativeWindowsConptyPty,
  registerConptyDa1OverrideInstaller,
  resolveTerminalQueryReplyOwner,
  type TerminalQueryReplyOwner
} from './terminal-model-query-authority'
import { TerminalSessionAuthority } from './terminal-session-authority/terminal-session-authority'
import type {
  TerminalLayoutResult,
  TerminalLayoutState,
  TerminalLayoutTarget
} from './terminal-session-authority/terminal-session-layout-types'
import {
  getTerminalViewAttributes,
  registerTerminalViewAttributesApplier
} from './terminal-view-attribute-store'
import { killAllProcessesForWorktree } from './worktree-teardown'
import { RuntimeBrowserCommands } from './yiru-runtime-browser'
import { RuntimeEmulatorCommands, setEmulatorBridge } from './yiru-runtime-emulator'
import { RuntimeFileCommands } from './yiru-runtime-files'
import { RuntimeGitCommands } from './yiru-runtime-git'

function sanitizeNestedRepoRuntimeImportError(context: string, error: unknown): string {
  console.warn(`[project-groups] ${context}`, error)
  return 'Repository could not be imported'
}

type RuntimeAccountServices = {
  claudeAccounts: ClaudeAccountService
  codexAccounts: CodexAccountService
  rateLimits: RateLimitService
}

export type RemoteFetchResult = { ok: true } | { ok: false; errorKind: 'git_error' }

export type RemoteTrackingBase = {
  remote: string
  branch: string
  ref: string
  base: string
}

export type AccountsSnapshot = {
  claude: ClaudeRateLimitAccountsState
  codex: CodexRateLimitAccountsState
  rateLimits: RateLimitState
}

type RuntimeStore = {
  getRepos: Store['getRepos']
  getRepo: Store['getRepo']
  addRepo: Store['addRepo']
  updateRepo: Store['updateRepo']
  getProjects?: Store['getProjects']
  updateProject?: Store['updateProject']
  getProjectHostSetups?: Store['getProjectHostSetups']
  createProjectHostSetup?: Store['createProjectHostSetup']
  updateProjectHostSetup?: Store['updateProjectHostSetup']
  deleteProjectHostSetup?: Store['deleteProjectHostSetup']
  getProjectGroups?: Store['getProjectGroups']
  createProjectGroup?: Store['createProjectGroup']
  updateProjectGroup?: Store['updateProjectGroup']
  deleteProjectGroup?: Store['deleteProjectGroup']
  moveProjectToGroup?: Store['moveProjectToGroup']
  getFolderWorkspaces?: Store['getFolderWorkspaces']
  createFolderWorkspace?: Store['createFolderWorkspace']
  updateFolderWorkspace?: Store['updateFolderWorkspace']
  removeFolderWorkspace?: Store['removeFolderWorkspace']
  removeProject?: Store['removeProject']
  reorderRepos?: Store['reorderRepos']
  getAllWorktreeMeta: Store['getAllWorktreeMeta']
  getWorktreeMeta: Store['getWorktreeMeta']
  setWorktreeMeta: Store['setWorktreeMeta']
  removeWorktreeMeta: Store['removeWorktreeMeta']
  getWorktreeLineage?: Store['getWorktreeLineage']
  getAllWorktreeLineage?: Store['getAllWorktreeLineage']
  setWorktreeLineage?: Store['setWorktreeLineage']
  removeWorktreeLineage?: Store['removeWorktreeLineage']
  getAllWorkspaceLineage?: Store['getAllWorkspaceLineage']
  setWorkspaceLineage?: Store['setWorkspaceLineage']
  removeWorkspaceLineage?: Store['removeWorkspaceLineage']
  getGitHubCache: Store['getGitHubCache']
  getWorkspaceSession?: Store['getWorkspaceSession']
  setWorkspaceSession?: Store['setWorkspaceSession']
  flushOrThrow?: Store['flushOrThrow']
  persistPtyBinding?: Store['persistPtyBinding']
  getUI?: Store['getUI']
  updateUI?: Store['updateUI']
  recordFeatureInteraction?: Store['recordFeatureInteraction']
  listAutomations?: Store['listAutomations']
  listAutomationRuns?: Store['listAutomationRuns']
  createAutomation?: Store['createAutomation']
  updateAutomation?: Store['updateAutomation']
  deleteAutomation?: Store['deleteAutomation']
  getSparsePresets?: Store['getSparsePresets']
  saveSparsePreset?: Store['saveSparsePreset']
  getSettings(): {
    workspaceDir: string
    nestWorkspaces: boolean
    refreshLocalBaseRefOnWorktreeCreate: boolean
    localBaseRefSuggestionDismissed?: boolean
    branchPrefix: string
    branchPrefixCustom: string
    defaultTuiAgent?: GlobalSettings['defaultTuiAgent']
    disabledTuiAgents?: GlobalSettings['disabledTuiAgents']
    agentCmdOverrides?: GlobalSettings['agentCmdOverrides']
    agentDefaultArgs?: GlobalSettings['agentDefaultArgs']
    agentDefaultEnv?: GlobalSettings['agentDefaultEnv']
    terminalWindowsShell?: GlobalSettings['terminalWindowsShell']
    floatingTerminalEnabled?: GlobalSettings['floatingTerminalEnabled']
    agentStatusHooksEnabled?: GlobalSettings['agentStatusHooksEnabled']
    minimaxGroupId?: GlobalSettings['minimaxGroupId']
    minimaxUsageModels?: GlobalSettings['minimaxUsageModels']
    prBotAuthorOverrides?: GlobalSettings['prBotAuthorOverrides']
    terminalQuickCommands?: GlobalSettings['terminalQuickCommands']
    mobileAutoRestoreFitMs?: number | null
    mobileEmulatorEnabled?: boolean
    mobileEmulatorDefaultDeviceUdid?: string | null
    voice?: VoiceSettings
    claudeAgentTeamsMode?: GlobalSettings['claudeAgentTeamsMode']
    languageServer?: GlobalSettings['languageServer']
    // Why: Phase-5 query responder kill switches — read per chunk in
    // onPtyData to capture reply ownership at ingestion.
    terminalMainSideEffectAuthority?: GlobalSettings['terminalMainSideEffectAuthority']
    terminalHiddenDeliveryGate?: GlobalSettings['terminalHiddenDeliveryGate']
    terminalModelQueryAuthority?: GlobalSettings['terminalModelQueryAuthority']
  }
  // The runtime never reads the return value; it reads persisted settings on
  // the next access.
  updateSettings?: (
    updates: Partial<GlobalSettings>,
    options?: { notifyListeners?: boolean; originWebContentsId?: number }
  ) => GlobalSettings
}

export type RuntimeAutomationCreateInput = Omit<
  AutomationCreateInput,
  'projectId' | 'workspaceId' | 'workspaceMode' | 'timezone'
> & {
  repo?: string
  workspace?: string
  workspaceMode?: AutomationWorkspaceMode
  timezone?: string
}

export type RuntimeAutomationUpdateInput = Omit<
  AutomationUpdateInput,
  'projectId' | 'workspaceId'
> & {
  repo?: string
  workspace?: string
}

function normalizeSparsePresetName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) {
    throw new Error('Preset name is required.')
  }
  if (trimmed.length > 80) {
    throw new Error('Preset name is too long.')
  }
  return trimmed
}

function normalizeSparsePresetDirectoriesForSave(directories: string[]): string[] {
  let normalized: string[]
  try {
    normalized = normalizeSparseDirectories(directories)
  } catch (err) {
    if (
      err instanceof Error &&
      err.message === 'Sparse checkout directories must be repo-relative paths.'
    ) {
      throw new Error('Preset directories must be repo-relative paths.')
    }
    throw err
  }
  if (normalized.length === 0) {
    throw new Error('Preset must have at least one directory.')
  }
  return normalized
}

function hasRuntimeAutomationUpdateValue<K extends keyof RuntimeAutomationUpdateInput>(
  updates: RuntimeAutomationUpdateInput,
  key: K
): boolean {
  return Object.hasOwn(updates, key) && updates[key] !== undefined
}

type RuntimeLeafRecord = RuntimeSyncedLeaf & {
  ptyGeneration: number
  connected: boolean
  writable: boolean
  lastOutputAt: number | null
  lastExitCode: number | null
  tailBuffer: string[]
  tailPartialLine: string
  tailPendingAnsi: string
  tailRedrawCursor: RetainedTailRedrawCursor | null
  tailTruncated: boolean
  tailLinesTotal: number
  preview: string
  waitBlockedAt: number | null
  // Why: memoized wait scan of the current retained tail so the next PTY chunk
  // reuses it as its "previous" state instead of rebuilding + rescanning the
  // full tail. See computeTerminalTailWaitState.
  tailWaitState?: TerminalTailWaitState
  lastAgentStatus: AgentStatus | null
  // Why: the most recent OSC title observed on this leaf's PTY data. Used by
  // worktree.ps so daemon-hosted terminals (no renderer pushing pane titles)
  // still recompute working/idle from the live title each call instead of
  // serving a stale `lastAgentStatus` after the agent process exits and the
  // shell takes over the title — the bug behind issue #1437.
  lastOscTitle: string | null
  lastOscTitleAt: number | null
  paneTitleUpdatedAt: number | null
}

function isCursorAgentOrchestrationTarget(
  leaf: RuntimeLeafRecord,
  tabTitle: string | null | undefined
): boolean {
  return [leaf.lastOscTitle, leaf.paneTitle, tabTitle].some(isCursorAgentTitle)
}

type RuntimePtyWorktreeRecord = {
  ptyId: string
  worktreeId: string
  /** Trusted spawn-time identity; null means the PTY must not cross a Spool boundary. */
  worktreeInstanceId: string | null
  connectionId: string | null
  // Why: a Windows host can own both native and WSL panes; preamble command
  // selection must follow the pane that executes it, not process.platform.
  isWsl: boolean | null
  // Why: background CLI PTYs can outlive a failed renderer reveal. Preserve the
  // spawn-time tab/pane identity so later reveals can adopt under the env key.
  tabId: string | null
  paneKey: string | null
  launchConfig: SleepingAgentLaunchConfig | null
  launchToken: string | null
  launchAgent: TuiAgent | null
  foregroundAgent: TuiAgent | null
  connected: boolean
  disconnectedAt: number | null
  lastExitCode: number | null
  lastAgentStatus: AgentStatus | null
  lastOscTitle: string | null
  lastOscTitleAt: number | null
  managementTitle: string | null
  managementTitleAt: number | null
  title: string | null
  titleUpdatedAt: number | null
  lastOutputAt: number | null
  tailBuffer: string[]
  tailPartialLine: string
  tailPendingAnsi: string
  tailRedrawCursor: RetainedTailRedrawCursor | null
  tailTruncated: boolean
  tailLinesTotal: number
  preview: string
  waitBlockedAt: number | null
  // Why: memoized wait scan of the current retained tail (see RuntimeLeafRecord).
  tailWaitState?: TerminalTailWaitState
}

type TerminalCreateOptions = {
  command?: string
  claudeAgentTeamsSourceCommand?: string
  cwd?: string
  env?: Record<string, string>
  envToDelete?: string[]
  launchConfig?: WorktreeStartupLaunch['launchConfig']
  launchToken?: string
  launchAgent?: TuiAgent
  viewMode?: 'terminal' | 'chat'
  startupCommandDelivery?: WorktreeStartupLaunch['startupCommandDelivery']
  telemetry?: WorktreeStartupLaunch['telemetry']
  title?: string
  focus?: boolean
  rendererBacked?: boolean
  activate?: boolean
  presentation?: RuntimeTerminalPresentation
  tabId?: string
  leafId?: string
  sessionId?: string
  persistHostSessionBinding?: boolean
  // Why: the headless mobile-session create publishes its own authoritative
  // snapshot (with the correct target group) right after spawn. Skip the
  // intermediate pty-backed publish so the new tab doesn't briefly flash in
  // the wrong (active) group before the corrected snapshot lands.
  deferMobileSessionPublish?: boolean
  /** Why: Spool grants can be revoked during async launch preparation. */
  beforeSpawn?: () => void | Promise<void>
  /** Why: agent trust persistence is also a launch side effect, before PTY spawn. */
  beforeAgentTrust?: () => void | Promise<void>
}

type PtyForegroundAgentRefresh = {
  promise: Promise<boolean>
  startedAfterTitleObservation: number
  requestedAfterTitleObservation: number
}

function copySleepingAgentLaunchConfig(
  config: SleepingAgentLaunchConfig
): SleepingAgentLaunchConfig {
  return {
    ...(config.agentCommand ? { agentCommand: config.agentCommand } : {}),
    agentArgs: config.agentArgs,
    agentEnv: { ...config.agentEnv },
    ...(config.ompResumeFilePath ? { ompResumeFilePath: config.ompResumeFilePath } : {})
  }
}

function mergeTerminalEnvDeletions(
  ...lists: readonly (readonly string[] | undefined)[]
): string[] | undefined {
  const merged = [...new Set(lists.flatMap((list) => list ?? []))]
  return merged.length > 0 ? merged : undefined
}

function normalizeAgentLaunchCommandForMatch(command: string): string {
  return command.trim().replace(/\s+/g, ' ')
}

function resolveBareAgentLaunchCommand(args: {
  command: string | undefined
  settings: {
    agentCmdOverrides?: Partial<Record<TuiAgent, string>> | null
    disabledTuiAgents?: Iterable<unknown> | null
  }
  platform: NodeJS.Platform
  isRemote: boolean
}): TuiAgent | null {
  const command = args.command ? normalizeAgentLaunchCommandForMatch(args.command) : ''
  if (!command) {
    return null
  }

  const cmdOverrides = args.settings.agentCmdOverrides ?? {}
  for (const agent of Object.keys(TUI_AGENT_CONFIG) as TuiAgent[]) {
    if (!isTuiAgentEnabled(agent, args.settings.disabledTuiAgents)) {
      continue
    }
    const override = cmdOverrides[agent]?.trim()
    const defaultLaunchCommand = getTuiAgentLaunchCommand(TUI_AGENT_CONFIG[agent], args.platform, {
      isRemote: args.isRemote
    })
    const launchCommands = override ? [defaultLaunchCommand, override] : [defaultLaunchCommand]
    if (
      launchCommands.some((candidate) => command === normalizeAgentLaunchCommandForMatch(candidate))
    ) {
      return agent
    }
  }

  return null
}

function inferCapturedClaudeAgentTeamsMode(
  launchConfig: SleepingAgentLaunchConfig | undefined,
  command: string | undefined,
  currentMode: ClaudeAgentTeamsMode | undefined
): ClaudeAgentTeamsMode | undefined {
  const capturedCommand = launchConfig?.agentCommand?.trim() || command?.trim() || ''
  const capturedArgs = launchConfig?.agentArgs?.trim() ?? ''
  const capturedLaunch = `${capturedCommand} ${capturedArgs}`.trim()
  if (/(^|\s)--teammate-mode(?:=|\s+)auto(?:\s|$)/.test(capturedLaunch)) {
    return 'native-panes-shim'
  }
  if (/(^|\s)--teammate-mode(?:=|\s+)in-process(?:\s|$)/.test(capturedLaunch)) {
    return 'in-process'
  }
  if (launchConfig && /(^|\s)--resume(?:\s|=|$)/.test(command?.trim() ?? '')) {
    return 'off'
  }
  return currentMode
}

export type RuntimeTerminalAgentStatusEvent = {
  ptyId: string
  source: 'mounted-leaf' | 'pty-record'
  paneKey: string
  tabId?: string
  worktreeId?: string
  connectionId?: string | null
  payload: ParsedAgentStatusPayload
}

type RuntimePtyTitleTrackerEntry = {
  tracker: TerminalTitleTracker
  // Why: onPtyData batches the mobile session-tab touch to once per chunk;
  // the stale-working-title timer fires between chunks and must touch
  // immediately. These flags route the tracker callback to the right mode.
  applyingChunk: boolean
  // Why: synthetic spinner ticks arrive ~12.5x/sec per working pane; the
  // synthetic path gates mobile snapshot fan-out on a non-decorative title
  // change (spinner glyph + status comparison key kept below).
  applyingSyntheticFrame: boolean
  lastMobileTitleGateKey: string | null
  chunkTouchedSessionTabs: boolean
  // Why: facts observed while applying a chunk are batched into one
  // pty:sideEffect emission per chunk, preserving byte order (titles in
  // sequence, then bell). Timer-fired facts emit immediately between chunks.
  pendingFacts: TerminalSideEffectFact[]
  // Why: Command Code lacks hooks, so its working/done state is scraped from
  // TUI output. Null when no side-effect consumer exists (headless serve) —
  // the scrape produces facts only.
  commandCodeDetector: { observe: (data: string) => boolean } | null
}

// Why: the full OSC 9999 payload flows through emitTerminalAgentStatusEvents and
// is then forwarded to the renderer and dropped. Mobile is served by the main
// process and has no renderer store, so we retain the latest payload per pane
// here to feed worktree.ps's inline agent rows (1:1 with the desktop sidebar).
type RuntimeAgentRowSnapshot = {
  paneKey: string
  ptyId: string
  worktreeId?: string
  tabId?: string
  payload: ParsedAgentStatusPayload
  // When the current payload.state was first observed for this pane (ms).
  stateStartedAt: number
  updatedAt: number
}

type RuntimeHeadlessTerminal = {
  emulator: HeadlessEmulator
  // Why: serialize can race with newer writes appended to writeChain; return
  // the seq actually painted into this emulator, not the latest PTY seq.
  outputSequence: number
  writeChain: Promise<void>
}

type HeadlessSeedMetadata = {
  cwd?: string | null
  oscLinks?: TerminalOscLinkRange[]
  /** Cold restore history must outrank a model that only saw new-generation bytes. */
  preferProviderIfExisting?: boolean
  /** Persisted kitty flags from the daemon snapshot, re-applied to the fresh
   *  emulator so hidden `CSI ? u` answers the real flags instead of ?0u
   *  (terminal-query-authority.md §kitty). */
  kittyKeyboardFlags?: number
}

type RuntimePtyController = {
  spawn?(opts: {
    cols: number
    rows: number
    cwd?: string
    command?: string
    launchAgent?: TuiAgent
    commandDelivery?: 'renderer' | 'provider'
    startupCommandDelivery?: WorktreeStartupLaunch['startupCommandDelivery']
    env?: Record<string, string>
    envToDelete?: string[]
    telemetry?: WorktreeStartupLaunch['telemetry']
    connectionId?: string | null
    worktreeId?: string
    preAllocatedHandle?: string
    tabId?: string
    leafId?: string
    sessionId?: string
    persistHostSessionBinding?: boolean
  }): Promise<{ id: string }>
  write(ptyId: string, data: string): boolean
  kill(ptyId: string): boolean
  stopAndWait?(ptyId: string, opts?: { keepHistory?: boolean }): Promise<boolean>
  getCwd?(ptyId: string): Promise<string | null>
  getForegroundProcess(ptyId: string): Promise<string | null>
  confirmForegroundProcess?(ptyId: string): Promise<string | null>
  hasChildProcesses?(ptyId: string): Promise<boolean>
  clearBuffer?(ptyId: string): Promise<void>
  resize?(ptyId: string, cols: number, rows: number): boolean
  // Why: exact-id Mobile polls should not enumerate every local and SSH PTY.
  hasPty?(ptyId: string): boolean | null
  listProcesses?(): Promise<PtyProcessInfo[]>
  serializeBuffer?(
    ptyId: string,
    opts?: { scrollbackRows?: number; altScreenForcesZeroRows?: boolean }
  ): Promise<{ data: string; cols: number; rows: number; seq?: number; lastTitle?: string } | null>
  /** Authoritative provider-owned snapshot for restored PTYs with no mounted renderer. */
  serializeProviderBuffer?(
    ptyId: string,
    opts?: { scrollbackRows?: number }
  ): Promise<PtyProviderBufferSnapshot | null>
  // Why: synchronous probe used by maybeHydrateHeadlessFromRenderer to skip
  // hydration when no renderer is authoritative for this PTY. See
  // docs/mobile-prefer-renderer-scrollback.md.
  hasRendererSerializer?(ptyId: string): boolean
  getRendererSerializerGeneration?(ptyId: string): number
  waitForRendererSerializer?(
    ptyId: string,
    afterGeneration: number,
    timeoutMs?: number,
    signal?: AbortSignal
  ): Promise<boolean>
  getSize?(ptyId: string): { cols: number; rows: number } | null
}

type WorktreeStartupDraftPaste = {
  agent: TuiAgent
  content: string
}

type WorktreeStartupFollowup = {
  expectedProcess: string
  prompt: string
}

function getAgentLaunchPlatformForRepo(
  repo: Pick<Repo, 'connectionId' | 'path'>,
  projectRuntime?: ProjectExecutionRuntimeResolution
): NodeJS.Platform {
  if (!repo.connectionId) {
    if (projectRuntime?.status === 'repair-required') {
      return projectRuntime.repair.preferredRuntime.kind === 'wsl' ? 'linux' : process.platform
    }
    if (projectRuntime?.status === 'resolved' && projectRuntime.runtime.kind === 'wsl') {
      return 'linux'
    }
    return process.platform
  }
  return isWindowsAbsolutePathLike(repo.path) ? 'win32' : 'linux'
}

// Why: long enough for a phone to reconnect and retry a create whose response
// was lost, short enough that an intentional later re-resume forks fresh.
const MOBILE_TERMINAL_CREATE_RESULT_TTL_MS = 60_000
const FOREGROUND_AGENT_WRAPPER_RETRY_INTERVAL_MS = 150
const FOREGROUND_AGENT_WRAPPER_RETRY_TIMEOUT_MS = 6_500
const BRACKETED_PASTE_BEGIN = '\x1b[200~'
const BRACKETED_PASTE_END = '\x1b[201~'
const BRACKETED_PASTE_QUIET_MS = 1500
const DRAFT_PASTE_READY_TIMEOUT_MS = 8000
const MOBILE_TERMINAL_SURFACE_TIMEOUT_MS = 10_000
const MOBILE_TERMINAL_READY_FALLBACK_MS = 1000
const RECENT_PTY_OUTPUT_LIMIT = 64 * 1024
const RECENT_PTY_PATH_CANDIDATE_LIMIT = 1024
const RECENT_PTY_PATH_CANDIDATE_MAX_BYTES = 4 * 1024
const RECENT_PTY_PATH_CANDIDATE_TOTAL_BYTES = 64 * 1024

function isClientDisconnectedError(error: unknown): boolean {
  return error instanceof Error && error.message === 'client_disconnected'
}

function createTerminalRevealWarning(handle: string, error?: unknown): string {
  const reason =
    error instanceof Error && error.message.trim().length > 0
      ? ` Reason: ${error.message.trim()}.`
      : ''
  return [
    `Terminal ${handle} is running, but Yiru could not make it discoverable.${reason}`,
    `Run \`yiru terminal focus --terminal ${handle}\` to reveal and focus it.`
  ].join(' ')
}

function resolveTerminalPresentation(opts: {
  presentation?: RuntimeTerminalPresentation
  focus?: boolean
  activate?: boolean
}): RuntimeTerminalPresentation | undefined {
  if (opts.presentation) {
    return opts.presentation
  }
  if (opts.focus === true || opts.activate === true) {
    return 'focused'
  }
  return undefined
}

type RuntimeNotifier = {
  worktreesChanged(repoId: string, renamed?: { oldWorktreeId: string; newWorktreeId: string }): void
  worktreeBaseStatus?(event: WorktreeBaseStatusEvent): void
  worktreeRemoteBranchConflict?(event: WorktreeRemoteBranchConflictEvent): void
  reposChanged(): void
  activateWorktree(
    repoId: string,
    worktreeId: string,
    setup?: CreateWorktreeResult['setup'],
    startup?: WorktreeStartupLaunch,
    defaultTabs?: CreateWorktreeResult['defaultTabs']
  ): void
  createTerminal(
    worktreeId: string,
    opts: {
      command?: string
      cwd?: string
      env?: Record<string, string>
      title?: string
      presentation?: RuntimeTerminalPresentation
    }
  ): void
  revealTerminalSession?(
    worktreeId: string,
    opts: {
      ptyId: string
      title?: string | null
      cwd?: string
      launchConfig?: SleepingAgentLaunchConfig
      launchToken?: string
      launchAgent?: TuiAgent
      viewMode?: 'terminal' | 'chat'
      isGlobalAssistant?: boolean
      activate?: boolean
      presentation?: RuntimeTerminalPresentation
      tabId?: string
      leafId?: string
      splitFromLeafId?: string
      splitDirection?: 'horizontal' | 'vertical'
      splitTelemetrySource?: TerminalPaneSplitSource
    }
  ):
    | Promise<{ tabId: string; title?: string | null }>
    | { tabId: string; title?: string | null }
    | void
  splitTerminal(
    tabId: string,
    paneRuntimeId: number,
    opts: {
      direction: 'horizontal' | 'vertical'
      command?: string
      telemetrySource?: TerminalPaneSplitSource
    }
  ): void
  renameTerminal(tabId: string, title: string | null): void
  focusTerminal(tabId: string, worktreeId: string, leafId?: string | null): void
  focusEditorTab?(tabId: string, worktreeId: string): void
  closeSessionTab?(tabId: string, worktreeId: string): void
  moveSessionTab?(worktreeId: string, move: RuntimeMobileSessionTabMove): void
  openFile?(
    worktreeId: string,
    filePath: string,
    relativePath: string,
    runtimeEnvironmentId?: string | null
  ): void
  openDiff?(
    worktreeId: string,
    filePath: string,
    relativePath: string,
    staged: boolean,
    runtimeEnvironmentId?: string | null
  ): void
  readMobileMarkdownTab?(worktreeId: string, tabId: string): Promise<RuntimeMarkdownReadTabResult>
  saveMobileMarkdownTab?(
    worktreeId: string,
    tabId: string,
    baseVersion: string,
    content: string
  ): Promise<RuntimeMarkdownSaveTabResult>
  closeTerminal(tabId: string, paneRuntimeId?: number): void
  closeTerminalTab?(tabId: string): Promise<void>
  sleepWorktree(worktreeId: string): void
  // Why: a phone opening a worktree wakes its slept agents by asking the host
  // renderer to run its own navigation-free wake (experimental agent sleep);
  // the runtime has no in-memory sleeping records or wake authority. Optional to
  // match the many renderer-backed notifier methods only the real bridge wires.
  resumeSleepingAgents?(worktreeId: string): void
  terminalFitOverrideChanged(
    ptyId: string,
    mode: 'mobile-fit' | 'remote-desktop-fit' | 'desktop-fit',
    cols: number,
    rows: number
  ): void
  // Why: presence-based lock signal — desktop renderer mounts the lock
  // banner when `driver.kind === 'mobile'` and unmounts otherwise. The
  // structured payload (vs a `locked: boolean`) carries the active mobile
  // actor's clientId so the renderer can disambiguate multi-phone scenarios
  // and so a future write coordinator can use the same signal as scheduling
  // input. See docs/mobile-presence-lock.md.
  terminalDriverChanged(ptyId: string, driver: DriverState): void
  browserDriverChanged?(browserPageId: string, driver: RuntimeBrowserDriverState): void
}

type TerminalHandleRecord = {
  handle: string
  runtimeId: string
  rendererGraphEpoch: number
  worktreeId: string
  tabId: string
  leafId: string
  ptyId: string | null
  ptyGeneration: number
}

type TerminalWaiter = {
  handle: string
  condition: RuntimeTerminalWaitCondition
  resolve: (result: RuntimeTerminalWait) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout | null
  pollInterval: NodeJS.Timeout | null
  abortCleanup: (() => void) | null
}

type MessageWaiter = {
  handle: string
  typeFilter: string[] | undefined
  resolve: (result: void) => void
  timeout: NodeJS.Timeout | null
  abortCleanup: (() => void) | null
}

function omitUndefinedProperties<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as Partial<T>
}

async function isRuntimeWorktreePathMissing(
  repo: Repo,
  worktreePath: string,
  localWorktreeGitOptions: { wslDistro?: string } = {}
): Promise<boolean> {
  if (!repo.connectionId) {
    const access = getLocalWorktreePathAccess(localWorktreeGitOptions)
    return isWorktreePathMissing(
      toLocalWorktreeRuntimePath(worktreePath, localWorktreeGitOptions),
      access.statPath
    )
  }

  const fsProvider = getSshFilesystemProvider(repo.connectionId)
  if (!fsProvider) {
    return false
  }
  return isWorktreePathMissing(worktreePath, (path) => fsProvider.stat(path))
}

async function isLocalRuntimeGitRepository(
  runtimeWorktreePath: string,
  localWorktreeGitOptions: { wslDistro?: string } = {}
): Promise<boolean> {
  try {
    await gitExecFileAsync(['status', '--short'], {
      cwd: runtimeWorktreePath,
      ...localWorktreeGitOptions
    })
    return true
  } catch (error) {
    return !gitStatusErrorMeansNotRepository(error)
  }
}

function gitStatusErrorMeansNotRepository(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : typeof error === 'string'
          ? error
          : ''
  const stderr =
    error && typeof error === 'object' && 'stderr' in error
      ? String((error as { stderr: unknown }).stderr)
      : ''
  return /not a git repository/i.test(`${message}\n${stderr}`)
}

type RuntimeWorktreeRemovalTarget = {
  id: string
  repoId: string
  path: string
  pushTarget?: GitPushTarget
}

type RuntimeWorktreeRemovalInFlight = {
  optionsKey: string
  promise: Promise<RemoveWorktreeResult & { warning?: string }>
}

type PreservedBranchCleanupTarget = {
  branchName: string
  head: string
  pushTarget?: GitPushTarget
}

function getRuntimeWorktreeRemovalOptionsKey(force: boolean, runHooks: boolean): string {
  return `${force ? 'force' : 'normal'}:${runHooks ? 'run-hooks' : 'skip-hooks'}`
}

function getRuntimeFolderWorkspaceRootId(repo: Repo): string {
  return `${repo.id}::${repo.path}`
}

// Null executionHostId means host-unaware: path-only callers match any repo, and the first runtime
// host can adopt a legacy (unstamped) repo. But an unstamped repo with a connectionId is an SSH repo
// (resolves to ssh:<id>), so it must not be adopted/matched by a runtime host at the same path.
function runtimeRepoMatchesExecutionHost(
  repo: Pick<Repo, 'connectionId' | 'executionHostId'>,
  executionHostId?: ExecutionHostId | null
): boolean {
  if (executionHostId == null) {
    return true
  }
  if (repo.executionHostId != null) {
    return repo.executionHostId === executionHostId
  }
  return repo.connectionId == null
}

function getRuntimeFolderWorkspaceInstanceId(repo: Repo, instanceId: string): string {
  return `${getRuntimeFolderWorkspaceRootId(repo)}${FOLDER_WORKSPACE_INSTANCE_SEPARATOR}${instanceId}`
}

function getRuntimeFolderWorkspaceInstanceIdentity(repo: Repo, worktreeId: string): string {
  const prefix = `${getRuntimeFolderWorkspaceRootId(repo)}${FOLDER_WORKSPACE_INSTANCE_SEPARATOR}`
  return worktreeId.startsWith(prefix) ? worktreeId.slice(prefix.length) : randomUUID()
}

function isRuntimeFolderWorkspaceIdForRepo(repo: Repo, worktreeId: string): boolean {
  const rootId = getRuntimeFolderWorkspaceRootId(repo)
  return (
    worktreeId === rootId ||
    worktreeId.startsWith(`${rootId}${FOLDER_WORKSPACE_INSTANCE_SEPARATOR}`)
  )
}

function mergeRuntimeFolderWorkspace(repo: Repo, worktreeId: string, meta: WorktreeMeta): Worktree {
  return {
    id: worktreeId,
    ...(meta.instanceId !== undefined ? { instanceId: meta.instanceId } : {}),
    repoId: repo.id,
    ...(meta.projectId !== undefined ? { projectId: meta.projectId } : {}),
    ...(meta.hostId !== undefined ? { hostId: meta.hostId } : {}),
    ...(meta.projectHostSetupId !== undefined
      ? { projectHostSetupId: meta.projectHostSetupId }
      : {}),
    path: repo.path,
    head: '',
    branch: '',
    isBare: false,
    isMainWorktree: worktreeId === getRuntimeFolderWorkspaceRootId(repo),
    displayName: meta.displayName || repo.displayName,
    comment: meta.comment || '',
    linkedPR: meta.linkedPR ?? null,
    linkedGitLabMR: meta.linkedGitLabMR ?? null,
    linkedBitbucketPR: meta.linkedBitbucketPR ?? null,
    linkedAzureDevOpsPR: meta.linkedAzureDevOpsPR ?? null,
    linkedGiteaPR: meta.linkedGiteaPR ?? null,
    isArchived: meta.isArchived ?? false,
    isUnread: meta.isUnread ?? false,
    isPinned: meta.isPinned ?? false,
    sortOrder: meta.sortOrder ?? 0,
    ...(meta.manualOrder !== undefined ? { manualOrder: meta.manualOrder } : {}),
    lastActivityAt: meta.lastActivityAt ?? 0,
    ...(meta.createdAt !== undefined ? { createdAt: meta.createdAt } : {}),
    ...(meta.createdWithAgent !== undefined ? { createdWithAgent: meta.createdWithAgent } : {}),
    ...(meta.automationProvenance !== undefined
      ? { automationProvenance: meta.automationProvenance }
      : {}),
    ...(meta.priorWorktreeIds !== undefined ? { priorWorktreeIds: meta.priorWorktreeIds } : {}),
    workspaceStatus: meta.workspaceStatus ?? DEFAULT_WORKSPACE_STATUS_ID,
    diffComments: meta.diffComments,
    mobileDiffReview: meta.mobileDiffReview
  }
}

function listRuntimeFolderWorkspaces(
  store: Pick<RuntimeStore, 'getAllWorktreeMeta' | 'setWorktreeMeta'>,
  repo: Repo
): Worktree[] {
  const rootId = getRuntimeFolderWorkspaceRootId(repo)
  const allMeta = store.getAllWorktreeMeta()
  const ids = Object.keys(allMeta).filter((worktreeId) =>
    isRuntimeFolderWorkspaceIdForRepo(repo, worktreeId)
  )
  if (!ids.includes(rootId)) {
    ids.unshift(rootId)
  } else {
    ids.sort((left, right) => {
      if (left === rootId) {
        return -1
      }
      if (right === rootId) {
        return 1
      }
      return 0
    })
  }

  return ids.map((worktreeId) => {
    const existing = allMeta[worktreeId]
    const meta = existing?.instanceId
      ? existing
      : store.setWorktreeMeta(worktreeId, {
          instanceId: getRuntimeFolderWorkspaceInstanceIdentity(repo, worktreeId),
          ...(existing ? {} : { displayName: repo.displayName, lastActivityAt: Date.now() })
        })
    return mergeRuntimeFolderWorkspace(repo, worktreeId, meta)
  })
}

function parseExactWorktreeIdSelector(selector: string): RuntimeWorktreeRemovalTarget | null {
  const worktreeId = selector.startsWith('id:') ? selector.slice(3) : selector
  const parsed = splitWorktreeId(worktreeId)
  if (!parsed || !parsed.repoId || !parsed.worktreePath) {
    return null
  }
  return {
    id: worktreeId,
    repoId: parsed.repoId,
    path: parsed.worktreePath
  }
}

async function resolveCreateBranchName(
  repoPath: string,
  branchNameOverride: string | undefined,
  sanitizedName: string,
  settings: { branchPrefix: string; branchPrefixCustom?: string },
  username: string | null,
  gitOptions: { wslDistro?: string } = {}
): Promise<string> {
  if (!branchNameOverride) {
    return computeBranchName(sanitizedName, settings, username)
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

// Clamp terminal dimensions to the PTY's supported range (cols 20–240, rows 8–120).
function clampTerminalViewport(cols: number, rows: number): { cols: number; rows: number } {
  return {
    cols: Math.max(20, Math.min(240, Math.round(cols))),
    rows: Math.max(8, Math.min(120, Math.round(rows)))
  }
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

function getLocalGitHubPrForBranch(
  repoPath: string,
  branchName: string,
  gitOptions: { wslDistro?: string }
): ReturnType<typeof getPRForBranch> {
  return hasLocalGitOptions(gitOptions)
    ? getPRForBranch(repoPath, branchName, null, null, null, {
        localGitExecOptions: gitOptions
      })
    : getPRForBranch(repoPath, branchName)
}

type SelectedReviewBranchInput = {
  branchNameOverride?: string
  linkedPR?: number | null
  linkedGitLabMR?: number | null
  linkedBitbucketPR?: number | null
  linkedAzureDevOpsPR?: number | null
  linkedGiteaPR?: number | null
  pushTarget?: GitPushTarget
}

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
  repo: Pick<Repo, 'path' | 'connectionId'>,
  branchName: string,
  args: SelectedReviewBranchInput,
  executionOptions: { localGitExecOptions?: { wslDistro?: string } } = {}
): Promise<{ matchesSelected: boolean; number: number } | null> {
  const selectedReview = getSelectedReviewBranch(args)
  if (!selectedReview) {
    return null
  }
  const review = await getHostedReviewForBranchFromRepo({
    repoPath: repo.path,
    connectionId: repo.connectionId ?? null,
    branch: branchName,
    ...executionOptions,
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

async function pathExists(pathValue: string): Promise<boolean> {
  try {
    await stat(pathValue)
    return true
  } catch (error) {
    if (isENOENT(error)) {
      return false
    }
    throw error
  }
}

function resolveServerBrowsePath(pathValue: string): string {
  const trimmed = pathValue.trim() || '~'
  if (trimmed.includes('\0')) {
    throw new Error('Path cannot contain null bytes')
  }
  if (trimmed === '~') {
    return homedir()
  }
  if (/^~[\\/]/.test(trimmed)) {
    return resolve(homedir(), trimmed.slice(2))
  }
  if (isAbsolute(trimmed)) {
    return resolve(trimmed)
  }
  // Why: remote clients do not share the server process cwd; relative browse
  // inputs are anchored to the server user's home to match the `~` picker root.
  return resolve(homedir(), trimmed)
}

type ResolvedWorktree = Worktree & {
  parentWorktreeId: string | null
  childWorktreeIds: string[]
  lineage: WorktreeLineage | null
  git: GitWorktreeInfo
}

const AGENT_HOOK_RUNTIME_ENV_KEYS = [
  'YIRU_AGENT_HOOK_PORT',
  'YIRU_AGENT_HOOK_TOKEN',
  'YIRU_AGENT_HOOK_ENV',
  'YIRU_AGENT_HOOK_VERSION',
  'YIRU_AGENT_HOOK_ENDPOINT'
] as const

type TerminalWorkspaceLaunchScope = {
  id: string
  path: string
  connectionId: string | null
  repo: Repo | null
  folderWorkspace: FolderWorkspace | null
}

type WorktreeLineageInput = {
  parentWorkspace?: string
  envParentWorkspace?: string
  parentWorktree?: string
  cwdParentWorktree?: string
  noParent?: boolean
  callerTerminalHandle?: string
  comment?: string
  orchestrationContext?: {
    parentWorktreeId?: string
    orchestrationRunId?: string
    taskId?: string
    coordinatorHandle?: string
  }
}

type ResolvedWorkspaceParent =
  | {
      type: 'worktree'
      workspaceKey: WorkspaceKey
      worktree: ResolvedWorktree
      instanceId: string | null
    }
  | {
      type: 'folder'
      workspaceKey: WorkspaceKey
      folderWorkspace: FolderWorkspace
      instanceId: string | null
    }

type WorktreeLineageResolution =
  | {
      kind: 'lineage'
      parent: ResolvedWorkspaceParent
      origin: WorktreeLineage['origin']
      capture: WorktreeLineage['capture']
      orchestrationRunId?: string
      taskId?: string
      coordinatorHandle?: string
      createdByTerminalHandle?: string
    }
  | {
      kind: 'none'
      warnings: WorktreeLineageWarning[]
    }

type RuntimeWorktreeScanResult =
  | { ok: true; worktrees: GitWorktreeInfo[] }
  | { ok: false; worktrees: GitWorktreeInfo[] }

type WorktreeLineageCandidate = {
  source: 'env-workspace' | 'cwd-context' | 'terminal-context' | 'orchestration-context'
  parent: ResolvedWorkspaceParent
  orchestrationRunId?: string
  taskId?: string
  coordinatorHandle?: string
}

function extractOrchestrationTaskId(text?: string): string | undefined {
  return text?.match(/\btask_[A-Za-z0-9]+\b/)?.[0]
}

class RuntimeLineageError extends Error {
  code: string
  data?: unknown

  constructor(code: string, message: string, data?: unknown) {
    super(message)
    this.code = code
    this.data = data
  }
}

class WorktreeIdRequiresFullPathError extends Error {
  readonly code = 'worktree_id_requires_full_path'

  constructor() {
    super(
      'Worktree id selectors must use the full <repo-id>::<path> value. Use the id from `yiru worktree list --json`, or target by path:<path>, branch:<branch>.'
    )
  }
}

type ResolvedWorktreeSnapshot = {
  worktrees: ResolvedWorktree[]
  platformByRepoId: ReadonlyMap<string, NodeJS.Platform>
}

type ResolvedWorktreeCache = ResolvedWorktreeSnapshot & {
  expiresAt: number
}

type ResolvedWorktreeInFlight = {
  generation: number
  promise: Promise<ResolvedWorktreeSnapshot>
}

// Why: presence-based driver state for the mobile-presence lock. Exactly one
// driver per PTY at any moment. See docs/mobile-presence-lock.md.
//   - `idle`: no mobile subscribers; desktop input flows freely
//   - `desktop`: at least one mobile client subscribed but desktop reclaimed
//      (or all mobile clients are passive `desktop`-mode watchers); desktop
//      input flows freely
//   - `mobile{clientId}`: a mobile client is the active driver; desktop
//      input/resize are dropped server-side and the lock banner is mounted.
//      `clientId` is the most recent mobile actor for this PTY.
export type DriverState = RuntimeTerminalDriverState

// Why: per-PTY layout target — what the PTY *should* be at right now.
// `desktop` ⇒ runs at the desktop renderer's pane geometry; mobile passive
// watchers (mode='desktop') still receive scrollback. `phone` ⇒ runs at
// `ownerClientId`'s viewport; the desktop renderer's auto-fit is suppressed.
// See docs/mobile-terminal-layout-state-machine.md.
export type PtyLayoutTarget = TerminalLayoutTarget

// Why: authoritative layout state with monotonic seq. Bumped on every
// applyLayout success; emitted on mobile subscribe-stream events so clients
// drop stale events that arrive after a newer transition.
export type PtyLayoutState = TerminalLayoutState

// Why: applyLayout result discriminator. Callers (especially RPC handlers)
// need to distinguish "shipped a new state at seq N" from "no-op — caller
// should not claim a seq it didn't produce." `pty-exited` is terminal;
// `resize-failed` is transient and the caller may retry.
export type ApplyLayoutResult = TerminalLayoutResult

async function hasLocalWorktreeBaseRef(
  repoPath: string,
  baseRef: string,
  options: { wslDistro?: string } = {}
): Promise<boolean> {
  const refExists = (qualifiedRef: string) =>
    hasWorktreeBaseCommitRef(repoPath, qualifiedRef, options)
  const resolvedBaseRef = await resolveWorktreeAddBaseRef(baseRef, refExists)
  if (resolvedBaseRef !== baseRef) {
    return true
  }
  if (baseRef.startsWith('refs/')) {
    return refExists(baseRef)
  }
  return hasCommitObjectViaGitExec(
    (gitArgs) => gitExecFileAsync(gitArgs, { cwd: repoPath, ...options }),
    baseRef
  )
}

export class YiruRuntimeService {
  private readonly runtimeId = randomUUID()
  private readonly startedAt = Date.now()
  private readonly store: RuntimeStore | null
  private readonly terminalSessions: TerminalSessionAuthority<
    RuntimeSyncedTab,
    RuntimeLeafRecord,
    RuntimePtyWorktreeRecord,
    TerminalHandleRecord,
    RuntimeHeadlessTerminal,
    TerminalWaiter,
    MessageWaiter
  >
  private languageServerManager: LanguageServerManager | null = null
  private mobileSessionTabsByWorktree = new Map<string, RuntimeMobileSessionTabsSnapshot>()
  // Why: idempotency map for mobile terminal creation — a retried create with the
  // same clientMutationId returns the in-flight operation instead of duplicating.
  private mobileTerminalCreateByMutationId = new Map<
    string,
    Promise<RuntimeMobileSessionCreateTerminalResult>
  >()
  // Why: a mobile create waits for the renderer to publish the new tab's surface
  // via graph-sync, but a throttled/hidden renderer can park that past the surface
  // timeout and the create would then destroy the live PTY (#7587). This lets the
  // renderer's own PTY spawn publish the surface main-side, scoped to in-flight
  // creates so ordinary renderer spawns never publish here.
  private pendingMobileTerminalCreatesByKey = new Map<
    string,
    {
      activate: boolean
      selectIfNoActiveTab: boolean
      viewMode?: 'terminal' | 'chat'
    }
  >()
  private mobileSessionTabListeners = new Set<(snapshot: RuntimeMobileSessionTabsResult) => void>()
  // Why: coalesces title/status-driven session.tabs emits so spinner churn
  // doesn't fan out (and per-client JSON.stringify) a snapshot several times a
  // second. Emit reads the latest snapshot, so only the freshest version ships.
  private readonly mobileSessionTabsNotifyCoalescer: MobileSessionTabsNotifyCoalescer =
    createMobileSessionTabsNotifyCoalescer((worktreeId) =>
      this.notifyMobileSessionTabsChangedNow(worktreeId)
    )
  private ptyController: RuntimePtyController | null = null
  private notifier: RuntimeNotifier | null = null
  private clientEventListeners = new Set<(event: RuntimeClientEvent) => void>()
  private forkBackfillStarted = false
  private agentBrowserBridge: AgentBrowserBridge | null = null
  private offscreenBrowserBackend: BrowserBackend | null = null
  private emulatorBridge: EmulatorBridge | null = null
  private resolvedWorktreeCache: ResolvedWorktreeCache | null = null
  private resolvedWorktreeInFlight: ResolvedWorktreeInFlight | null = null
  private resolvedWorktreeGeneration = 0
  private cloneInFlightByPath = new Map<string, Promise<void>>()
  // Why: two simultaneous `yiru .` requests must share the second request's
  // post-registration lookup instead of racing duplicate repo records into disk.
  private workspacePathOpenTail: Promise<void> = Promise.resolve()
  private agentDetector: AgentDetector | null = null
  private ptyForegroundAgentRefreshes = new Map<string, PtyForegroundAgentRefresh>()
  private ptyDelayedForegroundSnapshotTitleObservations = new Map<string, number>()
  private _orchestrationDb: OrchestrationDb | null = null
  // Why: startup draft paste can subscribe after the agent already emitted its
  // ready marker. Keep a bounded raw buffer so fast startup output is replayed.
  private recentPtyOutputById = new Map<string, string>()
  private titleObservationSequence = 0
  private ptyOutputSequenceById = new Map<string, number>()
  private providerSequenceInitializedPtys = new Set<string>()
  private providerSequenceOffsetByPtyId = new Map<string, number>()
  private providerSnapshotPreferredPtys = new Set<string>()
  private providerModeTrackersByPtyId = new Map<string, TerminalKittyKeyboardModeTracker>()
  private providerModeSnapshotScansByPtyId = new Map<
    string,
    Set<TerminalKittyKeyboardModeTracker>
  >()
  private recentPtyPathCandidatesById = new Map<string, string[]>()
  // Why: OSC 9999 status can span PTY chunks. Keeping parser state in the
  // runtime lets hidden/model-owned terminals observe agent state without a
  // mounted xterm view.
  // Why a throttle: the blocked-reason check builds and scans two full wait
  // texts (<=256KB each, lowercased) — measured at ~85% of onPtyData's cost
  // under a TUI flood (findings log 2026-07-03). PTY chunk boundaries are
  // arbitrary, so running the identical computation over coalesced chunks at
  // a bounded cadence (plus a trailing-edge timer so burst-final state is
  // always evaluated) preserves semantics while removing it from the hot path.
  private waitBlockedCheckStateByPtyId = new Map<
    string,
    {
      lastAt: number
      lastWaitState: TerminalTailWaitState | null
      appended: string
      keywordCarry: string
      timer: ReturnType<typeof setTimeout> | null
    }
  >()

  private agentStatusOscProcessorsByPtyId = new Map<
    string,
    ReturnType<typeof createAgentStatusOscProcessor>
  >()
  // Why: per-PTY shared title trackers (all-titles ordering + stale-working
  // timer) replace last-title-per-chunk scanning so main observes the same
  // intra-chunk working→idle transitions the renderer does (issue #1083).
  // Lazily created like agentStatusOscProcessorsByPtyId; disposed on PTY exit.
  private ptyTitleTrackersByPtyId = new Map<string, RuntimePtyTitleTrackerEntry>()
  // Why: the Command Code output detector arms early from the launch command
  // when known (banner detection covers user-typed launches), mirroring the
  // renderer detector's startupCommand seed.
  private terminalSpawnCommandsByPtyId = new Map<string, string>()
  // Why: ordinary OSC 0/1/2 titles can split across PTY chunks, especially over
  // SSH/relay buffering. Keep a small raw scan tail and feed reconstructed
  // chunks into the title tracker instead of falling back to last-title scans.
  private oscTitleScanTailByPtyId = new Map<string, string>()
  // Why: mobile file taps resolve relative paths on the host. OSC 7 is the
  // terminal-owned cwd signal, and it can arrive in live output between snapshots.
  private osc7ScanTailByPtyId = new Map<string, string>()
  private terminalCwdByPtyId = new Map<string, string>()
  private terminalFileUriHostnameByPtyId = new Map<string, string>()
  // Why: latest agent-status payload per pane, retained so worktree.ps can serve
  // mobile the same inline agent rows the desktop sidebar renders. Cleared on pty
  // teardown so dead agents don't linger. See RuntimeAgentRowSnapshot.
  private latestAgentStatusByPaneKey = new Map<string, RuntimeAgentRowSnapshot>()
  private stats: StatsCollector | null = null
  // Why (§3.3 + §7.1): the renderer-create path and coordinator
  // `probeWorktreeDrift` share this cache so a create that already fetched
  // `origin` within the last 30s does not re-fetch during dispatch, and
  // vice-versa. Keyed by `<repoPath>::<remote>` so multi-remote repos (even
  // though v1 only uses `origin`) don't cross-contaminate. The in-flight Map
  // also provides serialization — two concurrent callers share a single
  // underlying `git fetch`. Full-remote fetch lifecycle rules:
  //   - entry inserted BEFORE await,
  //   - `.finally()` removes the entry on BOTH success and rejection,
  //   - timestamp written ONLY on success (rejection must not make the
  //     30s freshness cache lie).
  // A literal "insert before await / read-back after await" without these
  // three rules wedges future fetches on the same repo after a single
  // DNS hiccup until process restart (see §3.3 Lifecycle). Exact base-ref
  // refreshes share the in-flight rule and maintain their own exact-base
  // freshness entries; a full-remote fetch may be narrowed by repo refspecs,
  // so it must not prove a specific branch for create.
  private fetchInflight = new Map<string, Promise<RemoteFetchResult>>()
  // Why: `git fetch origin` and `git fetch origin <refspec>` contend for the
  // same repo remote/ref locks. This queue serializes all fetch shapes for one
  // canonical repo+remote while still letting same-shape callers share promises.
  private remoteFetchQueueTail = new Map<string, Promise<RemoteFetchResult>>()
  private fetchLastCompletedAt = new Map<string, number>()
  // Why: `getCanonicalFetchKey` is awaited from every freshness probe and
  // every getOrStartRemoteFetch call. Without memoization the warm-cache hot
  // path spawns a `git rev-parse --git-common-dir` subprocess per touch
  // (twice in createLocalWorktree). Cache by `<repoPath>::<remote>` so the
  // canonical key is resolved at most once per repo+remote in the process.
  private canonicalFetchKeyCache = new Map<string, string>()
  private optimisticReconcileTokens = new Map<string, string>()
  private removeManagedWorktreeInFlight = new Map<string, RuntimeWorktreeRemovalInFlight>()
  private preservedBranchCleanupByWorktreeId = new Map<string, PreservedBranchCleanupTarget>()
  private readonly getLocalProviderFn: (() => IPtyProvider) | null
  private readonly getSshProviderFn: ((connectionId: string) => IPtyProvider | undefined) | null
  private readonly onPtyStopped: ((ptyId: string) => void) | null
  private readonly onTerminalAgentStatus: ((event: RuntimeTerminalAgentStatusEvent) => void) | null
  private readonly onTerminalSideEffects: ((batch: TerminalSideEffectBatch) => void) | null
  private terminalSideEffectConsumerAvailable = false
  private readonly getAgentStatusSnapshotFn: (() => AgentStatusIpcPayload[]) | null
  private readonly buildAgentHookPtyEnv: (() => Record<string, string>) | null
  private readonly getDesktopWindowStatusFn: () => RuntimeDesktopWindowStatus
  private accountServices: RuntimeAccountServices | null = null
  private commitMessageAgentEnv: CommitMessageAgentEnvironmentResolvers | null = null
  private automationService: AutomationService | null = null
  private readonly claudeAgentTeams = new ClaudeAgentTeamsService()
  private mobileDictation: {
    id: string
    owner: string
    clientId?: string
    connectionId?: string
    state: 'starting' | 'active' | 'closing'
    partialText: string
    finalTexts: string[]
    errors: string[]
  } | null = null

  constructor(
    store: RuntimeStore | null = null,
    stats?: StatsCollector,
    deps?: {
      getLocalProvider?: () => IPtyProvider
      getSshProvider?: (connectionId: string) => IPtyProvider | undefined
      onPtyStopped?: (ptyId: string) => void
      onTerminalAgentStatus?: (event: RuntimeTerminalAgentStatusEvent) => void
      onTerminalSideEffects?: (batch: TerminalSideEffectBatch) => void
      // Why: agent status mostly arrives via hooks (agent-hooks/server), not OSC
      // terminal output. worktree.ps reads this at query time so mobile shows the
      // same inline agent rows the desktop sidebar does — same source, 1:1.
      getAgentStatusSnapshot?: () => AgentStatusIpcPayload[]
      // Why: Claude and Codex history roots must also be available under headless `yiru serve`.
      getAdditionalAiVaultCodexHomePaths?: () => readonly string[]
      resolveAiVaultClaudeProjectsDirs?: (
        target: AiVaultSessionRuntimeTarget
      ) => Promise<readonly string[]>
      buildAgentHookPtyEnv?: () => Record<string, string>
      getDesktopWindowStatus?: () => RuntimeDesktopWindowStatus
    }
  ) {
    this.store = store
    this.terminalSessions = new TerminalSessionAuthority({
      rejectHandle: (handle) => this.rejectWaitersForHandle(handle, 'terminal_handle_stale'),
      rejectAllHandles: () => this.rejectAllWaiters('terminal_handle_stale'),
      notifyRemoteViewPresence: (ptyId) => this.notifyRemoteTerminalViewPresenceChanged(ptyId),
      notifyDriverChanged: (ptyId, driver) => this.notifier?.terminalDriverChanged(ptyId, driver),
      getPtySize: (ptyId) => this.getTerminalSize(ptyId),
      resizePty: (ptyId, cols, rows) => this.ptyController?.resize?.(ptyId, cols, rows) ?? true,
      resizeHeadlessTerminal: (ptyId, cols, rows) => this.resizeHeadlessTerminal(ptyId, cols, rows),
      notifyFitOverride: (ptyId, mode, cols, rows) =>
        this.notifier?.terminalFitOverrideChanged(ptyId, mode, cols, rows)
    })
    if (stats) {
      this.stats = stats
      this.agentDetector = new AgentDetector(stats)
    }
    this.getAgentStatusSnapshotFn = deps?.getAgentStatusSnapshot ?? null
    // Why: both managed-provider root resolvers must work without desktop IPC registration.
    if (deps?.getAdditionalAiVaultCodexHomePaths || deps?.resolveAiVaultClaudeProjectsDirs) {
      configureAiVaultSessionSources({
        getAdditionalCodexHomePaths: deps.getAdditionalAiVaultCodexHomePaths,
        resolveClaudeProjectsDirs: deps.resolveAiVaultClaudeProjectsDirs
      })
    }
    // Why: the daemon adapter is installed via `setLocalPtyProvider()` during
    // attachMainWindowServices, AFTER this service is constructed. Capturing
    // `getLocalPtyProvider()` at construction time would freeze a reference to
    // the pre-daemon `LocalPtyProvider` and miss the routed adapter. Resolve
    // lazily via thunk so teardown always sees the currently-installed
    // provider (design §4.3 wire-up).
    this.getLocalProviderFn = deps?.getLocalProvider ?? null
    this.getSshProviderFn = deps?.getSshProvider ?? null
    this.onPtyStopped = deps?.onPtyStopped ?? null
    this.onTerminalAgentStatus = deps?.onTerminalAgentStatus ?? null
    this.buildAgentHookPtyEnv = deps?.buildAgentHookPtyEnv ?? null
    this.getDesktopWindowStatusFn = deps?.getDesktopWindowStatus ?? (() => 'openable')
    this.onTerminalSideEffects = deps?.onTerminalSideEffects ?? null
    // Why: the ConPTY spawn mark can land after daemon stream data already
    // created this PTY's emulator; the mark retrofits the DA1 override here
    // (terminal-query-authority.md §ConPTY DA1).
    registerConptyDa1OverrideInstaller((ptyId) => this.ensureNativeWindowsConptyDa1Override(ptyId))
    // Why: a renderer attribute push must reach already-live emulators too —
    // cursor options for DECRQSS/DECRQM parity plus the per-PTY OSC color
    // override reset a theme apply implies (terminal-query-authority.md
    // §View-attribute bridge).
    registerTerminalViewAttributesApplier((attributes) => {
      for (const state of this.terminalSessions.listEmulators()) {
        state.emulator.applyPushedViewAttributes(attributes)
      }
    })
  }

  getLocalProvider(): IPtyProvider | null {
    return this.getLocalProviderFn ? this.getLocalProviderFn() : null
  }

  getLanguageServerManager(): LanguageServerManager {
    if (!this.store) {
      throw new Error('Language server runtime storage is unavailable.')
    }
    this.languageServerManager ??= new LanguageServerManager(this.store)
    return this.languageServerManager
  }

  private async stopPtysForDestructiveWorktreeRemoval(
    worktreeId: string,
    connectionId?: string
  ): Promise<void> {
    const provider = connectionId ? this.getSshProviderFn?.(connectionId) : this.getLocalProvider()
    if (!provider) {
      throw new Error(`PTY provider unavailable for worktree deletion: ${worktreeId}`)
    }
    const teardownResult = await killAllProcessesForWorktree(worktreeId, {
      runtime: this,
      localProvider: provider,
      onPtyStopped: this.onPtyStopped ?? undefined,
      requirePhysicalStop: true,
      ...(connectionId ? { includeLocalRegistry: false } : {})
    })
    const total =
      teardownResult.runtimeStopped +
      teardownResult.providerStopped +
      teardownResult.registryStopped
    if (total > 0) {
      console.info(
        `[worktree-teardown] ${worktreeId} killed runtime=${teardownResult.runtimeStopped} provider=${teardownResult.providerStopped} registry=${teardownResult.registryStopped}`
      )
    }
  }

  getStatsSummary(): StatsSummary | null {
    return this.stats?.getSummary() ?? null
  }

  getMemorySnapshot(): Promise<MemorySnapshot> {
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }
    return collectMemorySnapshot(this.store)
  }

  getUIState(): PersistedUIState {
    if (!this.store?.getUI) {
      throw new Error('runtime_unavailable')
    }
    return this.store.getUI()
  }

  updateUIState(updates: Partial<PersistedUIState>): PersistedUIState {
    if (!this.store?.getUI || !this.store.updateUI) {
      throw new Error('runtime_unavailable')
    }
    this.store.updateUI(updates)
    return this.store.getUI()
  }

  recordFeatureInteraction(id: FeatureInteractionId): PersistedUIState {
    if (!this.store?.recordFeatureInteraction) {
      throw new Error('runtime_unavailable')
    }
    return this.store.recordFeatureInteraction(id)
  }

  getClientSettings(): Pick<
    GlobalSettings,
    | 'defaultTuiAgent'
    | 'disabledTuiAgents'
    | 'agentCmdOverrides'
    | 'agentDefaultArgs'
    | 'agentDefaultEnv'
    | 'agentStatusHooksEnabled'
    | 'minimaxGroupId'
    | 'minimaxUsageModels'
    | 'prBotAuthorOverrides'
  > {
    if (!this.store?.getSettings) {
      throw new Error('runtime_unavailable')
    }
    const settings = this.store.getSettings()
    return {
      defaultTuiAgent: settings.defaultTuiAgent ?? null,
      disabledTuiAgents: settings.disabledTuiAgents ?? [],
      agentCmdOverrides: settings.agentCmdOverrides ?? {},
      agentDefaultArgs: settings.agentDefaultArgs ?? {},
      agentDefaultEnv: settings.agentDefaultEnv ?? {},
      agentStatusHooksEnabled: settings.agentStatusHooksEnabled !== false,
      minimaxGroupId: settings.minimaxGroupId ?? '',
      minimaxUsageModels: settings.minimaxUsageModels ?? 'general',
      prBotAuthorOverrides: settings.prBotAuthorOverrides ?? []
    }
  }

  updateClientSettings(
    updates: Pick<
      Partial<GlobalSettings>,
      | 'agentStatusHooksEnabled'
      | 'defaultTuiAgent'
      | 'disabledTuiAgents'
      | 'agentDefaultArgs'
      | 'agentDefaultEnv'
      | 'minimaxGroupId'
      | 'minimaxUsageModels'
      | 'prBotAuthorOverrides'
    >
  ): Pick<
    GlobalSettings,
    | 'defaultTuiAgent'
    | 'disabledTuiAgents'
    | 'agentCmdOverrides'
    | 'agentDefaultArgs'
    | 'agentDefaultEnv'
    | 'agentStatusHooksEnabled'
    | 'minimaxGroupId'
    | 'minimaxUsageModels'
    | 'prBotAuthorOverrides'
  > {
    if (!this.store?.getSettings || !this.store.updateSettings) {
      throw new Error('runtime_unavailable')
    }
    const before = this.store.getSettings().agentStatusHooksEnabled !== false
    this.store.updateSettings(updates, { notifyListeners: true })
    if (
      typeof updates.agentStatusHooksEnabled === 'boolean' &&
      before !== updates.agentStatusHooksEnabled
    ) {
      applyAgentStatusHooksEnabled(updates.agentStatusHooksEnabled)
    }
    return this.getClientSettings()
  }

  getClientTerminalQuickCommands(): TerminalQuickCommand[] {
    if (!this.store?.getSettings) {
      throw new Error('runtime_unavailable')
    }
    return this.store.getSettings().terminalQuickCommands ?? []
  }

  updateClientTerminalQuickCommands(
    mutation: TerminalQuickCommandMutation
  ): TerminalQuickCommand[] {
    if (!this.store?.getSettings || !this.store.updateSettings) {
      throw new Error('runtime_unavailable')
    }
    const current = this.getClientTerminalQuickCommands()
    if (
      mutation.type === 'upsert' &&
      !current.some((command) => command.id === mutation.command.id) &&
      current.length >= MAX_QUICK_COMMANDS
    ) {
      throw new Error('Quick command limit reached')
    }
    this.store.updateSettings(
      { terminalQuickCommands: applyTerminalQuickCommandMutation(current, mutation) },
      { notifyListeners: true }
    )
    return this.getClientTerminalQuickCommands()
  }

  updateClientPRBotAuthorOverride(args: { author: string; isBot: boolean }) {
    if (!this.store?.getSettings || !this.store.updateSettings) {
      throw new Error('runtime_unavailable')
    }
    const current = this.store.getSettings().prBotAuthorOverrides
    this.store.updateSettings(
      { prBotAuthorOverrides: applyPRBotAuthorOverride(current, args.author, args.isBot) },
      { notifyListeners: true }
    )
    return this.getClientSettings()
  }

  listAutomations(): Automation[] {
    if (!this.store?.listAutomations) {
      throw new Error('runtime_unavailable')
    }
    return this.store.listAutomations()
  }

  listAutomationRuns(automationId?: string): AutomationRun[] {
    if (!this.store?.listAutomationRuns) {
      throw new Error('runtime_unavailable')
    }
    return this.store.listAutomationRuns(automationId)
  }

  showAutomation(id: string): Automation {
    const automation = this.listAutomations().find((entry) => entry.id === id)
    if (!automation) {
      throw new Error('Automation not found.')
    }
    return automation
  }

  async createAutomation(input: RuntimeAutomationCreateInput): Promise<Automation> {
    if (!this.store?.createAutomation) {
      throw new Error('runtime_unavailable')
    }
    const target = await this.resolveAutomationTarget(input)
    if (input.reuseSession && target.workspaceMode !== 'existing') {
      throw new Error('Session reuse requires an existing workspace target.')
    }
    return this.store.createAutomation({
      name: input.name,
      prompt: input.prompt,
      precheck: input.precheck,
      agentId: input.agentId,
      runContext: input.runContext,
      sourceContext: input.sourceContext,
      projectId: target.projectId,
      workspaceMode: target.workspaceMode,
      workspaceId: target.workspaceId,
      baseBranch: input.baseBranch,
      setupDecision: input.setupDecision,
      reuseSession: input.reuseSession,
      timezone: input.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      rrule: input.rrule,
      dtstart: input.dtstart,
      enabled: input.enabled,
      missedRunGraceMinutes: input.missedRunGraceMinutes
    })
  }

  async updateAutomation(id: string, updates: RuntimeAutomationUpdateInput): Promise<Automation> {
    if (!this.store?.updateAutomation) {
      throw new Error('runtime_unavailable')
    }
    const current = this.showAutomation(id)
    const patch: AutomationUpdateInput = {}
    if (hasRuntimeAutomationUpdateValue(updates, 'name')) {
      patch.name = updates.name
    }
    if (hasRuntimeAutomationUpdateValue(updates, 'prompt')) {
      patch.prompt = updates.prompt
    }
    if (hasRuntimeAutomationUpdateValue(updates, 'precheck')) {
      patch.precheck = updates.precheck
    }
    if (hasRuntimeAutomationUpdateValue(updates, 'agentId')) {
      patch.agentId = updates.agentId
    }
    if (hasRuntimeAutomationUpdateValue(updates, 'runContext')) {
      patch.runContext = updates.runContext
    }
    if (hasRuntimeAutomationUpdateValue(updates, 'sourceContext')) {
      patch.sourceContext = updates.sourceContext
    }
    if (hasRuntimeAutomationUpdateValue(updates, 'baseBranch')) {
      patch.baseBranch = updates.baseBranch
    }
    if (hasRuntimeAutomationUpdateValue(updates, 'setupDecision')) {
      patch.setupDecision = updates.setupDecision
    }
    if (hasRuntimeAutomationUpdateValue(updates, 'reuseSession')) {
      patch.reuseSession = updates.reuseSession
    }
    if (hasRuntimeAutomationUpdateValue(updates, 'timezone')) {
      patch.timezone = updates.timezone
    }
    if (hasRuntimeAutomationUpdateValue(updates, 'rrule')) {
      patch.rrule = updates.rrule
    }
    if (hasRuntimeAutomationUpdateValue(updates, 'dtstart')) {
      patch.dtstart = updates.dtstart
    }
    if (hasRuntimeAutomationUpdateValue(updates, 'enabled')) {
      patch.enabled = updates.enabled
    }
    if (hasRuntimeAutomationUpdateValue(updates, 'missedRunGraceMinutes')) {
      patch.missedRunGraceMinutes = updates.missedRunGraceMinutes
    }
    const targetChanged =
      hasRuntimeAutomationUpdateValue(updates, 'repo') ||
      hasRuntimeAutomationUpdateValue(updates, 'workspace') ||
      hasRuntimeAutomationUpdateValue(updates, 'workspaceMode')
    if (targetChanged) {
      const target = await this.resolveAutomationTarget(updates, current)
      if (patch.reuseSession === true && target.workspaceMode !== 'existing') {
        throw new Error('Session reuse requires an existing workspace target.')
      }
      patch.projectId = target.projectId
      patch.workspaceMode = target.workspaceMode
      patch.workspaceId = target.workspaceId
      if (target.workspaceMode !== 'existing') {
        patch.reuseSession = false
      }
    }
    if (!targetChanged && patch.reuseSession && current.workspaceMode !== 'existing') {
      throw new Error('Session reuse requires an existing workspace target.')
    }
    return this.store.updateAutomation(id, patch)
  }

  deleteAutomation(id: string): { removed: boolean; id: string } {
    if (!this.store?.deleteAutomation) {
      throw new Error('runtime_unavailable')
    }
    this.showAutomation(id)
    this.store.deleteAutomation(id)
    return { removed: true, id }
  }

  async runAutomationNow(id: string): Promise<AutomationRun> {
    if (!this.automationService) {
      throw new Error('runtime_unavailable')
    }
    return await this.automationService.runNow(id)
  }

  private async resolveAutomationTarget(
    input: {
      repo?: string
      workspace?: string
      workspaceMode?: AutomationWorkspaceMode
      baseBranch?: string | null
    },
    current?: Automation
  ): Promise<{
    projectId: string
    workspaceMode: AutomationWorkspaceMode
    workspaceId?: string | null
  }> {
    const hasRepo = input.repo !== undefined
    const hasWorkspace = input.workspace !== undefined
    if (
      current?.workspaceMode === 'existing' &&
      hasRepo &&
      !hasWorkspace &&
      input.workspaceMode !== 'new_per_run'
    ) {
      throw new Error(
        'Repo updates for existing-workspace automation require workspaceMode new_per_run.'
      )
    }
    const workspace = input.workspace ? await this.showManagedWorktree(input.workspace) : null
    const repo = input.repo ? await this.showRepo(input.repo) : null
    const workspaceMode =
      input.workspaceMode ??
      (workspace
        ? 'existing'
        : input.repo && !current
          ? 'new_per_run'
          : (current?.workspaceMode ?? 'new_per_run'))
    if (workspaceMode === 'existing') {
      const workspaceId = workspace?.id ?? current?.workspaceId
      const projectId = workspace?.repoId ?? current?.projectId
      if (repo && repo.id !== projectId) {
        throw new Error('Selected workspace belongs to a different repo.')
      }
      if (!workspaceId || !projectId) {
        throw new Error('Existing-workspace automation requires --workspace.')
      }
      return { projectId, workspaceMode, workspaceId }
    }
    const projectId = repo?.id ?? workspace?.repoId ?? current?.projectId
    if (!projectId) {
      throw new Error('Automation requires --repo or --workspace.')
    }
    return { projectId, workspaceMode: 'new_per_run', workspaceId: null }
  }

  // Why: lazy initialization — the DB path depends on Electron's userData
  // which may not be finalized until after app.ready. Also allows unit tests
  // to inject an in-memory DB without touching the filesystem.
  getOrchestrationDb(): OrchestrationDb {
    if (!this._orchestrationDb) {
      const { app } = require('electron')
      const dbPath = join(app.getPath('userData'), 'orchestration.db')
      this._orchestrationDb = new OrchestrationDb(dbPath)
    }
    return this._orchestrationDb
  }

  setOrchestrationDb(db: OrchestrationDb): void {
    this._orchestrationDb = db
  }

  setAutomationService(service: AutomationService): void {
    this.automationService = service
  }

  getRuntimeId(): string {
    return this.runtimeId
  }

  getStartedAt(): number {
    return this.startedAt
  }

  getStatus(): RuntimeStatus {
    // Why: browser panes need a backend that can create and stream a page. A
    // desktop renderer provides one via <webview>; a headless serve provides one
    // via the offscreen backend. Either way the same browser.screencast.v1 path
    // works, so advertise it when either is present. browser.headless.v1
    // additionally tells clients this host owns browser pages with no renderer,
    // so they must not fall back to a local desktop browser tab.
    const hasRenderer = Boolean(this.getAvailableAuthoritativeWindow())
    const hasOffscreen = !hasRenderer && Boolean(this.offscreenBrowserBackend)
    const canBrowse = hasRenderer || hasOffscreen
    const capabilities: RuntimeCapability[] = RUNTIME_CAPABILITIES.filter(
      (capability) => capability !== 'browser.screencast.v1' || canBrowse
    )
    if (hasOffscreen) {
      capabilities.push(BROWSER_HEADLESS_RUNTIME_CAPABILITY)
    }
    if (hasRenderer) {
      // Why: opening VS Code is a desktop-host side effect unavailable to headless serve.
      capabilities.push(EXTERNAL_EDITOR_REMOTE_SSH_RUNTIME_CAPABILITY)
    }
    // Why: certificate proceed is owned by the browser-hosting process for both
    // desktop webviews and offscreen pages. Advertise whenever either backend
    // can host a page so remote clients can surface Proceed Anyway (Unsafe).
    if (canBrowse) {
      capabilities.push(BROWSER_CERTIFICATE_TRUST_RUNTIME_CAPABILITY)
    }
    const graph = this.terminalSessions.getGraphState()
    return {
      runtimeId: this.runtimeId,
      rendererGraphEpoch: graph.rendererGraphEpoch,
      graphStatus: graph.graphStatus,
      authoritativeWindowId: graph.authoritativeWindowId,
      desktopWindowStatus: hasRenderer ? 'available' : this.getDesktopWindowStatusFn(),
      liveTabCount: graph.liveTabCount,
      liveLeafCount: graph.liveLeafCount,
      runtimeProtocolVersion: RUNTIME_PROTOCOL_VERSION,
      minCompatibleRuntimeClientVersion: MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION,
      // Why: headless yiru serve cannot create/stream BrowserViews, so clients
      // must not treat browser panes as supported just because runtime RPC is up.
      capabilities,
      hostPlatform: process.platform,
      terminalWindowsShell: this.store?.getSettings?.().terminalWindowsShell ?? null,
      floatingWorkspaceEnabled: this.store?.getSettings?.().floatingTerminalEnabled !== false,
      protocolVersion: RUNTIME_PROTOCOL_VERSION,
      minCompatibleMobileVersion: MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION
    }
  }

  // Why: scans the transcript-owning host's disk (correct by construction over
  // RPC — a remote/SSH host scans its own disk). Delegates to the one shared
  // cache so the desktop panel and the mobile screen never double-scan.
  listAiVaultSessions(args?: AiVaultListArgs): Promise<AiVaultListResult> {
    return listAiVaultSessions(args)
  }

  setPtyController(controller: RuntimePtyController | null): void {
    // Why: CLI terminal writes must go through the main-owned PTY registry
    // instead of tunneling back through renderer IPC, or live handles could
    // drift from the process they are supposed to control during reloads.
    this.ptyController = controller
  }

  setNotifier(notifier: RuntimeNotifier | null): void {
    this.notifier = notifier
    // Why: run the one-shot fork-upstream backfill once a renderer is attached,
    // so existing forks self-correct on launch and the result can be broadcast.
    if (notifier && !this.forkBackfillStarted) {
      this.forkBackfillStarted = true
      void this.backfillForkUpstreams()
    }
  }

  onClientEvent(listener: (event: RuntimeClientEvent) => void): () => void {
    this.clientEventListeners.add(listener)
    return () => {
      this.clientEventListeners.delete(listener)
    }
  }

  private emitClientEvent(event: RuntimeClientEvent): void {
    for (const listener of this.clientEventListeners) {
      listener(event)
    }
  }

  private notifyWorktreesChanged(repoId: string): void {
    this.notifier?.worktreesChanged(repoId)
    this.emitClientEvent({ type: 'worktreesChanged', repoId })
  }

  private notifyReposChanged(): void {
    this.notifier?.reposChanged()
    this.emitClientEvent({ type: 'reposChanged' })
  }

  // Why: SSH state changes originate in main's ssh handlers, not in runtime
  // methods, so they need a public entry point onto the client-event stream.
  notifySshStateChanged(targetId: string, state: SshConnectionState): void {
    this.emitClientEvent({ type: 'sshStateChanged', targetId, state })
  }

  // Why: renderer-initiated meta updates intentionally skip the renderer
  // notifier (the renderer already applied them optimistically), but remote
  // clients hold no optimistic copy and need the invalidation event.
  notifyWorktreesChangedForRemoteClients(repoId: string): void {
    this.invalidateResolvedWorktreeCache()
    this.emitClientEvent({ type: 'worktreesChanged', repoId })
  }

  private notifyActivateWorktree(
    repoId: string,
    worktreeId: string,
    setup?: CreateWorktreeResult['setup'],
    startup?: WorktreeStartupLaunch,
    defaultTabs?: CreateWorktreeResult['defaultTabs']
  ): void {
    this.notifier?.activateWorktree(repoId, worktreeId, setup, startup, defaultTabs)
    this.emitClientEvent(
      toRuntimeActivateWorktreeEvent(repoId, worktreeId, setup, startup, defaultTabs)
    )
  }

  setAgentBrowserBridge(bridge: AgentBrowserBridge | null): void {
    this.agentBrowserBridge = bridge
  }

  getAgentBrowserBridge(): AgentBrowserBridge | null {
    return this.agentBrowserBridge
  }

  setOffscreenBrowserBackend(backend: BrowserBackend | null): void {
    this.offscreenBrowserBackend = backend
  }

  getOffscreenBrowserBackend(): BrowserBackend | null {
    return this.offscreenBrowserBackend
  }

  setEmulatorBridge(bridge: EmulatorBridge | null): void {
    this.emulatorBridge = bridge
    setEmulatorBridge(bridge)
  }

  getEmulatorBridge(): EmulatorBridge | null {
    return this.emulatorBridge
  }

  attachWindow(windowId: number): void {
    const authoritativeWindowId = this.terminalSessions.getAuthoritativeWindowId()
    if (authoritativeWindowId === HEADLESS_RUNTIME_WINDOW_ID) {
      // Why: promotion is a renderer reload of the same graph owner, not a new
      // runtime; stale handles must transition before the real window publishes.
      this.persistWindowlessPtyBindingsForDesktopAttach()
      this.markRendererReloading(HEADLESS_RUNTIME_WINDOW_ID)
      this.terminalSessions.replaceAuthoritativeWindow(windowId)
      return
    }
    if (authoritativeWindowId === null) {
      // Why: a promoted serve can close and later reopen its window while new
      // background PTYs keep arriving; every windowless gap needs this handoff.
      this.persistWindowlessPtyBindingsForDesktopAttach()
      this.terminalSessions.attachGraphWindow(windowId)
    }
  }

  private persistWindowlessPtyBindingsForDesktopAttach(): void {
    const session = this.store?.getWorkspaceSession?.()
    if (!session || !this.store?.setWorkspaceSession) {
      return
    }
    const promotablePtys = [...this.terminalSessions.listPtyRecords()].filter((pty) => {
      if (!pty.connected || !pty.tabId) {
        return false
      }
      const tab = session.tabsByWorktree[pty.worktreeId]?.find(
        (candidate) => candidate.id === pty.tabId
      )
      if (!tab) {
        return false
      }
      const layoutPtyIds = Object.values(
        session.terminalLayoutsByTabId[pty.tabId]?.ptyIdsByLeafId ?? {}
      )
      return tab.ptyId === pty.ptyId || layoutPtyIds.includes(pty.ptyId)
    })
    if (promotablePtys.length === 0) {
      return
    }

    // Why: renderer hydration treats an explicitly-present shutdown list as
    // authoritative. A windowless owner has no renderer shutdown pass, so seed
    // that existing reattach contract before its next desktop window loads.
    const activeWorktreeIdsOnShutdown = [
      ...new Set([
        ...(session.activeWorktreeIdsOnShutdown ?? []),
        ...promotablePtys.map((pty) => pty.worktreeId)
      ])
    ]
    const activeConnectionIdsAtShutdown = [
      ...new Set([
        ...(session.activeConnectionIdsAtShutdown ?? []),
        ...promotablePtys
          .map((pty) => pty.connectionId)
          .filter((connectionId): connectionId is string => connectionId !== null)
      ])
    ]
    const remoteSessionIdsByTabId = { ...session.remoteSessionIdsByTabId }
    for (const pty of promotablePtys) {
      if (pty.connectionId && pty.tabId) {
        remoteSessionIdsByTabId[pty.tabId] = pty.ptyId
      }
    }

    this.store.setWorkspaceSession({
      ...session,
      activeWorktreeIdsOnShutdown,
      ...(activeConnectionIdsAtShutdown.length > 0 ? { activeConnectionIdsAtShutdown } : {}),
      ...(Object.keys(remoteSessionIdsByTabId).length > 0 ? { remoteSessionIdsByTabId } : {})
    })
  }

  syncWindowGraph(windowId: number, graph: RuntimeSyncWindowGraph): RuntimeSyncWindowGraphResult {
    this.syncMobileSessionTabs(graph.mobileSessionTabs)
    const graphSyncedAt = this.nextTitleObservationSequence()
    this.terminalSessions.synchronizeGraph(
      windowId,
      graph.tabs,
      graph.leaves,
      {
        buildLeaf: (leaf, { existing, ptyId, ptyGeneration, writable }) => {
          const existingPty = ptyId ? this.terminalSessions.getPtyRecord(ptyId) : null
          const tailSource = existing?.ptyId === ptyId ? existing : existingPty
          return {
            ...leaf,
            ptyId,
            ptyGeneration,
            connected: ptyId !== null,
            writable,
            lastOutputAt: tailSource?.lastOutputAt ?? null,
            lastExitCode: tailSource?.lastExitCode ?? null,
            tailBuffer: tailSource?.tailBuffer ?? [],
            tailPartialLine: tailSource?.tailPartialLine ?? '',
            tailPendingAnsi: tailSource?.tailPendingAnsi ?? '',
            tailRedrawCursor: tailSource?.tailRedrawCursor ?? null,
            tailTruncated: tailSource?.tailTruncated ?? false,
            tailLinesTotal: tailSource?.tailLinesTotal ?? 0,
            preview: tailSource?.preview ?? '',
            waitBlockedAt: tailSource?.waitBlockedAt ?? null,
            lastAgentStatus: tailSource?.lastAgentStatus ?? null,
            lastOscTitle: tailSource?.lastOscTitle ?? null,
            lastOscTitleAt: tailSource?.lastOscTitleAt ?? null,
            paneTitleUpdatedAt:
              existing?.ptyId === ptyId && existing.paneTitle === leaf.paneTitle
                ? existing.paneTitleUpdatedAt
                : graphSyncedAt
          }
        },
        recordLivePty: (leaf, existing) => {
          if (!leaf.ptyId) {
            return
          }
          this.recordPtyWorktree(leaf.ptyId, leaf.worktreeId, {
            connected: true,
            lastOutputAt: existing?.ptyId === leaf.ptyId ? existing.lastOutputAt : null,
            preview: existing?.ptyId === leaf.ptyId ? existing.preview : '',
            tabId: leaf.tabId,
            paneKey: this.makeRuntimePaneKey(leaf)
          })
        }
      },
      this.runtimeId
    )
    this.notifyMobileSessionTabSnapshots()
    this.setTerminalSideEffectConsumerAvailable(windowId !== HEADLESS_RUNTIME_WINDOW_ID)

    const agentOrchestrationByPaneKey = this.buildAgentOrchestrationByPaneKey()
    return {
      ...this.getStatus(),
      ...(agentOrchestrationByPaneKey ? { agentOrchestrationByPaneKey } : {})
    }
  }

  async listMobileSessionTabs(worktreeSelector: string): Promise<RuntimeMobileSessionTabsResult> {
    const explicitWorktreeId = this.getValidatedExplicitWorktreeIdSelector(worktreeSelector)
    if (explicitWorktreeId) {
      this.hydrateHeadlessMobileSessionTabsFromWorkspaceSession(explicitWorktreeId)
      await this.refreshMobileSessionPtyRecords(explicitWorktreeId)
      return this.getMobileSessionTabsForWorktree(explicitWorktreeId)
    }
    const worktree = await this.resolveWorktreeSelector(worktreeSelector)
    this.hydrateHeadlessMobileSessionTabsFromWorkspaceSession(worktree.id)
    await this.refreshMobileSessionPtyRecords(worktree.id)
    return this.getMobileSessionTabsForWorktree(worktree.id)
  }

  async listAllMobileSessionTabs(): Promise<RuntimeMobileSessionTabsResult[]> {
    this.hydrateHeadlessMobileSessionTabsFromWorkspaceSession()
    await this.refreshMobileSessionPtyRecords()
    return [...this.mobileSessionTabsByWorktree.values()].map((snapshot) =>
      this.toMobileSessionTabsResult(snapshot)
    )
  }

  private hydrateHeadlessMobileSessionTabsFromWorkspaceSession(
    worktreeId?: string,
    options: {
      force?: boolean
      allowAttachedWindow?: boolean
      onlyServeOwnedTerminals?: boolean
    } = {}
  ): Set<string> {
    // Why: report which worktrees were reconciled in place so callers don't
    // reconcile them a second time (see notifyMobileSessionTabsChanged).
    const reconciledWorktreeIds = new Set<string>()
    if (this.getAvailableAuthoritativeWindow() && options.allowAttachedWindow !== true) {
      return reconciledWorktreeIds
    }
    const session = this.store?.getWorkspaceSession?.()
    if (!session) {
      return reconciledWorktreeIds
    }
    const entries =
      worktreeId !== undefined
        ? ([[worktreeId, session.tabsByWorktree[worktreeId] ?? []]] as const)
        : Object.entries(session.tabsByWorktree ?? {})
    for (const [entryWorktreeId, persistedTabs] of entries) {
      const existing = this.mobileSessionTabsByWorktree.get(entryWorktreeId)
      if (
        existing &&
        existing.tabs.length > 0 &&
        options.force !== true &&
        options.onlyServeOwnedTerminals !== true
      ) {
        // Why: terminals are stable/persisted so we normally skip a rebuild, but
        // offscreen browser tabs are live and may have been created/closed since.
        // Reconcile just the browser tabs against the live bridge instead of
        // leaving a stale snapshot that omits a freshly-opened browser tab.
        this.reconcileHeadlessMobileSessionBrowserTabs(entryWorktreeId, existing)
        reconciledWorktreeIds.add(entryWorktreeId)
        continue
      }
      const terminalTabs = this.buildHeadlessMobileSessionTerminalTabs(
        entryWorktreeId,
        persistedTabs
      ).filter(
        (tab) => options.onlyServeOwnedTerminals !== true || this.hasServeOwnedPtyBinding(tab)
      )
      // Why: offscreen browser panes are live-only (no persisted session entry),
      // so include them on every hydrate regardless of the onlyServeOwnedTerminals
      // filter, which is about terminal PTY ownership and never applies to browsers.
      const browserTabs = this.buildHeadlessMobileSessionBrowserTabs(entryWorktreeId)
      const tabs: RuntimeMobileSessionSnapshotTab[] = [...terminalTabs, ...browserTabs]
      if (tabs.length === 0) {
        continue
      }
      const activeTab = this.pickHeadlessActiveTerminalTab(terminalTabs)
      const tabOrder = [
        ...this.collectHeadlessParentTabOrder(terminalTabs),
        ...browserTabs.map((tab) => tab.id)
      ]
      const groupId = this.getHeadlessMobileSessionGroupId(entryWorktreeId)
      const mergedTabs =
        options.onlyServeOwnedTerminals === true && existing
          ? this.mergeMobileSessionSnapshotTabs(existing.tabs, tabs)
          : tabs
      const mergedActiveTab =
        existing?.tabs.find((tab) => tab.id === existing.activeTabId) ??
        activeTab ??
        mergedTabs[0] ??
        null
      const mergedTerminalTabs = mergedTabs.filter(
        (tab): tab is RuntimeMobileSessionTerminalTab => tab.type === 'terminal'
      )
      const mergedBrowserOrder = mergedTabs
        .filter((tab): tab is RuntimeMobileSessionBrowserTab => tab.type === 'browser')
        .map((tab) => tab.id)
      // Why: a persisted multi-group split must be restored on cold rebuild, or
      // the headless serve coalesces the user's group layout back into one group
      // (the persisted tabGroups/tabGroupLayouts would otherwise be write-only).
      const persistedGroups = session.tabGroups?.[entryWorktreeId]
      const persistedLayout = session.tabGroupLayouts?.[entryWorktreeId]
      const hasPersistedSplit =
        options.onlyServeOwnedTerminals !== true &&
        persistedGroups !== undefined &&
        persistedGroups.length > 1
      const activeTopLevelId = mergedActiveTab
        ? mergedActiveTab.type === 'terminal'
          ? mergedActiveTab.parentTabId
          : mergedActiveTab.id
        : null
      this.mobileSessionTabsByWorktree.set(entryWorktreeId, {
        worktree: existing?.worktree ?? entryWorktreeId,
        publicationEpoch: `headless-hydrated:${Date.now().toString(36)}`,
        snapshotVersion: (existing?.snapshotVersion ?? 0) + 1,
        activeGroupId: existing?.activeGroupId ?? groupId,
        activeTabId: mergedActiveTab?.id ?? null,
        activeTabType: mergedActiveTab?.type ?? null,
        tabGroups: hasPersistedSplit
          ? this.appendBrowserTabOrder(
              this.distributeHeadlessTabsAcrossGroups(
                persistedGroups.map((group) => ({
                  id: group.id,
                  activeTabId: group.activeTabId,
                  tabOrder: [...group.tabOrder],
                  ...(group.recentTabIds ? { recentTabIds: [...group.recentTabIds] } : {})
                })),
                this.collectHeadlessParentTabOrder(mergedTerminalTabs),
                activeTopLevelId
              ),
              mergedBrowserOrder,
              undefined,
              // Why: distribute drops browser ids (terminal-only), so carry each
              // browser's persisted group forward instead of coalescing left.
              this.collectBrowserGroupAssignment(persistedGroups, mergedBrowserOrder)
            )
          : options.onlyServeOwnedTerminals === true && existing?.tabGroups
            ? this.appendBrowserTabOrder(
                this.mergeMobileSessionTabGroups(
                  entryWorktreeId,
                  existing.tabGroups,
                  mergedTerminalTabs,
                  mergedActiveTab?.type === 'terminal' ? mergedActiveTab : null
                ),
                mergedBrowserOrder
              )
            : [
                {
                  id: groupId,
                  activeTabId: mergedActiveTab?.id
                    ? (activeTab?.parentTabId ?? mergedActiveTab.id)
                    : (tabOrder[0] ?? null),
                  tabOrder
                }
              ],
        ...(hasPersistedSplit && persistedLayout ? { tabGroupLayout: persistedLayout } : {}),
        tabs: mergedTabs
      })
    }
    return reconciledWorktreeIds
  }

  // Why: keep an existing snapshot's browser tabs in sync with the live bridge
  // without rebuilding stable terminal state. Replaces browser entries with the
  // current live set and rewrites the browser portion of the primary group order.
  private reconcileHeadlessMobileSessionBrowserTabs(
    worktreeId: string,
    existing: RuntimeMobileSessionTabsSnapshot
  ): void {
    if (!this.offscreenBrowserBackend) {
      return
    }
    const liveBrowserTabs = this.buildHeadlessMobileSessionBrowserTabs(worktreeId)
    const liveIds = liveBrowserTabs.map((tab) => tab.id)
    const existingBrowserTabs = existing.tabs.filter(
      (tab): tab is RuntimeMobileSessionBrowserTab => tab.type === 'browser'
    )
    const existingBrowserIds = existingBrowserTabs.map((tab) => tab.id)
    if (this.headlessBrowserTabsUnchanged(liveBrowserTabs, existingBrowserTabs)) {
      return
    }
    const nonBrowserTabs = existing.tabs.filter((tab) => tab.type !== 'browser')
    const nextTabs: RuntimeMobileSessionSnapshotTab[] = [...nonBrowserTabs, ...liveBrowserTabs]
    const liveIdSet = new Set(liveIds)
    const tabGroups = this.appendBrowserTabOrder(
      (existing.tabGroups ?? []).map((group) => ({
        ...group,
        // Drop closed browser ids; appendBrowserTabOrder re-adds the live ones.
        tabOrder: group.tabOrder.filter(
          (id) => liveIdSet.has(id) || !existingBrowserIds.includes(id)
        )
      })),
      liveIds
    )
    const activeStillPresent = nextTabs.some((tab) => tab.id === existing.activeTabId)
    const active = activeStillPresent
      ? null
      : (nextTabs.find((tab) => tab.isActive) ?? nextTabs[0] ?? null)
    this.mobileSessionTabsByWorktree.set(worktreeId, {
      ...existing,
      publicationEpoch: `headless-hydrated:${Date.now().toString(36)}`,
      snapshotVersion: existing.snapshotVersion + 1,
      ...(activeStillPresent
        ? {}
        : { activeTabId: active?.id ?? null, activeTabType: active?.type ?? null }),
      tabGroups,
      tabs: nextTabs
    })
  }

  // Why: browser session tabs have no parentTabId so the terminal-only group
  // builder drops them from tabOrder; this re-adds their ids to a group.
  // Browser tabs are live-only (no persisted session entry), but their GROUP
  // membership must still survive snapshot rebuilds like terminals'. The
  // passed-in groups already encode each browser's group (carried from the prior
  // snapshot / persisted tabGroups), so keep each existing browser id where it
  // is; only a genuinely-new browser id goes to its create-target group (when
  // that group exists) and otherwise to the first group. Previously every
  // browser was force-pushed into group[0], so opening a browser in the right
  // split group always snapped it back to the left on the next rebuild.
  private appendBrowserTabOrder(
    groups: readonly RuntimeMobileSessionTabGroup[],
    browserTabIds: readonly string[],
    newTabAssignment?: { tabId: string; groupId: string },
    // browserPageId -> groupId from the prior/persisted groups. The terminal
    // distributor rebuilds tabOrder from terminal ids only and drops browser
    // ids, so this carries each browser's group across rebuilds.
    priorGroupByBrowserId?: ReadonlyMap<string, string>
  ): RuntimeMobileSessionTabGroup[] {
    if (browserTabIds.length === 0) {
      return [...groups]
    }
    const next = groups.map((group) => ({ ...group, tabOrder: [...group.tabOrder] }))
    if (next.length === 0) {
      return next
    }
    const groupById = new Map(next.map((group) => [group.id, group]))
    const ownerGroupByTabId = new Map<string, RuntimeMobileSessionTabGroup>()
    for (const group of next) {
      for (const id of group.tabOrder) {
        ownerGroupByTabId.set(id, group)
      }
    }
    for (const id of browserTabIds) {
      if (ownerGroupByTabId.has(id)) {
        continue
      }
      const priorGroupId = priorGroupByBrowserId?.get(id)
      const targetGroup =
        (newTabAssignment?.tabId === id ? groupById.get(newTabAssignment.groupId) : undefined) ??
        (priorGroupId ? groupById.get(priorGroupId) : undefined) ??
        next[0]!
      targetGroup.tabOrder.push(id)
    }
    return next
  }

  // browserPageId -> groupId from a set of groups (the persisted/prior layout),
  // so a browser stays in its group across rebuilds that drop browser ids.
  private collectBrowserGroupAssignment(
    groups: readonly RuntimeMobileSessionTabGroup[] | undefined,
    browserTabIds: readonly string[]
  ): Map<string, string> {
    const browserIdSet = new Set(browserTabIds)
    const assignment = new Map<string, string>()
    for (const group of groups ?? []) {
      for (const id of group.tabOrder) {
        if (browserIdSet.has(id)) {
          assignment.set(id, group.id)
        }
      }
    }
    return assignment
  }

  private isServeOwnedPtyId(ptyId: string | null | undefined): boolean {
    return typeof ptyId === 'string' && ptyId.startsWith('serve-')
  }

  private hasServeOwnedPtyBinding(tab: RuntimeMobileSessionTerminalTab): boolean {
    if (this.isServeOwnedPtyId(tab.ptyId)) {
      return true
    }
    return Object.values(tab.parentLayout?.ptyIdsByLeafId ?? {}).some((ptyId) =>
      this.isServeOwnedPtyId(ptyId)
    )
  }

  // Why: serve-* (local serve) and ssh:<conn>@@<relay> (SSH relay) ids are minted
  // ONLY for runtime-owned terminals and are preserved/re-hydrated, so tear them
  // down even if the renderer adopted a view (else they resurrect). The daemon
  // session form <worktreeId>@@<shortUuid> is deliberately NOT here: the daemon
  // mints it for ordinary renderer-owned local terminals too, so id shape can't
  // classify ownership for that form — renderer-graph membership does (below).
  private isServeOrSshOwnedPtyId(ptyId: string | null | undefined): boolean {
    return (
      this.isServeOwnedPtyId(ptyId) ||
      (typeof ptyId === 'string' && parseAppSshPtyId(ptyId) !== null)
    )
  }

  private hasServeOrSshOwnedBinding(tab: RuntimeMobileSessionTerminalTab): boolean {
    if (this.isServeOrSshOwnedPtyId(tab.ptyId)) {
      return true
    }
    return Object.values(tab.parentLayout?.ptyIdsByLeafId ?? {}).some((ptyId) =>
      this.isServeOrSshOwnedPtyId(ptyId)
    )
  }

  // Why: a tab needs authoritative runtime teardown (kill + de-persist + prune)
  // only when the renderer can't durably tear it down: either it's serve/SSH
  // (preserved + re-hydrated, would resurrect) or the renderer graph never
  // published it (a leaked/unadopted shell — incl. daemon-session `@@` tabs the
  // host materialized but the renderer never showed). A tab the renderer graph
  // DOES list — including an ordinary daemon-backed local terminal or a pending
  // tab whose PTY hasn't bound — is renderer-owned: delegate, do not de-persist.
  private isRuntimeOwnedHeadlessMobileTab(
    worktreeId: string,
    tab: RuntimeMobileSessionTerminalTab
  ): boolean {
    if (this.hasServeOrSshOwnedBinding(tab)) {
      return true
    }
    const pty = this.findPtyForMobileTerminalTab(worktreeId, tab)
    if (pty && this.isServeOrSshOwnedPtyId(pty.ptyId)) {
      return true
    }
    return !this.terminalSessions.hasGraphTab(tab.parentTabId)
  }

  private mergeMobileSessionSnapshotTabs(
    baseTabs: readonly RuntimeMobileSessionSnapshotTab[],
    extraTabs: readonly RuntimeMobileSessionSnapshotTab[]
  ): RuntimeMobileSessionSnapshotTab[] {
    const seenIds = new Set<string>()
    const merged: RuntimeMobileSessionSnapshotTab[] = []
    const add = (tab: RuntimeMobileSessionSnapshotTab): void => {
      const ids = this.getMobileSessionSnapshotTabIdentityKeys(tab)
      if (ids.some((id) => seenIds.has(id))) {
        return
      }
      for (const id of ids) {
        seenIds.add(id)
      }
      merged.push(tab)
    }
    for (const tab of baseTabs) {
      add(tab)
    }
    for (const tab of extraTabs) {
      add(tab)
    }
    return merged
  }

  private getMobileSessionSnapshotTabIdentityKeys(tab: RuntimeMobileSessionSnapshotTab): string[] {
    if (tab.type === 'terminal') {
      // Why: split terminal leaves share one parent tab; merge dedup must stay
      // leaf-scoped or preserved siblings collapse into a single surface.
      const keys = [tab.id, `${tab.parentTabId}::${tab.leafId}`]
      if (typeof tab.ptyId === 'string' && tab.ptyId.length > 0) {
        // Why: renderer and headless sources can derive different leafIds for the same
        // terminal; real PTYs collapse those duplicates without merging pending splits.
        keys.push(`${tab.parentTabId}::pty:${tab.ptyId}`)
      }
      return keys
    }
    if (tab.type === 'browser') {
      return [tab.id, tab.browserWorkspaceId]
    }
    return [tab.id]
  }

  private mergeMobileSessionTabGroups(
    worktreeId: string,
    groups: readonly RuntimeMobileSessionTabGroup[],
    terminalTabs: readonly RuntimeMobileSessionTerminalTab[],
    activeTab: RuntimeMobileSessionTerminalTab | null
  ): RuntimeMobileSessionTabGroup[] {
    const parentTabOrder = this.collectHeadlessParentTabOrder(terminalTabs)
    if (parentTabOrder.length === 0) {
      return [...groups]
    }
    const targetGroupId = groups[0]?.id ?? this.getHeadlessMobileSessionGroupId(worktreeId)
    const nextGroups =
      groups.length > 0
        ? groups.map((group) => ({ ...group, tabOrder: [...group.tabOrder] }))
        : [
            {
              id: targetGroupId,
              activeTabId: null,
              tabOrder: []
            }
          ]
    // Why: keep each tab in the group that already owns it (a multi-group split
    // must survive the merge), drop tabs no longer present, and route only
    // genuinely-new tabs into the active group — never funnel everything into
    // group[0], which duplicated/coalesced tabs that lived in other groups.
    const ownerGroupId = new Map<string, string>()
    for (const group of nextGroups) {
      for (const tabId of group.tabOrder) {
        ownerGroupId.set(tabId, group.id)
      }
    }
    const liveTabIds = new Set(parentTabOrder)
    const activeParentId = activeTab?.parentTabId ?? null
    const activeGroupId =
      (activeParentId ? ownerGroupId.get(activeParentId) : undefined) ?? nextGroups[0]!.id
    const retainedOrder = new Map<string, string[]>(nextGroups.map((group) => [group.id, []]))
    for (const tabId of parentTabOrder) {
      const groupId = ownerGroupId.get(tabId) ?? activeGroupId
      retainedOrder.get(groupId)?.push(tabId)
    }
    return nextGroups
      .map((group) => {
        const tabOrder = retainedOrder.get(group.id) ?? []
        const keptActive =
          group.activeTabId &&
          tabOrder.includes(group.activeTabId) &&
          liveTabIds.has(group.activeTabId)
            ? group.activeTabId
            : null
        return {
          ...group,
          tabOrder,
          activeTabId:
            activeParentId && tabOrder.includes(activeParentId)
              ? activeParentId
              : (keptActive ?? tabOrder[0] ?? null)
        }
      })
      .filter((group) => group.tabOrder.length > 0)
  }

  /**
   * Publishes a PTY-backed terminal tab snapshot to the synced mobile session,
   * normalizing Pi-compatible titles based on launch or foreground ownership.
   */
  private publishPtyBackedMobileSessionTerminal(
    worktreeId: string,
    pty: RuntimePtyWorktreeRecord,
    args: {
      tabId: string
      leafId: string
      title: string | null
      activate: boolean
      selectIfNoActiveTab?: boolean
      startupCwd?: string
      viewMode?: 'terminal' | 'chat'
      split?: { splitFromLeafId: string; direction: 'horizontal' | 'vertical' }
    }
  ): void {
    const existing = this.mobileSessionTabsByWorktree.get(worktreeId)
    const ownerAgent = pty.launchAgent ?? pty.foregroundAgent
    const title = normalizeCompatibleAgentTitleForOwner(
      args.title ?? getLatestPtyTitle(pty) ?? 'Terminal',
      ownerAgent
    )
    const existingTab = existing?.tabs.find(
      (candidate): candidate is RuntimeMobileSessionTerminalTab =>
        candidate.type === 'terminal' &&
        candidate.parentTabId === args.tabId &&
        candidate.leafId === args.leafId
    )
    // Why: a split inserts into the parent tab's layout, which lives on the
    // sibling surface, not this new leaf's (empty) existing surface.
    const baseLayout = args.split
      ? (existing?.tabs.find(
          (candidate): candidate is RuntimeMobileSessionTerminalTab =>
            candidate.type === 'terminal' &&
            candidate.parentTabId === args.tabId &&
            candidate.leafId === args.split!.splitFromLeafId
        )?.parentLayout ?? existingTab?.parentLayout)
      : existingTab?.parentLayout
    const parentLayout = this.buildMaterializedHeadlessParentLayout(
      args.leafId,
      pty.ptyId,
      baseLayout,
      args.split
    )
    // Why: a main-side PTY rescue or split publication must not erase the
    // host's explicit tab mode before the renderer graph catches up.
    const viewMode =
      args.viewMode ??
      existingTab?.viewMode ??
      existing?.tabs.find(
        (candidate): candidate is RuntimeMobileSessionTerminalTab =>
          candidate.type === 'terminal' &&
          candidate.parentTabId === args.tabId &&
          candidate.viewMode !== undefined
      )?.viewMode
    const tab: RuntimeMobileSessionTerminalTab = {
      type: 'terminal',
      id: `${args.tabId}::${args.leafId}`,
      parentTabId: args.tabId,
      leafId: args.leafId,
      ptyId: pty.ptyId,
      title,
      ...(pty.launchAgent ? { launchAgent: pty.launchAgent } : {}),
      ...(args.startupCwd ? { startupCwd: args.startupCwd } : {}),
      ...(viewMode ? { viewMode } : {}),
      parentLayout,
      isActive:
        args.activate || (args.selectIfNoActiveTab !== false && existing?.activeTabId == null)
    }
    const existingTabs = (existing?.tabs ?? []).filter(
      (candidate) =>
        !(
          candidate.type === 'terminal' &&
          candidate.parentTabId === args.tabId &&
          candidate.leafId === args.leafId
        )
    )
    const tabs = this.mergeMobileSessionSnapshotTabs(
      existingTabs.map((candidate) => ({
        ...candidate,
        // Why: the client picks one sibling's parentLayout to render the whole
        // tab; a split must update every sibling surface to the new tree, or a
        // stale single-leaf sibling makes the client fall back to a default
        // direction ("Split Right" renders as down).
        ...(args.split && candidate.type === 'terminal' && candidate.parentTabId === args.tabId
          ? { parentLayout }
          : {}),
        isActive: tab.isActive ? false : candidate.isActive
      })),
      [tab]
    )
    const activeTab =
      (tab.isActive ? tab : tabs.find((candidate) => candidate.id === existing?.activeTabId)) ??
      tabs.find((candidate) => candidate.isActive) ??
      (args.selectIfNoActiveTab !== false ? tabs[0] : null) ??
      null
    const terminalTabs = tabs.filter(
      (candidate): candidate is RuntimeMobileSessionTerminalTab => candidate.type === 'terminal'
    )
    const next: RuntimeMobileSessionTabsSnapshot = {
      worktree: worktreeId,
      publicationEpoch:
        existing?.publicationEpoch ?? `headless:pty-backed:${Date.now().toString(36)}`,
      snapshotVersion: (existing?.snapshotVersion ?? 0) + 1,
      activeGroupId: existing?.activeGroupId ?? this.getHeadlessMobileSessionGroupId(worktreeId),
      activeTabId: activeTab?.id ?? null,
      activeTabType: activeTab?.type ?? null,
      tabGroups: this.mergeMobileSessionTabGroups(
        worktreeId,
        existing?.tabGroups ?? [],
        terminalTabs,
        activeTab?.type === 'terminal' ? activeTab : null
      ),
      ...(existing?.tabGroupLayout ? { tabGroupLayout: existing.tabGroupLayout } : {}),
      tabs
    }
    this.mobileSessionTabsByWorktree.set(worktreeId, next)
    this.notifyMobileSessionTabsChanged(worktreeId)
  }

  private touchMobileSessionSnapshotsForPty(
    ptyId: string,
    options: { immediate?: boolean } = {}
  ): void {
    for (const [worktreeId, snapshot] of this.mobileSessionTabsByWorktree) {
      const hasPtyBackedTab = snapshot.tabs.some(
        (tab) =>
          tab.type === 'terminal' &&
          (tab.ptyId === ptyId || tab.parentLayout?.ptyIdsByLeafId?.[tab.leafId] === ptyId)
      )
      if (!hasPtyBackedTab) {
        continue
      }
      this.mobileSessionTabsByWorktree.set(worktreeId, {
        ...snapshot,
        snapshotVersion: snapshot.snapshotVersion + 1
      })
      if (options.immediate) {
        // Why: readiness/lifecycle changes are structural and must not wait
        // behind the title/status coalescing window.
        this.notifyMobileSessionTabsChanged(worktreeId)
      } else {
        // Why: title/status flips several times a second under spinner-in-title
        // agents. Coalesce the emit instead of fanning out every version.
        this.mobileSessionTabsNotifyCoalescer.schedule(worktreeId)
      }
    }
  }

  private buildHeadlessMobileSessionTerminalTabs(
    worktreeId: string,
    persistedTabs: readonly TerminalTab[]
  ): RuntimeMobileSessionTerminalTab[] {
    const session = this.store?.getWorkspaceSession?.()
    if (!session) {
      return []
    }
    return [...persistedTabs]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt)
      .flatMap((tab, index) => {
        const layout = session.terminalLayoutsByTabId?.[tab.id]
        const leafIds = this.collectPersistedTerminalLeafIds(layout)
        if (leafIds.length === 0) {
          leafIds.push(this.deriveHeadlessLegacyTerminalLeafId(tab.id))
        }
        return leafIds.map((leafId) => {
          const ptyId =
            layout?.ptyIdsByLeafId?.[leafId] ?? (leafIds.length === 1 ? tab.ptyId : null)
          const title =
            tab.customTitle?.trim() ||
            tab.generatedTitle?.trim() ||
            tab.title?.trim() ||
            tab.defaultTitle?.trim() ||
            `Terminal ${index + 1}`
          return {
            type: 'terminal' as const,
            id: `${tab.id}::${leafId}`,
            parentTabId: tab.id,
            leafId,
            title,
            ...(ptyId ? { ptyId } : {}),
            ...(tab.startupCwd ? { startupCwd: tab.startupCwd } : {}),
            ...(tab.launchAgent ? { launchAgent: tab.launchAgent } : {}),
            ...(layout ? { parentLayout: this.cloneTerminalLayoutSnapshot(layout) } : {}),
            ...(tab.color != null ? { color: tab.color } : {}),
            ...(tab.isPinned ? { isPinned: true } : {}),
            ...(tab.viewMode ? { viewMode: tab.viewMode } : {}),
            isActive: this.isPersistedTerminalLeafActive(worktreeId, tab.id, leafId, layout)
          }
        })
      })
  }

  // Why: headless serve backs browser panes with offscreen WebContents that live
  // only in the BrowserManager, never in a renderer graph. Without surfacing them
  // as session tabs, a session.tabs snapshot (e.g. on terminal open) prunes the
  // paired browser tab and closing it fails with tab_not_found. Synthesize browser
  // session tabs from the live bridge so they are first-class alongside terminals.
  private buildHeadlessMobileSessionBrowserTabs(
    worktreeId: string
  ): RuntimeMobileSessionBrowserTab[] {
    if (!this.offscreenBrowserBackend || !this.agentBrowserBridge?.tabList) {
      return []
    }
    return this.agentBrowserBridge.tabList(worktreeId).tabs.map((tab) => {
      const persistedProps = this.getPersistedUnifiedSessionTabProps(worktreeId, tab.browserPageId)
      return {
        type: 'browser' as const,
        // Why: an offscreen page has no separate workspace identity, so the page id
        // is its own workspace id (matches the server's browserWorkspaceId fallback).
        id: tab.browserPageId,
        title: tab.title || tab.url || 'Browser',
        browserWorkspaceId: tab.browserPageId,
        browserPageId: tab.browserPageId,
        url: tab.url || 'about:blank',
        loading: false,
        canGoBack: false,
        canGoForward: false,
        loadError: tab.loadError ?? undefined,
        certificateFailure: tab.certificateFailure ?? undefined,
        ...(persistedProps ? { color: persistedProps.color } : {}),
        ...(persistedProps ? { isPinned: persistedProps.isPinned === true } : {}),
        isActive: tab.active === true
      }
    })
  }

  // Why: change detection for headless browser tabs. Compares the fields that
  // actually vary (a JSON.stringify equality was order-sensitive and silently
  // dropped `undefined` keys, so it only worked while both sides shared one
  // construction path).
  private headlessBrowserTabsUnchanged(
    live: RuntimeMobileSessionBrowserTab[],
    existing: RuntimeMobileSessionBrowserTab[]
  ): boolean {
    if (live.length !== existing.length) {
      return false
    }
    return live.every((tab, index) => {
      const prev = existing[index]
      return (
        tab.id === prev.id &&
        tab.title === prev.title &&
        tab.url === prev.url &&
        tab.isActive === prev.isActive &&
        (tab.isPinned ?? false) === (prev.isPinned ?? false) &&
        (tab.color ?? null) === (prev.color ?? null) &&
        this.browserLoadErrorsEqual(tab.loadError, prev.loadError) &&
        this.browserCertificateFailuresEqual(tab.certificateFailure, prev.certificateFailure)
      )
    })
  }

  private browserLoadErrorsEqual(
    a: RuntimeMobileSessionBrowserTab['loadError'],
    b: RuntimeMobileSessionBrowserTab['loadError']
  ): boolean {
    const left = a ?? null
    const right = b ?? null
    if (left === right) {
      return true
    }
    if (!left || !right) {
      return false
    }
    return (
      left.code === right.code &&
      left.description === right.description &&
      left.validatedUrl === right.validatedUrl
    )
  }

  private browserCertificateFailuresEqual(
    a: RuntimeMobileSessionBrowserTab['certificateFailure'],
    b: RuntimeMobileSessionBrowserTab['certificateFailure']
  ): boolean {
    const left = a ?? null
    const right = b ?? null
    if (left === right) {
      return true
    }
    if (!left || !right) {
      return false
    }
    return (
      left.challengeId === right.challengeId &&
      left.browserPageId === right.browserPageId &&
      left.errorCode === right.errorCode &&
      left.error === right.error &&
      left.origin === right.origin &&
      left.displayHost === right.displayHost &&
      left.canProceed === right.canProceed &&
      left.observedAt === right.observedAt
    )
  }

  private getPersistedUnifiedSessionTabProps(
    worktreeId: string,
    tabId: string
  ): Pick<Tab, 'color' | 'isPinned'> | null {
    const tab =
      this.store
        ?.getWorkspaceSession?.()
        ?.unifiedTabs?.[worktreeId]?.find(
          (candidate) => candidate.id === tabId || candidate.entityId === tabId
        ) ?? null
    return tab ? { color: tab.color, isPinned: tab.isPinned } : null
  }

  private collectPersistedTerminalLeafIds(layout: TerminalLayoutSnapshot | undefined): string[] {
    if (!layout) {
      return []
    }
    const leafIds = new Set<string>()
    const visit = (node: TerminalLayoutSnapshot['root']): void => {
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
    visit(layout.root)
    if (layout.activeLeafId && isTerminalLeafId(layout.activeLeafId)) {
      leafIds.add(layout.activeLeafId)
    }
    for (const leafId of Object.keys(layout.ptyIdsByLeafId ?? {})) {
      if (isTerminalLeafId(leafId)) {
        leafIds.add(leafId)
      }
    }
    return [...leafIds]
  }

  private deriveHeadlessLegacyTerminalLeafId(tabId: string): string {
    const hash = createHash('sha256').update(`headless-terminal-leaf:${tabId}`).digest('hex')
    const variant = ((Number.parseInt(hash.slice(16, 17), 16) & 0x3) | 0x8).toString(16)
    const leafId = [
      hash.slice(0, 8),
      hash.slice(8, 12),
      `4${hash.slice(13, 16)}`,
      `${variant}${hash.slice(17, 20)}`,
      hash.slice(20, 32)
    ].join('-')
    if (!isTerminalLeafId(leafId)) {
      return randomUUID()
    }
    return leafId
  }

  private cloneTerminalLayoutSnapshot(layout: TerminalLayoutSnapshot): TerminalLayoutSnapshot {
    const cloned: TerminalLayoutSnapshot = {
      root: layout.root,
      activeLeafId: layout.activeLeafId,
      expandedLeafId: layout.expandedLeafId
    }
    if (layout.ptyIdsByLeafId) {
      cloned.ptyIdsByLeafId = { ...layout.ptyIdsByLeafId }
    }
    if (layout.buffersByLeafId) {
      cloned.buffersByLeafId = { ...layout.buffersByLeafId }
    }
    if (layout.scrollbackRefsByLeafId) {
      cloned.scrollbackRefsByLeafId = { ...layout.scrollbackRefsByLeafId }
    }
    if (layout.titlesByLeafId) {
      cloned.titlesByLeafId = { ...layout.titlesByLeafId }
    }
    return cloned
  }

  private isPersistedTerminalLeafActive(
    worktreeId: string,
    tabId: string,
    leafId: string,
    layout: TerminalLayoutSnapshot | undefined
  ): boolean {
    const session = this.store?.getWorkspaceSession?.()
    const activeTabId = session?.activeTabIdByWorktree?.[worktreeId] ?? session?.activeTabId
    return activeTabId === tabId && (!layout?.activeLeafId || layout.activeLeafId === leafId)
  }

  private pickHeadlessActiveTerminalTab(
    tabs: readonly RuntimeMobileSessionTerminalTab[]
  ): RuntimeMobileSessionTerminalTab | null {
    return tabs.find((tab) => tab.isActive) ?? tabs.find((tab) => tab.parentTabId) ?? null
  }

  private collectHeadlessParentTabOrder(
    tabs: readonly RuntimeMobileSessionTerminalTab[]
  ): string[] {
    const order: string[] = []
    const seen = new Set<string>()
    for (const tab of tabs) {
      if (!seen.has(tab.parentTabId)) {
        seen.add(tab.parentTabId)
        order.push(tab.parentTabId)
      }
    }
    return order
  }

  // Why: the group tab order must follow actual creation/insertion order across
  // both terminals and browsers, not list terminals first. A terminal's top-level
  // id is its parentTabId (split leaves share one); a browser's is its own id.
  private collectHeadlessTopLevelTabOrder(
    tabs: readonly RuntimeMobileSessionSnapshotTab[]
  ): string[] {
    const order: string[] = []
    const seen = new Set<string>()
    for (const tab of tabs) {
      const topLevelId = tab.type === 'terminal' ? tab.parentTabId : tab.id
      if (!seen.has(topLevelId)) {
        seen.add(topLevelId)
        order.push(topLevelId)
      }
    }
    return order
  }

  private getHeadlessMobileSessionGroupId(worktreeId: string): string {
    return `headless-terminals:${worktreeId}`
  }

  private buildHeadlessMobileSessionTabGroups(
    worktreeId: string,
    tabs: readonly RuntimeMobileSessionSnapshotTab[],
    activeTab: RuntimeMobileSessionSnapshotTab | null,
    existingGroups?: readonly RuntimeMobileSessionTabGroup[],
    // Why: a new tab created via a specific group's "+" must land in THAT group,
    // not the active one — otherwise every "+" in a split funnels to one group.
    newTabAssignment?: { tabId: string; groupId: string }
  ): RuntimeMobileSessionTabGroup[] {
    // Why: order across terminals and browsers in their actual array order so a
    // tab opened after a browser tab lands to its right, not regrouped before it.
    const tabOrder = this.collectHeadlessTopLevelTabOrder(tabs)
    const topLevelOf = (tab: RuntimeMobileSessionSnapshotTab): string =>
      tab.type === 'terminal' ? tab.parentTabId : tab.id
    const activeTopLevelId =
      (activeTab ? topLevelOf(activeTab) : null) ??
      existingGroups?.[0]?.activeTabId ??
      (() => {
        const active = tabs.find((tab) => tab.isActive)
        return active ? topLevelOf(active) : null
      })() ??
      tabOrder[0] ??
      null

    // Why: when the user has split tabs into multiple groups, preserve that
    // assignment across rebuilds instead of coalescing back to one group.
    if (existingGroups && existingGroups.length > 1) {
      return this.distributeHeadlessTabsAcrossGroups(
        existingGroups,
        tabOrder,
        activeTopLevelId,
        newTabAssignment
      )
    }

    const groupId = existingGroups?.[0]?.id ?? this.getHeadlessMobileSessionGroupId(worktreeId)
    return [
      {
        id: groupId,
        activeTabId:
          activeTopLevelId && tabOrder.includes(activeTopLevelId)
            ? activeTopLevelId
            : (tabOrder[0] ?? null),
        tabOrder
      }
    ]
  }

  // Distribute live top-level tabs into the existing multi-group structure,
  // keeping each tab in its group; tabs new since the last snapshot join the
  // active group. Emptied groups are dropped so a closed split collapses.
  private distributeHeadlessTabsAcrossGroups(
    existingGroups: readonly RuntimeMobileSessionTabGroup[],
    tabOrder: readonly string[],
    activeTopLevelId: string | null,
    newTabAssignment?: { tabId: string; groupId: string }
  ): RuntimeMobileSessionTabGroup[] {
    const groupIdByTabId = new Map<string, string>()
    for (const group of existingGroups) {
      for (const tabId of group.tabOrder) {
        groupIdByTabId.set(tabId, group.id)
      }
    }
    // Why: route a freshly-created tab to the group its "+" was clicked in,
    // when that group still exists; otherwise fall through to the active group.
    const hasTargetGroup =
      newTabAssignment !== undefined &&
      existingGroups.some((group) => group.id === newTabAssignment.groupId)
    if (hasTargetGroup) {
      groupIdByTabId.set(newTabAssignment!.tabId, newTabAssignment!.groupId)
    }
    const activeGroupId =
      (activeTopLevelId ? groupIdByTabId.get(activeTopLevelId) : undefined) ?? existingGroups[0]!.id
    const orderByGroup = new Map<string, string[]>(existingGroups.map((group) => [group.id, []]))
    for (const tabId of tabOrder) {
      const groupId = groupIdByTabId.get(tabId) ?? activeGroupId
      orderByGroup.get(groupId)?.push(tabId)
    }
    return existingGroups
      .map((group) => {
        const nextOrder = orderByGroup.get(group.id) ?? []
        return {
          ...group,
          tabOrder: nextOrder,
          activeTabId:
            activeTopLevelId && nextOrder.includes(activeTopLevelId)
              ? activeTopLevelId
              : group.activeTabId && nextOrder.includes(group.activeTabId)
                ? group.activeTabId
                : (nextOrder[0] ?? null)
        }
      })
      .filter((group) => group.tabOrder.length > 0)
  }

  private buildMaterializedHeadlessParentLayout(
    leafId: string,
    ptyId: string,
    existingLayout: TerminalLayoutSnapshot | undefined,
    split?: { splitFromLeafId: string; direction: 'horizontal' | 'vertical' }
  ): TerminalLayoutSnapshot {
    if (!existingLayout) {
      return {
        root: { type: 'leaf', leafId },
        activeLeafId: leafId,
        expandedLeafId: null,
        ptyIdsByLeafId: { [leafId]: ptyId }
      }
    }
    // Why: a split must insert the new leaf into the live layout tree with the
    // requested direction, or the published snapshot keeps the old single-leaf
    // root and the split renders with a fallback direction ("Split Right" lands
    // as a top/bottom split). Reuse the persisted-split builder for parity.
    if (split) {
      return buildHeadlessTerminalSplitLayout(this.cloneTerminalLayoutSnapshot(existingLayout), {
        leafId,
        ptyId,
        splitFromLeafId: split.splitFromLeafId,
        direction: split.direction
      })
    }
    return {
      ...this.cloneTerminalLayoutSnapshot(existingLayout),
      ptyIdsByLeafId: {
        ...existingLayout.ptyIdsByLeafId,
        [leafId]: ptyId
      }
    }
  }

  private removePersistedHeadlessTerminalTab(worktreeId: string, parentTabId: string): string[] {
    const session = this.store?.getWorkspaceSession?.()
    if (!session || !this.store?.setWorkspaceSession) {
      throw new Error('workspace_session_unavailable')
    }
    const result = closeTerminalTabInWorkspaceSession(session, worktreeId, parentTabId)
    if (result.pinned) {
      throw new Error('terminal_tab_pinned')
    }
    if (!result.closed) {
      throw new Error('tab_not_found')
    }
    this.store.setWorkspaceSession(result.session)
    return result.ptyIdsToKill
  }

  private persistHeadlessTerminalTabOrder(worktreeId: string, tabOrder: readonly string[]): void {
    const session = this.store?.getWorkspaceSession?.()
    if (!session || !this.store?.setWorkspaceSession) {
      return
    }
    const orderIndexByTabId = new Map(tabOrder.map((tabId, index) => [tabId, index]))
    const tabs = session.tabsByWorktree[worktreeId] ?? []
    const reordered = [...tabs]
      .sort((a, b) => {
        const aIndex = orderIndexByTabId.get(a.id) ?? Number.MAX_SAFE_INTEGER
        const bIndex = orderIndexByTabId.get(b.id) ?? Number.MAX_SAFE_INTEGER
        return aIndex - bIndex || a.sortOrder - b.sortOrder || a.createdAt - b.createdAt
      })
      .map((tab, index) => ({
        ...tab,
        sortOrder: index
      }))
    this.store.setWorkspaceSession({
      ...session,
      tabsByWorktree: {
        ...session.tabsByWorktree,
        [worktreeId]: reordered
      }
    })
  }

  private emitMobileSessionTabsSnapshot(snapshot: RuntimeMobileSessionTabsSnapshot): void {
    if (this.mobileSessionTabListeners.size === 0) {
      return
    }
    const result = this.toMobileSessionTabsResult(snapshot)
    for (const listener of this.mobileSessionTabListeners) {
      listener(result)
    }
  }

  private async refreshMobileSessionPtyRecords(
    targetWorktreeId: string | null = null
  ): Promise<void> {
    if (!this.ptyController?.listProcesses && !this.ptyController?.hasPty) {
      return
    }
    // Why: the floating workspace has explicit PTY identity and no Git/SSH worktree to resolve.
    const isFloatingWorkspace = targetWorktreeId === FLOATING_TERMINAL_WORKTREE_ID
    const resolvedWorktrees = isFloatingWorkspace ? [] : await this.listResolvedWorktrees()
    await this.refreshPtyWorktreeRecordsFromController(
      resolvedWorktrees,
      isFloatingWorkspace ? targetWorktreeId : null
    )
  }

  async activateMobileSessionTab(
    worktreeSelector: string,
    tabId: string,
    leafId?: string,
    opts: { notifyClients?: boolean } = {}
  ): Promise<RuntimeMobileSessionTabsResult> {
    const explicitWorktreeId = this.getValidatedExplicitWorktreeIdSelector(worktreeSelector)
    const worktreeId =
      explicitWorktreeId ?? (await this.resolveWorktreeSelector(worktreeSelector)).id
    this.hydrateHeadlessMobileSessionTabsFromWorkspaceSession(worktreeId)
    await this.refreshMobileSessionPtyRecords(worktreeId)
    const snapshot = this.mobileSessionTabsByWorktree.get(worktreeId)
    const directTab = snapshot?.tabs.find((candidate) => candidate.id === tabId)
    const tab = leafId
      ? ((directTab?.type === 'terminal' && directTab.leafId === leafId ? directTab : undefined) ??
        snapshot?.tabs.find(
          (candidate) =>
            candidate.type === 'terminal' &&
            candidate.parentTabId === tabId &&
            candidate.leafId === leafId
        ))
      : (directTab ??
        snapshot?.tabs.find(
          (candidate) => candidate.type === 'terminal' && candidate.parentTabId === tabId
        ) ??
        snapshot?.tabs.find(
          (candidate) => candidate.type === 'browser' && candidate.browserWorkspaceId === tabId
        ))
    if (!tab) {
      throw new Error('tab_not_found')
    }

    if (tab.type === 'terminal') {
      const publicTab = this.toMobileSessionTabsResult(snapshot!).tabs.find(
        (candidate) => candidate.type === 'terminal' && candidate.id === tab.id
      )
      // Why: serve-created tabs can be visible before any renderer has adopted
      // their tab id, so focusing the renderer would silently no-op.
      // Phone-local activation also needs this path for inactive restored tabs:
      // desktop focus is intentionally suppressed, but the PTY still must exist.
      const shouldMaterializePendingTerminal =
        publicTab?.type === 'terminal' &&
        publicTab.status !== 'ready' &&
        (opts.notifyClients === false ||
          !this.notifier?.focusTerminal ||
          this.shouldMaterializeHeadlessMobileSessionTab(snapshot!, tab))
      if (shouldMaterializePendingTerminal) {
        const sessionId = tab.ptyId ?? tab.parentLayout?.ptyIdsByLeafId?.[tab.leafId] ?? undefined
        const targetGroupId = snapshot?.tabGroups?.find((group) =>
          group.tabOrder.includes(tab.parentTabId)
        )?.id
        // Why: a pending agent tab may exist without its startup command ever
        // having been delivered (the create's renderer stalled, #7587), so a
        // bare materialize would put a plain shell under the agent icon.
        // Re-resolve the launch like the create path; providers skip startup
        // commands when attaching to live sessions, so this cannot double-launch.
        let agentStartup: Awaited<
          ReturnType<YiruRuntimeService['resolveMobileSessionTerminalCommand']>
        > = {}
        if (tab.launchAgent) {
          try {
            const workspace = await this.resolveTerminalWorkspaceLaunchScope(`id:${worktreeId}`)
            agentStartup = await this.resolveMobileSessionTerminalCommand(workspace, {
              agent: tab.launchAgent
            })
          } catch {
            // Why: a disabled or unresolvable agent must not make the tab
            // untappable; fall back to the plain-shell materialize.
          }
        }
        try {
          await this.createHeadlessMobileSessionTerminal(worktreeId, true, undefined, {
            identity: {
              tabId: tab.parentTabId,
              leafId: tab.leafId,
              sessionId
            },
            cwd: tab.startupCwd,
            command: agentStartup.command,
            env: agentStartup.env,
            startupCommandDelivery: agentStartup.startupCommandDelivery,
            launchConfig: agentStartup.launchConfig,
            launchAgent: tab.launchAgent,
            targetGroupId
          })
        } catch (err) {
          if (sessionId && parseAppSshPtyId(sessionId)) {
            // Why: an expired SSH reattach clears durable bindings in the store,
            // but this in-memory headless snapshot can still carry the old id.
            this.hydrateHeadlessMobileSessionTabsFromWorkspaceSession(worktreeId, { force: true })
          }
          throw err
        }
        return this.getMobileSessionTabsForWorktree(worktreeId)
      }
      const activeSibling =
        tab.id === tabId || leafId
          ? null
          : snapshot?.tabs.find(
              (candidate): candidate is RuntimeMobileSessionTerminalTab =>
                candidate.type === 'terminal' &&
                candidate.parentTabId === tab.parentTabId &&
                candidate.isActive
            )
      const targetTab = activeSibling ?? tab
      if (opts.notifyClients === false) {
        this.activateMobileSessionTabForRemoteClient(worktreeId, snapshot!, targetTab)
        return this.getMobileSessionTabsForWorktree(worktreeId)
      }
      if (!this.notifier?.focusTerminal) {
        if (
          !targetTab.isActive &&
          this.shouldPersistHeadlessMobileSessionActivation(snapshot!, targetTab)
        ) {
          this.activateHeadlessMobileSessionTerminalTab(worktreeId, snapshot!, targetTab)
        }
        return this.getMobileSessionTabsForWorktree(worktreeId)
      }
      this.notifier?.focusTerminal(targetTab.parentTabId, worktreeId, targetTab.leafId)
    } else if (tab.type === 'browser') {
      if (opts.notifyClients === false) {
        this.activateMobileSessionTabForRemoteClient(worktreeId, snapshot!, tab)
        return this.getMobileSessionTabsForWorktree(worktreeId)
      }
      // Why: browser mobile tabs are renderer-owned unified tabs; focusing the
      // session tab keeps desktop tab order/group state authoritative.
      this.notifier?.focusEditorTab?.(tab.id, worktreeId)
    } else {
      if (opts.notifyClients === false) {
        this.activateMobileSessionTabForRemoteClient(worktreeId, snapshot!, tab)
        return this.getMobileSessionTabsForWorktree(worktreeId)
      }
      this.notifier?.focusEditorTab?.(tab.id, worktreeId)
    }
    return this.getMobileSessionTabsForWorktree(worktreeId)
  }

  private activateMobileSessionTabForRemoteClient(
    worktreeId: string,
    snapshot: RuntimeMobileSessionTabsSnapshot,
    activeTab: RuntimeMobileSessionSnapshotTab
  ): void {
    // Why: phone tab selection should update the mobile snapshot without
    // asking desktop renderers to focus the phone's background worktree.
    const activeTopLevelId = activeTab.type === 'terminal' ? activeTab.parentTabId : activeTab.id
    const tabs = snapshot.tabs.map((tab) => ({
      ...tab,
      isActive: tab.id === activeTab.id
    }))
    const tabGroups = snapshot.tabGroups?.map((group) =>
      group.tabOrder.includes(activeTopLevelId)
        ? { ...group, activeTabId: activeTopLevelId }
        : group
    )
    const activeGroupId =
      tabGroups?.find((group) => group.tabOrder.includes(activeTopLevelId))?.id ??
      snapshot.activeGroupId
    const nextSnapshot: RuntimeMobileSessionTabsSnapshot = {
      ...snapshot,
      publicationEpoch: `mobile-local:${Date.now().toString(36)}`,
      snapshotVersion: snapshot.snapshotVersion + 1,
      activeGroupId,
      activeTabId: activeTab.id,
      activeTabType: activeTab.type,
      ...(tabGroups ? { tabGroups } : {}),
      tabs
    }
    this.mobileSessionTabsByWorktree.set(worktreeId, nextSnapshot)
    this.emitMobileSessionTabsSnapshot(nextSnapshot)
  }

  private shouldMaterializeHeadlessMobileSessionTab(
    snapshot: RuntimeMobileSessionTabsSnapshot,
    tab: RuntimeMobileSessionTerminalTab
  ): boolean {
    return (
      this.isHeadlessMobileSessionPublication(snapshot.publicationEpoch) ||
      this.hasServeOwnedPtyBinding(tab)
    )
  }

  private shouldPersistHeadlessMobileSessionActivation(
    snapshot: RuntimeMobileSessionTabsSnapshot,
    tab: RuntimeMobileSessionTerminalTab
  ): boolean {
    if (snapshot.publicationEpoch.includes(':headless-merge:')) {
      return false
    }
    const graph = this.terminalSessions.getGraphState()
    if (graph.authoritativeWindowId !== null && graph.graphStatus === 'ready') {
      return false
    }
    return this.shouldMaterializeHeadlessMobileSessionTab(snapshot, tab)
  }

  private activateHeadlessMobileSessionTerminalTab(
    worktreeId: string,
    snapshot: RuntimeMobileSessionTabsSnapshot,
    activeTab: RuntimeMobileSessionTerminalTab
  ): void {
    const tabs = snapshot.tabs.map((candidate) => ({
      ...candidate,
      isActive: candidate.id === activeTab.id
    }))
    const nextSnapshot: RuntimeMobileSessionTabsSnapshot = {
      ...snapshot,
      publicationEpoch: `headless:${Date.now().toString(36)}`,
      snapshotVersion: snapshot.snapshotVersion + 1,
      activeTabId: activeTab.id,
      activeTabType: 'terminal',
      tabGroups: this.buildHeadlessMobileSessionTabGroups(
        worktreeId,
        tabs,
        activeTab,
        snapshot.tabGroups
      ),
      tabs
    }
    this.persistHeadlessTerminalActiveLeaf(worktreeId, activeTab)
    this.mobileSessionTabsByWorktree.set(worktreeId, nextSnapshot)
    this.emitMobileSessionTabsSnapshot(nextSnapshot)
  }

  // Why: a headless split only updated the LIVE session snapshot, never the
  // persisted workspace session layout. So a later snapshot rebuild (e.g. on the
  // next terminal create) re-derived from the stale single-leaf persisted layout
  // and collapsed the split. Persist the new split leaf into the workspace
  // session's terminalLayoutsByTabId so the split survives rebuilds.
  private persistHeadlessTerminalSplit(args: {
    tabId: string
    leafId: string
    ptyId: string
    splitFromLeafId: string
    direction: 'horizontal' | 'vertical'
  }): void {
    const session = this.store?.getWorkspaceSession?.()
    if (!session || !this.store?.setWorkspaceSession) {
      return
    }
    const existing = session.terminalLayoutsByTabId?.[args.tabId]
    const nextLayout = buildHeadlessTerminalSplitLayout(
      existing ? this.cloneTerminalLayoutSnapshot(existing) : undefined,
      args
    )
    this.store.setWorkspaceSession({
      ...session,
      terminalLayoutsByTabId: {
        ...session.terminalLayoutsByTabId,
        [args.tabId]: nextLayout
      }
    })
  }

  private persistHeadlessTerminalActiveLeaf(
    worktreeId: string,
    tab: RuntimeMobileSessionTerminalTab
  ): void {
    const session = this.store?.getWorkspaceSession?.()
    if (!session || !this.store?.setWorkspaceSession) {
      return
    }
    const existingLayout = session.terminalLayoutsByTabId?.[tab.parentTabId]
    const nextLayouts = existingLayout
      ? {
          ...session.terminalLayoutsByTabId,
          [tab.parentTabId]: {
            ...this.cloneTerminalLayoutSnapshot(existingLayout),
            activeLeafId: tab.leafId
          }
        }
      : session.terminalLayoutsByTabId
    this.store.setWorkspaceSession({
      ...session,
      activeTabId: tab.parentTabId,
      activeTabIdByWorktree: {
        ...session.activeTabIdByWorktree,
        [worktreeId]: tab.parentTabId
      },
      terminalLayoutsByTabId: nextLayouts
    })
  }

  async closeMobileSessionTab(worktreeSelector: string, tabId: string): Promise<{ closed: true }> {
    const explicitWorktreeId = this.getValidatedExplicitWorktreeIdSelector(worktreeSelector)
    const worktreeId =
      explicitWorktreeId ?? (await this.resolveWorktreeSelector(worktreeSelector)).id
    this.hydrateHeadlessMobileSessionTabsFromWorkspaceSession(worktreeId)
    await this.refreshMobileSessionPtyRecords()
    const snapshot = this.mobileSessionTabsByWorktree.get(worktreeId)
    const tab =
      snapshot?.tabs.find((candidate) => candidate.id === tabId) ??
      snapshot?.tabs.find(
        (candidate) => candidate.type === 'terminal' && candidate.parentTabId === tabId
      ) ??
      snapshot?.tabs.find(
        (candidate) => candidate.type === 'browser' && candidate.browserWorkspaceId === tabId
      )
    if (!tab) {
      throw new Error('tab_not_found')
    }
    if (tab.type === 'terminal') {
      const parentLeafCount = snapshot!.tabs.filter(
        (candidate) => candidate.type === 'terminal' && candidate.parentTabId === tab.parentTabId
      ).length
      const closingWholeParent = tab.id !== tabId || parentLeafCount <= 1
      // Why: a runtime-owned headless tab is absent from renderer state, so the
      // closeTerminalTab relay below would ack success without killing its PTY,
      // and syncMobileSessionTabs would republish the "closed" tab. Only bypass
      // the relay when no renderer owns the parent: an adopted tab needs the
      // renderer's live pin guard and durable close transaction.
      if (closingWholeParent && !this.terminalSessions.hasGraphTab(tab.parentTabId)) {
        this.closeHeadlessMobileTerminalTab(worktreeId, snapshot!, tab)
        this.notifyRendererOfHeadlessTerminalClose(tab.parentTabId)
        this.store?.flushOrThrow?.()
        return { closed: true }
      }
      if (closingWholeParent && this.notifier?.closeTerminalTab) {
        // Why: whole-tab close is a lifecycle transaction. The renderer reply
        // arrives only after canonical retirement and a forced session flush.
        await this.notifier.closeTerminalTab(tab.parentTabId)
        return { closed: true }
      }
      // Why: notifier implementations without the acknowledged relay may expose
      // only raw pane close. Runtime-owned parents still need de-persist + kill.
      if (closingWholeParent && this.isRuntimeOwnedHeadlessMobileTab(worktreeId, tab)) {
        this.closeHeadlessMobileTerminalTab(worktreeId, snapshot!, tab)
        this.notifyRendererOfHeadlessTerminalClose(tab.parentTabId)
        this.store?.flushOrThrow?.()
        return { closed: true }
      }
      if (!this.notifier?.closeTerminal) {
        this.closeHeadlessMobileTerminalTab(worktreeId, snapshot!, tab)
        this.store?.flushOrThrow?.()
        return { closed: true }
      }
      if (tab.id === tabId) {
        const pty = this.findPtyForMobileTerminalTab(worktreeId, tab)
        if (pty) {
          this.ptyController?.kill(pty.ptyId)
        } else {
          this.notifier?.closeTerminal(tab.parentTabId)
        }
      } else {
        // Why: paired web tab bars represent a split terminal with one local
        // parent tab id. Closing that parent should close the desktop tab, not
        // just whichever leaf happened to be first in the session snapshot.
        this.notifier?.closeTerminal(tab.parentTabId)
      }
    } else if (tab.type === 'browser' && this.offscreenBrowserBackend) {
      // Why: headless browser tabs are offscreen WebContents with no renderer to
      // route closeSessionTab to. Close the page directly and drop it from the
      // snapshot so paired clients stop showing it.
      await this.closeHeadlessMobileBrowserTab(worktreeId, snapshot!, tab)
    } else {
      this.notifier?.closeSessionTab?.(tab.id, worktreeId)
    }
    return { closed: true }
  }

  private notifyRendererOfHeadlessTerminalClose(parentTabId: string): void {
    // Why: this relay is advisory after main owns teardown; renderer failure must
    // not prevent the authoritative session flush or turn the close into failure.
    try {
      this.notifier?.closeTerminal(parentTabId)
    } catch (error) {
      console.warn('[runtime] failed to notify renderer after headless terminal close', {
        parentTabId,
        error
      })
    }
  }

  private async closeHeadlessMobileBrowserTab(
    worktreeId: string,
    snapshot: RuntimeMobileSessionTabsSnapshot,
    tab: RuntimeMobileSessionBrowserTab
  ): Promise<void> {
    if (tab.browserPageId) {
      await this.offscreenBrowserBackend?.closeTab(tab.browserPageId).catch(() => {})
    }
    const nextTabs = snapshot.tabs.filter((candidate) => candidate.id !== tab.id)
    const active = nextTabs.find((candidate) => candidate.isActive) ?? nextTabs[0] ?? null
    const nextSnapshot: RuntimeMobileSessionTabsSnapshot = {
      ...snapshot,
      publicationEpoch: `headless:${Date.now().toString(36)}`,
      snapshotVersion: snapshot.snapshotVersion + 1,
      activeTabId: active?.id ?? null,
      activeTabType: active?.type ?? null,
      tabGroups: (snapshot.tabGroups ?? []).map((group) => ({
        ...group,
        tabOrder: group.tabOrder.filter((id) => id !== tab.id),
        activeTabId: group.activeTabId === tab.id ? null : group.activeTabId
      })),
      tabs: nextTabs
    }
    this.mobileSessionTabsByWorktree.set(worktreeId, nextSnapshot)
    this.emitMobileSessionTabsSnapshot(nextSnapshot)
  }

  private markHeadlessBrowserSessionTabActive(
    worktreeId: string | undefined,
    browserPageId: string,
    targetGroupId?: string
  ): void {
    if (!this.offscreenBrowserBackend || !worktreeId) {
      return
    }
    // Hydrate first so the freshly created browser tab is present in the snapshot.
    this.hydrateHeadlessMobileSessionTabsFromWorkspaceSession(worktreeId)
    const snapshot = this.mobileSessionTabsByWorktree.get(worktreeId)
    const tab = snapshot?.tabs.find(
      (candidate): candidate is RuntimeMobileSessionBrowserTab =>
        candidate.type === 'browser' && candidate.browserPageId === browserPageId
    )
    if (!snapshot || !tab) {
      return
    }
    const groups = snapshot.tabGroups ?? []
    const hasTargetGroup =
      targetGroupId !== undefined && groups.some((group) => group.id === targetGroupId)
    // Why: move the new browser into the group whose "+" was clicked, removing it
    // from wherever the rebuild placed it. Only the TARGET group's activeTabId
    // (and the global active) change — every other group's active tab is left
    // intact, so creating in the right group never resets the left group's tab.
    const nextGroups = hasTargetGroup
      ? groups.map((group) => {
          const withoutTab = group.tabOrder.filter((id) => id !== tab.id)
          if (group.id === targetGroupId) {
            return { ...group, tabOrder: [...withoutTab, tab.id], activeTabId: tab.id }
          }
          return withoutTab.length === group.tabOrder.length
            ? group
            : { ...group, tabOrder: withoutTab }
        })
      : groups.map((group) =>
          group.tabOrder.includes(tab.id) ? { ...group, activeTabId: tab.id } : group
        )
    const nextSnapshot: RuntimeMobileSessionTabsSnapshot = {
      ...snapshot,
      publicationEpoch: `headless:${Date.now().toString(36)}`,
      snapshotVersion: snapshot.snapshotVersion + 1,
      ...(hasTargetGroup ? { activeGroupId: targetGroupId } : {}),
      activeTabId: tab.id,
      activeTabType: 'browser',
      tabs: snapshot.tabs.map((candidate) => ({
        ...candidate,
        isActive: candidate.id === tab.id
      })),
      tabGroups: nextGroups
    }
    this.mobileSessionTabsByWorktree.set(worktreeId, nextSnapshot)
    // Why: browser group membership is otherwise live-only; persist it so a
    // later rebuild keeps the browser in its group instead of coalescing left.
    if (hasTargetGroup && nextSnapshot.tabGroupLayout) {
      this.persistHeadlessTabGroups(worktreeId, nextGroups, nextSnapshot.tabGroupLayout)
    }
    this.emitMobileSessionTabsSnapshot(nextSnapshot)
  }

  private closeHeadlessMobileTerminalTab(
    worktreeId: string,
    snapshot: RuntimeMobileSessionTabsSnapshot,
    tab: RuntimeMobileSessionTerminalTab
  ): void {
    const closedParentTabId = tab.parentTabId
    const projectedPtyIds = this.removePersistedHeadlessTerminalTab(worktreeId, closedParentTabId)
    // Why: local provider ids can be reused after restart, so a dormant
    // persisted id is not kill authority. SSH relay ids remain durable exact
    // identities even before pane metadata reconnects.
    const ptyIdsToKill = new Set(projectedPtyIds.filter((ptyId) => parseAppSshPtyId(ptyId)))
    for (const candidate of snapshot.tabs) {
      if (candidate.type !== 'terminal' || candidate.parentTabId !== closedParentTabId) {
        continue
      }
      const livePty = this.findPtyForMobileTerminalTab(worktreeId, candidate)
      const ptyId = livePty?.ptyId ?? candidate.ptyId
      const hasOtherOwner = snapshot.tabs.some(
        (other) =>
          other.type === 'terminal' &&
          other.parentTabId !== closedParentTabId &&
          other.ptyId === ptyId
      )
      if (ptyId && !hasOtherOwner && (livePty || parseAppSshPtyId(ptyId))) {
        // Why: a live serve leaf can exist before its debounced binding reaches
        // persistence. Include it from the authoritative snapshot so split
        // close cannot leave a provider process behind.
        ptyIdsToKill.add(ptyId)
      }
    }
    for (const ptyId of ptyIdsToKill) {
      this.ptyController?.kill(ptyId)
    }
    const nextTabs = snapshot.tabs.filter((candidate) => {
      if (candidate.type !== 'terminal' || candidate.parentTabId !== closedParentTabId) {
        return true
      }
      return false
    })
    const active = nextTabs.find((candidate) => candidate.isActive) ?? nextTabs[0] ?? null
    const nextSnapshot: RuntimeMobileSessionTabsSnapshot = {
      ...snapshot,
      publicationEpoch: `headless:${Date.now().toString(36)}`,
      snapshotVersion: snapshot.snapshotVersion + 1,
      activeTabId: active?.id ?? null,
      activeTabType: active?.type ?? null,
      tabGroups: this.buildHeadlessMobileSessionTabGroups(
        worktreeId,
        nextTabs,
        active,
        snapshot.tabGroups
      ),
      tabs: nextTabs
    }
    this.mobileSessionTabsByWorktree.set(worktreeId, nextSnapshot)
    this.emitMobileSessionTabsSnapshot(nextSnapshot)
  }

  async moveMobileSessionTab(
    worktreeSelector: string,
    move: RuntimeMobileSessionTabMove
  ): Promise<RuntimeMobileSessionTabMoveResult> {
    const explicitWorktreeId = this.getValidatedExplicitWorktreeIdSelector(worktreeSelector)
    const worktreeId =
      explicitWorktreeId ?? (await this.resolveWorktreeSelector(worktreeSelector)).id
    this.hydrateHeadlessMobileSessionTabsFromWorkspaceSession(worktreeId)
    const snapshot = this.mobileSessionTabsByWorktree.get(worktreeId)
    if (!snapshot) {
      throw new Error('tab_not_found')
    }
    if (!this.notifier?.moveSessionTab) {
      return this.moveHeadlessMobileSessionTab(worktreeId, snapshot, move)
    }
    const hostTabId = this.resolveMobileSessionHostTabId(snapshot, move.tabId)
    if (!hostTabId) {
      throw new Error('tab_not_found')
    }
    const publicSnapshot = this.toMobileSessionTabsResult(snapshot)
    const targetGroup = publicSnapshot.tabGroups?.find((group) => group.id === move.targetGroupId)
    if (!targetGroup) {
      throw new Error('target_group_not_found')
    }

    // Why: web clients address terminal surfaces as tab::leaf, while desktop
    // tab grouping is owned by the outer terminal tab id.
    if (move.kind === 'reorder') {
      const tabOrder = this.normalizeMobileSessionTabOrder(snapshot, targetGroup, move.tabOrder)
      if (!tabOrder.includes(hostTabId)) {
        throw new Error('invalid_tab_order')
      }
      this.notifier.moveSessionTab(worktreeId, {
        ...move,
        tabId: hostTabId,
        tabOrder
      })
      return { moved: true }
    }
    this.notifier.moveSessionTab(worktreeId, {
      ...move,
      tabId: hostTabId
    })
    return { moved: true }
  }

  // Why: pane geometry inside a tab (split ratios, expanded pane, pane titles)
  // is host-authoritative for remote-server tabs but had no push path, so a
  // client divider-drag / expand / pane-rename reverted on the next snapshot.
  // Persist the structural fields onto the tab's layout, keeping host-owned
  // pty bindings and active leaf.
  async updateMobileSessionPaneLayout(
    worktreeSelector: string,
    args: {
      tabId: string
      root: TerminalPaneLayoutNode | null
      expandedLeafId: string | null
      titlesByLeafId?: Record<string, string>
    }
  ): Promise<{ updated: true }> {
    const explicitWorktreeId = this.getValidatedExplicitWorktreeIdSelector(worktreeSelector)
    const worktreeId =
      explicitWorktreeId ?? (await this.resolveWorktreeSelector(worktreeSelector)).id
    // Why: when a renderer is authoritative (desktop host reached via shared
    // control), it owns pane geometry and republishes it — a headless write here
    // would be overwritten and could fight the renderer. Persist only headlessly.
    if (this.getAvailableAuthoritativeWindow()) {
      return { updated: true }
    }
    // Why: resolve to the host tab id (older/raw-id clients) so the persisted
    // layout entry matches, matching setMobileSessionTabProps.
    const snapshot = this.mobileSessionTabsByWorktree.get(worktreeId)
    const hostTabId = snapshot
      ? (this.resolveMobileSessionHostTabId(snapshot, args.tabId) ?? args.tabId)
      : args.tabId
    const resolvedArgs = { ...args, tabId: hostTabId }
    this.persistHeadlessTerminalPaneLayout(resolvedArgs)
    this.applyHeadlessTerminalPaneLayoutToSnapshot(worktreeId, resolvedArgs)
    return { updated: true }
  }

  // Why: tab color/pin are host-authoritative for remote-server tabs but had no
  // push path, so pinning or coloring a tab reverted on the next snapshot and
  // was never persisted. Persist to the workspace session + live snapshot.
  async setMobileSessionTabProps(
    worktreeSelector: string,
    args: {
      tabId: string
      color?: string | null
      isPinned?: boolean
      viewMode?: 'terminal' | 'chat'
    }
  ): Promise<{ updated: true }> {
    const explicitWorktreeId = this.getValidatedExplicitWorktreeIdSelector(worktreeSelector)
    const worktreeId =
      explicitWorktreeId ?? (await this.resolveWorktreeSelector(worktreeSelector)).id
    // Why: a renderer-authoritative host owns + republishes tab props, so a
    // headless write would be overwritten. Persist only when headless.
    if (this.getAvailableAuthoritativeWindow()) {
      return { updated: true }
    }
    const snapshot = this.mobileSessionTabsByWorktree.get(worktreeId)
    const hostTabId = snapshot
      ? (this.resolveMobileSessionHostTabId(snapshot, args.tabId) ?? args.tabId)
      : args.tabId
    this.persistHeadlessSessionTabProps(worktreeId, hostTabId, args)
    this.applyHeadlessSessionTabPropsToSnapshot(worktreeId, hostTabId, args)
    return { updated: true }
  }

  private persistHeadlessSessionTabProps(
    worktreeId: string,
    tabId: string,
    props: { color?: string | null; isPinned?: boolean; viewMode?: 'terminal' | 'chat' }
  ): void {
    const session = this.store?.getWorkspaceSession?.()
    if (!session || !this.store?.setWorkspaceSession) {
      return
    }
    const tabs = session.tabsByWorktree[worktreeId]
    const nextSession: WorkspaceSessionState = { ...session }
    let changed = false
    if (tabs?.some((tab) => tab.id === tabId)) {
      changed = true
      nextSession.tabsByWorktree = {
        ...session.tabsByWorktree,
        [worktreeId]: tabs.map((tab) =>
          tab.id === tabId
            ? {
                ...tab,
                ...(props.color !== undefined ? { color: props.color } : {}),
                ...(props.isPinned !== undefined ? { isPinned: props.isPinned } : {}),
                ...(props.viewMode !== undefined ? { viewMode: props.viewMode } : {})
              }
            : tab
        )
      }
    }

    const unifiedTabs = session.unifiedTabs?.[worktreeId]
    if (unifiedTabs?.some((tab) => tab.id === tabId || tab.entityId === tabId)) {
      changed = true
      nextSession.unifiedTabs = {
        ...session.unifiedTabs,
        [worktreeId]: unifiedTabs.map((tab) =>
          tab.id === tabId || tab.entityId === tabId
            ? {
                ...tab,
                ...(props.color !== undefined ? { color: props.color } : {}),
                ...(props.isPinned !== undefined ? { isPinned: props.isPinned } : {})
              }
            : tab
        )
      }
    }

    if (!changed) {
      return
    }
    this.store.setWorkspaceSession(nextSession)
  }

  private applyHeadlessSessionTabPropsToSnapshot(
    worktreeId: string,
    tabId: string,
    props: { color?: string | null; isPinned?: boolean; viewMode?: 'terminal' | 'chat' }
  ): void {
    const snapshot = this.mobileSessionTabsByWorktree.get(worktreeId)
    if (!snapshot) {
      return
    }
    let changed = false
    const tabs = snapshot.tabs.map((tab) => {
      if (this.getMobileSessionTopLevelTabId(tab) !== tabId) {
        return tab
      }
      changed = true
      return {
        ...tab,
        ...(props.color !== undefined ? { color: props.color } : {}),
        ...(props.isPinned !== undefined ? { isPinned: props.isPinned } : {}),
        ...(props.viewMode !== undefined ? { viewMode: props.viewMode } : {})
      }
    })
    if (!changed) {
      return
    }
    const nextSnapshot: RuntimeMobileSessionTabsSnapshot = {
      ...snapshot,
      publicationEpoch: `headless:${Date.now().toString(36)}`,
      snapshotVersion: snapshot.snapshotVersion + 1,
      tabs
    }
    this.mobileSessionTabsByWorktree.set(worktreeId, nextSnapshot)
    this.emitMobileSessionTabsSnapshot(nextSnapshot)
  }

  private getMobileSessionTopLevelTabId(tab: RuntimeMobileSessionSnapshotTab): string {
    return tab.type === 'terminal' ? tab.parentTabId : tab.id
  }

  // Merge the client's pane structure into the persisted tab layout. PTY
  // bindings and active leaf stay host-owned; only ratios/expand/titles change.
  // terminalLayoutsByTabId is keyed by tab id (worktree-independent).
  private persistHeadlessTerminalPaneLayout(args: {
    tabId: string
    root: TerminalPaneLayoutNode | null
    expandedLeafId: string | null
    titlesByLeafId?: Record<string, string>
  }): void {
    const session = this.store?.getWorkspaceSession?.()
    if (!session || !this.store?.setWorkspaceSession) {
      return
    }
    const existing = session.terminalLayoutsByTabId?.[args.tabId]
    if (!existing) {
      return
    }
    this.store.setWorkspaceSession({
      ...session,
      terminalLayoutsByTabId: {
        ...session.terminalLayoutsByTabId,
        [args.tabId]: {
          ...this.cloneTerminalLayoutSnapshot(existing),
          root: args.root ?? existing.root,
          expandedLeafId: args.expandedLeafId,
          ...(args.titlesByLeafId ? { titlesByLeafId: args.titlesByLeafId } : {})
        }
      }
    })
  }

  private applyHeadlessTerminalPaneLayoutToSnapshot(
    worktreeId: string,
    args: {
      tabId: string
      root: TerminalPaneLayoutNode | null
      expandedLeafId: string | null
      titlesByLeafId?: Record<string, string>
    }
  ): void {
    const snapshot = this.mobileSessionTabsByWorktree.get(worktreeId)
    if (!snapshot) {
      return
    }
    let changed = false
    const tabs = snapshot.tabs.map((tab) => {
      if (tab.type !== 'terminal' || tab.parentTabId !== args.tabId || !tab.parentLayout) {
        return tab
      }
      changed = true
      return {
        ...tab,
        parentLayout: {
          ...tab.parentLayout,
          root: args.root ?? tab.parentLayout.root,
          expandedLeafId: args.expandedLeafId,
          ...(args.titlesByLeafId ? { titlesByLeafId: args.titlesByLeafId } : {})
        }
      }
    })
    if (!changed) {
      return
    }
    const nextSnapshot: RuntimeMobileSessionTabsSnapshot = {
      ...snapshot,
      publicationEpoch: `headless:${Date.now().toString(36)}`,
      snapshotVersion: snapshot.snapshotVersion + 1,
      tabs
    }
    this.mobileSessionTabsByWorktree.set(worktreeId, nextSnapshot)
    this.emitMobileSessionTabsSnapshot(nextSnapshot)
  }

  private moveHeadlessMobileSessionTab(
    worktreeId: string,
    snapshot: RuntimeMobileSessionTabsSnapshot,
    move: RuntimeMobileSessionTabMove
  ): RuntimeMobileSessionTabMoveResult {
    if (move.kind === 'split') {
      return this.splitHeadlessMobileSessionTabGroup(worktreeId, snapshot, move)
    }
    if (move.kind === 'move-to-group') {
      return this.moveHeadlessMobileSessionTabToGroup(worktreeId, snapshot, move)
    }
    if (move.kind !== 'reorder') {
      throw new Error('renderer_unavailable')
    }
    const hostTabId = this.resolveMobileSessionHostTabId(snapshot, move.tabId)
    if (!hostTabId) {
      throw new Error('tab_not_found')
    }
    const publicSnapshot = this.toMobileSessionTabsResult(snapshot)
    const targetGroup = publicSnapshot.tabGroups?.find((group) => group.id === move.targetGroupId)
    if (!targetGroup) {
      throw new Error('target_group_not_found')
    }
    const tabOrder = this.normalizeMobileSessionTabOrder(snapshot, targetGroup, move.tabOrder)
    const orderIndexByParentTabId = new Map(tabOrder.map((tabId, index) => [tabId, index]))
    const nextTabs = [...snapshot.tabs].sort((a, b) => {
      const aParent = a.type === 'terminal' ? a.parentTabId : a.id
      const bParent = b.type === 'terminal' ? b.parentTabId : b.id
      const aIndex = orderIndexByParentTabId.get(aParent) ?? Number.MAX_SAFE_INTEGER
      const bIndex = orderIndexByParentTabId.get(bParent) ?? Number.MAX_SAFE_INTEGER
      return aIndex - bIndex
    })
    const active = nextTabs.find((candidate) => candidate.isActive) ?? nextTabs[0] ?? null
    const reorderedTargetActiveTabId =
      active?.type === 'terminal' ? active.parentTabId : active ? active.id : (tabOrder[0] ?? null)
    // Why: reorder only changes ONE group's order. Preserve every other group so
    // a multi-group split isn't deleted by re-sorting tabs in one of its groups.
    const existingGroups = snapshot.tabGroups ?? []
    const nextGroups = existingGroups.some((group) => group.id === targetGroup.id)
      ? existingGroups.map((group) =>
          group.id === targetGroup.id
            ? { ...group, tabOrder, activeTabId: reorderedTargetActiveTabId }
            : group
        )
      : [{ ...targetGroup, tabOrder, activeTabId: reorderedTargetActiveTabId }]
    const nextSnapshot: RuntimeMobileSessionTabsSnapshot = {
      ...snapshot,
      publicationEpoch: `headless:${Date.now().toString(36)}`,
      snapshotVersion: snapshot.snapshotVersion + 1,
      activeTabId: active?.id ?? null,
      activeTabType: active?.type ?? null,
      tabGroups: nextGroups,
      tabs: nextTabs
    }
    this.persistHeadlessTerminalTabOrder(worktreeId, tabOrder)
    if (nextGroups.length > 1 && snapshot.tabGroupLayout) {
      this.persistHeadlessTabGroups(worktreeId, nextGroups, snapshot.tabGroupLayout)
    }
    this.mobileSessionTabsByWorktree.set(worktreeId, nextSnapshot)
    this.emitMobileSessionTabsSnapshot(nextSnapshot)
    return { moved: true }
  }

  // Why: a drag-to-split-group used to be a client-only change the headless host
  // never modeled, so the next snapshot coalesced every tab back into one group.
  // Model + persist the multi-group layout so the split survives rebuilds.
  private splitHeadlessMobileSessionTabGroup(
    worktreeId: string,
    snapshot: RuntimeMobileSessionTabsSnapshot,
    move: Extract<RuntimeMobileSessionTabMove, { kind: 'split' }>
  ): RuntimeMobileSessionTabMoveResult {
    const hostTabId = this.resolveMobileSessionHostTabId(snapshot, move.tabId)
    if (!hostTabId) {
      throw new Error('tab_not_found')
    }
    const split = buildHeadlessTabGroupSplit({
      groups: snapshot.tabGroups ?? [],
      layout: snapshot.tabGroupLayout,
      tabId: hostTabId,
      targetGroupId: move.targetGroupId,
      splitDirection: move.splitDirection,
      newGroupId: randomUUID()
    })
    if (!split) {
      // Renderer treats an unsplittable drop (e.g. last tab onto its own group)
      // as a no-op; mirror that instead of churning the snapshot.
      return { moved: true }
    }
    const nextSnapshot: RuntimeMobileSessionTabsSnapshot = {
      ...snapshot,
      publicationEpoch: `headless:${Date.now().toString(36)}`,
      snapshotVersion: snapshot.snapshotVersion + 1,
      activeGroupId: split.newGroupId,
      tabGroups: split.groups,
      tabGroupLayout: split.layout
    }
    this.persistHeadlessTabGroups(worktreeId, split.groups, split.layout)
    this.mobileSessionTabsByWorktree.set(worktreeId, nextSnapshot)
    this.emitMobileSessionTabsSnapshot(nextSnapshot)
    return { moved: true }
  }

  // Move a tab into an existing group on a headless serve (non-split drop).
  private moveHeadlessMobileSessionTabToGroup(
    worktreeId: string,
    snapshot: RuntimeMobileSessionTabsSnapshot,
    move: Extract<RuntimeMobileSessionTabMove, { kind: 'move-to-group' }>
  ): RuntimeMobileSessionTabMoveResult {
    const hostTabId = this.resolveMobileSessionHostTabId(snapshot, move.tabId)
    if (!hostTabId) {
      throw new Error('tab_not_found')
    }
    const moved = buildHeadlessTabGroupMove({
      groups: snapshot.tabGroups ?? [],
      layout: snapshot.tabGroupLayout,
      tabId: hostTabId,
      targetGroupId: move.targetGroupId,
      index: move.index
    })
    if (!moved) {
      // Same-group / missing-target drop is a renderer no-op; mirror that.
      return { moved: true }
    }
    const layout = moved.layout ?? { type: 'leaf' as const, groupId: move.targetGroupId }
    const nextSnapshot: RuntimeMobileSessionTabsSnapshot = {
      ...snapshot,
      publicationEpoch: `headless:${Date.now().toString(36)}`,
      snapshotVersion: snapshot.snapshotVersion + 1,
      activeGroupId: move.targetGroupId,
      tabGroups: moved.groups,
      tabGroupLayout: layout
    }
    this.persistHeadlessTabGroups(worktreeId, moved.groups, layout)
    this.mobileSessionTabsByWorktree.set(worktreeId, nextSnapshot)
    this.emitMobileSessionTabsSnapshot(nextSnapshot)
    return { moved: true }
  }

  // Persist the headless tab-GROUP layout so snapshot rebuilds keep the split.
  private persistHeadlessTabGroups(
    worktreeId: string,
    groups: readonly RuntimeMobileSessionTabGroup[],
    layout: TabGroupLayoutNode
  ): void {
    const session = this.store?.getWorkspaceSession?.()
    if (!session || !this.store?.setWorkspaceSession) {
      return
    }
    this.store.setWorkspaceSession({
      ...session,
      tabGroups: {
        ...session.tabGroups,
        [worktreeId]: groups.map((group) => ({
          id: group.id,
          worktreeId,
          activeTabId: group.activeTabId,
          tabOrder: [...group.tabOrder],
          ...(group.recentTabIds ? { recentTabIds: [...group.recentTabIds] } : {})
        }))
      },
      tabGroupLayouts: {
        ...session.tabGroupLayouts,
        [worktreeId]: layout
      }
    })
  }

  // Persist a manual terminal rename so a headless rebuild keeps the title
  // instead of reverting to the generated/default one.
  private persistHeadlessTerminalTitle(
    worktreeId: string,
    tabId: string,
    title: string | null
  ): void {
    const session = this.store?.getWorkspaceSession?.()
    if (!session || !this.store?.setWorkspaceSession) {
      return
    }
    const tabs = session.tabsByWorktree[worktreeId]
    if (!tabs?.some((tab) => tab.id === tabId)) {
      return
    }
    this.store.setWorkspaceSession({
      ...session,
      tabsByWorktree: {
        ...session.tabsByWorktree,
        [worktreeId]: tabs.map((tab) => (tab.id === tabId ? { ...tab, customTitle: title } : tab))
      }
    })
  }

  private normalizeMobileSessionTabOrder(
    snapshot: RuntimeMobileSessionTabsSnapshot | undefined,
    targetGroup: RuntimeMobileSessionTabGroup,
    tabOrder: readonly string[]
  ): string[] {
    const normalized: string[] = []
    const seen = new Set<string>()
    for (const tabId of tabOrder) {
      const hostTabId = this.resolveMobileSessionHostTabId(snapshot, tabId)
      if (!hostTabId) {
        throw new Error('invalid_tab_order')
      }
      if (seen.has(hostTabId)) {
        throw new Error('duplicate_tab_order')
      }
      seen.add(hostTabId)
      normalized.push(hostTabId)
    }

    const returnedIds = this.collectPublicMobileSessionTabIds(snapshot)
    const expected = targetGroup.tabOrder
      .map((tabId) => this.resolveMobileSessionHostTabId(snapshot, tabId) ?? tabId)
      // Why: clients reorder the sanitized session.tabs.list model; raw groups
      // can still contain stale browser ids hidden from paired web clients.
      .filter((tabId) => returnedIds.has(tabId))
    // Why: reorder is a pure permutation of one existing group. Missing or
    // extra ids would let a paired web client silently move/lose host tabs.
    if (normalized.length !== expected.length || expected.some((tabId) => !seen.has(tabId))) {
      throw new Error('invalid_tab_order')
    }
    return normalized
  }

  private collectPublicMobileSessionTabIds(
    snapshot: RuntimeMobileSessionTabsSnapshot | undefined
  ): Set<string> {
    const ids = new Set<string>()
    if (!snapshot) {
      return ids
    }
    const liveBrowserTabsByPageId = this.getLiveBrowserTabsByPageId(snapshot.worktree)
    for (const tab of snapshot.tabs) {
      if (tab.type === 'browser') {
        const liveTab = tab.browserPageId
          ? liveBrowserTabsByPageId.get(tab.browserPageId)
          : undefined
        if (!liveTab) {
          continue
        }
        ids.add(tab.id)
        ids.add(tab.browserWorkspaceId)
        continue
      }
      ids.add(tab.id)
      if (tab.type === 'terminal') {
        ids.add(tab.parentTabId)
      }
    }
    return ids
  }

  private resolveMobileSessionHostTabId(
    snapshot: RuntimeMobileSessionTabsSnapshot | undefined,
    tabId: string
  ): string | null {
    const tab =
      snapshot?.tabs.find((candidate) => candidate.id === tabId) ??
      snapshot?.tabs.find(
        (candidate) => candidate.type === 'terminal' && candidate.parentTabId === tabId
      ) ??
      snapshot?.tabs.find(
        (candidate) => candidate.type === 'browser' && candidate.browserWorkspaceId === tabId
      )
    if (!tab) {
      return null
    }
    return tab.type === 'terminal' ? tab.parentTabId : tab.id
  }

  async readMobileMarkdownTab(
    worktreeSelector: string,
    tabId: string
  ): Promise<RuntimeMarkdownReadTabResult> {
    const worktreeId = await this.resolveMobileMarkdownWorktreeId(worktreeSelector, tabId)
    if (!this.notifier?.readMobileMarkdownTab) {
      throw new Error('renderer_unavailable')
    }
    return await this.notifier.readMobileMarkdownTab(worktreeId, tabId)
  }

  async saveMobileMarkdownTab(
    worktreeSelector: string,
    tabId: string,
    baseVersion: string,
    content: string
  ): Promise<RuntimeMarkdownSaveTabResult> {
    const worktreeId = await this.resolveMobileMarkdownWorktreeId(worktreeSelector, tabId)
    if (!this.notifier?.saveMobileMarkdownTab) {
      throw new Error('renderer_unavailable')
    }
    return await this.notifier.saveMobileMarkdownTab(worktreeId, tabId, baseVersion, content)
  }

  readonly fileCommands = new RuntimeFileCommands({
    getRuntimeId: () => this.runtimeId,
    requireStore: () => this.requireStore(),
    resolveWorktreeSelector: (selector) => this.resolveWorktreeSelector(selector),
    resolveRuntimeFileTarget: (selector) => this.resolveRuntimeFileTarget(selector),
    resolveTerminalCwd: (terminalHandle) => this.resolveTerminalCwd(terminalHandle),
    resolveTerminalContext: (terminalHandle) => this.resolveTerminalContext(terminalHandle),
    resolveTerminalFileUriHostname: (terminalHandle) =>
      this.resolveTerminalFileUriHostname(terminalHandle),
    hasRecentTerminalOutputPath: (terminalHandle, pathText, absolutePath) =>
      this.hasRecentTerminalOutputPath(terminalHandle, pathText, absolutePath),
    resolveRuntimeGitTarget: (selector) => this.resolveRuntimeGitTarget(selector),
    openFile: (worktreeId, filePath, relativePath, runtimeEnvironmentId) => {
      if (!this.notifier?.openFile) {
        throw new Error('renderer_unavailable')
      }
      this.notifier.openFile(worktreeId, filePath, relativePath, runtimeEnvironmentId)
    },
    openDiff: (worktreeId, filePath, relativePath, staged, runtimeEnvironmentId) => {
      if (!this.notifier?.openDiff) {
        throw new Error('renderer_unavailable')
      }
      this.notifier.openDiff(worktreeId, filePath, relativePath, staged, runtimeEnvironmentId)
    }
  })

  closeFileWatchersForRemoval = async (
    worktreePath: string,
    connectionId?: string
  ): Promise<void> => {
    const results = await Promise.allSettled([
      connectionId
        ? closeRemoteWatcherForWorktreePath(connectionId, worktreePath)
        : closeLocalWatcherForWorktreePath(worktreePath),
      this.fileCommands.closeFileExplorerWatchersForPath(worktreePath, connectionId)
    ])
    const failure = results.find((result): result is PromiseRejectedResult => {
      return result.status === 'rejected'
    })
    if (failure) {
      // Why: restoration must start only after every bounded teardown settles;
      // otherwise a late close can stale a just-restored logical subscription.
      throw failure.reason
    }
  }
  restoreFileWatchersAfterFailedRemoval = async (
    worktreePath: string,
    connectionId?: string
  ): Promise<void> => {
    await Promise.all([
      connectionId
        ? restoreRemoteWatcherAfterFailedRemoval(connectionId, worktreePath)
        : restoreLocalWatcherAfterFailedRemoval(worktreePath),
      this.fileCommands.restoreFileExplorerWatchersAfterFailedRemoval(worktreePath, connectionId)
    ])
  }
  forgetFileWatchersAfterRemoval = (worktreePath: string, connectionId?: string): void => {
    if (connectionId) {
      forgetRemoteWatcherRemovalSnapshot(connectionId, worktreePath)
    } else {
      forgetLocalWatcherRemovalSnapshot(worktreePath)
    }
    this.fileCommands.forgetFileExplorerWatchersAfterRemoval(worktreePath, connectionId)
  }
  acquireFileWatcherRemoval = async (
    worktreePath: string,
    connectionId?: string
  ): Promise<{ finish(removed: boolean): Promise<void> }> => {
    const gate = acquireWatcherRemovalGate(worktreePath, connectionId)
    try {
      // Why: the first pass aborts desktop setup immediately; the second catches
      // any pre-gate runtime install that published after the first snapshot.
      await this.closeFileWatchersForRemoval(worktreePath, connectionId)
      await gate.ready
      await this.closeFileWatchersForRemoval(worktreePath, connectionId)
      let finished = false
      return {
        finish: async (removed) => {
          if (finished) {
            return
          }
          finished = true
          if (removed) {
            this.forgetFileWatchersAfterRemoval(worktreePath, connectionId)
          }
          gate.release()
          if (!removed) {
            await this.restoreFileWatchersAfterFailedRemoval(worktreePath, connectionId).catch(
              (restoreError: unknown) => {
                console.error('[worktrees] failed to restore watchers after removal failed', {
                  worktreePath,
                  restoreError
                })
              }
            )
          }
        }
      }
    } catch (error) {
      gate.release()
      await this.restoreFileWatchersAfterFailedRemoval(worktreePath, connectionId).catch(
        (restoreError: unknown) => {
          console.error('[worktrees] failed to restore watchers after removal setup failed', {
            worktreePath,
            restoreError
          })
        }
      )
      throw error
    }
  }
  readonly gitCommands = new RuntimeGitCommands({
    resolveRuntimeGitTarget: (selector) => this.resolveRuntimeGitTarget(selector),
    getRuntimeSettings: () => this.requireStore().getSettings() as GlobalSettings,
    getCommitMessageAgentEnvironment: () => this.commitMessageAgentEnv ?? undefined
  })

  private async resolveRuntimeGitTarget(worktreeSelector: string): Promise<{
    worktree: ResolvedWorktree
    repo?: Repo
    connectionId?: string
    localGitOptions?: { wslDistro?: string }
  }> {
    const store = this.requireStore()
    const worktree = await this.resolveWorktreeSelector(worktreeSelector)
    const repo = store.getRepo(worktree.repoId)
    const connectionId = repo?.connectionId ?? undefined
    const localGitOptions =
      repo && !connectionId ? getLocalProjectWorktreeGitOptions(store, repo) : {}
    return { worktree, repo, connectionId, localGitOptions }
  }

  private async resolveRuntimeFileTarget(worktreeSelector: string): Promise<{
    worktree: ResolvedWorktree
    connectionId?: string
  }> {
    const folderScope = await this.resolveFolderWorkspaceLaunchScope(worktreeSelector)
    if (folderScope?.folderWorkspace) {
      return {
        worktree: this.folderWorkspaceToResolvedWorktree(folderScope.folderWorkspace),
        connectionId: folderScope.connectionId ?? undefined
      }
    }

    const store = this.requireStore()
    const worktree = await this.resolveWorktreeSelector(worktreeSelector)
    const repo = store.getRepo(worktree.repoId)
    return { worktree, connectionId: repo?.connectionId ?? undefined }
  }

  onMobileSessionTabsChanged(
    listener: (snapshot: RuntimeMobileSessionTabsResult) => void
  ): () => void {
    this.mobileSessionTabListeners.add(listener)
    return () => {
      // Why: flush pending coalesced notifies before dropping this listener so a
      // subscriber closing mid-window still receives the latest settled state.
      this.mobileSessionTabsNotifyCoalescer.flushAll()
      this.mobileSessionTabListeners.delete(listener)
    }
  }

  // Why: terminal handles are normally created lazily when first referenced via
  // RPC, but agents need their own handle at spawn time (via YIRU_TERMINAL_HANDLE
  // env var) so they can self-identify in orchestration messages without an
  // extra RPC round-trip. Pre-allocating by ptyId lets issueHandle reuse it.
  preAllocateHandleForPty(ptyId: string): string {
    return this.terminalSessions.preAllocateHandle(ptyId)
  }

  createPreAllocatedTerminalHandle(): string {
    return this.terminalSessions.createPreAllocatedHandle()
  }

  registerPreAllocatedHandleForPty(ptyId: string, handle: string): void {
    this.terminalSessions.registerPreAllocatedHandle(this.runtimeId, ptyId, handle)
  }

  private adoptControllerTerminalHandle(ptyId: string, handle: string | undefined): void {
    const trimmed = handle?.trim()
    if (!trimmed || !trimmed.startsWith('term_')) {
      return
    }
    if (!this.terminalSessions.canAdoptControllerHandle(this.runtimeId, ptyId, trimmed)) {
      return
    }
    // Why: after an app/runtime restart, the live PTY child still has its
    // original YIRU_TERMINAL_HANDLE, but the runtime's in-memory map is gone.
    this.registerPreAllocatedHandleForPty(ptyId, trimmed)
  }

  onPtySpawned(ptyId: string): void {
    if (!this.terminalSessions.hasPtyRecord(ptyId)) {
      this.getOrCreatePtyWorktreeRecord(ptyId)
    }
    this.terminalSessions.markPtySpawned(ptyId, this.runtimeId)
  }

  registerPty(
    ptyId: string,
    worktreeId: string,
    connectionId: string | null = null,
    binding?: { tabId: string; leafId: string },
    isWsl?: boolean,
    trustedWorktreeInstanceId?: string | null
  ): void {
    // Why: record the renderer pane identity at spawn time so a stalled graph
    // sync can't hide that a live PTY already backs a pending mobile create.
    const paneKey =
      binding && isValidTerminalTabId(binding.tabId) && isTerminalLeafId(binding.leafId)
        ? makePaneKey(binding.tabId, binding.leafId)
        : null
    const hadRecord = this.terminalSessions.hasPtyRecord(ptyId)
    this.recordPtyWorktree(ptyId, worktreeId, {
      connected: true,
      connectionId,
      ...(isWsl !== undefined ? { isWsl } : {}),
      ...(binding && paneKey ? { tabId: binding.tabId, paneKey } : {})
    })
    const pty = this.terminalSessions.getPtyRecord(ptyId)
    if (pty) {
      if (trustedWorktreeInstanceId !== undefined) {
        pty.worktreeInstanceId = normalizeRuntimeWorktreeInstanceId(trustedWorktreeInstanceId)
      } else if (!hadRecord) {
        // Why: direct runtime spawns may bypass IPC; only a new record may bind current meta.
        pty.worktreeInstanceId = normalizeRuntimeWorktreeInstanceId(
          this.store?.getWorktreeMeta(worktreeId)?.instanceId
        )
      }
      this.terminalSessions.commitPtyState(ptyId, { pty })
    }
    // Why: the renderer's own PTY spawn is the reliable signal that the pending
    // mobile create's tab is live; publish its surface main-side (#7587).
    if (binding && paneKey) {
      this.ensurePtyBackedMobileSurfaceForRendererTab(worktreeId, binding.tabId)
    }
  }

  /** Record the spawn launch command so the per-PTY Command Code detector can
   *  arm from it (renderer startupCommand parity). Best-effort: a chunk that
   *  beats this call falls back to the detector's banner arming. */
  noteTerminalSpawnCommand(ptyId: string, command: string | null | undefined): void {
    const trimmed = typeof command === 'string' ? command.trim() : ''
    if (trimmed.length > 0) {
      this.terminalSpawnCommandsByPtyId.set(ptyId, trimmed)
    }
  }

  /**
   * Handles incoming data from a PTY process, running agent detection,
   * updating terminal tail buffers, and triggering foreground agent refreshes.
   */
  onPtyData(
    ptyId: string,
    data: string,
    at: number,
    sequenceChars = data.length,
    queryReplyOwner = this.getTerminalQueryReplyOwnerForLiveChunk(ptyId)
  ): number {
    const outputSequence = (this.ptyOutputSequenceById.get(ptyId) ?? 0) + sequenceChars
    this.ptyOutputSequenceById.set(ptyId, outputSequence)
    this.providerModeTrackersByPtyId.get(ptyId)?.scan(data)
    for (const tracker of this.providerModeSnapshotScansByPtyId.get(ptyId) ?? []) {
      tracker.scan(data)
    }
    const osc7Metadata = this.recordOsc7MetadataForPty(ptyId, data)
    const cwd = osc7Metadata.cwd
    const cwdChanged = osc7Metadata.cwdChanged
    const agentStatusChunk = this.processAgentStatusOscForPty(ptyId, data)
    this.recordRecentPtyOutputForPathProvenance(ptyId, data)
    // Agent detection runs on raw data before leaf processing, since the
    // tail buffer logic normalizes away the OSC sequences we need.
    this.agentDetector?.onData(ptyId, data, at)
    // Why: watch terminal output for advertised dev-server URLs (e.g. Vite's
    // `Network: https://local.example.com:3001/`) so the workspace ports
    // panel can surface them in place of the kernel bind address.
    advertisedUrlWatcher.ingest(ptyId, data, at)
    // Why: reply ownership is captured per chunk, here at ingestion — the
    // same module state and tick as the hidden-gate drop sites — and rides
    // the writeChain link. A mark/setting/subscriber flip before the queued
    // emulator write runs must not change who answers (terminal-query-
    // authority.md invariant 1).
    const forwardQueryReplies = queryReplyOwner === 'model'
    // Ordering invariant (DO NOT REORDER): maybeHydrateHeadlessFromRenderer
    // MUST run before trackHeadlessTerminalData so the eager-state pattern
    // (set headlessTerminals + writeChain head = seedPromise) is in place
    // before the live byte's chain link is queued. Without this ordering,
    // trackHeadlessTerminalData would lazy-create a fresh state at PTY dims
    // that the later seed-resolve would overwrite, dropping the live byte.
    // See docs/mobile-prefer-renderer-scrollback.md.
    this.maybeHydrateHeadlessFromRenderer(ptyId)
    // Our structure wins: OSC title/agent-status extraction runs through the
    // shared per-PTY title tracker below (getOrCreatePtyTitleTrackerEntry →
    // applyTrackedPtyTitle) in byte order, superseding main's inline
    // extractLastOscTitleForPty block (#7880/#7852 title/status semantics are
    // preserved via the tracker + detectAgentStatusFromTitle path).
    this.trackHeadlessTerminalData(ptyId, data, outputSequence, forwardQueryReplies)

    if (!this.terminalSessions.hasPtyRecord(ptyId)) {
      this.getOrCreatePtyWorktreeRecord(ptyId)
    }
    let ptyTailBefore: {
      lines: string[]
      partialLine: string
      pendingAnsi: string
      redrawCursor: RetainedTailRedrawCursor | null
      truncated: boolean
      linesTotal: number
    } | null = null
    let ptyTailAfter: ReturnType<typeof appendNormalizedToTailBuffer> | null = null
    let normalizedPtyText: string | null = null
    this.terminalSessions.mutatePtyOutputState(ptyId, ({ pty }) => {
      if (!pty) {
        return
      }
      ptyTailBefore = {
        lines: pty.tailBuffer,
        partialLine: pty.tailPartialLine,
        pendingAnsi: pty.tailPendingAnsi,
        redrawCursor: pty.tailRedrawCursor,
        truncated: pty.tailTruncated,
        linesTotal: pty.tailLinesTotal
      }
      pty.connected = true
      pty.disconnectedAt = null
      pty.lastOutputAt = at
      const normalized = normalizeTerminalChunk(data, pty.tailPendingAnsi)
      normalizedPtyText = normalized.text
      pty.tailPendingAnsi = normalized.pendingAnsi
      const nextTail = appendNormalizedToTailBuffer(
        pty.tailBuffer,
        pty.tailPartialLine,
        normalized.text,
        pty.tailRedrawCursor
      )
      ptyTailAfter = nextTail
      pty.tailBuffer = nextTail.lines
      pty.tailPartialLine = nextTail.partialLine
      pty.tailRedrawCursor = nextTail.redrawCursor
      pty.tailTruncated = pty.tailTruncated || nextTail.truncated
      pty.tailLinesTotal += nextTail.newCompleteLines
      pty.preview = buildPreview(pty.tailBuffer, pty.tailPartialLine)
    })
    if (normalizedPtyText !== null) {
      this.scheduleWaitBlockedCheck(ptyId, normalizedPtyText, at)
    }

    const boundWorktreeIds = new Set<string>()
    this.terminalSessions.mutatePtyOutputState(ptyId, ({ pty, leaves, graphReady }) => {
      for (const leaf of leaves) {
        const paneKey = this.makeRuntimePaneKey(leaf)
        const preservesGlobalAssistantOwner =
          pty?.worktreeId === GLOBAL_ASSISTANT_WORKTREE_ID &&
          leaf.worktreeId === FLOATING_TERMINAL_WORKTREE_ID
        this.terminalSessions.recordLivePtyBinding(ptyId, {
          worktreeId: leaf.worktreeId,
          preserveExistingWorktree: preservesGlobalAssistantOwner,
          lastOutputAt: pty?.lastOutputAt ?? at,
          preview: pty?.preview ?? leaf.preview,
          tabId: leaf.tabId,
          paneKey
        })
        boundWorktreeIds.add(leaf.worktreeId)
        leaf.connected = true
        leaf.writable = graphReady
        leaf.lastOutputAt = at
        if (
          pty &&
          ptyTailBefore &&
          ptyTailAfter &&
          tailStateMatches(
            leaf.tailBuffer,
            leaf.tailPartialLine,
            leaf.tailPendingAnsi,
            leaf.tailRedrawCursor,
            leaf.tailTruncated,
            leaf.tailLinesTotal,
            ptyTailBefore
          )
        ) {
          // Why: the leaf and PTY record mirror one terminal; reuse its single tail update.
          leaf.tailBuffer = pty.tailBuffer
          leaf.tailPartialLine = pty.tailPartialLine
          leaf.tailPendingAnsi = pty.tailPendingAnsi
          leaf.tailRedrawCursor = pty.tailRedrawCursor
          leaf.tailTruncated = pty.tailTruncated
          leaf.tailLinesTotal = pty.tailLinesTotal
          leaf.preview = pty.preview
          leaf.waitBlockedAt = pty.waitBlockedAt
          leaf.tailWaitState = pty.tailWaitState
        } else {
          const normalized = normalizeTerminalChunk(data, leaf.tailPendingAnsi)
          leaf.tailPendingAnsi = normalized.pendingAnsi
          const previousWaitState =
            leaf.tailWaitState?.fromTail === true
              ? leaf.tailWaitState
              : computeTerminalTailWaitState(leaf.tailBuffer, leaf.tailPartialLine, leaf.preview)
          const nextTail = appendNormalizedToTailBuffer(
            leaf.tailBuffer,
            leaf.tailPartialLine,
            normalized.text,
            leaf.tailRedrawCursor
          )
          const nextWaitState = computeTerminalTailWaitState(
            nextTail.lines,
            nextTail.partialLine,
            leaf.preview
          )
          if (tailGainedNewerBlockedReason(previousWaitState, nextWaitState, normalized.text)) {
            leaf.waitBlockedAt = at
          }
          leaf.tailWaitState = nextWaitState
          leaf.tailBuffer = nextTail.lines
          leaf.tailPartialLine = nextTail.partialLine
          leaf.tailRedrawCursor = nextTail.redrawCursor
          leaf.tailTruncated = leaf.tailTruncated || nextTail.truncated
          leaf.tailLinesTotal += nextTail.newCompleteLines
          leaf.preview = buildPreview(leaf.tailBuffer, leaf.tailPartialLine)
        }
      }
    })
    for (const worktreeId of boundWorktreeIds) {
      advertisedUrlWatcher.bindPty(ptyId, worktreeId)
    }

    // Why: feed the chunk's OSC titles through the shared per-PTY tracker in
    // byte order — the same ordering the renderer transport uses — so
    // coalesced working→idle transitions reach tui-idle waiters and
    // pending-message delivery instead of being masked by the chunk's last
    // title (issue #1083). Uses the OSC 9999-stripped cleanData like the
    // renderer, so pure status chunks don't perturb the stale-title probe.
    const titleTrackerEntry = this.getOrCreatePtyTitleTrackerEntry(ptyId)
    const previousTitleScanTail = this.oscTitleScanTailByPtyId.get(ptyId)
    const titleInput = previousTitleScanTail
      ? `${previousTitleScanTail}${agentStatusChunk.cleanData}`
      : agentStatusChunk.cleanData
    const nextTitleScanTail = extractOscTitleScanTail(titleInput)
    if (nextTitleScanTail.length > 0) {
      this.oscTitleScanTailByPtyId.set(ptyId, nextTitleScanTail)
    } else {
      this.oscTitleScanTailByPtyId.delete(ptyId)
    }
    titleTrackerEntry.applyingChunk = true
    titleTrackerEntry.chunkTouchedSessionTabs = false
    let retainedAgentStatusChanged = false
    try {
      titleTrackerEntry.tracker.handleChunk(agentStatusChunk.cleanData, {
        titleScanData: titleInput
      })
      // Why: the Command Code scrape rides the same per-chunk batch (its facts
      // trail the tracker's). cleanData keeps OSC 9999 payloads out of the
      // detector's bounded recent-text window; the detector strips remaining
      // control sequences itself, exactly like the renderer byte path.
      titleTrackerEntry.commandCodeDetector?.observe(agentStatusChunk.cleanData)
    } finally {
      titleTrackerEntry.applyingChunk = false
      try {
        // Why: per-chunk cross-channel contract order is status → titles →
        // bell — the chunk's agentStatus:set events must reach the renderer
        // before its pty:sideEffect batch.
        retainedAgentStatusChanged = this.emitTerminalAgentStatusEvents(ptyId, agentStatusChunk)
      } finally {
        // Why: flushed in the finally so a throwing tracker callback cannot
        // strand this chunk's facts to be emitted under the next chunk's seq.
        this.flushPendingTerminalSideEffectFacts(ptyId, titleTrackerEntry)
      }
    }
    // Why: hook (OSC 9999) transitions often arrive without a title change, so
    // headless-serve snapshots would never republish and paired remote clients
    // kept the stale agent state until the next title change (#7970).
    if (titleTrackerEntry.chunkTouchedSessionTabs || retainedAgentStatusChanged) {
      this.touchMobileSessionSnapshotsForPty(ptyId)
    }

    this.terminalSessions.emitData(ptyId, data, {
      seq: outputSequence,
      rawLength: data.length,
      ...(cwdChanged && cwd !== null ? { cwd } : {})
    })
    return outputSequence
  }

  private scheduleWaitBlockedCheck(ptyId: string, appendedText: string, at: number): void {
    let state = this.waitBlockedCheckStateByPtyId.get(ptyId)
    if (!state) {
      state = { lastAt: 0, lastWaitState: null, appended: '', keywordCarry: '', timer: null }
      this.waitBlockedCheckStateByPtyId.set(ptyId, state)
    }
    const appendedLower = appendedText.toLowerCase()
    const keywordHit = WAIT_BLOCKED_KEYWORD_PATTERN.test(`${state.keywordCarry}${appendedLower}`)
    state.keywordCarry = appendedLower.slice(-WAIT_BLOCKED_KEYWORD_CARRY_CHARS)
    // Why the cap keeps the tail: the accumulated text only anchors boundary-
    // spanning prompt detection; anything past the tail cap has scrolled out
    // of the retained tail the check reads anyway.
    state.appended =
      state.appended.length + appendedText.length > MAX_TAIL_CHARS
        ? `${state.appended}${appendedText}`.slice(-MAX_TAIL_CHARS)
        : `${state.appended}${appendedText}`
    const elapsed = at - state.lastAt
    if (keywordHit || elapsed >= WAIT_BLOCKED_CHECK_MIN_INTERVAL_MS || elapsed < 0) {
      this.runWaitBlockedCheck(ptyId, state, at)
      return
    }
    if (!state.timer) {
      // Why trailing edge: the final chunks of a burst must still be
      // evaluated or a prompt arriving right after a flood would go
      // unstamped until the next output.
      state.timer = setTimeout(() => {
        state.timer = null
        this.runWaitBlockedCheck(ptyId, state, Date.now())
      }, WAIT_BLOCKED_CHECK_MIN_INTERVAL_MS - elapsed)
    }
  }

  private runWaitBlockedCheck(
    ptyId: string,
    state: {
      lastAt: number
      lastWaitState: TerminalTailWaitState | null
      appended: string
      keywordCarry: string
      timer: ReturnType<typeof setTimeout> | null
    },
    at: number
  ): void {
    let found = false
    this.terminalSessions.mutatePtyOutputState(ptyId, ({ pty }) => {
      if (!pty) {
        return
      }
      found = true
      const nextWaitState = computeTerminalTailWaitState(
        pty.tailBuffer,
        pty.tailPartialLine,
        pty.preview
      )
      const previousWaitState = state.lastWaitState ?? {
        waitText: '',
        signal: null,
        fromTail: false
      }
      if (tailGainedNewerBlockedReason(previousWaitState, nextWaitState, state.appended)) {
        pty.waitBlockedAt = at
      }
      state.lastAt = at
      state.lastWaitState = nextWaitState
      state.appended = ''
    })
    if (!found) {
      state.appended = ''
    }
  }

  private clearWaitBlockedCheckState(ptyId: string): void {
    const state = this.waitBlockedCheckStateByPtyId.get(ptyId)
    if (state?.timer) {
      clearTimeout(state.timer)
    }
    this.waitBlockedCheckStateByPtyId.delete(ptyId)
  }

  private processAgentStatusOscForPty(ptyId: string, data: string): ProcessedAgentStatusChunk {
    let processor = this.agentStatusOscProcessorsByPtyId.get(ptyId)
    if (!processor) {
      processor = createAgentStatusOscProcessor()
      this.agentStatusOscProcessorsByPtyId.set(ptyId, processor)
    }
    return processor(data)
  }

  /** Emit the facts batched while applying one chunk/frame as a single
   *  pty:sideEffect batch, preserving byte order. */
  private flushPendingTerminalSideEffectFacts(
    ptyId: string,
    entry: RuntimePtyTitleTrackerEntry
  ): void {
    if (entry.pendingFacts.length === 0) {
      return
    }
    const facts = entry.pendingFacts
    entry.pendingFacts = []
    this.emitTerminalSideEffectBatch(ptyId, facts)
  }

  /** Feed a main-fabricated OSC title/BEL frame (agent hook spinners) through
   *  the per-PTY tracker — NOT onPtyData, so emulator state, tails,
   *  transcripts, and stats never see synthetic bytes. Parsed via the
   *  tracker's stateless synthetic path: the shared chunk bell detector must
   *  never observe fabricated bytes, or a tick interleaved with a split real
   *  OSC corrupts its escape state (phantom/swallowed bells). While the
   *  side-effect kill switch is off the legacy pty:data copy still drives
   *  renderer parsers; this ingest keeps main's facts and records
   *  authoritative. */
  ingestSyntheticTitleFrame(ptyId: string, data: string): void {
    const entry = this.getOrCreatePtyTitleTrackerEntry(ptyId)
    entry.applyingChunk = true
    entry.applyingSyntheticFrame = true
    entry.chunkTouchedSessionTabs = false
    try {
      entry.tracker.applySyntheticTitleFrame(data)
    } finally {
      entry.applyingChunk = false
      entry.applyingSyntheticFrame = false
      this.flushPendingTerminalSideEffectFacts(ptyId, entry)
    }
    if (entry.chunkTouchedSessionTabs) {
      this.touchMobileSessionSnapshotsForPty(ptyId)
    }
  }

  /** Scan-authority handoff for a backgrounded PTY (daemon keep-tail
   *  thinning): while delegated, the daemon relays bell/133/pr-link/2031
   *  facts itself and the delivered bytes may be gapped — feeding them to
   *  main's transient scanners would mint phantom or duplicate facts. Title
   *  processing stays main-side either way. */
  setPtyTransientFactDelegation(ptyId: string, delegated: boolean, scanSeedAnsi?: string): void {
    const entry = this.getOrCreatePtyTitleTrackerEntry(ptyId)
    entry.tracker.setTransientFactScanningSuppressed(delegated)
    if (!delegated && scanSeedAnsi) {
      // Prime the freshly reset scanner carry with the emulator's dangling
      // incomplete escape at the handoff position — a sequence split across
      // the un-background toggle must not mint a phantom bell or lose its
      // fact. titleScanData:'' keeps titles out (they were never suppressed).
      entry.tracker.handleChunk(scanSeedAnsi, { titleScanData: '' })
    }
  }

  /** A transient fact the daemon detected while it held scan authority —
   *  emitted through the same fact channel as byte-scanned facts. Arrives
   *  between chunks, so recordTerminalSideEffectFact emits it immediately. */
  emitDaemonPtyTransientFact(ptyId: string, fact: PtyTransientFact): void {
    switch (fact.kind) {
      case 'bell':
        this.recordTerminalSideEffectFact(ptyId, { kind: 'bell' })
        return
      case 'command-finished':
        this.recordTerminalSideEffectFact(ptyId, {
          kind: 'command-finished',
          exitCode: fact.exitCode
        })
        return
      case 'pr-link':
        this.recordTerminalSideEffectFact(ptyId, { kind: 'pr-link', link: fact.link })
        return
      case '2031-subscribe':
        this.recordTerminalSideEffectFact(ptyId, { kind: '2031-subscribe' })
    }
  }

  /** The daemon keep-tail dropped this PTY's oldest undelivered output; the
   *  next delivered chunk is discontinuous. Reset every cross-chunk parse
   *  carry so a half-open escape from before the gap cannot corrupt what
   *  follows, and drop the mobile headless mirror — it rebuilds from the
   *  delivered tail / snapshot seeds instead of parsing a gapped stream. */
  notePtyDataGap(ptyId: string, droppedChars = 0): void {
    if (droppedChars > 0) {
      // Why: the daemon snapshot's seq counts bytes its monitoring stream
      // dropped. Advancing without parsing preserves that absolute domain so
      // post-snapshot live chunks can be reconciled instead of duplicated.
      const outputSequence = (this.ptyOutputSequenceById.get(ptyId) ?? 0) + droppedChars
      this.ptyOutputSequenceById.set(ptyId, outputSequence)
    }
    const pty = this.getOrCreatePtyWorktreeRecord(ptyId)
    if (pty) {
      pty.tailPendingAnsi = ''
      this.terminalSessions.commitPtyState(ptyId, { pty })
    }
    const updatedLeaves = this.terminalSessions.getGraphLeavesForPty(ptyId)
    for (const leaf of updatedLeaves) {
      leaf.tailPendingAnsi = ''
    }
    this.terminalSessions.commitPtyState(ptyId, { leaves: updatedLeaves })
    this.oscTitleScanTailByPtyId.delete(ptyId)
    this.osc7ScanTailByPtyId.delete(ptyId)
    this.agentStatusOscProcessorsByPtyId.delete(ptyId)
    this.disposeHeadlessTerminal(ptyId)
  }

  /** Record one derived side-effect fact: batched per chunk while applying
   *  bytes, emitted immediately for between-chunk facts (stale-title timer). */
  private recordTerminalSideEffectFact(ptyId: string, fact: TerminalSideEffectFact): void {
    if (!this.onTerminalSideEffects || !this.terminalSideEffectConsumerAvailable) {
      return
    }
    const entry = this.ptyTitleTrackersByPtyId.get(ptyId)
    if (entry?.applyingChunk) {
      entry.pendingFacts.push(fact)
      return
    }
    this.emitTerminalSideEffectBatch(ptyId, [fact])
  }

  private emitTerminalSideEffectBatch(
    ptyId: string,
    facts: TerminalSideEffectFact[],
    options: { replay?: boolean } = {}
  ): void {
    if (
      !this.onTerminalSideEffects ||
      !this.terminalSideEffectConsumerAvailable ||
      facts.length === 0
    ) {
      return
    }
    const batch: TerminalSideEffectBatch = {
      ptyId,
      seq: this.ptyOutputSequenceById.get(ptyId) ?? 0,
      facts,
      ...(options.replay ? { replay: true } : {}),
      ...this.resolveTerminalSideEffectAttribution(ptyId)
    }
    try {
      this.onTerminalSideEffects(batch)
    } catch (err) {
      console.error('[runtime] terminal side-effect listener threw', { ptyId, err })
    }
  }

  /** Same attribution resolution as emitTerminalAgentStatusEvents: prefer the
   *  first mounted leaf, fall back to the spawn-time PTY record binding. */
  private resolveTerminalSideEffectAttribution(ptyId: string): {
    worktreeId?: string
    tabId?: string
    paneKey?: string
    connectionId?: string | null
  } {
    const pty = this.terminalSessions.getPtyRecord(ptyId)
    const connectionId = pty?.connectionId ?? null
    for (const leaf of this.getLeavesForPty(ptyId)) {
      return {
        worktreeId: leaf.worktreeId,
        tabId: leaf.tabId,
        paneKey: this.makeRuntimePaneKey(leaf),
        connectionId
      }
    }
    if (pty?.paneKey) {
      return {
        worktreeId: pty.worktreeId,
        ...(pty.tabId ? { tabId: pty.tabId } : {}),
        paneKey: pty.paneKey,
        connectionId
      }
    }
    return {}
  }

  /** Title-only replay batch for renderer (re)attach — the no-attention-replay
   *  rule: snapshots restore title state, never historical bells/completions. */
  getTerminalSideEffectSnapshot(ptyId: string): TerminalSideEffectBatch | null {
    const tracker = this.ptyTitleTrackersByPtyId.get(ptyId)?.tracker
    const recordTitle = this.terminalSessions.getPtyRecord(ptyId)?.lastOscTitle
    // Why: the cursor-agent literal drop applies to every title surface; a
    // record-fallback snapshot must not replay the bare native title the
    // tracker would have refused to emit live.
    const rawTitle = recordTitle && !isCursorNativeAgentTitle(recordTitle) ? recordTitle : null
    const normalizedTitle = tracker?.getLastNormalizedTitle() ?? null
    if (normalizedTitle === null && !rawTitle) {
      return null
    }
    return {
      ptyId,
      seq: this.ptyOutputSequenceById.get(ptyId) ?? 0,
      replay: true,
      facts: [
        {
          kind: 'title',
          normalizedTitle: normalizedTitle ?? normalizeTerminalTitle(rawTitle!),
          rawTitle: rawTitle ?? normalizedTitle!
        }
      ],
      ...this.resolveTerminalSideEffectAttribution(ptyId)
    }
  }

  /** Raw last title from main's tracked PTY/leaf records — the title surface
   *  the tracker (live bytes + synthetic frames) keeps current. */
  private getTrackedRawTitleForPty(ptyId: string): string | null {
    const recordTitle = this.terminalSessions.getPtyRecord(ptyId)?.lastOscTitle
    if (recordTitle) {
      return recordTitle
    }
    for (const leaf of this.getLeavesForPty(ptyId)) {
      if (leaf.lastOscTitle) {
        return leaf.lastOscTitle
      }
    }
    return null
  }

  /** Why: synthetic agent title frames no longer ride pty:data, so neither
   *  renderer xterm nor the headless emulator observes them. Mobile-parity
   *  snapshot titles must prefer main's tracker over snapshot lastTitle, or
   *  hook-driven spinner/idle titles vanish from mobile tabs. */
  private preferTrackedLastTitle<T extends { lastTitle?: string }>(ptyId: string, snapshot: T): T {
    const tracked = this.getTrackedRawTitleForPty(ptyId)
    if (!tracked) {
      return snapshot
    }
    return { ...snapshot, lastTitle: tracked }
  }

  /** Decorative comparison key: spinner frame glyphs stripped, derived agent
   *  status kept so a working→idle flip with an otherwise-equal label still
   *  counts as a change. */
  private makeMobileTitleGateKey(rawTitle: string, normalizedTitle: string): string {
    return `${detectAgentStatusFromTitle(rawTitle) ?? ''}\u0000${stripBrailleSpinnerGlyphs(
      normalizedTitle
    )}`
  }

  private getOrCreatePtyTitleTrackerEntry(ptyId: string): RuntimePtyTitleTrackerEntry {
    const existing = this.ptyTitleTrackersByPtyId.get(ptyId)
    if (existing) {
      return existing
    }
    // Why: trackers are created lazily on the first observed chunk. After an
    // app relaunch the PTY/leaf records can already hold a persisted title; a
    // cold tracker would miss the parked working→idle completion and never
    // arm the stale-title timer for a persisted 'working' title.
    let initialTitle = this.terminalSessions.getPtyRecord(ptyId)?.lastOscTitle ?? null
    if (initialTitle === null) {
      for (const leaf of this.getLeavesForPty(ptyId)) {
        if (leaf.lastOscTitle) {
          initialTitle = leaf.lastOscTitle
          break
        }
      }
    }
    const tracker = createTerminalTitleTracker(
      {
        onTitle: (normalizedTitle, rawTitle, meta) => {
          this.recordTerminalSideEffectFact(ptyId, {
            kind: 'title',
            normalizedTitle,
            rawTitle,
            ...(meta?.staleWorkingTitleClear ? { staleWorkingTitleClear: true } : {})
          })
          const changed = this.applyTrackedPtyTitle(ptyId, rawTitle, normalizedTitle)
          if (!changed) {
            return
          }
          const live = this.ptyTitleTrackersByPtyId.get(ptyId)
          const gateKey = this.makeMobileTitleGateKey(rawTitle, normalizedTitle)
          const decorativeOnly = live?.lastMobileTitleGateKey === gateKey
          if (live) {
            live.lastMobileTitleGateKey = gateKey
          }
          if (live?.applyingChunk) {
            // Why: synthetic spinner ticks change only the braille glyph
            // ~12.5x/sec; fanning out full mobile session snapshots per frame
            // is pure churn. Raw lastOscTitle updates above stay cheap.
            if (!(live.applyingSyntheticFrame && decorativeOnly)) {
              live.chunkTouchedSessionTabs = true
            }
          } else {
            // Stale-working-title timer path — fires between chunks, so the
            // per-chunk batching in onPtyData cannot pick it up.
            this.touchMobileSessionSnapshotsForPty(ptyId)
          }
        },
        // Why: agent transitions and bells become pty:sideEffect facts —
        // main is the single byte parser for local/SSH PTYs; the renderer
        // store handler decides what the facts mean (notification policy).
        onAgentBecameWorking: () => {
          this.recordTerminalSideEffectFact(ptyId, { kind: 'agent-working' })
        },
        onAgentBecameIdle: (title, meta) => {
          this.recordTerminalSideEffectFact(ptyId, {
            kind: 'agent-idle',
            title,
            ...(meta?.staleWorkingTitleClear ? { staleWorkingTitleClear: true } : {})
          })
        },
        onAgentExited: () => {
          this.recordTerminalSideEffectFact(ptyId, { kind: 'agent-exited' })
        },
        // Why: bell/command-finished/pr-link/2031 facts exist only for the
        // pty:sideEffect channel. Headless serve has no consumer, so skip the
        // per-chunk bell walk and 133/URL/2031 scans entirely.
        ...(this.terminalSideEffectConsumerAvailable
          ? {
              onBell: () => {
                this.recordTerminalSideEffectFact(ptyId, { kind: 'bell' })
              },
              onCommandFinished: (exitCode: number | null) => {
                this.recordTerminalSideEffectFact(ptyId, { kind: 'command-finished', exitCode })
              },
              onPrLink: (link: TerminalGitHubPRLink) => {
                this.recordTerminalSideEffectFact(ptyId, { kind: 'pr-link', link })
              },
              // Why: hidden-delivery-gated views never see the bytes, so main
              // surfaces DECSET 2031 subscribes as facts; the theme reply is
              // still sent by the renderer (query authority stays with the view).
              onMode2031Subscribe: () => {
                this.recordTerminalSideEffectFact(ptyId, { kind: '2031-subscribe' })
              }
            }
          : {})
      },
      initialTitle !== null ? { initialTitle } : {}
    )
    const entry: RuntimePtyTitleTrackerEntry = {
      tracker,
      applyingChunk: false,
      applyingSyntheticFrame: false,
      lastMobileTitleGateKey: null,
      chunkTouchedSessionTabs: false,
      pendingFacts: [],
      // Why: command-code facts exist only for the pty:sideEffect channel —
      // headless serve skips the per-chunk scrape entirely. The detector
      // self-arms on the Command Code banner; the spawn command (when main
      // saw one) mirrors the renderer detector's startupCommand fast-arm.
      commandCodeDetector: this.terminalSideEffectConsumerAvailable
        ? createCommandCodeOutputStatusDetector({
            startupCommand: this.terminalSpawnCommandsByPtyId.get(ptyId) ?? null,
            onWorking: (prompt) => {
              this.recordTerminalSideEffectFact(ptyId, { kind: 'command-code-working', prompt })
            },
            onDone: (prompt) => {
              this.recordTerminalSideEffectFact(ptyId, { kind: 'command-code-done', prompt })
            }
          })
        : null
    }
    this.ptyTitleTrackersByPtyId.set(ptyId, entry)
    return entry
  }

  /** Apply one observed OSC title (raw form) to the PTY and leaf records.
   *  Returns true when the PTY record's title or status changed. */
  private applyTrackedPtyTitle(ptyId: string, rawTitle: string, normalizedTitle: string): boolean {
    // Why: status is detected from the RAW title (mirrors the renderer tracker),
    // so working/idle transitions are unaffected by normalization; the records
    // store the NORMALIZED title so rotating Grok/Pi/Gemini frames collapse to
    // one stable stored label (#7880) instead of churning `ps`/mobile tabs.
    const agentStatus = detectAgentStatusFromTitle(rawTitle)
    let ptyRecordChanged = false
    this.terminalSessions.mutatePtyOutputState(ptyId, ({ pty, leaves }) => {
      if (pty) {
        const prevStatus = pty.lastAgentStatus
        const prevTitle = pty.lastOscTitle
        const observedAt = this.nextTitleObservationSequence()
        pty.lastOscTitle = normalizedTitle
        pty.lastOscTitleAt = observedAt
        pty.lastAgentStatus = agentStatus
        this.setPtyManagementTitleFromObservedTitle(pty, normalizedTitle, observedAt)
        ptyRecordChanged = prevTitle !== normalizedTitle || prevStatus !== agentStatus
        if (agentStatus === 'idle' && prevStatus !== 'idle') {
          this.resolvePtyTuiIdleWaiters(pty, ptyId)
        }
        const shouldDelayMobileSnapshot =
          ptyRecordChanged &&
          this.shouldDelayPtyBackedMobileSnapshotForForegroundAgent(pty, normalizedTitle)
        let foregroundRefresh: Promise<boolean> | undefined
        // Why: status transitions, not spinner frames, pay the foreground-process probe.
        if (prevStatus !== agentStatus) {
          foregroundRefresh = this.refreshPtyForegroundAgentFromController(ptyId, {
            afterTitleObservation: observedAt
          })
        } else if (shouldDelayMobileSnapshot) {
          foregroundRefresh = this.getPendingForegroundAgentRefreshForTitle(ptyId, observedAt)
        }
        if (foregroundRefresh && shouldDelayMobileSnapshot) {
          ptyRecordChanged = false
          this.delayPtyBackedMobileSnapshotForForegroundAgent(ptyId, observedAt, foregroundRefresh)
        }
      }
      for (const leaf of leaves) {
        // Why: keep the latest OSC title on the leaf so worktree.ps can
        // recompute status from the live title each call. Without this,
        // daemon-hosted terminals (no renderer pushing pane titles) had no
        // way to clear a stale 'working' status after the agent exited and
        // the shell took over the title — the stuck-spinner bug in #1437.
        leaf.lastOscTitle = normalizedTitle
        leaf.lastOscTitleAt = this.nextTitleObservationSequence()
        const prevStatus = leaf.lastAgentStatus
        // Why: when a new OSC title doesn't classify as an agent state (e.g.
        // bare shell title after the agent exits), clear lastAgentStatus so
        // it is no longer sticky. Tui-idle waiters that needed the previous
        // 'idle' transition were already resolved at the moment of the
        // transition below; only fresh waiters registered after the agent
        // exits would observe the cleared value, and they correctly fall
        // back to title-based detection / polling.
        leaf.lastAgentStatus = agentStatus
        // Why: resolve tui-idle on any transition TO idle (not just working→idle).
        // Claude Code may skip "working" entirely on fast tasks, going null→idle,
        // and the coordinator's tui-idle waiter would hang forever waiting for a
        // working→idle transition that never comes. Permission→idle is excluded:
        // it means the agent was blocked on user approval and the user said no,
        // which isn't a task-completion signal.
        if (agentStatus === 'idle' && prevStatus !== 'idle') {
          this.resolveTuiIdleWaiters(leaf)
          this.deliverPendingMessages(leaf)
        }
      }
    })
    return ptyRecordChanged
  }

  /** Cancel the per-PTY title tracker (stale-title timer included) on PTY
   *  teardown so it cannot fire into pruned records. */
  private disposePtyTitleTracker(ptyId: string): void {
    this.ptyTitleTrackersByPtyId.get(ptyId)?.tracker.dispose()
    this.ptyTitleTrackersByPtyId.delete(ptyId)
  }

  private resetTrackedTerminalStateForProviderGeneration(ptyId: string): void {
    // Why: a replacement daemon session can reuse the PTY id, but title/parser
    // state from the prior process must not bleed into its snapshots or chunks.
    this.disposePtyTitleTracker(ptyId)
    this.oscTitleScanTailByPtyId.delete(ptyId)
    this.osc7ScanTailByPtyId.delete(ptyId)
    this.agentStatusOscProcessorsByPtyId.delete(ptyId)
    const pty = this.terminalSessions.getPtyRecord(ptyId)
    if (pty) {
      pty.lastOscTitle = null
      pty.lastOscTitleAt = null
      pty.lastAgentStatus = null
      pty.managementTitle = null
      pty.managementTitleAt = null
      this.terminalSessions.commitPtyState(ptyId, { pty })
    }
    const updatedLeaves = this.terminalSessions.getGraphLeavesForPty(ptyId)
    for (const leaf of updatedLeaves) {
      leaf.lastOscTitle = null
      leaf.lastOscTitleAt = null
      leaf.lastAgentStatus = null
    }
    this.terminalSessions.commitPtyState(ptyId, { leaves: updatedLeaves })
    this.clearAgentRowSnapshotsForPty(ptyId)
  }

  private setTerminalSideEffectConsumerAvailable(available: boolean): void {
    const nextAvailable = available && this.onTerminalSideEffects !== null
    if (nextAvailable === this.terminalSideEffectConsumerAvailable) {
      return
    }
    this.terminalSideEffectConsumerAvailable = nextAvailable
    // Why: optional bell/command/link scanners are selected when a tracker is
    // created. Rebuild at the window boundary so pure headless output stays cheap.
    for (const ptyId of [...this.ptyTitleTrackersByPtyId.keys()]) {
      this.disposePtyTitleTracker(ptyId)
    }
  }

  private extractLastOsc7CwdForPty(
    ptyId: string,
    data: string
  ): { path: string; hostname: string } | null {
    const previousTail = this.osc7ScanTailByPtyId.get(ptyId)
    if (!previousTail && !data.includes('\x1b]7;')) {
      return null
    }
    const input = `${previousTail ?? ''}${data}`
    const scanTail = extractOscScanTail(input, 4096)
    if (scanTail.length > 0) {
      this.osc7ScanTailByPtyId.set(ptyId, scanTail)
    } else {
      this.osc7ScanTailByPtyId.delete(ptyId)
    }
    const uri = extractLastOsc7Uri(input)
    const pty = this.terminalSessions.getPtyRecord(ptyId)
    const pathFlavor = this.pathFlavorForPty(pty)
    return uri
      ? parseFileUriPathParts(uri, {
          pathFlavor,
          remotePosixAuthority: !!pty?.connectionId && pathFlavor !== 'win32'
        })
      : null
  }

  private recordOsc7MetadataForPty(
    ptyId: string,
    data: string
  ): { cwd: string | null; cwdChanged: boolean } {
    const osc7 = this.extractLastOsc7CwdForPty(ptyId, data)
    const cwd = osc7?.path ?? null
    const cwdChanged =
      cwd !== null && cwd.trim().length > 0 && this.terminalCwdByPtyId.get(ptyId) !== cwd
    if (cwdChanged) {
      this.terminalCwdByPtyId.set(ptyId, cwd)
    }
    if (osc7) {
      if (osc7.hostname) {
        this.terminalFileUriHostnameByPtyId.set(ptyId, osc7.hostname)
      } else {
        this.terminalFileUriHostnameByPtyId.delete(ptyId)
      }
    }
    return { cwd, cwdChanged }
  }

  private pathFlavorForPty(pty?: RuntimePtyWorktreeRecord | null): 'posix' | 'win32' {
    if (!pty?.connectionId) {
      return process.platform === 'win32' ? 'win32' : 'posix'
    }
    const worktreePath = splitWorktreeIdForFilesystem(pty.worktreeId)?.worktreePath
    return worktreePath && isWindowsAbsolutePathLike(worktreePath) ? 'win32' : 'posix'
  }

  /** Returns true when any retained agent-row snapshot changed in a
   *  client-visible way, so the caller can republish session snapshots. */
  private emitTerminalAgentStatusEvents(ptyId: string, chunk: ProcessedAgentStatusChunk): boolean {
    // Why: snapshot retention (for mobile worktree.ps) must run even when no
    // renderer listener is attached, so we don't early-return on a missing
    // onTerminalAgentStatus — only the per-target emit below is gated on it.
    if (chunk.payloads.length === 0) {
      return false
    }
    const targets = new Map<
      string,
      {
        source: 'mounted-leaf' | 'pty-record'
        paneKey: string
        tabId?: string
        worktreeId?: string
        connectionId?: string | null
      }
    >()
    const pty = this.terminalSessions.getPtyRecord(ptyId)
    const connectionId = pty?.connectionId ?? null
    for (const leaf of this.getLeavesForPty(ptyId)) {
      const paneKey = this.makeRuntimePaneKey(leaf)
      targets.set(paneKey, {
        source: 'mounted-leaf',
        paneKey,
        tabId: leaf.tabId,
        worktreeId: leaf.worktreeId,
        connectionId
      })
    }
    if (targets.size === 0 && pty?.paneKey) {
      targets.set(pty.paneKey, {
        source: 'pty-record',
        paneKey: pty.paneKey,
        tabId: pty.tabId ?? undefined,
        worktreeId: pty.worktreeId,
        connectionId
      })
    }
    let retainedChanged = false
    for (const payload of chunk.payloads) {
      for (const target of targets.values()) {
        retainedChanged =
          this.retainAgentRowSnapshot(
            ptyId,
            target.paneKey,
            target.worktreeId,
            target.tabId,
            payload
          ) || retainedChanged
        if (!this.onTerminalAgentStatus) {
          continue
        }
        try {
          this.onTerminalAgentStatus({
            ptyId,
            ...target,
            payload
          })
        } catch (err) {
          console.error('[runtime] terminal agent status listener threw', {
            ptyId,
            paneKey: target.paneKey,
            state: payload.state,
            agentType: payload.agentType,
            err
          })
        }
      }
    }
    return retainedChanged
  }

  private retainAgentRowSnapshot(
    ptyId: string,
    paneKey: string,
    worktreeId: string | undefined,
    tabId: string | undefined,
    payload: ParsedAgentStatusPayload
  ): boolean {
    const now = Date.now()
    const previous = this.latestAgentStatusByPaneKey.get(paneKey)
    // Why: stateStartedAt must mark the transition into the current state, not
    // every within-state ping (tool/prompt updates keep the state but refresh
    // updatedAt) — mirrors AgentStatusEntry.stateStartedAt on the desktop side.
    const stateStartedAt =
      previous && previous.payload.state === payload.state ? previous.stateStartedAt : now
    this.latestAgentStatusByPaneKey.set(paneKey, {
      paneKey,
      ptyId,
      worktreeId,
      tabId,
      payload,
      stateStartedAt,
      updatedAt: now
    })
    // Client-visible change detection: snapshot republish is gated on this so
    // repeated same-state hook pings don't fan a rebuild out to every client.
    return (
      !previous ||
      previous.payload.state !== payload.state ||
      previous.payload.prompt !== payload.prompt ||
      (previous.payload.agentType ?? null) !== (payload.agentType ?? null) ||
      (previous.payload.toolName ?? null) !== (payload.toolName ?? null) ||
      (previous.payload.interactivePrompt ?? null) !== (payload.interactivePrompt ?? null) ||
      (previous.payload.interrupted ?? false) !== (payload.interrupted ?? false)
    )
  }

  private clearAgentRowSnapshotsForPty(ptyId: string): void {
    for (const [paneKey, snapshot] of this.latestAgentStatusByPaneKey) {
      if (snapshot.ptyId === ptyId) {
        this.latestAgentStatusByPaneKey.delete(paneKey)
      }
    }
  }

  getPtyOutputSequence(ptyId: string): number {
    return this.ptyOutputSequenceById.get(ptyId) ?? 0
  }

  synchronizePtyOutputSequenceFromProvider(
    ptyId: string,
    providerSequence: { value: number; generation: 'continued' | 'reset' },
    runtimeSequenceAtSpawnStart = 0
  ): number {
    if (
      !Number.isFinite(providerSequence.value) ||
      providerSequence.value < 0 ||
      !Number.isFinite(runtimeSequenceAtSpawnStart) ||
      runtimeSequenceAtSpawnStart < 0
    ) {
      return this.getPtyOutputSequence(ptyId)
    }
    const baseline = Math.floor(providerSequence.value)
    const currentSequence = this.getPtyOutputSequence(ptyId)
    const sequenceAtSpawnStart = Math.min(currentSequence, Math.floor(runtimeSequenceAtSpawnStart))
    const postSpawnSequence = currentSequence - sequenceAtSpawnStart
    const wasInitialized = this.providerSequenceInitializedPtys.has(ptyId)
    const replacesExistingRuntimeGeneration = wasInitialized || sequenceAtSpawnStart > 0
    const providerOffset =
      providerSequence.generation === 'reset'
        ? sequenceAtSpawnStart
        : (this.providerSequenceOffsetByPtyId.get(ptyId) ?? 0)
    const providerBaseline = providerOffset + baseline

    if (providerSequence.generation === 'reset') {
      // Why: daemon respawn/cold restore starts a new absolute domain. Old
      // emulator state cannot remain authoritative over the replacement.
      if (replacesExistingRuntimeGeneration) {
        this.disposeHeadlessTerminal(ptyId)
      }
      this.providerModeTrackersByPtyId.delete(ptyId)
      if (replacesExistingRuntimeGeneration && postSpawnSequence === 0) {
        this.resetTrackedTerminalStateForProviderGeneration(ptyId)
      }
    }

    const synchronizedSequence =
      providerSequence.generation === 'reset'
        ? currentSequence
        : wasInitialized
          ? currentSequence
          : providerBaseline + postSpawnSequence
    this.ptyOutputSequenceById.set(ptyId, synchronizedSequence)
    this.providerSequenceInitializedPtys.add(ptyId)
    this.providerSequenceOffsetByPtyId.set(ptyId, providerOffset)

    const snapshotMayCoverMissingState =
      (providerSequence.generation === 'continued' && !wasInitialized) ||
      (postSpawnSequence > 0 &&
        providerSequence.generation === 'reset' &&
        replacesExistingRuntimeGeneration) ||
      (providerSequence.generation === 'continued' &&
        wasInitialized &&
        providerBaseline > currentSequence)
    if (snapshotMayCoverMissingState) {
      // Why: bytes can cross the control/stream sockets around attach. Until a
      // full renderer/provider snapshot is available, a partial model is unsafe.
      this.providerSnapshotPreferredPtys.add(ptyId)
    } else if (providerSequence.generation === 'reset') {
      this.providerSnapshotPreferredPtys.delete(ptyId)
    }

    const headless = this.terminalSessions.getEmulator(ptyId)
    if (headless && !wasInitialized && providerSequence.generation === 'continued') {
      // Why: daemon bytes can reach main just before spawn resolves. Queue the
      // baseline behind those writes so their emulator sequence is rebased too.
      headless.writeChain = headless.writeChain.then(() => {
        headless.outputSequence = synchronizedSequence
      })
    }
    return synchronizedSequence
  }

  subscribeToTerminalData(
    ptyId: string,
    listener: (data: string, meta?: { seq?: number; rawLength?: number; cwd?: string }) => void
  ): () => void {
    return this.terminalSessions.subscribeToData(ptyId, listener)
  }

  /** Set by pty IPC: fires when a PTY gains/loses remote view subscribers so
   *  the daemon background mark (keep-tail stream thinning) can resync — a
   *  live mobile/web view consumes raw bytes and must never be thinned, even
   *  while the desktop pane is hidden. */
  onRemoteTerminalViewPresenceChanged: ((ptyId: string) => void) | null = null

  private notifyRemoteTerminalViewPresenceChanged(ptyId: string): void {
    try {
      this.onRemoteTerminalViewPresenceChanged?.(ptyId)
    } catch (err) {
      console.error('[runtime] remote view presence listener threw', { ptyId, err })
    }
  }

  /** Registered by terminal-RPC subscribe/multiplex streams: while a remote
   *  view subscriber is attached its xterm answers queries with view
   *  authority and the model responder must stay silent. Returns an
   *  idempotent release. */
  registerRemoteTerminalViewSubscriber(ptyId: string): () => void {
    return this.terminalSessions.registerRemoteView(ptyId)
  }

  hasRemoteTerminalViewSubscriber(ptyId: string): boolean {
    return this.terminalSessions.hasRemoteView(ptyId)
  }

  isMobileTerminalQueryReplyAuthority(ptyId: string, clientId: string): boolean {
    // Why: a passive phone watching desktop-sized output must not race the
    // desktop xterm. Mobile becomes reply authority only with the mobile floor.
    if (this.getDriver(ptyId).kind !== 'mobile') {
      return false
    }
    const subscribers = this.terminalSessions.listMobileSubscribers(ptyId)
    if (subscribers.length === 0) {
      return false
    }
    // Why: soft-leave resubscribe preserves the original subscription time but
    // reinserts the record. Elect fitted responders from that stable age, not
    // mutable Map order or passive desktop-mode watchers.
    let earliest: { clientId: string; subscribedAt: number } | null = null
    for (const subscriber of subscribers) {
      if (!subscriber.wasResizedToPhone) {
        continue
      }
      if (earliest === null || subscriber.subscribedAt < earliest.subscribedAt) {
        earliest = subscriber
      }
    }
    return earliest?.clientId === clientId
  }

  subscribeToFitOverrideChanges(
    ptyId: string,
    listener: (event: {
      mode: 'mobile-fit' | 'remote-desktop-fit' | 'desktop-fit'
      cols: number
      rows: number
    }) => void
  ): () => void {
    return this.terminalSessions.subscribeToFit(ptyId, listener)
  }

  subscribeToDriverChanges(ptyId: string, listener: (driver: DriverState) => void): () => void {
    return this.terminalSessions.subscribeToDriver(ptyId, listener)
  }

  private notifyFitOverrideListeners(
    ptyId: string,
    mode: 'mobile-fit' | 'remote-desktop-fit' | 'desktop-fit',
    cols: number,
    rows: number
  ): void {
    this.terminalSessions.emitFit(ptyId, { mode, cols, rows })
  }

  serializeTerminalBuffer(
    ptyId: string,
    opts: { scrollbackRows?: number } = {}
  ): Promise<{
    data: string
    cols: number
    rows: number
    seq?: number
    cwd?: string | null
    lastTitle?: string
    source?: 'headless' | 'renderer'
    oscLinks?: TerminalOscLinkRange[]
    alternateScreen?: boolean
    scrollbackAnsi?: string
    pendingEscapeTailAnsi?: string
  } | null> {
    return this.serializeTerminalBufferFromAvailableState(ptyId, opts)
  }

  hasHeadlessTerminalState(ptyId: string): boolean {
    return this.terminalSessions.hasEmulator(ptyId)
  }

  serializeMainTerminalBuffer(
    ptyId: string,
    opts: { scrollbackRows?: number } = {}
  ): Promise<{
    data: string
    cols: number
    rows: number
    seq?: number
    cwd?: string | null
    lastTitle?: string
    source?: 'headless' | 'renderer'
    oscLinks?: TerminalOscLinkRange[]
    alternateScreen?: boolean
    scrollbackAnsi?: string
  } | null> {
    return this.serializeHeadlessTerminalBuffer(ptyId, { ...opts, includeEmpty: true })
  }

  async serializeHiddenOutputRecoveryBuffer(
    ptyId: string,
    opts: { scrollbackRows?: number } = {}
  ): Promise<{
    data: string
    cols: number
    rows: number
    cwd?: string | null
    lastTitle?: string
    seq?: number
    source?: 'headless' | 'renderer'
    oscLinks?: TerminalOscLinkRange[]
    alternateScreen?: boolean
    scrollbackAnsi?: string
    pendingEscapeTailAnsi?: string
  } | null> {
    const headlessSnapshot = await this.serializeHeadlessTerminalBuffer(ptyId, {
      ...opts,
      includeEmpty: true
    })
    if (headlessSnapshot) {
      return headlessSnapshot
    }
    // Why: hidden-output recovery is initiated by the desktop renderer. If the
    // runtime has not built headless state yet, the mounted xterm is still the
    // best available state and avoids a false "snapshot unavailable" result.
    const rendererSnapshot = await this.serializeRendererTerminalBuffer(ptyId, opts)
    return rendererSnapshot ?? this.serializeProviderTerminalBuffer(ptyId, opts)
  }

  async clearTerminalBuffer(handle: string): Promise<{ handle: string; cleared: boolean }> {
    const leaf = this.resolveLeafForHandle(handle)
    if (!leaf?.ptyId) {
      throw new Error('terminal_not_found')
    }
    // Why: clear is a terminal UI action (Cmd+K on desktop), not shell input.
    // Route through the controller so renderer-owned xterm buffers, daemon
    // sessions, and SSH relay sessions all drop scrollback before the next
    // mobile snapshot.
    await this.ptyController?.clearBuffer?.(leaf.ptyId)
    await this.clearHeadlessTerminalBuffer(leaf.ptyId)
    return { handle, cleared: true }
  }

  getTerminalSize(ptyId: string): { cols: number; rows: number } | null {
    return this.ptyController?.getSize?.(ptyId) ?? null
  }

  // Why: a width reflow on a normal-buffer PTY must re-stream the full
  // scrollback to mobile so it rewraps at the new cols, but alternate-screen
  // TUIs (vim, Claude Code) own their repaint and have no scrollback — for
  // those the mobile client just resizes xterm geometry and consumes the
  // TUI's own redraw, so the resize re-stream must be skipped. Provider state
  // covers restored PTYs whose main-side emulator is only a partial suffix.
  isTerminalAlternateScreen(ptyId: string): boolean {
    if (this.providerSnapshotPreferredPtys.has(ptyId)) {
      return this.providerModeTrackersByPtyId.get(ptyId)?.isAlternateScreen ?? false
    }
    return (
      this.terminalSessions.getEmulator(ptyId)?.emulator.isAlternateScreen ??
      this.providerModeTrackersByPtyId.get(ptyId)?.isAlternateScreen ??
      false
    )
  }

  // Why: daemon-backed PTYs that the runtime adopted after a Yiru relaunch
  // start with a fresh headless emulator that has zero scrollback, even though
  // the daemon's on-disk checkpoint and the desktop xterm both contain the
  // full prior history. Without this hydration, mobile subscribers see only
  // the bare current prompt because serializeHeadlessTerminalBuffer always
  // wins over the renderer-path fallback. Seeding the emulator with the
  // adapter's snapshot/cold-restore data makes mobile and desktop agree on
  // what scrollback is available.
  seedHeadlessTerminal(
    ptyId: string,
    data: string,
    size?: { cols: number; rows: number },
    metadata: HeadlessSeedMetadata = {}
  ): void {
    if (!data) {
      return
    }
    const existing = this.terminalSessions.getEmulator(ptyId)
    if (existing) {
      // Why: emulator already has live data — re-seeding would duplicate
      // every byte. The seed is only valid when the emulator is fresh.
      if (metadata.preferProviderIfExisting) {
        this.providerSnapshotPreferredPtys.add(ptyId)
      }
      return
    }
    const dims = size ?? this.getTerminalSize(ptyId) ?? { cols: 80, rows: 24 }
    const state = this.createPtyHeadlessTerminalState(ptyId, dims)
    state.outputSequence = this.getPtyOutputSequence(ptyId)
    this.terminalSessions.setEmulator(ptyId, state)
    this.recordOsc7MetadataForPty(ptyId, data)
    this.recordRecentPtyOutputForPathProvenance(ptyId, data)
    state.writeChain = state.writeChain
      .then(async () => {
        // Why: seed writes never set forwardQueryReplies — the main-side
        // replay guard. A snapshot containing old queries must answer no one.
        await state.emulator.write(data)
        // Why AFTER the seed write: the snapshot payload cannot carry kitty
        // pushes (rehydrateSequences deliberately omits them), but ordering
        // behind it keeps the parse deterministic. Unflagged like the seed —
        // re-applying flags must answer no one.
        if (typeof metadata.kittyKeyboardFlags === 'number') {
          await state.emulator.applyKittyKeyboardFlags(metadata.kittyKeyboardFlags)
        }
        if (metadata.cwd !== undefined) {
          state.emulator.setCwd(metadata.cwd)
        }
        if (metadata.oscLinks !== undefined) {
          state.emulator.setRestoredOscLinks(metadata.oscLinks)
        }
        this.providerSnapshotPreferredPtys.delete(ptyId)
      })
      .catch(() => {
        // Seeding is best-effort; live data will continue to populate the
        // emulator even if the snapshot replay fails.
      })
  }

  // Why: hydrate the runtime headless emulator from the desktop renderer's
  // xterm buffer on the first onPtyData byte after a PTY is taken over by a
  // pane. Eager-state pattern matches seedHeadlessTerminal: headlessTerminals
  // is populated synchronously so concurrent live writes from
  // trackHeadlessTerminalData chain after the seed via the same writeChain.
  // See docs/mobile-prefer-renderer-scrollback.md.
  private maybeHydrateHeadlessFromRenderer(ptyId: string): void {
    if (this.terminalSessions.getEmulatorHydration(ptyId) !== null) {
      return
    }
    const providerSnapshotPreferred = this.providerSnapshotPreferredPtys.has(ptyId)
    if (this.terminalSessions.hasEmulator(ptyId) && !providerSnapshotPreferred) {
      // Daemon-snapshot seed already populated the emulator — skip hydration.
      this.terminalSessions.setEmulatorHydration(ptyId, 'done')
      return
    }
    const controller = this.ptyController
    if (!controller?.serializeBuffer || !controller.hasRendererSerializer) {
      return
    }
    if (!controller.hasRendererSerializer(ptyId)) {
      // Renderer hasn't registered yet (or never will). Live writes lazy-
      // create the state via trackHeadlessTerminalData on this same tick.
      return
    }

    if (providerSnapshotPreferred) {
      // Why: a stream byte can create a partial model before restored history
      // arrives. A mounted renderer snapshot can safely replace that model.
      this.disposeHeadlessTerminal(ptyId)
    }

    this.terminalSessions.setEmulatorHydration(ptyId, 'pending')
    const dims = this.getTerminalSize(ptyId) ?? { cols: 80, rows: 24 }
    // Why: hydration writes below never set forwardQueryReplies (main-side
    // replay guard) — renderer-buffer snapshots can embed stale queries.
    const state = this.createPtyHeadlessTerminalState(ptyId, dims)
    state.outputSequence = this.getPtyOutputSequence(ptyId)
    this.terminalSessions.setEmulator(ptyId, state)

    // Why: append the seed work to writeChain so live writes queued by
    // trackHeadlessTerminalData (after this method returns synchronously)
    // execute AFTER the seed-write resolves. If we awaited inline before
    // setting headlessTerminals, the live byte would lazy-create a separate
    // state and the seed-resolve would overwrite it, dropping live bytes.
    state.writeChain = state.writeChain.then(async () => {
      try {
        const rendered = await controller.serializeBuffer!(ptyId, {
          scrollbackRows: MOBILE_SUBSCRIBE_SCROLLBACK_ROWS,
          altScreenForcesZeroRows: true
        })
        if (!rendered || rendered.data.length === 0) {
          return
        }
        this.recordOsc7MetadataForPty(ptyId, rendered.data)
        this.recordRecentPtyOutputForPathProvenance(ptyId, rendered.data)
        // Resize to renderer's dims so the seed reflows correctly into the
        // emulator's grid, then resize back to PTY dims (if known) so live
        // writes use the correct cell layout.
        if (rendered.cols !== dims.cols || rendered.rows !== dims.rows) {
          state.emulator.resize(rendered.cols, rendered.rows)
        }
        await state.emulator.write(rendered.data)
        const ptyDims = this.getTerminalSize(ptyId)
        if (ptyDims && (ptyDims.cols !== rendered.cols || ptyDims.rows !== rendered.rows)) {
          state.emulator.resize(ptyDims.cols, ptyDims.rows)
        }
        // Why: the renderer xterm no longer sees synthetic hook title frames
        // (they feed main's tracker only), so its serializer lastTitle can be
        // stale here. Prefer main's tracked title; the renderer's is only the
        // seed when main has observed none (fresh relaunch, cold tracker).
        const seedTitle = this.getTrackedRawTitleForPty(ptyId) ?? rendered.lastTitle
        if (seedTitle) {
          state.emulator.setLastTitle(seedTitle)
          this.applySeededAgentStatus(ptyId, seedTitle)
        }
        this.providerSnapshotPreferredPtys.delete(ptyId)
      } catch {
        // Hydration is best-effort. Live writes continue via the same
        // writeChain that this catch-arm leaves intact.
      } finally {
        this.terminalSessions.setEmulatorHydration(ptyId, 'done')
      }
    })
  }

  // Why: seed-derived agent status reflects historical state. Orchestration
  // waiters (resolveTuiIdleWaiters, deliverPendingMessages) must only react
  // to LIVE transitions, so this helper writes leaf.lastAgentStatus only and
  // never resolves waiters. detectAgentStatusFromTitle wrap mirrors the live
  // path so seeded and live values are the same union member, keeping
  // downstream `=== 'idle'` checks correct.
  private applySeededAgentStatus(ptyId: string, title: string): void {
    if (!title) {
      return
    }
    // Why: a relaunched main starts its per-PTY title tracker cold — without
    // this seed it misses the parked working→idle completion and never arms
    // the stale-title timer for a persisted 'working' title. Seeding no-ops
    // once a live title was observed, so live state always wins.
    this.getOrCreatePtyTitleTrackerEntry(ptyId).tracker.seedInitialTitle(title)
    const status = detectAgentStatusFromTitle(title)
    // Why: live observations store normalized titles, so seeds must match —
    // otherwise the first live frame after hydration compares unequal and
    // touches session tabs once for no visible change.
    const seededTitle = normalizeTerminalTitle(title)
    const pty = this.terminalSessions.getPtyRecord(ptyId)
    if (pty) {
      const observedAt = this.nextTitleObservationSequence()
      pty.lastOscTitle = seededTitle
      pty.lastOscTitleAt = observedAt
      this.setPtyManagementTitleFromObservedTitle(pty, seededTitle, observedAt)
      this.terminalSessions.commitPtyState(ptyId, { pty })
    }
    const updatedLeaves = this.terminalSessions.getGraphLeavesForPty(ptyId)
    for (const leaf of updatedLeaves) {
      // Why: seed lastOscTitle even when the seeded title doesn't classify
      // as an agent state, so worktree.ps recomputes status from the live
      // title rather than treating the leaf as agentless.
      leaf.lastOscTitle = seededTitle
      leaf.lastOscTitleAt = this.nextTitleObservationSequence()
      if (status !== null) {
        leaf.lastAgentStatus = status
      }
    }
    this.terminalSessions.commitPtyState(ptyId, { leaves: updatedLeaves })
  }

  /** Per-chunk reply ownership is captured synchronously before ingestion so
   *  provider adapters and the queued emulator write use the same decision. */
  getTerminalQueryReplyOwnerForLiveChunk(ptyId: string): TerminalQueryReplyOwner {
    return resolveTerminalQueryReplyOwner({
      ptyId,
      settings: this.store?.getSettings(),
      hasRemoteViewSubscriber: this.hasRemoteTerminalViewSubscriber(ptyId)
    })
  }

  private trackHeadlessTerminalData(
    ptyId: string,
    data: string,
    outputSequence: number,
    forwardQueryReplies = false
  ): void {
    const state = this.getOrCreateHeadlessTerminal(ptyId)
    state.writeChain = state.writeChain
      .then(async () => {
        // Why: the ingestion-time ownership decision is closed over this
        // chain link; async scheduling cannot retroactively change it.
        await state.emulator.write(data, { forwardQueryReplies })
        state.outputSequence = outputSequence
      })
      .catch(() => {
        // Best-effort state tracking; live streaming must continue even if
        // xterm rejects a malformed or raced write during shutdown.
      })
  }

  /** Shared factory for the per-PTY runtime emulators (seed, hydration, and
   *  lazy live-byte creation): wires the Phase-5 query-reply sink and the
   *  ConPTY DA1 override. The daemon emulator never goes through here. */
  private createPtyHeadlessTerminalState(
    ptyId: string,
    dims: { cols: number; rows: number }
  ): RuntimeHeadlessTerminal {
    let state: RuntimeHeadlessTerminal | null = null
    const pathFlavor = this.pathFlavorForPty(this.terminalSessions.getPtyRecord(ptyId))
    const emulator = new HeadlessEmulator({
      cols: dims.cols,
      rows: dims.rows,
      pathFlavor,
      remotePosixFileUriAuthority:
        !!this.terminalSessions.getPtyRecord(ptyId)?.connectionId && pathFlavor !== 'win32',
      // Why: replies take the provider input path (same entry as pty:write —
      // daemon shell-ready gating and the SSH relay write apply unchanged),
      // NOT writePtyInput, so renderer interactive-output metering never
      // counts responder traffic as user-input echo.
      onQueryReply: (reply) => {
        // Why the identity check: queued writeChain links can parse after
        // disposeHeadlessTerminal, and daemon respawns reuse session ids — a
        // stale link's reply must never reach a successor PTY under this id.
        if (state !== null && this.terminalSessions.getEmulator(ptyId) === state) {
          // Why this write is safe pre-shell-ready: daemon Session.write
          // QUEUES (never drops) input while the POSIX shell-ready gate is
          // pending and flushes at the ready marker or the 15s
          // SHELL_READY_TIMEOUT_MS bound (session.ts) — a spawn-time query
          // reply is delayed at most that bound, not lost.
          this.ptyController?.write(ptyId, reply)
        }
      }
    })
    if (isNativeWindowsConptyPty(ptyId)) {
      emulator.installConptyPrimaryDeviceAttributesOverride()
    }
    // Why the lazy getter: replies must use the freshest renderer push at
    // parse time, and stay silent (never default) before the first push.
    emulator.installViewAttributeResponder(() => getTerminalViewAttributes())
    const viewAttributes = getTerminalViewAttributes()
    if (viewAttributes) {
      emulator.applyPushedViewAttributes(viewAttributes)
    }
    state = { emulator, outputSequence: 0, writeChain: Promise.resolve() }
    return state
  }

  /** Phase-5 ConPTY DA1 retrofit (terminal-query-authority.md): invoked via
   *  markNativeWindowsConptyPty when the spawn mark lands after daemon stream
   *  data already created this PTY's emulator. Idempotent emulator-side. */
  private ensureNativeWindowsConptyDa1Override(ptyId: string): void {
    if (isNativeWindowsConptyPty(ptyId)) {
      this.terminalSessions
        .getEmulator(ptyId)
        ?.emulator.installConptyPrimaryDeviceAttributesOverride()
    }
  }

  private getOrCreateHeadlessTerminal(ptyId: string): RuntimeHeadlessTerminal {
    const existing = this.terminalSessions.getEmulator(ptyId)
    if (existing) {
      return existing
    }
    const size = this.getTerminalSize(ptyId) ?? { cols: 80, rows: 24 }
    const state = this.createPtyHeadlessTerminalState(ptyId, size)
    this.terminalSessions.setEmulator(ptyId, state)
    return state
  }

  private resizeHeadlessTerminal(ptyId: string, cols: number, rows: number): void {
    const state = this.terminalSessions.getEmulator(ptyId)
    if (!state) {
      return
    }
    // Why: terminal reflow is a parser operation. It must sit in the same
    // per-PTY stream as output bytes or restore snapshots can bake in wraps
    // from the wrong terminal width.
    state.writeChain = state.writeChain
      .then(() => {
        state.emulator.resize(cols, rows)
      })
      .catch(() => {
        // Best-effort mirror tracking; live PTY streaming must continue even
        // if xterm rejects a raced resize during teardown.
      })
  }

  // Public: desktop-initiated clears (ipc/pty.ts) must also drop this mobile
  // mirror or a resubscribing mobile client resurrects the cleared scrollback.
  async clearHeadlessTerminalBuffer(ptyId: string): Promise<void> {
    const state = this.terminalSessions.getEmulator(ptyId)
    if (!state) {
      return
    }
    // Why: headless writes are queued to preserve xterm parser order. Clear
    // must join that same chain or an earlier PTY chunk can finish after the
    // clear request and repopulate mobile scrollback.
    state.writeChain = state.writeChain.then(() => state.emulator.clearScrollback())
    await state.writeChain
  }

  private async serializeTerminalBufferFromAvailableState(
    ptyId: string,
    opts: { scrollbackRows?: number } = {}
  ): Promise<{
    data: string
    cols: number
    rows: number
    cwd?: string | null
    lastTitle?: string
    seq?: number
    source?: 'headless' | 'renderer'
    oscLinks?: TerminalOscLinkRange[]
    alternateScreen?: boolean
    pendingEscapeTailAnsi?: string
  } | null> {
    if (this.providerSnapshotPreferredPtys.has(ptyId)) {
      // Why: pre-attach stream bytes only form a suffix of restored state. A
      // sequenced provider snapshot safely reconciles live bytes; renderer is
      // the fallback when an older provider cannot expose that boundary.
      const providerSnapshot = await this.serializeProviderTerminalBuffer(ptyId, opts)
      if (providerSnapshot) {
        return providerSnapshot
      }
      const rendererSnapshot = await this.serializeRendererTerminalBuffer(ptyId, opts)
      if (rendererSnapshot) {
        return rendererSnapshot
      }
    }
    const headlessSnapshot = await this.serializeHeadlessTerminalBuffer(ptyId, opts)
    if (headlessSnapshot) {
      return headlessSnapshot
    }

    const rendererSnapshot = await this.serializeRendererTerminalBuffer(ptyId, opts)
    if (!rendererSnapshot) {
      return this.serializeProviderTerminalBuffer(ptyId, opts)
    }
    if (rendererSnapshot.data.length > 0) {
      return rendererSnapshot
    }
    // Why: parked desktop panes register serializers before their xterm has
    // hydrated. Treat that empty shell as provisional so retained provider
    // history can restore mobile without forcing the desktop pane to mount.
    const providerSnapshot = await this.serializeProviderTerminalBuffer(ptyId, opts)
    return providerSnapshot &&
      (providerSnapshot.data.length > 0 || Boolean(providerSnapshot.scrollbackAnsi))
      ? providerSnapshot
      : rendererSnapshot
  }

  async serializeRendererTerminalBuffer(
    ptyId: string,
    opts: { scrollbackRows?: number } = {}
  ): Promise<{
    data: string
    cols: number
    rows: number
    seq?: number
    cwd?: string | null
    lastTitle?: string
    source?: 'renderer'
    oscLinks?: TerminalOscLinkRange[]
  } | null> {
    if (this.ptyController?.hasRendererSerializer?.(ptyId) === false) {
      return null
    }
    let rendererSnapshot: {
      data: string
      cols: number
      rows: number
      seq?: number
      cwd?: string | null
      lastTitle?: string
      oscLinks?: TerminalOscLinkRange[]
    } | null = null
    try {
      // Why: recovery/read fallback wants visible alt-screen content (e.g. an
      // active TUI), so altScreenForcesZeroRows is FALSE here. Hydration is
      // the only path that suppresses alt-screen scrollback.
      rendererSnapshot = await (this.ptyController?.serializeBuffer?.(ptyId, {
        scrollbackRows: opts.scrollbackRows,
        altScreenForcesZeroRows: false
      }) ?? Promise.resolve(null))
    } catch {
      // Why: terminal snapshots should not depend on a mounted renderer pane.
      // If renderer serialization races reload/unmount, callers can still use
      // their existing null fallback paths.
    }
    return rendererSnapshot
      ? this.preferTrackedLastTitle(ptyId, {
          ...rendererSnapshot,
          cwd: rendererSnapshot.cwd ?? this.terminalCwdByPtyId.get(ptyId),
          source: 'renderer' as const
        })
      : null
  }

  private async serializeProviderTerminalBuffer(
    ptyId: string,
    opts: { scrollbackRows?: number } = {}
  ): Promise<PtyProviderBufferSnapshot | null> {
    const liveModeTracker = new TerminalKittyKeyboardModeTracker()
    let liveModeTrackers = this.providerModeSnapshotScansByPtyId.get(ptyId)
    if (!liveModeTrackers) {
      liveModeTrackers = new Set()
      this.providerModeSnapshotScansByPtyId.set(ptyId, liveModeTrackers)
    }
    liveModeTrackers.add(liveModeTracker)
    try {
      // Why: daemon PTYs survive an app relaunch before any renderer mounts.
      // Mobile still needs their retained history without navigating desktop.
      const snapshot = await this.ptyController?.serializeProviderBuffer?.(ptyId, opts)
      if (typeof snapshot?.alternateScreen === 'boolean') {
        const modeTracker = new TerminalKittyKeyboardModeTracker()
        if (snapshot.alternateScreen) {
          modeTracker.scan('\x1b[?1049h')
        }
        if (liveModeTracker.hasObservedAlternateScreenSwitch) {
          modeTracker.scan(liveModeTracker.isAlternateScreen ? '\x1b[?1049h' : '\x1b[?1049l')
        }
        this.providerModeTrackersByPtyId.set(ptyId, modeTracker)
      }
      if (!snapshot) {
        return null
      }
      const providerOffset = this.providerSequenceOffsetByPtyId.get(ptyId) ?? 0
      return this.preferTrackedLastTitle(ptyId, {
        ...snapshot,
        seq: providerOffset + snapshot.seq
      })
    } catch {
      return null
    } finally {
      liveModeTrackers.delete(liveModeTracker)
      if (liveModeTrackers.size === 0) {
        this.providerModeSnapshotScansByPtyId.delete(ptyId)
      }
    }
  }

  private async withVisibleSnapshotFallback(
    ptyId: string,
    read: RuntimeTerminalRead,
    opts: { cursor?: number; limit?: number } = {}
  ): Promise<RuntimeTerminalRead> {
    if (!shouldFallbackToVisibleTerminalSnapshot(read, opts)) {
      return read
    }
    const lines = await this.readRendererVisibleSnapshotLines(ptyId)
    if (lines.length === 0) {
      return read
    }
    return buildVisibleSnapshotReadFallback(read, lines, opts.limit)
  }

  private async readRendererVisibleSnapshotLines(ptyId: string): Promise<string[]> {
    const controller = this.ptyController
    if (!controller?.serializeBuffer) {
      return []
    }
    if (controller.hasRendererSerializer && !controller.hasRendererSerializer(ptyId)) {
      return []
    }
    try {
      // Why: raw PTY tails can be whitespace-only while a full-screen TUI is
      // visibly nonblank in renderer xterm. Ask the renderer for the active
      // screen instead of reusing the headless transcript path.
      const snapshot = await controller.serializeBuffer(ptyId, {
        scrollbackRows: 0,
        altScreenForcesZeroRows: false
      })
      if (!snapshot || snapshot.data.length === 0) {
        return []
      }
      const emulator = new HeadlessEmulator({
        cols: snapshot.cols,
        rows: snapshot.rows,
        scrollback: 0
      })
      try {
        await emulator.write(snapshot.data)
        return emulator
          .getVisibleLines()
          .map((line) => line.trimEnd())
          .filter((line) => line.trim().length > 0)
      } finally {
        emulator.dispose()
      }
    } catch {
      return []
    }
  }

  private async serializeHeadlessTerminalBuffer(
    ptyId: string,
    opts: { scrollbackRows?: number; includeEmpty?: boolean } = {}
  ): Promise<{
    data: string
    cols: number
    rows: number
    cwd?: string | null
    lastTitle?: string
    seq?: number
    source?: 'headless'
    oscLinks?: TerminalOscLinkRange[]
    alternateScreen?: boolean
    scrollbackAnsi?: string
    // Why: dangling mid-escape tail the restorer must write LAST, after any
    // reset, so the next live chunk completes it instead of rendering it
    // literally (Bug E / #7329).
    pendingEscapeTailAnsi?: string
  } | null> {
    const state = this.terminalSessions.getEmulator(ptyId)
    if (!state) {
      return null
    }
    await state.writeChain
    // Why: normal history is separated from an active alternate frame, so the
    // caller's scrollback policy can be honored without painting it into alt.
    const isAlternateScreen = state.emulator.isAlternateScreen
    const scrollbackRows = opts.scrollbackRows ?? 0
    const snapshot = state.emulator.getSnapshot({ scrollbackRows })
    const data = snapshot.rehydrateSequences + snapshot.snapshotAnsi
    return data.length > 0 || opts.includeEmpty === true
      ? this.preferTrackedLastTitle(ptyId, {
          data,
          cols: snapshot.cols,
          rows: snapshot.rows,
          cwd: snapshot.cwd ?? this.terminalCwdByPtyId.get(ptyId),
          lastTitle: snapshot.lastTitle,
          seq: state.outputSequence,
          source: 'headless' as const,
          oscLinks: snapshot.oscLinks,
          scrollbackAnsi: snapshot.scrollbackAnsi,
          ...(snapshot.pendingEscapeTailAnsi
            ? { pendingEscapeTailAnsi: snapshot.pendingEscapeTailAnsi }
            : {}),
          // Why: lets the renderer skip the destructive scrollback clear when
          // restoring an alt-screen snapshot — clearing wipes xterm's own
          // history that the TUI relies on for scroll-up after a tab return.
          alternateScreen: isAlternateScreen,
          // Why NOT folded into data: the renderer writes its post-replay
          // reset after data, and any ESC after a dangling partial aborts it.
          // The restorer writes this last (Bug E fix).
          pendingEscapeTailAnsi: snapshot.pendingEscapeTailAnsi
        })
      : null
  }

  private disposeHeadlessTerminal(ptyId: string): void {
    const state = this.terminalSessions.takeEmulator(ptyId)
    if (!state) {
      return
    }
    // Why: queued chain links still parse below before the emulator disposes;
    // sever the reply sink now so they cannot write to a respawned PTY that
    // reused this id (belt to the sink's state-identity check).
    state.emulator.disableQueryReplyForwarding()
    state.writeChain.finally(() => state.emulator.dispose()).catch(() => state.emulator.dispose())
  }

  resolveLeafForHandle(handle: string): { ptyId: string | null } | null {
    const record = this.terminalSessions.getTerminalHandle(handle)
    if (!record) {
      return null
    }
    if (record.tabId.startsWith('pty:')) {
      return { ptyId: record.ptyId }
    }
    const leaf = this.terminalSessions.getGraphLeafByKey(
      this.getLeafKey(record.tabId, record.leafId)
    )
    if (!leaf) {
      return null
    }
    return { ptyId: leaf.ptyId }
  }

  // Why: remote clients hold handles across transport reconnects. A handle
  // minted for a concrete PTY must never silently adopt a different PTY that
  // later occupies the same pane — that misroutes keystrokes (#7718). Handles
  // still awaiting their first PTY (ptyId null) may adopt it, which preserves
  // the mobile pre-spawn subscribe flow.
  resolveLiveLeafForHandle(handle: string): { ptyId: string | null } | null {
    const record = this.terminalSessions.getTerminalHandle(handle)
    if (!record) {
      return null
    }
    if (record.tabId.startsWith('pty:')) {
      return { ptyId: record.ptyId }
    }
    const leaf = this.terminalSessions.getGraphLeafByKey(
      this.getLeafKey(record.tabId, record.leafId)
    )
    if (!leaf) {
      return null
    }
    if (
      record.ptyId !== null &&
      (leaf.ptyId !== record.ptyId || leaf.ptyGeneration !== record.ptyGeneration)
    ) {
      throw new Error('terminal_handle_stale')
    }
    return { ptyId: leaf.ptyId }
  }

  async resolveTerminalCwd(handle: string): Promise<string | null> {
    const ptyId = this.resolveLeafForHandle(handle)?.ptyId
    if (!ptyId) {
      return null
    }
    const tracked = this.terminalCwdByPtyId.get(ptyId)
    if (tracked) {
      return tracked
    }
    try {
      const cwd = await this.ptyController?.getCwd?.(ptyId)
      return cwd && cwd.trim().length > 0 ? cwd : null
    } catch {
      return null
    }
  }

  resolveTerminalFileUriHostname(handle: string): string | null {
    const ptyId = this.resolveLeafForHandle(handle)?.ptyId
    return ptyId ? (this.terminalFileUriHostnameByPtyId.get(ptyId) ?? null) : null
  }

  private recordRecentPtyOutputForPathProvenance(ptyId: string, data: string): void {
    this.recentPtyOutputById.set(
      ptyId,
      appendRecentPtyOutput(this.recentPtyOutputById.get(ptyId), data)
    )
    this.recentPtyPathCandidatesById.set(
      ptyId,
      appendRecentPtyPathCandidates(this.recentPtyPathCandidatesById.get(ptyId), data)
    )
  }

  resolveTerminalContext(
    handle: string
  ): { worktreeId: string; connectionId: string | null } | null {
    const ptyId = this.resolveLeafForHandle(handle)?.ptyId
    const pty = ptyId ? this.terminalSessions.getPtyRecord(ptyId) : null
    return pty ? { worktreeId: pty.worktreeId, connectionId: pty.connectionId } : null
  }

  // Why: remote clients cannot resolve this runtime's WSL project preference,
  // so host-affecting RPCs resolve it from the owning store.
  resolveProjectRuntimeForWorktree(
    worktreeId: string | null | undefined
  ): ProjectExecutionRuntimeResolution | undefined {
    return this.store && worktreeId
      ? resolveLocalProjectRuntimeForWorktreeId(this.requireStore(), worktreeId)
      : undefined
  }

  getTerminalOrchestrationCliCommand(handle: string): 'yiru' {
    let pty: RuntimePtyWorktreeRecord | null = null
    try {
      const ptyId = this.resolveLeafForHandle(handle)?.ptyId
      pty = ptyId ? (this.terminalSessions.getPtyRecord(ptyId) ?? null) : null
    } catch {
      return 'yiru'
    }
    if (!pty) {
      return 'yiru'
    }
    return resolveTerminalOrchestrationCliCommand({
      connectionId: pty.connectionId,
      isWsl: pty.isWsl,
      worktreeId: pty.worktreeId,
      projectRuntime: this.store
        ? resolveLocalProjectRuntimeForWorktreeId(this.requireStore(), pty.worktreeId)
        : undefined
    })
  }

  hasRecentTerminalOutputPath(handle: string, pathText: string, absolutePath: string): boolean {
    const ptyId = this.resolveLeafForHandle(handle)?.ptyId
    const recentOutput = ptyId ? this.recentPtyOutputById.get(ptyId) : null
    if (recentOutput && recentTerminalOutputIncludesPath(recentOutput, pathText, absolutePath)) {
      return true
    }
    const candidates = ptyId ? this.recentPtyPathCandidatesById.get(ptyId) : null
    return candidates
      ? recentTerminalPathCandidatesIncludePath(candidates, pathText, absolutePath)
      : false
  }

  registerSubscriptionCleanup(
    subscriptionId: string,
    cleanup: () => void | Promise<void>,
    connectionId?: string
  ): void {
    this.terminalSessions.registerSubscription(subscriptionId, cleanup, connectionId)
  }

  cleanupSubscription(subscriptionId: string): void {
    this.terminalSessions.cleanupSubscription(subscriptionId)
  }

  retrySubscriptionCleanupAfter(
    subscriptionId: string,
    cleanupOwner: () => void | Promise<void>,
    gate: Promise<void>
  ): void {
    this.terminalSessions.retrySubscriptionCleanupAfter(subscriptionId, cleanupOwner, gate)
  }

  cleanupSubscriptionAndWait(subscriptionId: string): Promise<void> {
    return this.terminalSessions.cleanupSubscriptionAndWait(subscriptionId)
  }

  cleanupSubscriptionsByPrefix(prefix: string): void {
    this.terminalSessions.cleanupSubscriptionsByPrefix(prefix)
  }

  // Why: invoked from the WebSocket transport's on-close hook so streaming
  // listeners registered for this exact socket get torn down even when other
  // sockets sharing the same deviceToken are still alive (multi-screen
  // mobile). Without this sweep, listeners leak across every reconnect.
  cleanupSubscriptionsForConnection(connectionId: string): void {
    this.terminalSessions.cleanupSubscriptionsForConnection(connectionId)
  }

  readonly mobileNotifications = new MobileNotificationChannel()

  // ─── Account Services (mobile RPC bridge) ─────────────────────

  setAccountServices(services: RuntimeAccountServices): void {
    this.accountServices = services
  }

  setCommitMessageAgentEnvironmentResolvers(
    resolvers: CommitMessageAgentEnvironmentResolvers
  ): void {
    this.commitMessageAgentEnv = resolvers
  }

  getCommitMessageAgentEnvironmentResolvers(): CommitMessageAgentEnvironmentResolvers | undefined {
    return this.commitMessageAgentEnv ?? undefined
  }

  // Lists the speech-model catalog joined with live download/ready state, plus
  // the current enabled flag + selected model, so mobile can present a dictation
  // setup sheet and drive remote enable/download. Always targets this (paired)
  // desktop — speech never routes to a worktree's SSH host.
  async listMobileSpeechModels(): Promise<RuntimeSpeechSetupState> {
    if (!this.store) {
      throw new Error('voice_dictation_unavailable')
    }
    const voice = this.store.getSettings().voice ?? getDefaultVoiceSettings()
    const states = await getSpeechModelManager(this.store).getModelStates()
    const stateById = new Map(states.map((state) => [state.id, state]))
    const models: RuntimeSpeechModelSummary[] = SPEECH_MODEL_CATALOG.map((manifest) => {
      const state = stateById.get(manifest.id)
      return {
        id: manifest.id,
        label: manifest.label,
        provider: manifest.provider === 'openai' ? 'openai' : 'local',
        sizeBytes: manifest.sizeBytes ?? null,
        recommended: manifest.recommended === true,
        status: state?.status ?? 'not-downloaded',
        progress: state?.progress ?? null
      }
    })
    return {
      enabled: voice.enabled === true,
      selectedModelId: voice.sttModel ?? '',
      dictationMode: voice.dictationMode === 'hold' ? 'hold' : 'toggle',
      models
    }
  }

  // Fire-and-forget model download; the ModelManager writes progress into its
  // per-model state, which mobile reads back via listMobileSpeechModels polling.
  async downloadMobileSpeechModel(modelId: string): Promise<{ started: true }> {
    if (!this.store) {
      throw new Error('voice_dictation_unavailable')
    }
    const manifest = getCatalogModel(modelId)
    if (!manifest || !isLocalSpeechModel(manifest)) {
      throw new Error('voice_model_not_downloadable')
    }
    // Why: do not await — downloads run for tens of seconds; the call returns
    // immediately and mobile polls for progress/ready.
    void getSpeechModelManager(this.store)
      .downloadModel(modelId)
      .catch((err) => {
        console.error('[runtime] mobile speech model download failed', { modelId, err })
      })
    return { started: true }
  }

  async deleteMobileSpeechModel(modelId: string): Promise<RuntimeSpeechSetupState> {
    if (!this.store?.getSettings || !this.store.updateSettings) {
      throw new Error('voice_dictation_unavailable')
    }
    const store = this.store
    try {
      // The runtime store is adapted to the minimal speech settings contract used by deletion.
      await deleteLocalSpeechModel({
        store: {
          getSettings: () => store.getSettings(),
          updateSettings: (updates, options) => store.updateSettings?.(updates, options)
        },
        modelManager: getSpeechModelManager(store),
        sttService: getSpeechSttService(store),
        modelId
      })
    } catch (error) {
      throw new Error(getSpeechModelDeletionErrorCode(error) ?? 'voice_model_delete_failed')
    }
    return this.listMobileSpeechModels()
  }

  // Enables/disables dictation and/or selects the model, merging into the
  // existing voice settings so other voice fields are preserved.
  async configureMobileDictation(params: {
    enabled?: boolean
    modelId?: string
    dictationMode?: 'toggle' | 'hold'
  }): Promise<RuntimeSpeechSetupState> {
    if (!this.store?.getSettings || !this.store.updateSettings) {
      throw new Error('voice_dictation_unavailable')
    }
    const current = this.store.getSettings().voice ?? getDefaultVoiceSettings()
    // An explicit '' clears the selected model (the OptionalString RPC schema
    // maps '' → undefined, so this only matters for direct callers); any other
    // non-empty modelId must be a known catalog entry.
    if (params.modelId !== undefined && params.modelId !== '' && !getCatalogModel(params.modelId)) {
      throw new Error('voice_model_unknown')
    }
    const nextVoice: VoiceSettings = {
      ...current,
      ...(params.enabled !== undefined ? { enabled: params.enabled } : {}),
      ...(params.modelId !== undefined ? { sttModel: params.modelId } : {}),
      ...(params.dictationMode !== undefined ? { dictationMode: params.dictationMode } : {})
    }
    this.store.updateSettings({ voice: nextVoice }, { notifyListeners: true })
    return this.listMobileSpeechModels()
  }

  async startMobileDictation(params: {
    dictationId: string
    modelId?: string
    clientId?: string
    connectionId?: string
  }): Promise<{
    dictationId: string
    modelId: string
  }> {
    if (!this.store) {
      throw new Error('voice_dictation_unavailable')
    }

    const voice = this.store.getSettings().voice ?? getDefaultVoiceSettings()
    if (!voice.enabled) {
      throw new Error('voice_dictation_disabled')
    }

    const modelId = params.modelId || voice.sttModel
    if (!modelId) {
      throw new Error('voice_model_not_selected')
    }

    const modelState = await getSpeechModelManager(this.store).getModelState(modelId)
    if (modelState.status !== 'ready') {
      throw new Error(`voice_model_not_ready:${modelState.status}`)
    }

    if (!params.clientId) {
      throw new Error('dictation_requires_mobile_client')
    }

    if (this.mobileDictation) {
      throw new Error('dictation_already_active')
    }

    const owner = `mobile:${params.dictationId}`
    this.mobileDictation = {
      id: params.dictationId,
      owner,
      clientId: params.clientId,
      connectionId: params.connectionId,
      state: 'starting',
      partialText: '',
      finalTexts: [],
      errors: []
    }

    try {
      await getSpeechSttService(this.store).startDictation(
        modelId,
        (event) => {
          const session = this.mobileDictation
          if (!session || session.id !== params.dictationId) {
            return
          }
          if (event.type === 'partial') {
            session.partialText = event.text ?? ''
          } else if (event.type === 'final') {
            const text = event.text?.trim()
            if (text) {
              session.finalTexts.push(text)
              session.partialText = ''
            }
          } else if (event.type === 'error') {
            session.errors.push(event.error ?? 'Speech worker error')
          }
        },
        undefined,
        owner
      )
      if (this.mobileDictation?.id !== params.dictationId) {
        throw new Error('dictation_canceled')
      }
      this.mobileDictation.state = 'active'
    } catch (error) {
      if (this.mobileDictation?.id === params.dictationId) {
        this.mobileDictation = null
      }
      throw error
    }

    return { dictationId: params.dictationId, modelId }
  }

  feedMobileDictation(params: {
    dictationId: string
    audioBase64: string
    sampleRate: number
    clientId?: string
    connectionId?: string
  }): {
    dictationId: string
  } {
    const session = this.mobileDictation
    if (!session || session.id !== params.dictationId) {
      throw new Error('dictation_stream_not_started')
    }
    if (!params.clientId || session.clientId !== params.clientId) {
      throw new Error('dictation_owner_mismatch')
    }
    if (session.connectionId && session.connectionId !== params.connectionId) {
      throw new Error('dictation_owner_mismatch')
    }
    if (session.state !== 'active') {
      throw new Error('dictation_stream_closing')
    }
    if (session.errors.length > 0) {
      throw new Error(session.errors[0])
    }

    const pcm = Buffer.from(params.audioBase64, 'base64')
    const samples = new Float32Array(Math.floor(pcm.length / 2))
    for (let i = 0; i < samples.length; i += 1) {
      samples[i] = pcm.readInt16LE(i * 2) / 32768
    }
    getSpeechSttService(this.store!).feedAudio(samples, params.sampleRate, session.owner)
    return { dictationId: params.dictationId }
  }

  async finishMobileDictation(params: {
    dictationId: string
    clientId?: string
    connectionId?: string
  }): Promise<{
    dictationId: string
    text: string
  }> {
    const session = this.mobileDictation
    if (!session || session.id !== params.dictationId) {
      throw new Error('dictation_stream_not_started')
    }
    if (!params.clientId || session.clientId !== params.clientId) {
      throw new Error('dictation_owner_mismatch')
    }
    if (session.connectionId && session.connectionId !== params.connectionId) {
      throw new Error('dictation_owner_mismatch')
    }
    session.state = 'closing'
    try {
      await getSpeechSttService(this.store!).stopDictation(session.owner)
      if (session.errors.length > 0) {
        throw new Error(session.errors[0])
      }
      const text = [...session.finalTexts, session.partialText].join(' ').trim()
      return { dictationId: params.dictationId, text }
    } finally {
      if (this.mobileDictation?.id === session.id) {
        this.mobileDictation = null
      }
    }
  }

  async cancelMobileDictation(params: {
    dictationId: string
    clientId?: string
    connectionId?: string
  }): Promise<{ dictationId: string }> {
    const session = this.mobileDictation
    if (
      session?.id === params.dictationId &&
      params.clientId &&
      session.clientId === params.clientId &&
      (!session.connectionId || session.connectionId === params.connectionId)
    ) {
      session.state = 'closing'
      try {
        await getSpeechSttService(this.store!).stopDictation(session.owner)
      } finally {
        if (this.mobileDictation?.id === session.id) {
          this.mobileDictation = null
        }
      }
    }
    return { dictationId: params.dictationId }
  }

  private cancelMobileDictationSession(session: NonNullable<typeof this.mobileDictation>): void {
    if (session.state === 'closing') {
      return
    }
    session.state = 'closing'
    void getSpeechSttService(this.store!)
      .stopDictation(session.owner)
      .finally(() => {
        if (this.mobileDictation?.id === session.id) {
          this.mobileDictation = null
        }
      })
  }

  cancelMobileDictationForConnection(connectionId: string): void {
    const session = this.mobileDictation
    if (!session || session.connectionId !== connectionId) {
      return
    }
    this.cancelMobileDictationSession(session)
  }

  private cancelMobileDictationForClient(clientId: string): void {
    const session = this.mobileDictation
    if (!session || session.clientId !== clientId) {
      return
    }
    this.cancelMobileDictationSession(session)
  }

  private requireAccountServices(): RuntimeAccountServices {
    if (!this.accountServices) {
      throw new Error('Account services are not configured on this runtime')
    }
    return this.accountServices
  }

  getAccountsSnapshot(): AccountsSnapshot {
    const { claudeAccounts, codexAccounts, rateLimits } = this.requireAccountServices()
    return {
      claude: claudeAccounts.listAccounts(),
      codex: codexAccounts.listAccounts(),
      rateLimits: rateLimits.getState()
    }
  }

  // Why: RateLimitService polls only when the Electron window is visible AND
  // focused, and the inactive-account caches fill lazily when the user opens
  // the desktop AccountsPane. Mobile has neither trigger, so without this the
  // phone shows 0% / "—" against a backgrounded desktop. Errors swallowed
  // because partial usage is still useful for the rest of the snapshot.
  async refreshAccountsForMobile(): Promise<void> {
    const { rateLimits } = this.requireAccountServices()
    await Promise.allSettled([
      rateLimits.refresh(),
      rateLimits.fetchInactiveClaudeAccountsOnOpen(),
      rateLimits.fetchInactiveCodexAccountsOnOpen()
    ])
  }

  // Why: connection migration replays subscriptions; use the stale-aware lane
  // so a reconnect cannot turn one mobile viewer into continuous forced fetches.
  async refreshAccountsForMobileSubscriber(): Promise<void> {
    const { rateLimits } = this.requireAccountServices()
    await Promise.allSettled([
      rateLimits.refreshIfStale(),
      rateLimits.fetchInactiveClaudeAccountsOnOpen(),
      rateLimits.fetchInactiveCodexAccountsOnOpen()
    ])
  }

  selectClaudeAccount(accountId: string | null): Promise<ClaudeRateLimitAccountsState> {
    return this.requireAccountServices().claudeAccounts.selectAccount(accountId)
  }

  selectCodexAccount(accountId: string | null): Promise<CodexRateLimitAccountsState> {
    return this.requireAccountServices().codexAccounts.selectAccount(accountId)
  }

  removeClaudeAccount(accountId: string): Promise<ClaudeRateLimitAccountsState> {
    return this.requireAccountServices().claudeAccounts.removeAccount(accountId)
  }

  removeCodexAccount(accountId: string): Promise<CodexRateLimitAccountsState> {
    return this.requireAccountServices().codexAccounts.removeAccount(accountId)
  }

  // Why: rate-limit polling fires every 5 minutes and on account switch.
  // Mobile clients subscribe to receive a fresh AccountsSnapshot whenever
  // RateLimitService pushes new usage data, mirroring the existing
  // `rateLimits:update` IPC channel desktop already uses.
  onAccountsChanged(listener: (snapshot: AccountsSnapshot) => void): () => void {
    const services = this.requireAccountServices()
    return services.rateLimits.onStateChange((rateLimits) => {
      listener({
        claude: services.claudeAccounts.listAccounts(),
        codex: services.codexAccounts.listAccounts(),
        rateLimits
      })
    })
  }

  // ─── Mobile Fit Override Management ─────────────────────────

  // Why: legacy mobile RPC entrypoint. After the state-machine rewrite this
  // is a thin shim that computes a `PtyLayoutTarget` and routes through
  // `enqueueLayout`. Keeps the same observable return shape so older mobile
  // builds continue to work. See docs/mobile-terminal-layout-state-machine.md.
  async resizeForClient(
    ptyId: string,
    mode: 'mobile-fit' | 'restore',
    clientId: string,
    cols?: number,
    rows?: number
  ): Promise<{
    cols: number
    rows: number
    previousCols: number | null
    previousRows: number | null
    mode: 'mobile-fit' | 'desktop-fit'
  }> {
    if (mode === 'mobile-fit') {
      if (cols == null || rows == null || !Number.isFinite(cols) || !Number.isFinite(rows)) {
        throw new Error('invalid_dimensions')
      }
      const { cols: clampedCols, rows: clampedRows } = clampTerminalViewport(cols, rows)

      const currentSize = this.getTerminalSize(ptyId)
      const existing = this.terminalSessions.getFitOverride(ptyId)
      // Capture baseline cols/rows for the return value (existing override's
      // baseline wins over current size to preserve original desktop dims
      // across multiple re-fits).
      const previousCols = existing?.previousCols ?? currentSize?.cols ?? null
      const previousRows = existing?.previousRows ?? currentSize?.rows ?? null

      // Why: legacy resizeForClient callers bypass handleMobileSubscribe, so
      // mobileSubscribers stays empty and resolveDesktopRestoreTarget's step-1
      // (per-subscriber baseline) never matches. Stash the pre-fit PTY size
      // into lastRendererSizes so restore lands on step 2 (renderer geometry)
      // instead of step 3 (current phone-fit dims = no-op restore).
      if (currentSize && !existing) {
        this.terminalSessions.setLastRendererSize(ptyId, currentSize.cols, currentSize.rows)
      }

      const result = await this.enqueueLayout(
        ptyId,
        {
          kind: 'phone',
          cols: clampedCols,
          rows: clampedRows,
          ownerClientId: clientId
        },
        true
      )
      if (!result.ok) {
        throw new Error('resize_failed')
      }

      // Why: mobile-fit via resizeForClient is a deliberate mobile action;
      // the actor takes the floor (updates lastActedAt; mode-flip case is
      // already handled by enqueueLayout above).
      await this.mobileTookFloor(ptyId, clientId)

      return {
        cols: clampedCols,
        rows: clampedRows,
        previousCols,
        previousRows,
        mode: 'mobile-fit'
      }
    }

    // restore mode
    const override = this.terminalSessions.getFitOverride(ptyId)
    if (!override) {
      throw new Error('no_active_override')
    }
    // Only the owning client can restore — prevents one phone from undoing
    // another phone's active fit.
    if (override.clientId !== clientId) {
      throw new Error('not_override_owner')
    }

    const restore = this.resolveDesktopRestoreTarget(ptyId)
    const result = await this.enqueueLayout(ptyId, {
      kind: 'desktop',
      cols: restore.cols,
      rows: restore.rows
    })
    if (!result.ok) {
      throw new Error('resize_failed')
    }

    // Why: legacy mobile clients on the resizeForClient path also need a
    // fit-override-listener notification (the renderer-side terminalFitOverrideChanged
    // is already emitted by applyLayout's mode-flip path).
    this.notifyFitOverrideListeners(ptyId, 'desktop-fit', restore.cols, restore.rows)

    return {
      cols: restore.cols,
      rows: restore.rows,
      previousCols: null,
      previousRows: null,
      mode: 'desktop-fit'
    }
  }

  getTerminalFitOverride(ptyId: string) {
    return this.terminalSessions.getFitOverride(ptyId) ?? null
  }

  getAllTerminalFitOverrides(): Map<
    string,
    { mode: 'mobile-fit' | 'remote-desktop-fit'; cols: number; rows: number }
  > {
    const result = new Map<
      string,
      { mode: 'mobile-fit' | 'remote-desktop-fit'; cols: number; rows: number }
    >()
    for (const [ptyId, override] of this.terminalSessions.getFitOverrides()) {
      result.set(ptyId, { mode: override.mode, cols: override.cols, rows: override.rows })
    }
    for (const [ptyId] of this.terminalSessions.listRemoteDesktopOwners()) {
      if (result.has(ptyId)) {
        continue
      }
      const size = this.getTerminalSize(ptyId)
      if (size) {
        result.set(ptyId, { mode: 'remote-desktop-fit', ...size })
      }
    }
    return result
  }

  getAllTerminalDrivers(): Map<string, DriverState> {
    return this.terminalSessions.getDrivers()
  }

  onClientDisconnected(clientId: string): void {
    this.fileCommands.revokeTerminalFileGrantsForClient(clientId)
    this.cancelMobileDictationForClient(clientId)

    // (1) Cancel pending restore-debounce timers owned by this client.
    this.terminalSessions.cancelMobileRestoreTimersForClient(clientId)

    // (2) Promote any soft-leave grace owned by this client into immediate
    // finalization. Grace existed to absorb a quick re-subscribe; a real
    // disconnect kills any chance of re-subscribe.
    //
    // Note: this is mode-decoupled (matches docs/mobile-terminal-layout-state-machine.md
    // sub-case 2). Today's pre-rewrite code only restored when
    // `mode === 'auto' && wasResizedToPhone`; the new design restores
    // whenever the layout is currently `phone`. This is an intentional
    // behavior fix — `mode === 'phone'` with no subscribers is a degenerate
    // state nothing in product depends on.
    for (const [ptyId, soft] of this.terminalSessions.takeMobileSoftLeaversForClient(clientId)) {
      // Cancel any in-flight 300ms restore timer too — we'll handle it inline.
      this.terminalSessions.cancelMobileRestoreTimer(ptyId)

      const cur = this.terminalSessions.getLayout(ptyId)
      // Why: Indefinite hold (mobileAutoRestoreFitMs == null) keeps the PTY
      // at phone dims after the phone disconnects; the desktop banner's
      // Restore button is the explicit return path. See
      // docs/mobile-fit-hold.md.
      if (this.hasRemoteDesktopViewers(ptyId)) {
        this.setDriver(ptyId, { kind: 'idle' })
        void this.applyRemoteDesktopLayout(ptyId)
        continue
      } else if (cur?.kind === 'phone' && this.getAutoRestoreFitMs() != null) {
        if (this.terminalSessions.getRemoteDesktopHostReclaimTarget(ptyId)) {
          this.setDriver(ptyId, { kind: 'idle' })
          void this.applyRemoteDesktopLayout(ptyId)
          continue
        }
        // Use the soft-leaver's snapshot baseline as a hint, falling
        // through to resolveDesktopRestoreTarget for missing values.
        const fallback = this.resolveDesktopRestoreTarget(ptyId)
        const cols = soft.record.previousCols ?? fallback.cols
        const rows = soft.record.previousRows ?? fallback.rows
        void this.enqueueLayout(ptyId, { kind: 'desktop', cols, rows })
      }
      this.setDriver(ptyId, { kind: 'idle' })
    }

    // (3) Immediate restore for PTYs where this client was the last
    // mobile subscriber. With multi-mobile, peer subscribers keep the
    // floor; only when the inner map empties do we transition to desktop.
    const ptysWithSurvivingPeers: string[] = []
    const ptysToRestore: { ptyId: string; baseline: { cols: number; rows: number } | null }[] = []
    for (const { ptyId, subscriber, hasSurvivors } of this.terminalSessions.disconnectMobileClient(
      clientId
    )) {
      // Snapshot baseline before deleting — needed once mobileSubscribers
      // entry is gone for the resolveDesktopRestoreTarget chain.
      const baseline =
        subscriber.previousCols != null && subscriber.previousRows != null
          ? { cols: subscriber.previousCols, rows: subscriber.previousRows }
          : null
      this.notifyRemoteTerminalViewPresenceChanged(ptyId)
      if (hasSurvivors) {
        ptysWithSurvivingPeers.push(ptyId)
      } else {
        ptysToRestore.push({ ptyId, baseline })
      }
    }
    for (const { ptyId, baseline } of ptysToRestore) {
      const cur = this.terminalSessions.getLayout(ptyId)
      // Why: Indefinite hold gate — see soft-leaver branch above.
      if (this.hasRemoteDesktopViewers(ptyId)) {
        this.setDriver(ptyId, { kind: 'idle' })
        void this.applyRemoteDesktopLayout(ptyId)
        continue
      } else if (cur?.kind === 'phone' && this.getAutoRestoreFitMs() != null) {
        if (this.terminalSessions.getRemoteDesktopHostReclaimTarget(ptyId)) {
          this.setDriver(ptyId, { kind: 'idle' })
          void this.applyRemoteDesktopLayout(ptyId)
          continue
        }
        const fallback = this.resolveDesktopRestoreTarget(ptyId)
        const cols = baseline?.cols ?? fallback.cols
        const rows = baseline?.rows ?? fallback.rows
        void this.enqueueLayout(ptyId, { kind: 'desktop', cols, rows })
      }
      this.setDriver(ptyId, { kind: 'idle' })
    }

    // (4) Driver re-election where peers survived. If the disconnecting
    // client was the active driver, the most-recent surviving actor takes
    // the floor.
    for (const ptyId of ptysWithSurvivingPeers) {
      const driver = this.getDriver(ptyId)
      if (driver.kind !== 'mobile' || driver.clientId !== clientId) {
        continue
      }
      const subscribers = this.terminalSessions.listMobileSubscribers(ptyId)
      const next = this.pickMostRecentActor(subscribers)
      if (!next) {
        continue
      }
      this.setDriver(ptyId, { kind: 'mobile', clientId: next.clientId })

      const mode = this.getMobileDisplayMode(ptyId)
      if (mode === 'desktop') {
        continue
      }
      const nextSub = this.terminalSessions.getMobileSubscriber(ptyId, next.clientId)
      const nextViewport = nextSub?.viewport
      if (!nextViewport) {
        continue
      }
      void this.enqueueLayout(ptyId, {
        kind: 'phone',
        cols: nextViewport.cols,
        rows: nextViewport.rows,
        ownerClientId: next.clientId
      })
    }

    // (5) Legacy-callers fallback. Older mobile builds use resizeForClient
    // directly and never populate mobileSubscribers. For those PTYs the
    // override carries the owning clientId; restore the layout when the
    // owner disconnects. resolveDesktopRestoreTarget reads lastRendererSizes
    // (which the legacy mobile-fit branch stashes the pre-fit size into).
    for (const [ptyId, override] of this.terminalSessions.getFitOverrides()) {
      if (override.clientId !== clientId) {
        continue
      }
      if (this.terminalSessions.hasMobileSubscribers(ptyId)) {
        continue
      }
      const cur = this.terminalSessions.getLayout(ptyId)
      if (cur?.kind !== 'phone') {
        continue
      }
      // Why: Indefinite hold gate — see soft-leaver branch above. Legacy
      // mobile clients (resizeForClient path) honor the same setting.
      if (this.getAutoRestoreFitMs() == null) {
        continue
      }
      const fallback = this.resolveDesktopRestoreTarget(ptyId)
      const cols = override.previousCols ?? fallback.cols
      const rows = override.previousRows ?? fallback.rows
      void this.enqueueLayout(ptyId, { kind: 'desktop', cols, rows })
    }
  }

  onPtyExit(ptyId: string, exitCode: number): void {
    advertisedUrlWatcher.unbindPty(ptyId)
    const exited = this.terminalSessions.exitPtySession(ptyId, exitCode)
    this.recentPtyOutputById.delete(ptyId)
    this.clearWaitBlockedCheckState(ptyId)
    this.recentPtyPathCandidatesById.delete(ptyId)
    this.ptyOutputSequenceById.delete(ptyId)
    this.providerSequenceInitializedPtys.delete(ptyId)
    this.providerSequenceOffsetByPtyId.delete(ptyId)
    this.providerSnapshotPreferredPtys.delete(ptyId)
    this.providerModeTrackersByPtyId.delete(ptyId)
    this.providerModeSnapshotScansByPtyId.delete(ptyId)
    this.agentStatusOscProcessorsByPtyId.delete(ptyId)
    this.terminalSpawnCommandsByPtyId.delete(ptyId)
    this.disposePtyTitleTracker(ptyId)
    this.oscTitleScanTailByPtyId.delete(ptyId)
    this.osc7ScanTailByPtyId.delete(ptyId)
    this.terminalCwdByPtyId.delete(ptyId)
    this.terminalFileUriHostnameByPtyId.delete(ptyId)
    this.clearAgentRowSnapshotsForPty(ptyId)
    // Why: a Claude agent-team leader whose PTY exits naturally (agent finished,
    // process died, renderer reload) must release its team + nested panes map.
    // Previously only explicit closeTerminal evicted it, so natural exits leaked
    // one team per never-reused teamId for the runtime's lifetime.
    if (exited.handle) {
      this.claudeAgentTeams.removeTeamForLeaderHandle(exited.handle)
    }
    this.disposeHeadlessTerminal(ptyId)
    this.agentDetector?.onExit(ptyId)
    if (exited.pty) {
      this.resolvePtyExitWaiters(exited.pty, ptyId)
      this.pruneDisconnectedPtyTranscript(exited.pty)
      this.terminalSessions.commitPtyState(ptyId, { pty: exited.pty })
      this.touchMobileSessionSnapshotsForPty(ptyId, { immediate: true })
    }

    for (const leaf of exited.leaves) {
      this.resolveExitWaiters(leaf)
      this.failActiveDispatchOnExit(leaf, exitCode)
    }
    this.pruneDisconnectedPtyRecords()
  }

  // ─── Driver state (mobile-presence lock) ──────────────────────────
  //
  // See docs/mobile-presence-lock.md.

  getDriver(ptyId: string): DriverState {
    return this.terminalSessions.getDriver(ptyId)
  }

  private setDriver(ptyId: string, next: DriverState): void {
    this.terminalSessions.setDriver(ptyId, next)
  }

  // Why: the host's own fit cascade (window resize, split drag, tab reveal,
  // "+"-new-tab re-render) must not resize a PTY whose width a remote client
  // owns — that is the remote "porridge" bug. True while a phone (mobile driver)
  // OR an active remote desktop viewer owns the PTY. Input is deliberately NOT gated
  // here (see the `writePtyInput` mobile-only checks): shared-control desktop
  // viewers may still type alongside the host.
  // Note: this is intentionally NOT a driver kind. An active remote viewer needs
  // only resize suppression, not the mobile driver machinery (input lock,
  // phone-fit, driver-change banners), so it lives in its own registry and does
  // not perturb the presence-lock state machine. It also coexists with mobile:
  // while a phone drives, the registry still suppresses host resize, and when
  // the phone leaves the surviving viewer keeps the PTY suppressed.
  isPtyResizeDrivenRemotely(ptyId: string): boolean {
    if (this.getDriver(ptyId).kind === 'mobile') {
      return true
    }
    return this.isRemoteDesktopResizeDriven(ptyId)
  }

  isRemoteDesktopResizeDriven(ptyId: string): boolean {
    return Boolean(this.terminalSessions.getRemoteDesktopOwner(ptyId))
  }

  isRemoteDesktopViewerOwner(ptyId: string, subscriptionKey: string): boolean {
    return this.terminalSessions.getRemoteDesktopOwner(ptyId) === subscriptionKey
  }

  getRemoteDesktopFitHold(
    ptyId: string,
    subscriptionKey: string
  ): { mode: 'remote-desktop-fit' | 'desktop-fit'; cols: number; rows: number } {
    const size = this.getTerminalSize(ptyId) ?? { cols: 0, rows: 0 }
    return {
      mode: this.isRemoteDesktopViewerOwner(ptyId, subscriptionKey)
        ? 'desktop-fit'
        : 'remote-desktop-fit',
      ...size
    }
  }

  private hasRemoteDesktopViewers(ptyId: string): boolean {
    return this.terminalSessions.hasRemoteDesktopViewers(ptyId)
  }

  private activeRemoteDesktopViewport(ptyId: string): { cols: number; rows: number } | null {
    const owner = this.terminalSessions.getRemoteDesktopOwner(ptyId)
    return owner ? this.terminalSessions.getRemoteDesktopViewer(ptyId, owner) : null
  }

  private resolveRemoteDesktopHostReclaimTarget(ptyId: string): { cols: number; rows: number } {
    const target = this.terminalSessions.getRemoteDesktopHostReclaimTarget(ptyId)
    if (target) {
      return target
    }
    // Why: a viewer can join while a phone owns the actual PTY size. The
    // mobile restore chain retains the pre-phone desktop geometry; current
    // PTY size alone would incorrectly capture the phone grid as host truth.
    return this.resolveDesktopRestoreTarget(ptyId)
  }

  private ensureRemoteDesktopHostReclaimTarget(ptyId: string): void {
    if (!this.terminalSessions.getRemoteDesktopHostReclaimTarget(ptyId)) {
      this.terminalSessions.setRemoteDesktopHostReclaimTarget(
        ptyId,
        this.resolveRemoteDesktopHostReclaimTarget(ptyId)
      )
    }
  }

  recordRemoteDesktopHostReclaimTarget(ptyId: string, cols: number, rows: number): void {
    // Why: phone presence also suppresses host resize, but must not seed the
    // separate remote-viewer cache when no desktop stream owns a width floor.
    if (!this.terminalSessions.getRemoteDesktopOwner(ptyId) || cols <= 0 || rows <= 0) {
      return
    }
    this.terminalSessions.setRemoteDesktopHostReclaimTarget(ptyId, { cols, rows })
  }

  private hasRemoteDesktopLayoutState(ptyId: string): boolean {
    return this.terminalSessions.hasRemoteDesktopLayoutState(ptyId)
  }

  private bumpRemoteDesktopViewerRevision(ptyId: string): number {
    return this.terminalSessions.bumpRemoteDesktopRevision(ptyId)
  }

  async applyRemoteDesktopLayout(ptyId: string): Promise<boolean> {
    if (this.getDriver(ptyId).kind === 'mobile') {
      return true
    }
    const target = this.activeRemoteDesktopViewport(ptyId)
    const reclaimingHost = !target
    const viewerRevision = this.terminalSessions.getRemoteDesktopRevision(ptyId)
    const layoutTarget: PtyLayoutTarget = target
      ? {
          kind: 'remote-desktop',
          cols: target.cols,
          rows: target.rows,
          ownerSubscriptionKey: this.terminalSessions.getRemoteDesktopOwner(ptyId)!
        }
      : { kind: 'desktop', ...this.resolveRemoteDesktopHostReclaimTarget(ptyId) }
    const result = await this.enqueueLayout(ptyId, layoutTarget, true)
    // Why: only drop the recorded host size once the reclaim resize actually
    // landed. If it failed, the PTY is still at the remote-viewer width, so
    // keep the target for the next reclaim (otherwise it resolves via the
    // stale remote width and never restores true host geometry).
    if (
      reclaimingHost &&
      result.ok &&
      !this.terminalSessions.getRemoteDesktopOwner(ptyId) &&
      this.terminalSessions.getRemoteDesktopRevision(ptyId) === viewerRevision
    ) {
      this.terminalSessions.deleteRemoteDesktopHostReclaimTarget(ptyId)
    }
    return result.ok
  }

  // Why: attachment only records geometry. Passive hydration/reconnect must not
  // steal the shared PTY from the desktop where the user is actively working.
  async updateRemoteDesktopViewer(
    ptyId: string,
    subscriptionKey: string,
    clientId: string,
    cols: number,
    rows: number,
    claim = true
  ): Promise<boolean> {
    const viewport = clampTerminalViewport(cols, rows)
    if (claim) {
      this.ensureRemoteDesktopHostReclaimTarget(ptyId)
    }
    const prior = this.terminalSessions.getRemoteDesktopViewer(ptyId, subscriptionKey)
    if (
      prior &&
      prior.cols === viewport.cols &&
      prior.rows === viewport.rows &&
      (!claim || this.terminalSessions.getRemoteDesktopOwner(ptyId) === subscriptionKey)
    ) {
      if (claim && this.terminalSessions.getRemoteDesktopOwner(ptyId) === subscriptionKey) {
        const size = this.getTerminalSize(ptyId)
        if (size?.cols !== viewport.cols || size.rows !== viewport.rows) {
          return this.applyRemoteDesktopLayout(ptyId)
        }
      }
      return true
    }
    const activity = claim
      ? this.terminalSessions.nextRemoteDesktopActivity()
      : (prior?.activity ?? 0)
    this.terminalSessions.setRemoteDesktopViewer(ptyId, subscriptionKey, {
      clientId,
      cols: viewport.cols,
      rows: viewport.rows,
      activity
    })
    this.bumpRemoteDesktopViewerRevision(ptyId)
    if (claim) {
      this.terminalSessions.setRemoteDesktopOwner(ptyId, subscriptionKey)
      return this.applyRemoteDesktopLayout(ptyId)
    }
    return true
  }

  claimRemoteDesktopViewer(ptyId: string, subscriptionKey: string): Promise<boolean> {
    const viewer = this.terminalSessions.getRemoteDesktopViewer(ptyId, subscriptionKey)
    if (!viewer) {
      return Promise.resolve(false)
    }
    if (this.terminalSessions.getRemoteDesktopOwner(ptyId) === subscriptionKey) {
      const size = this.getTerminalSize(ptyId)
      return size?.cols === viewer.cols && size.rows === viewer.rows
        ? Promise.resolve(true)
        : this.applyRemoteDesktopLayout(ptyId)
    }
    this.ensureRemoteDesktopHostReclaimTarget(ptyId)
    this.terminalSessions.touchRemoteDesktopViewer(ptyId, subscriptionKey)
    this.terminalSessions.setRemoteDesktopOwner(ptyId, subscriptionKey)
    this.bumpRemoteDesktopViewerRevision(ptyId)
    return this.applyRemoteDesktopLayout(ptyId)
  }

  claimRemoteDesktopHost(ptyId: string, cols: number, rows: number): Promise<boolean> {
    if (!this.terminalSessions.getRemoteDesktopOwner(ptyId)) {
      // Why: disconnect can remove the owner before its queued host resize
      // lands. A host input in that window must join the reclaim, not pass it.
      return this.terminalSessions.getRemoteDesktopHostReclaimTarget(ptyId)
        ? this.applyRemoteDesktopLayout(ptyId)
        : Promise.resolve(true)
    }
    const viewport = clampTerminalViewport(cols, rows)
    this.terminalSessions.setRemoteDesktopHostReclaimTarget(ptyId, viewport)
    this.terminalSessions.deleteRemoteDesktopOwner(ptyId)
    this.bumpRemoteDesktopViewerRevision(ptyId)
    return this.applyRemoteDesktopLayout(ptyId)
  }

  unregisterRemoteDesktopViewer(ptyId: string, subscriptionKey: string): Promise<boolean> {
    return this.unregisterRemoteDesktopViewers(ptyId, [subscriptionKey])
  }

  unregisterRemoteDesktopViewers(
    ptyId: string,
    subscriptionKeys: Iterable<string>
  ): Promise<boolean> {
    if (!this.terminalSessions.hasRemoteDesktopViewers(ptyId)) {
      return Promise.resolve(false)
    }
    let changed = false
    let removedOwner = false
    for (const subscriptionKey of subscriptionKeys) {
      removedOwner =
        this.terminalSessions.getRemoteDesktopOwner(ptyId) === subscriptionKey || removedOwner
      changed = this.terminalSessions.deleteRemoteDesktopViewer(ptyId, subscriptionKey) || changed
    }
    if (!changed) {
      return Promise.resolve(false)
    }
    if (removedOwner) {
      let fallback: { key: string; activity: number } | null = null
      for (const [key, viewer] of this.terminalSessions.listRemoteDesktopViewers(ptyId)) {
        if (viewer.activity > 0 && (!fallback || viewer.activity > fallback.activity)) {
          fallback = { key, activity: viewer.activity }
        }
      }
      if (fallback) {
        this.terminalSessions.setRemoteDesktopOwner(ptyId, fallback.key)
      } else {
        this.terminalSessions.deleteRemoteDesktopOwner(ptyId)
      }
    }
    this.bumpRemoteDesktopViewerRevision(ptyId)
    return removedOwner ? this.applyRemoteDesktopLayout(ptyId) : Promise.resolve(true)
  }

  // Why: the one-shot `terminal.updateViewport` RPC has no disconnect hook, so
  // it must never *create* a width floor (that floor would leak — nothing
  // releases it, pinning the host at a stale width after the viewer is gone).
  // It only refreshes the floor(s) this client already owns via its stream
  // subscription, keyed by clientId. Mirrors the mobile `updateMobileViewport`
  // no-op-without-subscription invariant. Returns false when the client owns no
  // floor (passive/stream-less viewer) — a stream-less viewer must not lock host
  // resize.
  refreshRemoteDesktopViewer(
    ptyId: string,
    clientId: string,
    cols: number,
    rows: number,
    claim = false
  ): Promise<boolean> {
    const viewers = this.terminalSessions.listRemoteDesktopViewers(ptyId)
    if (viewers.length === 0) {
      return Promise.resolve(false)
    }
    const viewport = clampTerminalViewport(cols, rows)
    if (claim) {
      // Why: terminal.send may be the first activity while the stream is only
      // passively registered. Snapshot host truth before this refresh owns it.
      this.ensureRemoteDesktopHostReclaimTarget(ptyId)
    }
    let changed = false
    for (const [subscriptionKey, viewer] of viewers) {
      if (viewer.clientId === clientId) {
        const activity = claim ? this.terminalSessions.nextRemoteDesktopActivity() : viewer.activity
        this.terminalSessions.setRemoteDesktopViewer(ptyId, subscriptionKey, {
          ...viewer,
          cols: viewport.cols,
          rows: viewport.rows,
          activity
        })
        if (claim) {
          this.terminalSessions.setRemoteDesktopOwner(ptyId, subscriptionKey)
        }
        changed = true
      }
    }
    if (!changed) {
      return Promise.resolve(false)
    }
    this.bumpRemoteDesktopViewerRevision(ptyId)
    return this.terminalSessions.getRemoteDesktopOwner(ptyId)
      ? this.applyRemoteDesktopLayout(ptyId)
      : Promise.resolve(true)
  }

  async updateDesktopViewport(
    ptyId: string,
    viewport: { cols: number; rows: number }
  ): Promise<boolean> {
    const { cols, rows } = clampTerminalViewport(viewport.cols, viewport.rows)
    if (this.terminalSessions.hasFitOverride(ptyId) || this.getDriver(ptyId).kind === 'mobile') {
      this.recordRendererGeometry(ptyId, cols, rows)
      return true
    }
    if (this.isResizeSuppressed()) {
      return false
    }
    const result = await this.enqueueLayout(ptyId, { kind: 'desktop', cols, rows }, true)
    if (result.ok) {
      this.refreshRendererGeometry(ptyId, cols, rows)
    }
    return result.ok
  }

  markMobileActor(ptyId: string, clientId: string): void {
    this.terminalSessions.markMobileActorAndTakeDriver(ptyId, clientId)
  }

  beginMobileInputFloor(
    ptyId: string,
    clientId: string
  ): { commit: () => Promise<void>; rollback: () => void } | null {
    // Why: a client inside soft-leave grace may still reserve the floor; the
    // authority rejects post-grace or orphaned writers before changing driver.
    return this.terminalSessions.beginMobileInputFloor(
      ptyId,
      clientId,
      (previousFloor, isCurrent) => this.mobileTookFloor(ptyId, clientId, previousFloor, isCurrent)
    )
  }

  // Why: invoked from mobile RPC method handlers (terminal.send / setDisplayMode /
  // resizeForClient / fresh subscribe with auto). Records the actor as the
  // most recent mobile driver and re-applies phone-fit if we were previously
  // in `desktop` mode (mobile reclaims a take-back). Mobile-to-mobile hand-offs
  // are no-ops for resize.
  async mobileTookFloor(
    ptyId: string,
    clientId: string,
    previousFloor?: DriverState,
    isCurrent: () => boolean = () => true
  ): Promise<void> {
    const sub = this.terminalSessions.getMobileSubscriber(ptyId, clientId)
    const softLeaver = this.terminalSessions.getMobileSoftLeaver(ptyId)
    // Why: native chat pauses terminal output, so its later sends have no
    // subscriber lifecycle that could release a newly-created desktop lock.
    if (!sub && softLeaver?.clientId !== clientId) {
      return
    }
    this.terminalSessions.markMobileActor(ptyId, clientId)
    const prev = previousFloor ?? this.getDriver(ptyId)
    const currentMode = this.terminalSessions.getMobileDisplayMode(ptyId)
    // Why: a deliberate mobile action implies mobile is resuming control.
    // If the display mode is currently 'desktop' (set by an earlier
    // take-back), flip it back to 'auto' (= map absence) and re-apply so
    // phone-fit takes hold again. See docs/mobile-presence-lock.md.
    if (prev.kind === 'desktop' || currentMode === 'desktop') {
      if (currentMode === 'desktop') {
        this.terminalSessions.setMobileDisplayMode(ptyId, 'auto')
      }
      await this.applyMobileDisplayMode(ptyId)
    }
    // Why: display changes are async; a later PTY write must keep the floor
    // when an older phone-fit operation eventually completes.
    if (!isCurrent()) {
      return
    }
    this.setDriver(ptyId, { kind: 'mobile', clientId })
  }

  // Why: in-place viewport update on the existing mobile subscription —
  // used when the mobile keyboard opens/closes and shrinks/grows the
  // visible terminal area. We refresh the subscriber's viewport, re-fit
  // the PTY to the new dims, and emit a 'resized' event so the mobile
  // xterm reinits inline at the new dims without re-subscribing. This
  // avoids the unsubscribe → resubscribe cycle which would (a) flash the
  // desktop lock banner during the brief idle gap and (b) cause the new
  // subscribe to capture the already-phone-fitted PTY size as its
  // restore baseline (stuck-dim bug on later disconnect).
  // No-op when the client isn't actually subscribed to this PTY.
  async updateMobileViewport(
    ptyId: string,
    clientId: string,
    viewport: { cols: number; rows: number }
  ): Promise<{ updated: boolean; applied: boolean }> {
    if (!this.terminalSessions.recordMobileViewportActivity(ptyId, clientId, viewport)) {
      return { updated: false, applied: false }
    }
    const subscribers = this.terminalSessions.listMobileSubscribers(ptyId)

    const mode = this.getMobileDisplayMode(ptyId)
    if (mode === 'desktop') {
      // Watching at desktop dims — viewport is informational only.
      return { updated: true, applied: false }
    }
    // Drive PTY dims by the most-recent-actor (just updated to this client).
    const winner = this.pickMostRecentActor(subscribers)
    if (!winner) {
      return { updated: false, applied: false }
    }
    const winnerSub = this.terminalSessions.getMobileSubscriber(ptyId, winner.clientId)
    const driveViewport = winnerSub?.viewport ?? viewport
    const { cols: clampedCols, rows: clampedRows } = clampTerminalViewport(
      driveViewport.cols,
      driveViewport.rows
    )

    this.terminalSessions.setMobilePhoneFit(ptyId, clientId, true)
    // The driver is already mobile{this client} when we got here; refresh
    // to update lastActedAt-based ordering on later actor selection.
    this.setDriver(ptyId, { kind: 'mobile', clientId })

    const result = await this.enqueueLayout(
      ptyId,
      {
        kind: 'phone',
        cols: clampedCols,
        rows: clampedRows,
        ownerClientId: winner.clientId
      },
      !this.terminalSessions.hasLayout(ptyId)
    )
    return { updated: true, applied: result.ok }
  }

  // Why: invoked from `runtime:restoreTerminalFit` IPC (the desktop "Take
  // back" / "Restore" button). Forces the PTY back to desktop dims and flips
  // the driver to `desktop`, suppressing further mobile-driven dim changes
  // until a mobile actor takes the floor again. Three cases, each ending in
  // releaseDesktopTakeBack:
  //   1. Active mobile subscriber: route through applyMobileDisplayMode so the
  //      existing 'resized' event reaches the phone.
  //   2. Held override, no subscriber (post-indefinite-hold): resolve the
  //      restore target and enqueueLayout directly.
  //   3. Stale mobile driver, no subscriber and no override: nothing to resize,
  //      just drop the lock. See docs/mobile-fit-hold.md.
  //
  // Why: explicit desktop take-back is a user command to reclaim input control
  // NOW. Unlike the auto-restore timer and phone-initiated setDisplayMode paths
  // (which keep the lock when a resize can't converge, #7588), this gesture
  // ALWAYS drops the presence lock and banner. "Take back all terminals"
  // reclaims several PTYs at once; a background pane whose desktop resize can't
  // converge must not strand its banner on the other terminals. The resize is
  // best-effort — the desktop renderer refits the PTY on its next settled
  // frame. Returns `true` whenever there was a lock to reclaim, `false` only
  // when there was nothing to reclaim.
  async reclaimTerminalForDesktop(ptyId: string): Promise<boolean> {
    if (this.isMobileSubscriberActive(ptyId)) {
      this.setMobileDisplayMode(ptyId, 'desktop')
      await this.applyMobileDisplayMode(ptyId)
      this.releaseDesktopTakeBack(ptyId)
      // Why: a desktop-initiated reclaim is "I'm taking over right now", not a
      // sticky preference. The next mobile subscribe (e.g. user switches back to
      // the terminal tab on the phone) must default to phone-fit again, not stay
      // in passive desktop-watch mode.
      this.setMobileDisplayMode(ptyId, 'auto')
      if (this.hasRemoteDesktopLayoutState(ptyId)) {
        return this.applyRemoteDesktopLayout(ptyId)
      }
      return true
    }
    const heldOverride = this.terminalSessions.getFitOverride(ptyId)
    if (heldOverride && this.hasRemoteDesktopLayoutState(ptyId)) {
      this.terminalSessions.cancelMobileRestoreTimer(ptyId)
      this.terminalSessions.cancelMobileSoftLeaver(ptyId)
      const priorDriver = this.getDriver(ptyId)
      this.setDriver(ptyId, { kind: 'idle' })
      const converged = await this.applyRemoteDesktopLayout(ptyId)
      if (!converged) {
        this.setDriver(ptyId, priorDriver)
        return false
      }
      this.setDriver(ptyId, { kind: 'desktop' })
      this.setMobileDisplayMode(ptyId, 'auto')
      return true
    }
    if (heldOverride) {
      this.terminalSessions.cancelMobileRestoreTimer(ptyId)
      // Why: with no subscribers, resolveDesktopRestoreTarget can fall through
      // to current PTY size — which is at phone dims (wrong). Prefer a fresh
      // desktop renderer measurement when one exists; otherwise use the
      // override's pre-fit baseline before falling back to current size.
      const fallback = this.resolveDesktopRestoreTarget(ptyId)
      const renderer = this.terminalSessions.getLastRendererSize(ptyId)
      const cols = renderer?.cols ?? heldOverride.previousCols ?? fallback.cols
      const rows = renderer?.rows ?? heldOverride.previousRows ?? fallback.rows
      await this.enqueueLayout(ptyId, { kind: 'desktop', cols, rows })
      this.releaseDesktopTakeBack(ptyId)
      this.setMobileDisplayMode(ptyId, 'auto')
      return true
    }
    // Why: a stale lock — driver still reads mobile with no active subscriber
    // and no held override (e.g. reclaimed inside the soft-leave grace, or a
    // subscriber that dropped without a clean unsubscribe). Release it so the
    // banner can't linger; there is nothing to resize.
    if (this.getDriver(ptyId).kind === 'mobile') {
      this.releaseDesktopTakeBack(ptyId)
      return true
    }
    return false
  }

  // Why: the shared "banner must be gone now" step for an explicit desktop
  // take-back. Releases the presence lock (driver → desktop) and, if the
  // best-effort resize left a fit-override held (resize didn't converge),
  // clears it optimistically with a paired desktop-fit 0×0 — the same signal
  // onPtyExit emits — so neither the presence-lock banner nor the held-fit
  // banner can survive the reclaim. The desktop renderer refits the PTY to real
  // dims on its next settled frame.
  private releaseDesktopTakeBack(ptyId: string): void {
    this.setDriver(ptyId, { kind: 'desktop' })
    this.terminalSessions.releaseFitOverride(ptyId)
  }

  // Why: read-side clamp for mobileAutoRestoreFitMs. `null` means
  // indefinite hold (no auto-restore timer). A finite value is clamped
  // to [MIN, MAX] to defend against bad config — the smallest useful
  // value is a few seconds, the largest is one hour. See
  // docs/mobile-fit-hold.md.
  private getAutoRestoreFitMs(): number | null {
    const raw = this.store?.getSettings().mobileAutoRestoreFitMs ?? null
    if (raw == null) {
      return null
    }
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return null
    }
    return Math.min(Math.max(raw, MOBILE_AUTO_RESTORE_FIT_MIN_MS), MOBILE_AUTO_RESTORE_FIT_MAX_MS)
  }

  // Why: invoked when the user changes mobileAutoRestoreFitMs to `null`
  // (Indefinite). Clears every pending restore timer so the just-expressed
  // preference "do not auto-restore" is honored for ALL currently-pending
  // PTYs, not just one. See docs/mobile-fit-hold.md.
  cancelAllPendingFitRestoreTimers(): void {
    this.terminalSessions.cancelAllMobileRestoreTimers()
  }

  // Why: read the persisted user preference (clamped) for surfacing to UI
  // callers (mobile RPC, desktop preferences). Returns null when the
  // setting is unset or `null` ("Indefinite").
  getMobileAutoRestoreFitMs(): number | null {
    return this.getAutoRestoreFitMs()
  }

  // Why: persisted-preference setter routed through the same `Store` the
  // desktop preferences UI writes to. Transitions to `null` (Indefinite)
  // clear every pending restore timer to honor the preference change for
  // already-held PTYs. Transitions to a finite value do NOT retroactively
  // schedule timers for PTYs that are currently held — those PTYs were
  // already-not-restored under the old preference, and silently scheduling
  // a restore on a settings change would be surprising. The new value
  // takes effect on the next unsubscribe. See docs/mobile-fit-hold.md.
  setMobileAutoRestoreFitMs(ms: number | null): number | null {
    if (!this.store?.updateSettings) {
      return this.getAutoRestoreFitMs()
    }
    let normalized: number | null
    if (ms == null) {
      normalized = null
    } else if (typeof ms !== 'number' || !Number.isFinite(ms)) {
      normalized = null
    } else {
      normalized = Math.min(
        Math.max(ms, MOBILE_AUTO_RESTORE_FIT_MIN_MS),
        MOBILE_AUTO_RESTORE_FIT_MAX_MS
      )
    }
    this.store.updateSettings({ mobileAutoRestoreFitMs: normalized }, { notifyListeners: true })
    if (normalized == null) {
      this.cancelAllPendingFitRestoreTimers()
    }
    return normalized
  }

  // Why: with multiple subscribers, the active phone-fit dims follow the
  // most recent mobile actor (argmax(lastActedAt)). See
  // docs/mobile-presence-lock.md "Active phone-fit dim selection".
  private pickMostRecentActor(
    subscribers: Iterable<{ clientId: string; lastActedAt: number }>
  ): { clientId: string; lastActedAt: number } | null {
    let best: { clientId: string; lastActedAt: number } | null = null
    for (const sub of subscribers) {
      if (best === null || sub.lastActedAt > best.lastActedAt) {
        best = sub
      }
    }
    return best
  }

  // ─── Layout authority adapter ─────────────────────────────────────

  getLayout(ptyId: string): PtyLayoutState | null {
    return this.terminalSessions.getLayout(ptyId)
  }

  private resolveDesktopRestoreTarget(ptyId: string): { cols: number; rows: number } {
    return this.terminalSessions.resolveDesktopRestoreTarget(ptyId)
  }

  private enqueueLayout(
    ptyId: string,
    target: PtyLayoutTarget,
    allowInitial = false
  ): Promise<ApplyLayoutResult> {
    return this.terminalSessions.enqueueLayout(ptyId, target, allowInitial)
  }

  // ─── Server-Authoritative Mobile Display Mode ─────────────────────────────────────────

  setMobileDisplayMode(ptyId: string, mode: 'auto' | 'desktop'): void {
    this.terminalSessions.setMobileDisplayMode(ptyId, mode)
  }

  getMobileDisplayMode(ptyId: string): 'auto' | 'desktop' {
    return this.terminalSessions.getMobileDisplayMode(ptyId)
  }

  isMobileSubscriberActive(ptyId: string): boolean {
    return this.terminalSessions.hasMobileSubscribers(ptyId)
  }

  // Why: late-bind viewport on an existing subscriber record. Subscribers
  // that registered before the mobile side measured (e.g. terminal first
  // mounted while the WebView was still loading) have null viewport, and
  // applyMobileDisplayMode's auto branch needs a viewport to phone-fit.
  // The setDisplayMode RPC carries the latest viewport so we can patch it
  // here just before applyMobileDisplayMode runs.
  updateMobileSubscriberViewport(
    ptyId: string,
    clientId: string,
    viewport: { cols: number; rows: number }
  ): void {
    this.terminalSessions.setMobileViewport(ptyId, clientId, viewport)
  }

  // Why: server-side auto-fit on mobile subscribe. The runtime is the single
  // source of truth — the mobile client just passes its viewport and the runtime
  // decides whether to resize. This eliminates the measure→RPC→resubscribe
  // pipeline that caused race conditions.
  //
  // Multi-mobile keying: each subscriber lives in `mobileSubscribers[ptyId]`'s
  // inner map under its own clientId. Phone B subscribing does not overwrite
  // phone A's record — both stay until each unsubscribes.
  //
  // Subscribe-in-desktop-mode rule: a subscribe with displayMode='desktop' is
  // a passive watch; it does NOT take the floor. The driver remains
  // `idle`/`desktop`. The lock banner is reserved for actual mobile
  // interaction (input/resize/setDisplayMode/auto-or-phone subscribe).
  async handleMobileSubscribe(
    ptyId: string,
    clientId: string,
    viewport?: { cols: number; rows: number }
  ): Promise<boolean> {
    try {
      return await this.handleMobileSubscribeInternal(ptyId, clientId, viewport)
    } finally {
      // Every subscribe path mutates mobileSubscribers — resync the daemon
      // background mark once, whatever branch returned.
      this.notifyRemoteTerminalViewPresenceChanged(ptyId)
    }
  }

  private async handleMobileSubscribeInternal(
    ptyId: string,
    clientId: string,
    viewport?: { cols: number; rows: number }
  ): Promise<boolean> {
    const mode = this.getMobileDisplayMode(ptyId)

    // Cancel pending restore timer for this ptyId — any new subscriber
    // supersedes any old client's pending restore.
    this.terminalSessions.cancelMobileRestoreTimer(ptyId)

    // Resubscribe-grace honor: same client returning within soft-leave
    // window restores prior record (preserving baseline so we don't capture
    // phone-fitted dims as the new baseline).
    const softLeaver = this.terminalSessions.getMobileSoftLeaver(ptyId)
    if (softLeaver && softLeaver.clientId === clientId) {
      this.terminalSessions.takeMobileSoftLeaver(ptyId)
      this.terminalSessions.setMobileSubscriber(ptyId, {
        ...softLeaver.record,
        viewport: viewport ?? null,
        lastActedAt: Date.now()
      })
      if (!viewport) {
        return false
      }
      this.setDriver(ptyId, { kind: 'mobile', clientId })
      if (mode !== 'desktop') {
        const { cols: clampedCols, rows: clampedRows } = clampTerminalViewport(
          viewport.cols,
          viewport.rows
        )
        await this.enqueueLayout(
          ptyId,
          {
            kind: 'phone',
            cols: clampedCols,
            rows: clampedRows,
            ownerClientId: clientId
          },
          true
        )
      }
      return true
    }

    const subscribers = this.terminalSessions.listMobileSubscribers(ptyId)

    // Capture restore baseline BEFORE applyLayout writes the override.
    // Multi-mobile: peer joiner against an already-fitted PTY captures null
    // — the existing baseline-holder's snapshot remains canonical. See
    // docs/mobile-presence-lock.md.
    //
    // Resubscribe-after-indefinite-hold: the held override carries the only
    // authoritative pre-fit dims across the no-subscriber gap. Inherit it
    // first; otherwise rendererSize/currentSize would be the held phone dims
    // and applyLayout would clobber the override's previousCols with phone
    // dims, making any subsequent Restore a no-op.
    const heldOverride = this.terminalSessions.getFitOverride(ptyId)
    const existing = this.terminalSessions.getMobileSubscriber(ptyId, clientId)
    const someoneAlreadyFitted = subscribers.some((subscriber) => subscriber.wasResizedToPhone)
    const currentSize = this.getTerminalSize(ptyId)
    const rendererSize = this.terminalSessions.getLastRendererSize(ptyId)
    const previousCols =
      existing?.previousCols ??
      heldOverride?.previousCols ??
      (someoneAlreadyFitted ? null : (rendererSize?.cols ?? currentSize?.cols ?? null))
    const previousRows =
      existing?.previousRows ??
      heldOverride?.previousRows ??
      (someoneAlreadyFitted ? null : (rendererSize?.rows ?? currentSize?.rows ?? null))
    const now = Date.now()
    const subscribedAt = existing?.subscribedAt ?? now

    if (!viewport) {
      // Why: mobile can subscribe before its WebView has measured. Keep the
      // subscriber + desktop baseline so updateViewport/setDisplayMode can
      // late-bind the viewport without recapturing phone dims.
      this.terminalSessions.setMobileSubscriber(ptyId, {
        clientId,
        viewport: null,
        wasResizedToPhone: false,
        previousCols,
        previousRows,
        subscribedAt,
        lastActedAt: now
      })
      return false
    }

    const { cols: clampedCols, rows: clampedRows } = clampTerminalViewport(
      viewport.cols,
      viewport.rows
    )

    if (mode === 'desktop') {
      // Passive watch — null baseline (we'll capture later if user toggles
      // to auto/phone, since safeFit will have converged by then). Do not
      // flip driver.
      this.terminalSessions.setMobileSubscriber(ptyId, {
        clientId,
        viewport,
        wasResizedToPhone: false,
        previousCols: null,
        previousRows: null,
        subscribedAt,
        lastActedAt: now
      })
      return false
    }

    this.terminalSessions.setMobileSubscriber(ptyId, {
      clientId,
      viewport,
      wasResizedToPhone: true,
      previousCols,
      previousRows,
      subscribedAt,
      lastActedAt: now
    })

    // Subscribe-fresh with auto/phone counts as "take the floor".
    this.setDriver(ptyId, { kind: 'mobile', clientId })

    await this.enqueueLayout(
      ptyId,
      {
        kind: 'phone',
        cols: clampedCols,
        rows: clampedRows,
        ownerClientId: clientId
      },
      true
    )

    return true
  }

  // Why: delayed restore prevents resize thrashing during rapid tab switches.
  // The 300ms debounce means only the final tab triggers a PTY restore;
  // intermediate terminals keep their current dims harmlessly.
  //
  // Multi-mobile: only the last subscriber leaving for this ptyId triggers
  // restore + driver=idle. Peer mobile clients still on the inner map keep
  // the lock banner mounted; if the disconnecting client was the active
  // driver, we re-elect the most-recent surviving subscriber.
  handleMobileUnsubscribe(ptyId: string, clientId: string): void {
    const subscriber = this.terminalSessions.getMobileSubscriber(ptyId, clientId)
    if (!subscriber) {
      return
    }
    const wasResizedToPhone = subscriber.wasResizedToPhone

    this.terminalSessions.deleteMobileSubscriber(ptyId, clientId)
    this.notifyRemoteTerminalViewPresenceChanged(ptyId)
    const remainingSubscribers = this.terminalSessions.listMobileSubscribers(ptyId)

    if (remainingSubscribers.length > 0) {
      // Why: if the leaving client was the only one with a non-null restore
      // baseline (typical when peer joiners subscribed against an
      // already-phone-fitted PTY and got null prevCols), donate the baseline
      // to the earliest surviving subscriber so a future last-leaver can
      // still restore correctly. See docs/mobile-presence-lock.md.
      if (subscriber.previousCols != null && subscriber.previousRows != null) {
        this.terminalSessions.donateMobileRestoreBaseline(ptyId, {
          cols: subscriber.previousCols,
          rows: subscriber.previousRows
        })
      }
      // Peers still on the line. If the disconnecting client was the active
      // mobile driver, re-elect the most-recent surviving subscriber so the
      // banner remains correct and active phone-fit dims follow them.
      const driver = this.getDriver(ptyId)
      if (driver.kind === 'mobile' && driver.clientId === clientId) {
        const next = this.pickMostRecentActor(remainingSubscribers)
        if (next) {
          this.setDriver(ptyId, { kind: 'mobile', clientId: next.clientId })
          // Fire-and-forget — handleMobileUnsubscribe stays sync; applyLayout
          // failures self-recover on the next gesture.
          void this.applyMobileDisplayMode(ptyId)
        }
      }
      return
    }

    // Last subscriber leaving — clean up.
    this.terminalSessions.deleteMobileSubscribers(ptyId)
    const mode = this.getMobileDisplayMode(ptyId)

    // Resubscribe-grace: hold driver=mobile{clientId} for ~250ms so a quick
    // re-subscribe (older clients without updateViewport) doesn't flash the
    // desktop banner. See docs/mobile-presence-lock.md.
    const SOFT_LEAVE_GRACE_MS = 250
    this.terminalSessions.cancelMobileSoftLeaver(ptyId)
    const softTimer = setTimeout(() => {
      this.terminalSessions.takeMobileSoftLeaver(ptyId)
      if (!this.terminalSessions.hasMobileSubscribers(ptyId)) {
        this.setDriver(ptyId, { kind: 'idle' })
        if (this.hasRemoteDesktopViewers(ptyId)) {
          void this.applyRemoteDesktopLayout(ptyId)
        }
      }
    }, SOFT_LEAVE_GRACE_MS)
    if (typeof softTimer.unref === 'function') {
      softTimer.unref()
    }
    this.terminalSessions.setMobileSoftLeaver(ptyId, {
      clientId,
      timer: softTimer,
      record: {
        clientId: subscriber.clientId,
        viewport: subscriber.viewport,
        wasResizedToPhone: subscriber.wasResizedToPhone,
        previousCols: subscriber.previousCols,
        previousRows: subscriber.previousRows,
        subscribedAt: subscriber.subscribedAt,
        lastActedAt: subscriber.lastActedAt
      }
    })

    if (mode === 'auto' && wasResizedToPhone) {
      this.terminalSessions.cancelMobileRestoreTimer(ptyId)
      // Why: scheduling is conditional on the user's mobileAutoRestoreFitMs
      // preference. `null` (default, "Indefinite") leaves the PTY at phone
      // dims until the user clicks Restore on the desktop banner — the
      // central UX promise of docs/mobile-fit-hold.md. A finite value runs
      // the restore that long after the last unsubscribe.
      const autoRestoreMs = this.getAutoRestoreFitMs()
      if (autoRestoreMs == null) {
        // Indefinite hold: the fit override persists, the SOFT_LEAVE_GRACE
        // driver-state grace above still releases the input lock, and the
        // banner's Restore button is the explicit return path.
      } else {
        // Snapshot the disconnecting subscriber's baseline NOW, before the
        // timer fires. By the time the timer runs, the subscriber map has
        // been deleted; resolveDesktopRestoreTarget would fall through to
        // lastRendererSizes → current PTY size (which is at phone dims,
        // wrong). The disconnecting subscriber's baseline is the correct
        // restore target.
        const fallback = this.terminalSessions.getLastRendererSize(ptyId)
        const restoreCols =
          subscriber.previousCols ?? fallback?.cols ?? this.getTerminalSize(ptyId)?.cols ?? 80
        const restoreRows =
          subscriber.previousRows ?? fallback?.rows ?? this.getTerminalSize(ptyId)?.rows ?? 24
        const timer = setTimeout(() => {
          this.terminalSessions.clearMobileRestoreTimer(ptyId)
          if (this.isMobileSubscriberActive(ptyId)) {
            return
          }
          if (this.hasRemoteDesktopLayoutState(ptyId)) {
            void this.applyRemoteDesktopLayout(ptyId)
            return
          }
          void this.enqueueLayout(ptyId, {
            kind: 'desktop',
            cols: restoreCols,
            rows: restoreRows
          })
        }, autoRestoreMs)
        // Why: a delayed mobile restore should not keep Electron main alive
        // after the last window/runtime transport has otherwise shut down.
        if (typeof timer.unref === 'function') {
          timer.unref()
        }

        this.terminalSessions.setMobileRestoreTimer(ptyId, { timer, clientId })
      }
    }
    // 'desktop' mode: was never resized, nothing to restore.
  }

  // Why: called when mode changes via terminal.setDisplayMode. Applies the
  // mode change immediately if there's an active subscriber, and emits a
  // 'resized' event so the mobile client can reinitialize xterm inline.
  //
  // Multi-mobile: the most recent mobile actor's viewport drives the active
  // phone-fit dims. The earliest-by-subscribe-time subscriber's
  // previousCols/Rows drive the desktop-restore target.
  //
  // Returns the post-condition "no fit-override remains held" (#7588): `true`
  // when it cleared a held override OR nothing was held to begin with, `false`
  // only when a restore was attempted and the resize failed (override rolled
  // back, still held). reclaimTerminalForDesktop gates its driver/mode
  // transitions on this; other callers ignore it.
  async applyMobileDisplayMode(ptyId: string): Promise<boolean> {
    const mode = this.getMobileDisplayMode(ptyId)
    const subscribers = this.terminalSessions.listMobileSubscribers(ptyId)
    const subscriber = this.pickMostRecentActor(subscribers)
    const subscriberRecord = subscriber
      ? this.terminalSessions.getMobileSubscriber(ptyId, subscriber.clientId)
      : null

    if (mode === 'desktop') {
      // Reset wasResizedToPhone on every fitted subscriber so a future
      // toggle back to auto re-issues the resize. applyLayout owns the
      // actual PTY resize + override delete + renderer notify. Track which
      // subscribers we cleared so a failed resize can re-arm them.
      const clearedFitSubscriberIds = this.terminalSessions.clearMobilePhoneFits(ptyId)
      const anyWasResized = clearedFitSubscriberIds.length > 0
      // Why (#7588): also restore when a fit-override is still held but no
      // subscriber carries wasResizedToPhone — e.g. a null-viewport resubscribe
      // after an indefinite hold resets the flag yet leaves the override,
      // stranding the desktop "phone size" modal. Reuse resolveDesktopRestoreTarget
      // (the same resolver the anyWasResized branch uses) so the two adjacent
      // restore paths can never resolve to different dims for the same state.
      if (anyWasResized || this.terminalSessions.hasFitOverride(ptyId)) {
        const restore = this.resolveDesktopRestoreTarget(ptyId)
        const result = await this.enqueueLayout(ptyId, {
          kind: 'desktop',
          cols: restore.cols,
          rows: restore.rows
        })
        // Why (#7588): a failed resize rolls the override back (still held), so
        // re-arm the flags we cleared. Otherwise a later unsubscribe under a
        // finite mobileAutoRestoreFitMs would see wasResizedToPhone=false, skip
        // scheduling its auto-restore timer, and strand the held phone-fit.
        if (!result.ok) {
          this.terminalSessions.restoreMobilePhoneFits(ptyId, clearedFitSubscriberIds)
        }
      } else {
        // Nothing was fitted or held — emit a mode-change resize event so
        // the mobile client still learns the toggle landed.
        const size = this.getTerminalSize(ptyId)
        this.notifyTerminalResize(ptyId, {
          cols: size?.cols ?? 0,
          rows: size?.rows ?? 0,
          displayMode: 'desktop',
          reason: 'mode-change',
          seq: this.terminalSessions.getLayout(ptyId)?.seq
        })
      }
    } else {
      // mode === 'auto' — the only non-desktop mode after the 'phone'
      // (sticky-fit) collapse. Phone-fit if the active subscriber has a
      // viewport and we haven't already applied it.
      if (subscriberRecord && !subscriberRecord.wasResizedToPhone) {
        const viewport = subscriberRecord.viewport
        if (viewport) {
          await this.handleMobileSubscribe(ptyId, subscriberRecord.clientId, viewport)
          // After a phone-fit an override IS held, so this reports false. The
          // auto branch is never reached from reclaim (it sets 'desktop'
          // first); computed here only to keep the post-condition uniform.
          return !this.terminalSessions.hasFitOverride(ptyId)
        }
      }
      // Why: always emit the mode change even when no resize occurred — the
      // mobile client needs to learn the toggle landed even if dims didn't
      // actually change. Carry the current seq (or undefined if no layout
      // entry yet) so the mobile-side stale-event filter behaves correctly.
      const size = this.getTerminalSize(ptyId)
      this.notifyTerminalResize(ptyId, {
        cols: size?.cols ?? 0,
        rows: size?.rows ?? 0,
        displayMode: 'auto',
        reason: 'mode-change',
        seq: this.terminalSessions.getLayout(ptyId)?.seq
      })
    }
    return !this.terminalSessions.hasFitOverride(ptyId)
  }

  // Why: called after a desktop renderer path has successfully resized the
  // PTY (local IPC or remote desktop viewport). The runtime mirror must take
  // the same accepted geometry so hidden-output restore parses at PTY width.
  onExternalPtyResize(ptyId: string, cols: number, rows: number): void {
    // The pty:resize IPC handler is supposed to gate via `isResizeSuppressed`
    // before calling here, but defend against callers that don't.
    if (this.isResizeSuppressed()) {
      return
    }
    // Why: while a mobile-fit override is in place, the desktop renderer's
    // safeFit echoes pty:resize(override.cols, override.rows). Treating that
    // echo as legitimate geometry would overwrite each subscriber's
    // previousCols/Rows baseline with phone dims, so the next take-back
    // enqueues a no-op {kind:'desktop', cols:49, rows:40} and leaves xterm
    // stuck. Only filter reports that EXACTLY match the override — a fresh
    // measurement from a now-visible pane (e.g. user activated a previously
    // hidden tab on desktop, container went 0×0 → 1782×1195) reports
    // different dims and is the right baseline to remember.
    const activeOverride = this.terminalSessions.getFitOverride(ptyId)
    if (activeOverride && activeOverride.cols === cols && activeOverride.rows === rows) {
      return
    }
    // Why: a successful host resize supersedes any target retained after a
    // failed viewer reclaim; a later viewer cycle must capture this new truth.
    if (!this.hasRemoteDesktopViewers(ptyId)) {
      this.terminalSessions.deleteRemoteDesktopHostReclaimTarget(ptyId)
    }
    this.resizeHeadlessTerminal(ptyId, cols, rows)
    this.refreshRendererGeometry(ptyId, cols, rows)
  }

  // Why: pty:reportGeometry IPC sibling. The renderer calls this when a
  // desktop pane container goes from 0×0 to a real size while a mobile-fit
  // override is active (e.g. user activates a previously-hidden tab on
  // desktop after the phone has already taken the floor). We need the
  // restore-target baseline to track real desktop dims even during the
  // fit period — otherwise resolveDesktopRestoreTarget falls back to the
  // PTY's spawn default (typically 80×24) and Take Back leaves the
  // terminal partially restored. This is a measurement-only channel: it
  // refreshes lastRendererSizes and non-null subscriber baselines, never
  // resizes the PTY, and bypasses both isResizeSuppressed and the
  // override-echo gate by design — the renderer only fires it when it
  // has just measured fresh real geometry. See docs/mobile-fit-hold.md.
  recordRendererGeometry(ptyId: string, cols: number, rows: number): void {
    if (cols <= 0 || rows <= 0) {
      return
    }
    // Why: a viewer may leave while phone-fit still owns the PTY. Keep its
    // deferred host reclaim cache aligned with later trusted pane measurements.
    if (this.terminalSessions.getRemoteDesktopHostReclaimTarget(ptyId)) {
      this.terminalSessions.setRemoteDesktopHostReclaimTarget(ptyId, { cols, rows })
    }
    this.refreshRendererGeometry(ptyId, cols, rows)
  }

  private refreshRendererGeometry(ptyId: string, cols: number, rows: number): void {
    this.terminalSessions.setLastRendererSize(ptyId, cols, rows)
    // Refresh the renderer-current size as the next-restore target on every
    // subscriber that already has a non-null baseline. Subscribers with null
    // baselines (joined while a peer had already phone-fitted) stay null.
    this.terminalSessions.refreshMobileRestoreBaselines(ptyId, { cols, rows })
  }

  // Why: the pty:resize IPC handler calls this to check if the global
  // suppress window is active. During this window, all desktop renderer
  // pty:resize events are ignored to prevent collateral safeFit corruption.
  isResizeSuppressed(): boolean {
    return this.terminalSessions.isResizeSuppressed()
  }

  subscribeToTerminalResize(
    ptyId: string,
    listener: (event: {
      cols: number
      rows: number
      displayMode: string
      reason: string
      seq?: number
    }) => void
  ): () => void {
    return this.terminalSessions.subscribeToResize(ptyId, listener)
  }

  private notifyTerminalResize(
    ptyId: string,
    event: { cols: number; rows: number; displayMode: string; reason: string; seq?: number }
  ): void {
    this.terminalSessions.emitResize(ptyId, event)
  }

  // Why: Section 7.2 — the runtime detects agent exit directly and updates
  // dispatch contexts immediately, rather than waiting for the coordinator's
  // next poll cycle. This catches agent crashes and unexpected exits within
  // milliseconds. The task is set back to 'pending' so it can be re-dispatched.
  private failActiveDispatchOnExit(leaf: RuntimeLeafRecord, exitCode: number): void {
    if (!this._orchestrationDb) {
      return
    }

    const handle = this.terminalSessions.getTerminalHandleForLeafKey(
      this.getLeafKey(leaf.tabId, leaf.leafId)
    )
    if (!handle) {
      return
    }

    const dispatch = this._orchestrationDb.getActiveDispatchForTerminal(handle)
    if (!dispatch) {
      return
    }

    const errorContext = `Agent exited with code ${exitCode}`
    this._orchestrationDb.failDispatch(dispatch.id, errorContext)

    // Why: create an escalation message so the coordinator is notified about
    // the unexpected exit on its next check cycle, even if the circuit breaker
    // hasn't tripped yet.
    const run = this._orchestrationDb.getActiveCoordinatorRun()
    if (run) {
      this._orchestrationDb.insertMessage({
        from: handle,
        to: run.coordinator_handle,
        subject: `Agent exited unexpectedly (code ${exitCode})`,
        type: 'escalation',
        priority: 'high',
        payload: JSON.stringify({
          taskId: dispatch.task_id,
          exitCode,
          handle
        })
      })
    }
  }

  async listTerminals(
    worktreeSelector?: string,
    limit = DEFAULT_TERMINAL_LIST_LIMIT,
    opts: { requireFreshPtyLiveness?: boolean } = {}
  ): Promise<RuntimeTerminalListResult> {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error('invalid_limit')
    }
    const graphEpoch =
      this.terminalSessions.getGraphStatus() === 'ready'
        ? this.terminalSessions.getGraphEpoch()
        : null
    const explicitTargetWorktreeId = worktreeSelector
      ? this.getValidatedExplicitWorktreeIdSelector(worktreeSelector)
      : null
    const initialResolvedWorktreeCache = this.resolvedWorktreeCache
    const cachedResolvedWorktrees =
      initialResolvedWorktreeCache && initialResolvedWorktreeCache.expiresAt > Date.now()
        ? initialResolvedWorktreeCache.worktrees
        : null
    const cachedExplicitTargetWorktree =
      explicitTargetWorktreeId && cachedResolvedWorktrees
        ? (cachedResolvedWorktrees.find((worktree) => worktree.id === explicitTargetWorktreeId) ??
          null)
        : null
    const parsedExplicitTargetWorktree =
      explicitTargetWorktreeId && !cachedExplicitTargetWorktree
        ? this.buildResolvedWorktreeFromId(explicitTargetWorktreeId)
        : null
    const targetWorktree =
      worktreeSelector && !explicitTargetWorktreeId
        ? await this.resolveWorktreeSelector(worktreeSelector)
        : (cachedExplicitTargetWorktree ?? parsedExplicitTargetWorktree)
    const targetWorktreeId = explicitTargetWorktreeId ?? targetWorktree?.id ?? null
    const classificationResolvedWorktreeCache = this.resolvedWorktreeCache
    const classificationResolvedWorktrees =
      targetWorktreeId &&
      classificationResolvedWorktreeCache &&
      classificationResolvedWorktreeCache.expiresAt > Date.now()
        ? includeTargetResolvedWorktree(
            classificationResolvedWorktreeCache.worktrees,
            targetWorktree
          )
        : targetWorktreeId && explicitTargetWorktreeId
          ? this.listKnownResolvedWorktreesForExplicitTarget(targetWorktreeId, targetWorktree)
          : null
    const worktreesById =
      targetWorktreeId && targetWorktree
        ? new Map([[targetWorktree.id, targetWorktree]])
        : targetWorktreeId
          ? new Map()
          : await this.getResolvedWorktreeMap()
    if (graphEpoch !== null) {
      this.assertStableReadyGraph(graphEpoch)
    }

    const resolvedWorktrees =
      targetWorktreeId && classificationResolvedWorktrees
        ? classificationResolvedWorktrees
        : targetWorktreeId && targetWorktree
          ? [targetWorktree]
          : targetWorktreeId
            ? []
            : [...worktreesById.values()]
    const refreshedPtyLiveness = await this.refreshPtyWorktreeRecordsFromController(
      resolvedWorktrees,
      targetWorktreeId
    )
    if (opts.requireFreshPtyLiveness && !refreshedPtyLiveness) {
      throw new Error('terminal_liveness_unavailable')
    }

    const livePtyWorktreeIds = new Set<string>()
    for (const pty of this.terminalSessions.listPtyRecords()) {
      if (pty.connected) {
        livePtyWorktreeIds.add(pty.worktreeId)
      }
    }

    const terminals: RuntimeTerminalSummary[] = []
    const ptyIdsFromLeaves = new Set<string>()
    if (graphEpoch !== null) {
      for (const leaf of this.terminalSessions.listGraphLeaves()) {
        if (targetWorktreeId && leaf.worktreeId !== targetWorktreeId) {
          continue
        }
        if (opts.requireFreshPtyLiveness && leaf.ptyId && !refreshedPtyLiveness?.has(leaf.ptyId)) {
          continue
        }
        if (!leaf.ptyId && livePtyWorktreeIds.has(leaf.worktreeId)) {
          continue
        }
        if (leaf.ptyId) {
          ptyIdsFromLeaves.add(leaf.ptyId)
        }
        terminals.push(this.buildTerminalSummary(leaf, worktreesById))
      }
    }

    // Why: worktree.ps can classify active worktrees from PTY records even when
    // the renderer graph is missing a leaf. terminal.list needs the same fallback
    // so mobile does not show a false "No terminals" create flow.
    for (const pty of this.terminalSessions.listPtyRecords()) {
      if (!pty.connected || ptyIdsFromLeaves.has(pty.ptyId)) {
        continue
      }
      if (opts.requireFreshPtyLiveness && !refreshedPtyLiveness?.has(pty.ptyId)) {
        continue
      }
      if (targetWorktreeId && pty.worktreeId !== targetWorktreeId) {
        continue
      }
      terminals.push(this.buildPtyTerminalSummary(pty, worktreesById))
    }

    const listedTerminals = terminals.slice(0, limit)
    const visualLayouts = this.buildTerminalVisualLayouts(
      listedTerminals,
      worktreesById,
      targetWorktreeId
    )

    return {
      terminals: listedTerminals,
      ...(visualLayouts.length > 0 ? { visualLayouts } : {}),
      totalCount: terminals.length,
      truncated: terminals.length > limit
    }
  }

  private buildTerminalVisualLayouts(
    terminals: RuntimeTerminalSummary[],
    worktreesById: Map<string, ResolvedWorktree>,
    targetWorktreeId: string | null
  ): RuntimeTerminalVisualLayout[] {
    if (terminals.length === 0) {
      return []
    }
    // Why: the mobile/session snapshot supplies topology, but terminal.list
    // must print the same handles in both the flat list and visual tree.
    const summariesByLeafKey = new Map(
      terminals.map((terminal) => [this.getLeafKey(terminal.tabId, terminal.leafId), terminal])
    )
    const summariesByWorktree = new Map<string, RuntimeTerminalSummary[]>()
    for (const terminal of terminals) {
      const existing = summariesByWorktree.get(terminal.worktreeId)
      if (existing) {
        existing.push(terminal)
      } else {
        summariesByWorktree.set(terminal.worktreeId, [terminal])
      }
    }
    const snapshots = targetWorktreeId
      ? [this.mobileSessionTabsByWorktree.get(targetWorktreeId)].filter(
          (snapshot): snapshot is RuntimeMobileSessionTabsSnapshot => snapshot !== undefined
        )
      : [...this.mobileSessionTabsByWorktree.values()]
    const layouts: RuntimeTerminalVisualLayout[] = []
    for (const snapshot of snapshots) {
      const worktreeTerminals = summariesByWorktree.get(snapshot.worktree)
      if (!worktreeTerminals || worktreeTerminals.length === 0) {
        continue
      }
      const groups = this.buildTerminalVisualGroups(snapshot, summariesByLeafKey)
      if (groups.length === 0) {
        continue
      }
      const groupsById = new Map(
        groups
          .filter((group): group is RuntimeTerminalVisualGroupNode & { groupId: string } =>
            Boolean(group.groupId)
          )
          .map((group) => [group.groupId, group])
      )
      const root =
        this.buildTerminalVisualGroupLayout(snapshot.tabGroupLayout, groupsById) ?? groups[0]
      if (!root) {
        continue
      }
      const worktree = worktreesById.get(snapshot.worktree)
      layouts.push({
        worktreeId: snapshot.worktree,
        worktreePath: worktree?.path ?? worktreeTerminals[0]?.worktreePath ?? '',
        root
      })
    }
    return layouts
  }

  private buildTerminalVisualGroups(
    snapshot: RuntimeMobileSessionTabsSnapshot,
    summariesByLeafKey: ReadonlyMap<string, RuntimeTerminalSummary>
  ): RuntimeTerminalVisualGroupNode[] {
    const terminalTabs = snapshot.tabs.filter(
      (tab): tab is RuntimeMobileSessionTerminalTab => tab.type === 'terminal'
    )
    if (terminalTabs.length === 0) {
      return []
    }
    const tabsByParentId = new Map<string, RuntimeMobileSessionTerminalTab[]>()
    const parentOrder: string[] = []
    for (const tab of terminalTabs) {
      const existing = tabsByParentId.get(tab.parentTabId)
      if (existing) {
        existing.push(tab)
      } else {
        parentOrder.push(tab.parentTabId)
        tabsByParentId.set(tab.parentTabId, [tab])
      }
    }
    const groupSources =
      snapshot.tabGroups && snapshot.tabGroups.length > 0
        ? snapshot.tabGroups
        : [{ id: null, activeTabId: snapshot.activeTabId, tabOrder: parentOrder }]
    return groupSources
      .map((group): RuntimeTerminalVisualGroupNode | null => {
        const tabs = group.tabOrder
          .map((tabId) => {
            const surfaces =
              tabsByParentId.get(tabId) ?? terminalTabs.filter((tab) => tab.id === tabId)
            return this.buildTerminalVisualTab(tabId, surfaces, summariesByLeafKey)
          })
          .filter((tab): tab is RuntimeTerminalVisualTab => tab !== null)
        if (tabs.length === 0) {
          return null
        }
        return {
          type: 'group',
          groupId: group.id,
          activeTabId: group.activeTabId,
          tabs
        }
      })
      .filter((group): group is RuntimeTerminalVisualGroupNode => group !== null)
  }

  private buildTerminalVisualTab(
    tabId: string,
    surfaces: RuntimeMobileSessionTerminalTab[],
    summariesByLeafKey: ReadonlyMap<string, RuntimeTerminalSummary>
  ): RuntimeTerminalVisualTab | null {
    const firstSurface = surfaces[0]
    if (!firstSurface) {
      return null
    }
    const parentTabId = firstSurface.parentTabId
    const requestedActiveLeafId =
      firstSurface.parentLayout?.activeLeafId ??
      surfaces.find((surface) => surface.isActive)?.leafId ??
      firstSurface.leafId
    const root = firstSurface.parentLayout?.root ?? {
      type: 'leaf' as const,
      leafId: firstSurface.leafId
    }
    const visibleLeafIds = this.collectVisibleTerminalLeafIds(root, parentTabId, summariesByLeafKey)
    if (visibleLeafIds.length === 0) {
      return null
    }
    const activeLeafId =
      (requestedActiveLeafId && visibleLeafIds.includes(requestedActiveLeafId)
        ? requestedActiveLeafId
        : surfaces.find((surface) => surface.isActive && visibleLeafIds.includes(surface.leafId))
            ?.leafId) ?? visibleLeafIds[0]!
    const panes = this.buildTerminalVisualPane(root, parentTabId, activeLeafId, summariesByLeafKey)
    if (!panes) {
      return null
    }
    return {
      tabId: parentTabId || tabId,
      title: this.terminalSessions.getGraphTab(parentTabId)?.title ?? firstSurface.title ?? null,
      activeLeafId,
      panes
    }
  }

  private collectVisibleTerminalLeafIds(
    node: TerminalPaneLayoutNode,
    tabId: string,
    summariesByLeafKey: ReadonlyMap<string, RuntimeTerminalSummary>
  ): string[] {
    if (node.type === 'leaf') {
      return summariesByLeafKey.has(this.getLeafKey(tabId, node.leafId)) ? [node.leafId] : []
    }
    return [
      ...this.collectVisibleTerminalLeafIds(node.first, tabId, summariesByLeafKey),
      ...this.collectVisibleTerminalLeafIds(node.second, tabId, summariesByLeafKey)
    ]
  }

  private buildTerminalVisualPane(
    node: TerminalPaneLayoutNode,
    tabId: string,
    activeLeafId: string | null,
    summariesByLeafKey: ReadonlyMap<string, RuntimeTerminalSummary>
  ): RuntimeTerminalVisualPaneNode | null {
    if (node.type === 'leaf') {
      const summary = summariesByLeafKey.get(this.getLeafKey(tabId, node.leafId))
      if (!summary) {
        return null
      }
      return {
        type: 'terminal',
        handle: summary.handle,
        tabId: summary.tabId,
        leafId: summary.leafId,
        title: summary.title,
        connected: summary.connected,
        active: summary.leafId === activeLeafId
      }
    }
    const first = this.buildTerminalVisualPane(node.first, tabId, activeLeafId, summariesByLeafKey)
    const second = this.buildTerminalVisualPane(
      node.second,
      tabId,
      activeLeafId,
      summariesByLeafKey
    )
    if (first && second) {
      return { type: 'pane-split', direction: node.direction, first, second }
    }
    return first ?? second
  }

  private buildTerminalVisualGroupLayout(
    node: TabGroupLayoutNode | null | undefined,
    groupsById: ReadonlyMap<string, RuntimeTerminalVisualGroupNode>
  ): RuntimeTerminalVisualLayoutNode | null {
    if (!node) {
      return null
    }
    if (node.type === 'leaf') {
      return groupsById.get(node.groupId) ?? null
    }
    const first = this.buildTerminalVisualGroupLayout(node.first, groupsById)
    const second = this.buildTerminalVisualGroupLayout(node.second, groupsById)
    if (first && second) {
      return { type: 'split', direction: node.direction, first, second }
    }
    return first ?? second
  }

  // Why: when --terminal is omitted, the CLI auto-resolves to the active
  // terminal in the current worktree — matching browser's implicit active tab.
  async resolveActiveTerminal(worktreeSelector?: string): Promise<string> {
    if (this.terminalSessions.getGraphStatus() !== 'ready') {
      const targetWorktreeId = worktreeSelector
        ? (await this.resolveWorktreeSelector(worktreeSelector)).id
        : null
      const snapshots = targetWorktreeId
        ? [this.getMobileSessionTabsForWorktree(targetWorktreeId)]
        : await this.listAllMobileSessionTabs()
      for (const snapshot of snapshots) {
        const activeTerminal = snapshot.tabs.find(
          (tab) =>
            tab.type === 'terminal' &&
            tab.isActive &&
            tab.status === 'ready' &&
            typeof tab.terminal === 'string'
        )
        if (activeTerminal?.type === 'terminal' && activeTerminal.terminal) {
          return activeTerminal.terminal
        }
      }
      const listed = await this.listTerminals(worktreeSelector)
      const first = listed.terminals[0]?.handle
      if (first) {
        return first
      }
      throw new Error('no_active_terminal')
    }
    this.assertGraphReady()

    const targetWorktreeId = worktreeSelector
      ? (await this.resolveWorktreeSelector(worktreeSelector)).id
      : null

    // Prefer the tab's activeLeafId — this is the pane the user last focused
    for (const tab of this.terminalSessions.listGraphTabs()) {
      if (targetWorktreeId && tab.worktreeId !== targetWorktreeId) {
        continue
      }
      if (!tab.activeLeafId) {
        continue
      }
      const leafKey = this.getLeafKey(tab.tabId, tab.activeLeafId)
      const leaf = this.terminalSessions.getGraphLeafByKey(leafKey)
      if (leaf) {
        return this.issueHandle(leaf)
      }
    }

    // Fallback: any leaf in the target worktree
    for (const leaf of this.terminalSessions.listGraphLeaves()) {
      if (targetWorktreeId && leaf.worktreeId !== targetWorktreeId) {
        continue
      }
      return this.issueHandle(leaf)
    }

    throw new Error('no_active_terminal')
  }

  // Why: orchestration records the pane key as the remint-stable assignee
  // identity at dispatch time; null (best-effort) rather than throwing so
  // dispatch still works for handles without a resolvable pane.
  getTerminalPaneKey(handle: string): string | null {
    return this.getPaneKeyForTerminalHandle(handle)
  }

  resolveTerminalPane(paneKey: string): RuntimeTerminalResolvePane {
    // Why: the renderer context menu only knows the stable pane key; main owns
    // the runtime terminal handle that agents and CLI commands can address.
    const handle = this.getTerminalHandleForPaneKey(paneKey)
    if (!handle) {
      throw new Error('terminal_not_found')
    }
    const record = this.terminalSessions.getTerminalHandle(handle)
    const parsed = parsePaneKey(paneKey)
    return {
      handle,
      tabId: record?.tabId ?? parsed?.tabId ?? '',
      leafId: record?.leafId ?? parsed?.leafId ?? '',
      ptyId: record?.ptyId ?? null
    }
  }

  async showTerminal(handle: string): Promise<RuntimeTerminalShow> {
    const pty = this.getLivePtyForHandle(handle)
    if (pty) {
      const worktreesById = await this.getResolvedWorktreeMap()
      return {
        ...this.buildPtyTerminalSummary(pty.pty, worktreesById),
        tabId: pty.pty.tabId ?? pty.record.tabId,
        leafId: parsePaneKey(pty.pty.paneKey ?? '')?.leafId ?? pty.record.leafId,
        paneRuntimeId: -1,
        ptyId: pty.pty.ptyId,
        rendererGraphEpoch: this.terminalSessions.getGraphEpoch()
      }
    }
    const graphEpoch = this.captureReadyGraphEpoch()
    const worktreesById = await this.getResolvedWorktreeMap()
    this.assertStableReadyGraph(graphEpoch)
    const { leaf } = this.getLiveLeafForHandle(handle)
    const summary = this.buildTerminalSummary(leaf, worktreesById)
    return {
      ...summary,
      paneRuntimeId: leaf.paneRuntimeId,
      ptyId: leaf.ptyId,
      rendererGraphEpoch: this.terminalSessions.getGraphEpoch()
    }
  }

  async readTerminal(
    handle: string,
    opts: { cursor?: number; limit?: number } = {}
  ): Promise<RuntimeTerminalRead> {
    const pty = this.getLivePtyForHandle(handle)
    if (pty) {
      const read = this.readPtyTerminal(handle, pty.pty, opts)
      return this.withVisibleSnapshotFallback(pty.pty.ptyId, read, opts)
    }

    const { leaf } = this.getLiveLeafForHandle(handle)
    const read = readTerminalTail({
      handle,
      status: getTerminalState(leaf),
      completedLines: leaf.tailBuffer,
      partialLine: leaf.tailPartialLine,
      completedLineCount: leaf.tailLinesTotal,
      bufferTruncated: leaf.tailTruncated,
      cursor: opts.cursor,
      limit: opts.limit
    })
    return leaf.ptyId ? this.withVisibleSnapshotFallback(leaf.ptyId, read, opts) : read
  }

  async sendTerminal(
    handle: string,
    action: {
      text?: string
      enter?: boolean
      interrupt?: boolean
    },
    options: {
      beforeWrite?: (ptyId: string) => void | Promise<void>
      reserveWrite?: (ptyId: string) => void
      afterWrite?: (ptyId: string) => void | Promise<void>
      suffixFailureError?: string
    } = {}
  ): Promise<RuntimeTerminalSend> {
    const pty = this.getLivePtyForHandle(handle)
    if (pty) {
      if (!pty.pty.connected) {
        throw new Error('terminal_not_writable')
      }
      const payload = buildSendPayload(action)
      if (payload === null) {
        throw new Error('invalid_terminal_send')
      }
      await assertTerminalInputWithinLimitWithYield(action.text)
      await this.writeTerminalAction(pty.pty.ptyId, action, payload, options)
      return {
        handle,
        accepted: true,
        bytesWritten: Buffer.byteLength(payload, 'utf8')
      }
    }

    const { leaf } = this.getLiveLeafForHandle(handle)
    if (!leaf.writable || !leaf.ptyId) {
      throw new Error('terminal_not_writable')
    }
    const payload = buildSendPayload(action)
    if (payload === null) {
      throw new Error('invalid_terminal_send')
    }
    await assertTerminalInputWithinLimitWithYield(action.text)

    await this.writeTerminalAction(leaf.ptyId, action, payload, options)

    return {
      handle,
      accepted: true,
      bytesWritten: Buffer.byteLength(payload, 'utf8')
    }
  }

  async sendTerminalAgentPrompt(
    handle: string,
    prompt: string,
    options: {
      beforeWrite?: (ptyId: string) => void | Promise<void>
      suffixFailureError?: string
    } = {}
  ): Promise<RuntimeTerminalSend> {
    const payload = buildAgentPromptPasteBytes(prompt)
    const bytesWritten = Buffer.byteLength(`${payload}${AGENT_PROMPT_SUBMIT}`, 'utf8')
    const pty = this.getLivePtyForHandle(handle)
    if (pty) {
      if (!pty.pty.connected) {
        throw new Error('terminal_not_writable')
      }
      await assertTerminalInputWithinLimitWithYield(payload)
      await this.writeTerminalAgentPrompt(pty.pty.ptyId, payload, options)
      return { handle, accepted: true, bytesWritten }
    }

    const { leaf } = this.getLiveLeafForHandle(handle)
    if (!leaf.writable || !leaf.ptyId) {
      throw new Error('terminal_not_writable')
    }
    await assertTerminalInputWithinLimitWithYield(payload)
    await this.writeTerminalAgentPrompt(leaf.ptyId, payload, options)
    return { handle, accepted: true, bytesWritten }
  }

  async getTerminalAgentStatus(handle: string): Promise<RuntimeTerminalAgentStatus> {
    const ptyId = this.getTerminalAgentStatusPtyId(handle)
    const terminal = this.getTerminalAgentStatusSnapshot(handle, ptyId)
    const explicitStatus = this.getFreshExplicitAgentStatusForHandle(handle)
    const blockedByWaitText = detectTerminalWaitBlockedReason(terminal.waitText)
    const liveTitleClearsBlockedText =
      terminal.titleStatusIsLive &&
      terminal.titleStatus !== null &&
      terminal.titleStatus !== 'permission'
    if (terminal.titleStatus === 'permission' && terminal.titleStatusIsLive) {
      return { handle, isRunningAgent: true, status: 'permission' }
    }
    if (
      blockedByWaitText &&
      !liveTitleClearsBlockedText &&
      (!explicitStatus ||
        explicitStatus.status === 'permission' ||
        (terminal.waitBlockedAt !== null && terminal.waitBlockedAt >= explicitStatus.updatedAt))
    ) {
      return { handle, isRunningAgent: true, status: 'permission' }
    }
    if (explicitStatus) {
      // Why: permission titles can linger after hooks report the agent resumed.
      // Fresh hook state is tighter, but current shell/management evidence wins.
      const isRunningAgent =
        !terminalTitleBlocksExplicitAgentStatus(terminal.title) &&
        !(await this.terminalHasShellForegroundProcess(handle, ptyId))
      this.assertTerminalAgentStatusPtyBinding(handle, ptyId)
      return {
        handle,
        isRunningAgent,
        status: isRunningAgent ? explicitStatus.status : null
      }
    }
    if (terminal.titleStatus) {
      return { handle, isRunningAgent: true, status: terminal.titleStatus }
    }

    const isRunningAgent = await this.isTerminalRunningAgent(handle)
    this.assertTerminalAgentStatusPtyBinding(handle, ptyId)
    return { handle, isRunningAgent, status: null }
  }

  private getTerminalAgentStatusPtyId(handle: string): string {
    const pty = this.getLivePtyForHandle(handle)
    if (pty) {
      if (!pty.pty.connected) {
        throw new Error('terminal_gone')
      }
      return pty.pty.ptyId
    }
    const { leaf } = this.getLiveLeafForHandle(handle)
    if (getTerminalState(leaf) !== 'running') {
      throw new Error('terminal_exited')
    }
    if (!leaf.ptyId) {
      throw new Error('terminal_gone')
    }
    return leaf.ptyId
  }

  private assertTerminalAgentStatusPtyBinding(handle: string, expectedPtyId: string): void {
    if (this.getTerminalAgentStatusPtyId(handle) === expectedPtyId) {
      return
    }
    // Why: delayed process evidence belongs only to the PTY that started the
    // read, while callers still rely on the established stale-handle contract.
    throw new Error('terminal_handle_stale')
  }

  private getTerminalAgentStatusSnapshot(
    handle: string,
    expectedPtyId: string
  ): {
    waitText: string
    waitBlockedAt: number | null
    title: string | null
    titleStatus: AgentStatus | null
    titleStatusIsLive: boolean
  } {
    const pty = this.getLivePtyForHandle(handle)
    if (pty) {
      if (!pty.pty.connected || pty.pty.ptyId !== expectedPtyId) {
        throw new Error('terminal_not_writable')
      }
      const leaf = this.getPrimaryLeafForPty(pty.pty.ptyId)
      const leafTitle = leaf
        ? getLatestAgentCandidateTitleInfo(
            { title: leaf.paneTitle, updatedAt: leaf.paneTitleUpdatedAt },
            { title: leaf.lastOscTitle, updatedAt: leaf.lastOscTitleAt }
          )
        : null
      const ptyTitle =
        leafTitle ??
        getLatestAgentCandidateTitleInfo(
          { title: pty.pty.title, updatedAt: pty.pty.titleUpdatedAt },
          { title: pty.pty.lastOscTitle, updatedAt: pty.pty.lastOscTitleAt }
        )
      const waitText = buildTerminalWaitText(
        pty.pty.tailBuffer,
        pty.pty.tailPartialLine,
        pty.pty.preview
      )
      return {
        waitText,
        waitBlockedAt: pty.pty.waitBlockedAt,
        title: ptyTitle?.title ?? null,
        titleStatus: ptyTitle
          ? detectAgentStatusFromTitle(ptyTitle.title)
          : pty.pty.lastAgentStatus,
        titleStatusIsLive: ptyTitle !== null
      }
    }

    const { leaf } = this.getLiveLeafForHandle(handle)
    if (getTerminalState(leaf) !== 'running') {
      throw new Error('terminal_exited')
    }
    if (!leaf.ptyId) {
      throw new Error('terminal_gone')
    }
    if (leaf.ptyId !== expectedPtyId) {
      throw new Error('terminal_not_writable')
    }
    const title = getLatestAgentCandidateTitleInfo(
      { title: leaf.paneTitle, updatedAt: leaf.paneTitleUpdatedAt },
      { title: leaf.lastOscTitle, updatedAt: leaf.lastOscTitleAt },
      { title: this.terminalSessions.getGraphTab(leaf.tabId)?.title, updatedAt: 0 }
    )
    return {
      waitText: buildTerminalWaitText(leaf.tailBuffer, leaf.tailPartialLine, leaf.preview),
      waitBlockedAt: leaf.waitBlockedAt,
      title: title?.title ?? null,
      titleStatus: title ? detectAgentStatusFromTitle(title.title) : leaf.lastAgentStatus,
      titleStatusIsLive: (title?.updatedAt ?? 0) > 0
    }
  }

  private async terminalHasShellForegroundProcess(handle: string, ptyId: string): Promise<boolean> {
    if (!this.ptyController) {
      return false
    }
    let foregroundProcess: string | null
    try {
      foregroundProcess = await this.ptyController.getForegroundProcess(ptyId)
    } catch {
      this.assertTerminalAgentStatusPtyBinding(handle, ptyId)
      return false
    }
    this.assertTerminalAgentStatusPtyBinding(handle, ptyId)
    if (!foregroundProcess || !isShellProcess(foregroundProcess)) {
      return false
    }
    const confirmationController = this.ptyController
    if (!confirmationController?.confirmForegroundProcess) {
      return true
    }
    let confirmedProcess: string | null
    try {
      confirmedProcess = await confirmationController.confirmForegroundProcess(ptyId)
    } catch {
      this.assertTerminalAgentStatusPtyBinding(handle, ptyId)
      return true
    }
    this.assertTerminalAgentStatusPtyBinding(handle, ptyId)
    // Why: hook identity is generic; strong provider evidence only needs to
    // prove that some recognized agent still owns this exact PTY.
    return recognizeAgentProcess(confirmedProcess) === null
  }

  private shouldDelayPtyBackedMobileSnapshotForForegroundAgent(
    pty: RuntimePtyWorktreeRecord,
    title: string
  ): boolean {
    return (
      !pty.launchAgent && pty.foregroundAgent === null && hasCompatibleAgentTitleIdentity(title)
    )
  }

  /**
   * Schedules an asynchronous query to check which agent process is currently
   * running in the foreground of a PTY.
   */
  private refreshPtyForegroundAgent(ptyId: string): void {
    void this.refreshPtyForegroundAgentFromController(ptyId)
  }

  private getPendingForegroundAgentRefreshForTitle(
    ptyId: string,
    titleObservedAt: number
  ): Promise<boolean> | undefined {
    if (!this.ptyForegroundAgentRefreshes.has(ptyId)) {
      return undefined
    }
    return this.refreshPtyForegroundAgentFromController(ptyId, {
      afterTitleObservation: titleObservedAt
    })
  }

  private delayPtyBackedMobileSnapshotForForegroundAgent(
    ptyId: string,
    titleObservedAt: number,
    foregroundRefresh: Promise<boolean>
  ): void {
    this.ptyDelayedForegroundSnapshotTitleObservations.set(ptyId, titleObservedAt)
    void foregroundRefresh.then((foregroundAgentChanged) => {
      if (this.ptyDelayedForegroundSnapshotTitleObservations.get(ptyId) !== titleObservedAt) {
        return
      }
      this.ptyDelayedForegroundSnapshotTitleObservations.delete(ptyId)
      if (!foregroundAgentChanged) {
        this.touchMobileSessionSnapshotsForPty(ptyId)
      }
    })
  }

  /**
   * Deduplicates and manages in-flight foreground agent refresh queries
   * for a specific PTY.
   */
  private refreshPtyForegroundAgentFromController(
    ptyId: string,
    options: { afterTitleObservation?: number } = {}
  ): Promise<boolean> {
    const startedAfterTitleObservation = options.afterTitleObservation ?? 0
    const pendingRefresh = this.ptyForegroundAgentRefreshes.get(ptyId)
    if (pendingRefresh) {
      pendingRefresh.requestedAfterTitleObservation = Math.max(
        pendingRefresh.requestedAfterTitleObservation,
        startedAfterTitleObservation
      )
      return pendingRefresh.promise
    }
    const entry: PtyForegroundAgentRefresh = {
      promise: Promise.resolve(false),
      startedAfterTitleObservation,
      requestedAfterTitleObservation: startedAfterTitleObservation
    }
    const refresh = (async (): Promise<boolean> => {
      while (true) {
        entry.startedAfterTitleObservation = entry.requestedAfterTitleObservation
        const foregroundAgentChanged = await this.loadPtyForegroundAgentFromController(ptyId)
        if (
          foregroundAgentChanged ||
          entry.requestedAfterTitleObservation <= entry.startedAfterTitleObservation
        ) {
          return foregroundAgentChanged
        }
      }
    })().finally(() => {
      if (this.ptyForegroundAgentRefreshes.get(ptyId) === entry) {
        this.ptyForegroundAgentRefreshes.delete(ptyId)
      }
    })
    entry.promise = refresh
    this.ptyForegroundAgentRefreshes.set(ptyId, entry)
    return refresh
  }

  /**
   * Queries the PTY controller for the active foreground process, identifies if it
   * is a recognized agent, and updates the PTY's foreground agent state if changed.
   */
  private async loadPtyForegroundAgentFromController(ptyId: string): Promise<boolean> {
    if (!this.ptyController) {
      return false
    }
    // Why: foregroundAgent is only consulted as the owner fallback when
    // launchAgent is unknown, so a known launchAgent makes the relay
    // getForegroundProcess round-trip pure waste (covers all launched agents).
    if (!this.terminalSessions.canProbePtyForegroundAgent(ptyId)) {
      return false
    }
    let foregroundProcess: string | null
    try {
      foregroundProcess = await this.ptyController.getForegroundProcess(ptyId)
    } catch {
      return false
    }
    const foregroundAgent = foregroundProcess
      ? (recognizeAgentProcess(foregroundProcess)?.agent ?? null)
      : null
    if (!this.terminalSessions.setPtyForegroundAgent(ptyId, foregroundAgent)) {
      return false
    }
    this.touchMobileSessionSnapshotsForPty(ptyId)
    return true
  }

  private getFreshExplicitAgentStatusForHandle(handle: string): {
    status: NonNullable<RuntimeTerminalAgentStatus['status']>
    updatedAt: number
  } | null {
    const paneKey = this.getPaneKeyForTerminalHandle(handle)
    const now = Date.now()
    let bestStatus: NonNullable<RuntimeTerminalAgentStatus['status']> | null = null
    let bestUpdatedAt = -1

    const consider = (
      state: AgentStatusEntry['state'] | undefined,
      updatedAt: number | null | undefined
    ): void => {
      if (!state) {
        return
      }
      if (typeof updatedAt !== 'number' || now - updatedAt > AGENT_STATUS_STALE_AFTER_MS) {
        return
      }
      const status = mapExplicitAgentStateToRuntimeTerminalStatus(state)
      // Why: older retained permission rows can remain visible after the agent
      // resumes. Prefer the newest explicit state; only let permission win ties.
      if (updatedAt > bestUpdatedAt || (updatedAt === bestUpdatedAt && status === 'permission')) {
        bestStatus = status
        bestUpdatedAt = updatedAt
      }
    }

    if (paneKey) {
      const retained = this.latestAgentStatusByPaneKey.get(paneKey)
      consider(retained?.payload.state, retained?.updatedAt)
    }

    for (const entry of this.getAgentStatusSnapshotFn?.() ?? []) {
      if (entry.terminalHandle !== handle && (!paneKey || entry.paneKey !== paneKey)) {
        continue
      }
      consider(entry.state, entry.receivedAt)
    }

    return bestStatus ? { status: bestStatus, updatedAt: bestUpdatedAt } : null
  }

  private async writeTerminalAction(
    ptyId: string,
    action: { text?: string; enter?: boolean; interrupt?: boolean },
    payload: string,
    options: {
      beforeWrite?: (ptyId: string) => void | Promise<void>
      reserveWrite?: (ptyId: string) => void
      afterWrite?: (ptyId: string) => void | Promise<void>
      suffixFailureError?: string
    } = {}
  ): Promise<void> {
    // Why: direct terminal.send can carry paste-sized text from RPC/mobile
    // clients; chunk text before PTY/ConPTY while preserving suffix separation.
    const hasText = typeof action.text === 'string' && action.text.length > 0
    const hasSuffix = action.enter || action.interrupt
    if (hasText) {
      await this.writeTerminalInputChunks(ptyId, action.text!, options)
    }
    if (hasSuffix) {
      const suffix = (action.enter ? '\r' : '') + (action.interrupt ? '\x03' : '')
      if (hasText) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
      try {
        await options.beforeWrite?.(ptyId)
        options.reserveWrite?.(ptyId)
      } catch (error) {
        if (options.suffixFailureError) {
          throw new Error(options.suffixFailureError)
        }
        throw error
      }
      const suffixWrote = this.ptyController?.write(ptyId, suffix) ?? false
      if (!suffixWrote) {
        throw new Error(options.suffixFailureError ?? 'terminal_not_writable')
      }
      await options.afterWrite?.(ptyId)
      return
    }
    if (hasText) {
      return
    }

    await options.beforeWrite?.(ptyId)
    options.reserveWrite?.(ptyId)
    const wrote = this.ptyController?.write(ptyId, payload) ?? false
    if (!wrote) {
      throw new Error('terminal_not_writable')
    }
    await options.afterWrite?.(ptyId)
  }

  private async writeTerminalInputChunks(
    ptyId: string,
    text: string,
    options: {
      beforeWrite?: (ptyId: string) => void | Promise<void>
      reserveWrite?: (ptyId: string) => void
      afterWrite?: (ptyId: string) => void | Promise<void>
    } = {}
  ): Promise<void> {
    const chunks = iterateTerminalInputChunks(text)
    let chunk = chunks.next()
    while (!chunk.done) {
      await options.beforeWrite?.(ptyId)
      options.reserveWrite?.(ptyId)
      const wrote = this.ptyController?.write(ptyId, chunk.value) ?? false
      if (!wrote) {
        throw new Error('terminal_not_writable')
      }
      await options.afterWrite?.(ptyId)
      chunk = chunks.next()
      if (!chunk.done) {
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    }
  }

  private async writeTerminalAgentPrompt(
    ptyId: string,
    pastePayload: string,
    options: {
      beforeWrite?: (ptyId: string) => void | Promise<void>
      suffixFailureError?: string
    } = {}
  ): Promise<void> {
    let wrotePasteBytes = false
    let completedPaste = false
    try {
      const chunks = iterateTerminalInputChunks(pastePayload)
      let chunk = chunks.next()
      while (!chunk.done) {
        await options.beforeWrite?.(ptyId)
        const wrote = this.ptyController?.write(ptyId, chunk.value) ?? false
        if (!wrote) {
          throw new Error('terminal_not_writable')
        }
        wrotePasteBytes = true
        chunk = chunks.next()
        if (!chunk.done) {
          await new Promise((resolve) => setTimeout(resolve, 0))
        }
      }
      completedPaste = true
    } catch (error) {
      if (wrotePasteBytes && !completedPaste) {
        this.ptyController?.write(ptyId, AGENT_PROMPT_BRACKETED_PASTE_END)
      }
      throw error
    }

    await new Promise((resolve) => setTimeout(resolve, AGENT_PROMPT_SUBMIT_DELAY_MS))
    try {
      await options.beforeWrite?.(ptyId)
    } catch (error) {
      if (options.suffixFailureError) {
        throw new Error(options.suffixFailureError)
      }
      throw error
    }
    const suffixWrote = this.ptyController?.write(ptyId, AGENT_PROMPT_SUBMIT) ?? false
    if (!suffixWrote) {
      throw new Error(options.suffixFailureError ?? 'terminal_not_writable')
    }
  }

  async waitForTerminal(
    handle: string,
    options?: {
      condition?: RuntimeTerminalWaitCondition
      timeoutMs?: number
      signal?: AbortSignal
    }
  ): Promise<RuntimeTerminalWait> {
    const condition = options?.condition ?? 'exit'
    const pty = this.getLivePtyForHandle(handle)
    if (pty) {
      if (condition === 'exit' && !pty.pty.connected) {
        return buildPtyTerminalWaitResult(handle, condition, pty.pty)
      }
      const ptyWaitText = buildTerminalWaitText(
        pty.pty.tailBuffer,
        pty.pty.tailPartialLine,
        pty.pty.preview
      )
      const ptyBlockedReason = detectTerminalWaitBlockedReason(ptyWaitText)
      if (condition === 'tui-idle' && ptyBlockedReason) {
        return buildPtyTerminalWaitBlockedResult(handle, condition, pty.pty, ptyBlockedReason)
      }
      if (condition === 'tui-idle' && pty.pty.lastAgentStatus === 'idle') {
        return buildPtyTerminalWaitResult(handle, condition, pty.pty)
      }
      if (
        condition === 'tui-idle' &&
        (this.getAdoptedPtyExplicitIdleStatus(pty.pty) === 'idle' ||
          isKnownReadyPromptPreview(ptyWaitText))
      ) {
        return buildPtyTerminalWaitResult(handle, condition, pty.pty)
      }
      return await new Promise<RuntimeTerminalWait>((resolve, reject) => {
        const effectiveTimeoutMs =
          typeof options?.timeoutMs === 'number' && options.timeoutMs > 0
            ? options.timeoutMs
            : condition === 'tui-idle'
              ? TUI_IDLE_DEFAULT_TIMEOUT_MS
              : 0
        const waiter: TerminalWaiter = {
          handle,
          condition,
          resolve,
          reject,
          timeout: null,
          pollInterval: null,
          abortCleanup: null
        }
        if (!this.bindTerminalWaiterAbort(waiter, options?.signal)) {
          reject(new Error('request_aborted'))
          return
        }
        if (effectiveTimeoutMs > 0) {
          waiter.timeout = setTimeout(() => {
            this.removeWaiter(waiter)
            reject(new Error('timeout'))
          }, effectiveTimeoutMs)
        }
        this.terminalSessions.addTerminalWaiter(waiter)
        const live = this.getLivePtyForHandle(handle)
        if (!live) {
          this.removeWaiter(waiter)
          reject(new Error('terminal_handle_stale'))
        } else if (condition === 'exit' && !live.pty.connected) {
          this.resolveWaiter(waiter, buildPtyTerminalWaitResult(handle, condition, live.pty))
        } else if (condition === 'tui-idle') {
          const livePtyWaitText = buildTerminalWaitText(
            live.pty.tailBuffer,
            live.pty.tailPartialLine,
            live.pty.preview
          )
          const blockedReason = detectTerminalWaitBlockedReason(livePtyWaitText)
          if (blockedReason) {
            this.resolveWaiter(
              waiter,
              buildPtyTerminalWaitBlockedResult(handle, condition, live.pty, blockedReason)
            )
          } else if (live.pty.lastAgentStatus === 'idle') {
            this.resolveWaiter(waiter, buildPtyTerminalWaitResult(handle, condition, live.pty))
          } else if (
            this.getAdoptedPtyExplicitIdleStatus(live.pty) === 'idle' ||
            isKnownReadyPromptPreview(livePtyWaitText)
          ) {
            this.resolveWaiter(waiter, buildPtyTerminalWaitResult(handle, condition, live.pty))
          } else {
            this.startPtyTuiIdleFallbackPoll(waiter, live.pty)
          }
        }
      })
    }
    const { leaf } = this.getLiveLeafForHandle(handle)

    if (condition === 'exit' && getTerminalState(leaf) === 'exited') {
      return buildTerminalWaitResult(handle, condition, leaf)
    }

    const leafWaitText = buildTerminalWaitText(leaf.tailBuffer, leaf.tailPartialLine, leaf.preview)
    const leafBlockedReason = detectTerminalWaitBlockedReason(leafWaitText)
    if (condition === 'tui-idle' && leafBlockedReason) {
      return buildTerminalWaitBlockedResult(handle, condition, leaf, leafBlockedReason)
    }

    // Why: if the agent already transitioned to idle (or permission) before the
    // waiter was registered, resolve immediately. This uses the same OSC title
    // detection that powers the renderer's "Task complete" notifications.
    // Why: only 'idle' satisfies tui-idle, not 'permission'. Permission means the
    // agent is blocked on user approval, not finished with its task.
    if (condition === 'tui-idle' && leaf.lastAgentStatus === 'idle') {
      return buildTerminalWaitResult(handle, condition, leaf)
    }
    if (condition === 'tui-idle') {
      const fastPathTitle = leaf.paneTitle ?? this.terminalSessions.getGraphTab(leaf.tabId)?.title
      if (
        (fastPathTitle && detectExplicitIdleStatusFromTitle(fastPathTitle) === 'idle') ||
        isKnownReadyPromptPreview(leafWaitText)
      ) {
        return buildTerminalWaitResult(handle, condition, leaf)
      }
    }

    return await new Promise<RuntimeTerminalWait>((resolve, reject) => {
      // Why: tui-idle depends on OSC title transitions from a recognized agent.
      // If no agent is detected, the waiter would hang forever. Enforce a default
      // timeout so unsupported CLIs fail predictably instead of silently blocking.
      const effectiveTimeoutMs =
        typeof options?.timeoutMs === 'number' && options.timeoutMs > 0
          ? options.timeoutMs
          : condition === 'tui-idle'
            ? TUI_IDLE_DEFAULT_TIMEOUT_MS
            : 0

      const waiter: TerminalWaiter = {
        handle,
        condition,
        resolve,
        reject,
        timeout: null,
        pollInterval: null,
        abortCleanup: null
      }

      if (!this.bindTerminalWaiterAbort(waiter, options?.signal)) {
        reject(new Error('request_aborted'))
        return
      }

      if (effectiveTimeoutMs > 0) {
        waiter.timeout = setTimeout(() => {
          this.removeWaiter(waiter)
          reject(new Error('timeout'))
        }, effectiveTimeoutMs)
      }

      this.terminalSessions.addTerminalWaiter(waiter)

      // Why: the handle may go stale or exit in the small gap between the first
      // validation and waiter registration. Re-checking here keeps wait --for
      // exit honest instead of hanging on a terminal that already changed.
      try {
        const live = this.getLiveLeafForHandle(handle)
        if (getTerminalState(live.leaf) === 'exited') {
          this.resolveWaiter(waiter, buildTerminalWaitResult(handle, condition, live.leaf))
        } else if (condition === 'tui-idle') {
          const liveLeafWaitText = buildTerminalWaitText(
            live.leaf.tailBuffer,
            live.leaf.tailPartialLine,
            live.leaf.preview
          )
          const blockedReason = detectTerminalWaitBlockedReason(liveLeafWaitText)
          if (blockedReason) {
            this.resolveWaiter(
              waiter,
              buildTerminalWaitBlockedResult(handle, condition, live.leaf, blockedReason)
            )
          } else if (live.leaf.lastAgentStatus === 'idle') {
            // Why: don't clear lastAgentStatus here. It's a factual record of the
            // last detected OSC state, not a one-shot signal. Clearing it causes
            // subsequent tui-idle waiters to hang even though the agent is idle —
            // the first waiter consumes the status and all later ones see null.
            this.resolveWaiter(waiter, buildTerminalWaitResult(handle, condition, live.leaf))
          } else {
            // Why: renderer-synced previews can show a known ready prompt even
            // while the last OSC title is still "working"; keep polling the
            // preview/title until the waiter resolves or hits its timeout.
            const fastPathTitle =
              live.leaf.paneTitle ?? this.terminalSessions.getGraphTab(live.leaf.tabId)?.title
            if (
              (fastPathTitle && detectExplicitIdleStatusFromTitle(fastPathTitle) === 'idle') ||
              isKnownReadyPromptPreview(liveLeafWaitText)
            ) {
              this.resolveWaiter(waiter, buildTerminalWaitResult(handle, condition, live.leaf))
            } else {
              this.startTuiIdleFallbackPoll(waiter, live.leaf)
            }
          }
        }
      } catch (error) {
        this.removeWaiter(waiter)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  async getWorktreePs(limit = DEFAULT_WORKTREE_PS_LIMIT): Promise<{
    worktrees: RuntimeWorktreePsSummary[]
    totalCount: number
    truncated: boolean
  }> {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error('invalid_limit')
    }
    const resolvedWorktreeSnapshot = await this.listResolvedWorktreeSnapshot()
    const resolvedWorktrees = resolvedWorktreeSnapshot.worktrees.filter((worktree) =>
      this.isRuntimeWorktreeVisible(worktree)
    )
    // Why: worktree.ps backs the mobile sidebar, so it must use the same
    // host-owned imported-worktree visibility gate as worktree.list/desktop.
    await this.refreshPtyWorktreeRecordsFromController(resolvedWorktrees)
    const repoById = new Map((this.store?.getRepos() ?? []).map((repo) => [repo.id, repo]))
    const platformByRepoId = resolvedWorktreeSnapshot.platformByRepoId
    const summaries = new Map<string, RuntimeWorktreePsSummary>()

    // Why: the GitHub cache is keyed by `repoPath::branch` (no refs/heads/ prefix),
    // matching how the renderer's fetchPRForBranch stores entries. We look up cached
    // PR info so mobile clients can group worktrees by PR state without making
    // expensive `gh` CLI calls. Falls back to meta.linkedPR if no cache entry exists.
    const ghCache = this.store?.getGitHubCache?.()
    for (const worktree of resolvedWorktrees) {
      const meta =
        this.store?.getWorktreeMeta?.(worktree.id) ?? this.store?.getAllWorktreeMeta()[worktree.id]
      const repo = repoById.get(worktree.repoId)
      let linkedPR: { number: number; state: string } | null = null
      const branch = worktree.branch.replace(/^refs\/heads\//, '')
      if (branch && ghCache) {
        // Why: the renderer keys the PR cache by `repoId::branch` (getGitHubPRCacheKey
        // prefers repo.id over repo.path), so read by id first and fall back to path
        // for legacy/path-keyed entries. Reading only by path missed every cached
        // entry, leaving mobile's linked-PR badge stuck on the 'unknown' fallback.
        const cached =
          (repo?.id ? ghCache.pr[`${repo.id}::${branch}`] : undefined) ??
          (repo?.path ? ghCache.pr[`${repo.path}::${branch}`] : undefined)
        if (cached?.data) {
          linkedPR = { number: cached.data.number, state: cached.data.state }
        }
      }
      if (!linkedPR && meta?.linkedPR != null) {
        linkedPR = { number: meta.linkedPR, state: 'unknown' }
      }
      const terminalPlatform = platformByRepoId.get(worktree.repoId) ?? process.platform
      // Why: use the instance-validated lineage from attachLineageToResolvedWorktrees,
      // not the raw store entry — shipped mobile clients trust parentWorktreeId as-is,
      // so a stale same-path entry would nest replacement checkouts under old parents.
      const lineage = worktree.lineage
      summaries.set(worktree.id, {
        // Why: mobile mirrors desktop workspace grouping/order from persisted
        // metadata, while older runtimes may not have hydrated every field yet.
        workspaceKind: 'git',
        worktreeId: worktree.id,
        repoId: worktree.repoId,
        ...((worktree.hostId ?? meta?.hostId) ? { hostId: worktree.hostId ?? meta?.hostId } : {}),
        terminalPlatform,
        repo: repo?.displayName ?? worktree.repoId,
        path: worktree.path,
        branch: worktree.branch,
        isArchived: worktree.isArchived,
        isMainWorktree: worktree.isMainWorktree,
        hasHostSidebarActivity: false,
        ...(worktree.instanceId !== undefined ? { worktreeInstanceId: worktree.instanceId } : {}),
        ...(lineage?.worktreeInstanceId !== undefined
          ? { lineageWorktreeInstanceId: lineage.worktreeInstanceId }
          : {}),
        ...(lineage?.parentWorktreeInstanceId !== undefined
          ? { parentWorktreeInstanceId: lineage.parentWorktreeInstanceId }
          : {}),
        parentWorktreeId: worktree.parentWorktreeId,
        childWorktreeIds: worktree.childWorktreeIds,
        displayName: worktree.displayName,
        workspaceStatus: meta?.workspaceStatus ?? DEFAULT_WORKSPACE_STATUS_ID,
        sortOrder: meta?.sortOrder ?? 0,
        ...(meta?.manualOrder !== undefined ? { manualOrder: meta.manualOrder } : {}),
        lastActivityAt: worktree.lastActivityAt,
        ...(worktree.createdAt !== undefined ? { createdAt: worktree.createdAt } : {}),
        linkedPR,
        linkedGitLabMR: meta?.linkedGitLabMR ?? null,
        comment: meta?.comment ?? '',
        isPinned: meta?.isPinned ?? false,
        isActive: false,
        unread: meta?.isUnread ?? false,
        liveTerminalCount: 0,
        hasAttachedPty: false,
        lastOutputAt: null,
        preview: '',
        status: 'inactive',
        agents: []
      })
    }

    const projectGroupById = new Map(
      (this.store?.getProjectGroups?.() ?? []).map((group) => [group.id, group])
    )
    for (const folderWorkspace of this.store?.getFolderWorkspaces?.() ?? []) {
      const projectGroup = projectGroupById.get(folderWorkspace.projectGroupId)
      if (!projectGroup?.parentPath) {
        continue
      }
      const worktree = folderWorkspaceToWorktree(folderWorkspace)
      summaries.set(worktree.id, {
        // Why: folder workspaces use the same mobile grouping/order contract as
        // git worktrees, but legacy records may be missing order metadata.
        workspaceKind: 'folder-workspace',
        worktreeId: worktree.id,
        repoId: worktree.repoId,
        repo: projectGroup.name,
        path: worktree.path,
        branch: worktree.branch,
        isArchived: worktree.isArchived,
        isMainWorktree: worktree.isMainWorktree,
        hasHostSidebarActivity: false,
        ...(worktree.instanceId !== undefined ? { worktreeInstanceId: worktree.instanceId } : {}),
        parentWorktreeId: null,
        childWorktreeIds: [],
        displayName: worktree.displayName,
        workspaceStatus: worktree.workspaceStatus ?? DEFAULT_WORKSPACE_STATUS_ID,
        sortOrder: worktree.sortOrder ?? 0,
        ...(worktree.manualOrder !== undefined ? { manualOrder: worktree.manualOrder } : {}),
        lastActivityAt: worktree.lastActivityAt,
        ...(worktree.createdAt !== undefined ? { createdAt: worktree.createdAt } : {}),
        linkedPR: null,
        linkedGitLabMR: worktree.linkedGitLabMR ?? null,
        comment: worktree.comment,
        isPinned: worktree.isPinned,
        isActive: false,
        unread: worktree.isUnread,
        liveTerminalCount: 0,
        hasAttachedPty: false,
        lastOutputAt: null,
        preview: '',
        status: 'inactive',
        agents: []
      })
    }

    const runtimeWorktreeSummaryPathIndex = buildRuntimeWorktreeSummaryPathIndex(
      summaries,
      resolvedWorktrees,
      platformByRepoId
    )
    const missingRuntimeWorktreeIds = new Set<string>()
    const countedPtyIds = new Set<string>()
    for (const leaf of this.terminalSessions.listGraphLeaves()) {
      const summary = this.getSummaryForRuntimeWorktreeId(
        summaries,
        runtimeWorktreeSummaryPathIndex,
        missingRuntimeWorktreeIds,
        leaf.worktreeId
      )
      if (!summary) {
        continue
      }
      if (leaf.ptyId) {
        countedPtyIds.add(leaf.ptyId)
      }
      if (leaf.ptyId && leaf.connected) {
        summary.hasHostSidebarActivity = true
      }
      const previousLastOutputAt = summary.lastOutputAt
      summary.liveTerminalCount += 1
      summary.hasAttachedPty = summary.hasAttachedPty || leaf.connected
      summary.lastOutputAt = maxTimestamp(summary.lastOutputAt, leaf.lastOutputAt)
      summary.status = mergeWorktreeStatus(
        summary.status,
        getLeafWorktreeStatus(leaf, this.terminalSessions.getGraphTab(leaf.tabId)?.title ?? null)
      )
      if (
        leaf.preview &&
        (summary.preview.length === 0 || (leaf.lastOutputAt ?? -1) >= (previousLastOutputAt ?? -1))
      ) {
        summary.preview = leaf.preview
      }
    }

    for (const pty of this.terminalSessions.listPtyRecords()) {
      if (!pty.connected || countedPtyIds.has(pty.ptyId)) {
        continue
      }
      const summary = this.getSummaryForRuntimeWorktreeId(
        summaries,
        runtimeWorktreeSummaryPathIndex,
        missingRuntimeWorktreeIds,
        pty.worktreeId
      )
      if (!summary) {
        continue
      }
      const previousLastOutputAt = summary.lastOutputAt
      summary.liveTerminalCount += 1
      summary.hasAttachedPty = true
      summary.hasHostSidebarActivity = true
      summary.lastOutputAt = maxTimestamp(summary.lastOutputAt, pty.lastOutputAt)
      summary.status = mergeWorktreeStatus(summary.status, 'active')
      if (
        pty.preview &&
        (summary.preview.length === 0 || (pty.lastOutputAt ?? -1) >= (previousLastOutputAt ?? -1))
      ) {
        summary.preview = pty.preview
      }
    }

    const session = this.store?.getWorkspaceSession?.()
    for (const worktreeId of session?.activeWorktreeIdsOnShutdown ?? []) {
      const summary = this.getSummaryForRuntimeWorktreeId(
        summaries,
        runtimeWorktreeSummaryPathIndex,
        missingRuntimeWorktreeIds,
        worktreeId
      )
      if (summary) {
        // Why: desktop advertises deferred reattach ids as live before their
        // panes mount; mobile must preserve the same startup activity view.
        summary.hasHostSidebarActivity = true
      }
    }
    for (const [worktreeId, tabs] of Object.entries(session?.tabsByWorktree ?? {})) {
      if (tabs.length === 0) {
        continue
      }
      const summary = this.getSummaryForRuntimeWorktreeId(
        summaries,
        runtimeWorktreeSummaryPathIndex,
        missingRuntimeWorktreeIds,
        worktreeId
      )
      if (!summary) {
        continue
      }
      // Why: desktop can show terminal tabs that are not mounted as renderer
      // leaves and are not currently visible in the PTY provider list. Mobile
      // still needs those worktrees to show as terminal-bearing entries.
      summary.liveTerminalCount = Math.max(summary.liveTerminalCount, tabs.length)
      summary.hasAttachedPty = summary.hasAttachedPty || tabs.some((tab) => tab.ptyId !== null)
      if (
        tabs.some(
          (tab) => tab.ptyId !== null && this.terminalSessions.getPtyRecord(tab.ptyId)?.connected
        )
      ) {
        summary.hasHostSidebarActivity = true
      }
      for (const tab of tabs) {
        summary.status = mergeWorktreeStatus(
          summary.status,
          getSavedTabWorktreeStatus(tab.title, tab.ptyId !== null)
        )
      }
    }

    for (const [worktreeId, tabs] of Object.entries(session?.browserTabsByWorktree ?? {})) {
      if (tabs.length === 0) {
        continue
      }
      const summary = this.getSummaryForRuntimeWorktreeId(
        summaries,
        runtimeWorktreeSummaryPathIndex,
        missingRuntimeWorktreeIds,
        worktreeId
      )
      if (summary) {
        // Why: desktop's sleeping predicate treats any open browser workspace
        // as active, so the mobile host projection must preserve that parity.
        summary.hasHostSidebarActivity = true
      }
    }

    // Why: surface the desktop's focused worktree so mobile can scroll it into
    // view and highlight it. Resolve through getSummaryForRuntimeWorktreeId so
    // SSH/remote path-projected ids match the same way tabsByWorktree does.
    if (session?.activeWorktreeId) {
      const activeSummary = this.getSummaryForRuntimeWorktreeId(
        summaries,
        runtimeWorktreeSummaryPathIndex,
        missingRuntimeWorktreeIds,
        session.activeWorktreeId
      )
      if (activeSummary) {
        activeSummary.isActive = true
      }
    }

    const mirroredWorktreeIdByTabId = new Map<string, string>()
    for (const [worktreeId, tabs] of Object.entries(session?.tabsByWorktree ?? {})) {
      for (const tab of tabs) {
        mirroredWorktreeIdByTabId.set(tab.id, worktreeId)
      }
    }
    // Why: a live renderer graph may precede persistence, but persisted tab
    // ownership wins when an automatic workspace rename has already rekeyed it.
    for (const tab of this.terminalSessions.listGraphTabs()) {
      if (!mirroredWorktreeIdByTabId.has(tab.tabId)) {
        mirroredWorktreeIdByTabId.set(tab.tabId, tab.worktreeId)
      }
    }

    this.attachAgentRowsToSummaries(
      summaries,
      runtimeWorktreeSummaryPathIndex,
      missingRuntimeWorktreeIds,
      mirroredWorktreeIdByTabId
    )

    const sorted = [...summaries.values()].sort(compareWorktreePs)
    return {
      worktrees: sorted.slice(0, limit),
      totalCount: sorted.length,
      truncated: sorted.length > limit
    }
  }

  // Why: maps the retained per-pane agent snapshots into each worktree's inline
  // agent list, mirroring the desktop sidebar. Lineage parent is resolved from
  // the orchestration db (paneKey-keyed), not the OSC payload, since spawn
  // hierarchy is pane-level state tracked separately from terminal output.
  private attachAgentRowsToSummaries(
    summaries: Map<string, RuntimeWorktreePsSummary>,
    runtimeWorktreeSummaryPathIndex: RuntimeWorktreeSummaryPathIndex,
    missingRuntimeWorktreeIds: Set<string>,
    mirroredWorktreeIdByTabId: ReadonlyMap<string, string>
  ): void {
    // Why: most agents report via hooks (agent-hooks/server), not OSC, so the
    // hook snapshot is the primary source — same one the desktop sidebar reads.
    // OSC-only entries (no hook) are merged in as a fallback, keyed by paneKey.
    const rowSources = new Map<
      string,
      {
        paneKey: string
        tabId?: string
        worktreeId?: string
        state: ParsedAgentStatusPayload['state']
        agentType: string | null
        prompt: string
        lastAssistantMessage: string | null
        toolName: string | null
        toolInput: string | null
        interrupted: boolean
        stateStartedAt: number
        updatedAt: number
      }
    >()
    for (const snapshot of this.latestAgentStatusByPaneKey.values()) {
      const { payload } = snapshot
      rowSources.set(snapshot.paneKey, {
        paneKey: snapshot.paneKey,
        tabId: snapshot.tabId,
        worktreeId: snapshot.worktreeId,
        state: payload.state,
        agentType: payload.agentType ?? null,
        prompt: payload.prompt,
        lastAssistantMessage: payload.lastAssistantMessage ?? null,
        toolName: payload.toolName ?? null,
        toolInput: payload.toolInput ?? null,
        interrupted: payload.interrupted ?? false,
        stateStartedAt: snapshot.stateStartedAt,
        updatedAt: snapshot.updatedAt
      })
    }
    for (const entry of this.getAgentStatusSnapshotFn?.() ?? []) {
      const existing = rowSources.get(entry.paneKey)
      // Why: hook rows win ties, but an older cached hook must not replace a
      // fresh OSC status and make a running mobile workspace look inactive.
      if (existing && existing.updatedAt > entry.receivedAt) {
        continue
      }
      rowSources.set(entry.paneKey, {
        paneKey: entry.paneKey,
        tabId: entry.tabId,
        worktreeId: entry.worktreeId,
        state: entry.state,
        agentType: entry.agentType ?? null,
        prompt: entry.prompt,
        lastAssistantMessage: entry.lastAssistantMessage ?? null,
        toolName: entry.toolName ?? null,
        toolInput: entry.toolInput ?? null,
        interrupted: entry.interrupted ?? false,
        stateStartedAt: entry.stateStartedAt,
        updatedAt: entry.receivedAt
      })
    }
    if (rowSources.size === 0) {
      return
    }
    const orchestrationByPaneKey = this.buildAgentOrchestrationByPaneKey()
    const rowsByWorktree = new Map<string, RuntimeWorktreeAgentRow[]>()
    const now = Date.now()
    for (const src of rowSources.values()) {
      // Why: hooks retain launch-time attribution across automatic workspace
      // renames; the tab's current mirrored owner is authoritative when present.
      const tabId = src.tabId ?? parsePaneKey(src.paneKey)?.tabId
      const worktreeId =
        (tabId ? mirroredWorktreeIdByTabId.get(tabId) : undefined) ?? src.worktreeId
      if (!worktreeId) {
        continue
      }
      const summary = this.getSummaryForRuntimeWorktreeId(
        summaries,
        runtimeWorktreeSummaryPathIndex,
        missingRuntimeWorktreeIds,
        worktreeId
      )
      if (!summary) {
        continue
      }
      const taskTitle = orchestrationByPaneKey?.[src.paneKey]?.taskTitle ?? null
      const displayName = orchestrationByPaneKey?.[src.paneKey]?.displayName ?? null
      const row: RuntimeWorktreeAgentRow = {
        paneKey: src.paneKey,
        parentPaneKey: orchestrationByPaneKey?.[src.paneKey]?.parentPaneKey ?? null,
        state: src.state,
        agentType: src.agentType,
        prompt: src.prompt,
        taskTitle,
        displayName,
        lastAssistantMessage: src.lastAssistantMessage,
        toolName: src.toolName,
        toolInput: src.toolInput,
        interrupted: src.interrupted,
        stateStartedAt: src.stateStartedAt,
        updatedAt: src.updatedAt
      }
      // Why: SSH/runtime projections can spell an equivalent path differently;
      // bucket by the canonical summary id so mobile keeps the agent activity.
      const rows = rowsByWorktree.get(summary.worktreeId)
      if (rows) {
        rows.push(row)
      } else {
        rowsByWorktree.set(summary.worktreeId, [row])
      }
    }
    for (const [worktreeId, rows] of rowsByWorktree) {
      // Oldest-started first, matching the desktop dashboard's start-order sort.
      rows.sort((a, b) => a.stateStartedAt - b.stateStartedAt)
      const summary = summaries.get(worktreeId)
      if (summary) {
        summary.agents = rows
        for (const row of rows) {
          if (!isFreshNonDoneAgentStatus(row, now)) {
            continue
          }
          // Why: worktree.ps is mobile's host-sidebar parity source, so a live
          // agent must survive the same temporary PTY gaps as desktop.
          summary.hasHostSidebarActivity = true
          summary.status = mergeWorktreeStatus(
            summary.status,
            row.state === 'working' ? 'working' : 'permission'
          )
        }
      }
    }
  }

  listRepos(): Repo[] {
    return this.store?.getRepos() ?? []
  }

  enrichMissingRepoGitRemoteIdentities(): void {
    if (!this.store) {
      return
    }
    enrichMissingRepoGitRemoteIdentities(this.store, {
      onChanged: () => {
        this.invalidateResolvedWorktreeCache()
        this.notifyReposChanged()
      }
    })
  }

  listProjects(): Project[] {
    return this.store?.getProjects?.() ?? []
  }

  updateProject(projectId: string, updates: ProjectUpdateArgs['updates']): Project {
    if (!this.store?.updateProject) {
      throw new Error('runtime_unavailable')
    }
    const project = this.store.updateProject(projectId, updates)
    if (!project) {
      throw new Error(`Project not found: ${projectId}`)
    }
    this.invalidateResolvedWorktreeCache()
    this.notifyReposChanged()
    return project
  }

  listProjectHostSetups(): ProjectHostSetup[] {
    return this.store?.getProjectHostSetups?.() ?? []
  }

  createProjectHostSetup(args: ProjectHostSetupCreateArgs): ProjectHostSetupCreateResult {
    if (!this.store?.createProjectHostSetup) {
      throw new Error('runtime_unavailable')
    }
    const result = this.store.createProjectHostSetup(args)
    if (!result) {
      throw new Error(`Project not found: ${args.projectId}`)
    }
    return result
  }

  async setupProjectExistingFolder(
    args: ProjectHostSetupExistingFolderArgs
  ): Promise<ProjectHostSetupResult> {
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }
    let repo = await this.addRepo(args.path, args.kind === 'folder' ? 'folder' : 'git', args.hostId)
    let setup = getProjectHostSetupForRepo(this.listProjectHostSetups(), repo)
    if (setup.projectId !== args.projectId) {
      const existingProject = this.listProjects().find((project) => project.id === args.projectId)
      if (
        !existingProject?.providerIdentity ||
        existingProject.providerIdentity.provider !== 'github'
      ) {
        throw new Error('Imported folder does not match the selected project identity.')
      }
      const updated = this.store.updateRepo(repo.id, {
        upstream: {
          owner: existingProject.providerIdentity.owner,
          repo: existingProject.providerIdentity.repo
        }
      })
      if (!updated) {
        throw new Error(`Project setup repo disappeared before it could be linked: ${repo.id}`)
      }
      repo = updated
      setup = getProjectHostSetupForRepo(this.listProjectHostSetups(), repo)
    }
    const setupMethod = args.setupMethod ?? 'imported-existing-folder'
    const updated = this.store.updateRepo(repo.id, { projectHostSetupMethod: setupMethod })
    if (!updated) {
      throw new Error(
        `Project setup repo disappeared before setup metadata could be linked: ${repo.id}`
      )
    }
    repo = updated
    setup = getProjectHostSetupForRepo(this.listProjectHostSetups(), repo)
    const project = this.listProjects().find((entry) => entry.id === setup.projectId)
    if (!project) {
      throw new Error(`Project setup was created without a project record: ${setup.projectId}`)
    }
    return { project, setup, repo }
  }

  async setupProjectClone(args: ProjectHostSetupCloneArgs): Promise<ProjectHostSetupResult> {
    const repo = await this.cloneRepo(args.url, args.destination, args.hostId)
    return await this.setupProjectExistingFolder({
      projectId: args.projectId,
      hostId: args.hostId,
      path: repo.path,
      kind: 'git',
      displayName: args.displayName,
      setupMethod: 'cloned'
    })
  }

  updateProjectHostSetup(args: ProjectHostSetupUpdateArgs): ProjectHostSetupUpdateResult {
    if (!this.store?.updateProjectHostSetup) {
      throw new Error('runtime_unavailable')
    }
    const result = this.store.updateProjectHostSetup(args)
    if (!result) {
      throw new Error(`Project host setup not found: ${args.setupId}`)
    }
    if ('worktreeBasePath' in args.updates && result.repo) {
      void prepareLocalWorktreeRootForRepo(this.store, result.repo)
      invalidateAuthorizedRootsCache()
    }
    return result
  }

  deleteProjectHostSetup(args: ProjectHostSetupDeleteArgs): ProjectHostSetupDeleteResult {
    if (!this.store?.deleteProjectHostSetup) {
      throw new Error('runtime_unavailable')
    }
    const result = this.store.deleteProjectHostSetup(args)
    if (!result) {
      throw new Error(`Project host setup not found: ${args.setupId}`)
    }
    return result
  }

  listProjectGroups(): ProjectGroup[] {
    return this.store?.getProjectGroups?.() ?? []
  }

  listFolderWorkspaces(): FolderWorkspace[] {
    return this.store?.getFolderWorkspaces?.() ?? []
  }

  async createProjectGroup(input: {
    name: string
    parentPath?: string | null
    connectionId?: string | null
    parentGroupId?: string | null
    createdFrom?: ProjectGroup['createdFrom']
  }): Promise<ProjectGroup> {
    if (!this.store?.createProjectGroup) {
      throw new Error('runtime_unavailable')
    }
    const group = this.store.createProjectGroup({
      name: input.name,
      parentPath: input.parentPath ?? null,
      connectionId: input.connectionId ?? null,
      parentGroupId: input.parentGroupId ?? null,
      createdFrom: input.createdFrom ?? 'manual'
    })
    this.notifyReposChanged()
    return group
  }

  async updateProjectGroup(
    groupId: string,
    updates: Partial<Pick<ProjectGroup, 'name' | 'isCollapsed' | 'tabOrder' | 'color'>>
  ): Promise<ProjectGroup | null> {
    if (!this.store?.updateProjectGroup) {
      throw new Error('runtime_unavailable')
    }
    const updated = this.store.updateProjectGroup(groupId, updates)
    if (updated) {
      this.notifyReposChanged()
    }
    return updated
  }

  async deleteProjectGroup(groupId: string): Promise<{ deleted: boolean }> {
    if (!this.store?.deleteProjectGroup) {
      throw new Error('runtime_unavailable')
    }
    const deleted = this.store.deleteProjectGroup(groupId)
    if (deleted) {
      this.notifyReposChanged()
    }
    return { deleted }
  }

  async moveProjectToGroup(
    repoSelector: string,
    groupId: string | null,
    order?: number
  ): Promise<Repo> {
    if (!this.store?.moveProjectToGroup) {
      throw new Error('runtime_unavailable')
    }
    const repo = await this.resolveRepoSelector(repoSelector)
    const moved = this.store.moveProjectToGroup(repo.id, groupId, order)
    if (!moved) {
      throw new Error('repo_not_found')
    }
    this.notifyReposChanged()
    return moved
  }

  async createFolderWorkspace(input: {
    projectGroupId: string
    name?: string
    folderPath?: string | null
    connectionId?: string | null
    linkedReview?: FolderWorkspace['linkedReview']
    createdWithAgent?: FolderWorkspace['createdWithAgent']
    pendingFirstAgentMessageRename?: boolean
  }): Promise<FolderWorkspace> {
    if (!this.store?.createFolderWorkspace) {
      throw new Error('runtime_unavailable')
    }
    const projectGroups = this.store.getProjectGroups?.() ?? []
    const group = projectGroups.find((entry) => entry.id === input.projectGroupId)
    const folderPath =
      typeof input.folderPath === 'string' && input.folderPath.trim().length > 0
        ? input.folderPath
        : group?.parentPath
    if (!group || !folderPath) {
      throw new Error('folder_workspace_project_group_not_found')
    }
    const status = await getFolderWorkspacePathStatusForPath(
      {
        folderPath,
        projectGroupId: group.id,
        connectionId: input.connectionId ?? group.connectionId ?? null,
        projectGroups,
        repos: this.store.getRepos()
      },
      { getSshFilesystemProvider }
    )
    assertFolderWorkspacePathUsable(status)
    const workspace = this.store.createFolderWorkspace(input)
    this.notifyReposChanged()
    return workspace
  }

  async getFolderWorkspacePathStatus(
    request: FolderWorkspacePathStatusRequest
  ): Promise<FolderWorkspacePathStatus> {
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }
    return getFolderWorkspacePathStatus(this.store, request, { getSshFilesystemProvider })
  }

  async updateFolderWorkspace(
    folderWorkspaceId: string,
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
  ): Promise<FolderWorkspace | null> {
    if (!this.store?.updateFolderWorkspace) {
      throw new Error('runtime_unavailable')
    }
    if (typeof updates.folderPath === 'string' && updates.folderPath.trim().length > 0) {
      const workspace = this.store
        .getFolderWorkspaces?.()
        .find((entry) => entry.id === folderWorkspaceId)
      if (!workspace) {
        return null
      }
      const projectGroups = this.store.getProjectGroups?.() ?? []
      const status = await getFolderWorkspacePathStatusForPath(
        {
          folderPath: updates.folderPath,
          projectGroupId: workspace.projectGroupId,
          connectionId:
            workspace.connectionId ??
            projectGroups.find((entry) => entry.id === workspace.projectGroupId)?.connectionId ??
            null,
          projectGroups,
          repos: this.store.getRepos()
        },
        { getSshFilesystemProvider }
      )
      assertFolderWorkspacePathUsable(status)
    }
    const updated = this.store.updateFolderWorkspace(folderWorkspaceId, updates)
    if (updated) {
      this.notifyReposChanged()
    }
    return updated
  }

  async deleteFolderWorkspace(folderWorkspaceId: string): Promise<{ deleted: boolean }> {
    if (!this.store?.removeFolderWorkspace) {
      throw new Error('runtime_unavailable')
    }
    const deleted = this.store.removeFolderWorkspace(folderWorkspaceId)
    if (deleted) {
      this.notifyReposChanged()
    }
    return { deleted }
  }

  async scanNestedRepos(path: string): Promise<NestedRepoScanResult> {
    if (!isAbsolute(path)) {
      throw new Error('Project path must be an absolute path')
    }
    return scanNestedRepos({ path, options: { timeoutMs: 15_000 } })
  }

  async browseServerDir(pathValue: string): Promise<{ resolvedPath: string; entries: DirEntry[] }> {
    const dirPath = resolveServerBrowsePath(pathValue)
    const dirStat = await stat(dirPath)
    if (!dirStat.isDirectory()) {
      throw new Error(`${dirPath} is not a directory`)
    }
    const entries = await readdir(dirPath, { withFileTypes: true })
    const mapped = entries
      .filter((entry) => entry.name !== '.' && entry.name !== '..')
      .map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        isSymlink: entry.isSymbolicLink()
      }))
    mapped.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })
    return { resolvedPath: dirPath, entries: mapped }
  }

  async isGitAvailable(): Promise<boolean> {
    try {
      await gitExecFileAsync(['--version'], { cwd: process.cwd(), timeout: 3000 })
      return true
    } catch {
      return false
    }
  }

  async importNestedRepos(args: {
    parentPath: string
    groupName: string
    projectPaths: string[]
    mode: ProjectGroupImportMode
  }): Promise<ProjectGroupImportResult> {
    if (!this.store?.createProjectGroup || !this.store?.moveProjectToGroup) {
      throw new Error('runtime_unavailable')
    }
    if (!isAbsolute(args.parentPath)) {
      throw new Error('Project path must be an absolute path')
    }
    const scan = await scanNestedRepos({ path: args.parentPath, options: { timeoutMs: 15_000 } })
    const selection = resolveNestedRepoSelection({ scan, projectPaths: args.projectPaths })
    const groupResolver = createNestedProjectGroupResolver({
      parentPath: args.parentPath,
      groupName: args.groupName,
      mode: args.mode,
      connectionId: null,
      repoPaths: selection.selectedPaths,
      createGroup: (input) => this.store!.createProjectGroup!(input)
    })
    const results: ProjectGroupImportResult['projects'] = selection.rejectedPaths.map(
      (repoPath) => ({
        path: repoPath,
        status: 'failed',
        error: 'Repository was not found in the nested repo scan result'
      })
    )
    const importedProjectIdsByRepoPath = new Map<string, string>()
    const importTargetResolver = createNestedRepoImportTargetResolver()
    for (const [projectGroupOrder, repoPath] of selection.selectedPaths.entries()) {
      try {
        if (!isGitRepo(repoPath)) {
          results.push({ path: repoPath, status: 'failed', error: 'Not a valid git repository' })
          continue
        }
        const importRepoPath = await importTargetResolver.resolveLocal(repoPath)
        const normalizedImportRepoPath = normalizeRuntimePathForComparison(importRepoPath)
        const alreadyImportedProjectId = importedProjectIdsByRepoPath.get(normalizedImportRepoPath)
        if (alreadyImportedProjectId) {
          results.push({
            path: repoPath,
            projectId: alreadyImportedProjectId,
            status: 'already-known'
          })
          continue
        }
        const existing = this.store
          .getRepos()
          .find((repo) => normalizeRuntimePathForComparison(repo.path) === normalizedImportRepoPath)
        const group = groupResolver.getGroupForRepo(repoPath)
        if (existing) {
          if (group) {
            this.store.moveProjectToGroup(existing.id, group.id, projectGroupOrder)
          }
          importedProjectIdsByRepoPath.set(normalizedImportRepoPath, existing.id)
          results.push({ path: repoPath, projectId: existing.id, status: 'already-known' })
          continue
        }
        const repo: Repo = {
          id: randomUUID(),
          path: importRepoPath,
          displayName: getRepoName(importRepoPath),
          badgeColor: DEFAULT_REPO_BADGE_COLOR,
          addedAt: Date.now(),
          kind: 'git',
          externalWorktreeVisibility: 'hide',
          externalWorktreeVisibilityLegacy: false,
          ...(group
            ? {
                projectGroupId: group.id,
                projectGroupOrder
              }
            : {})
        }
        this.store.addRepo(repo)
        importedProjectIdsByRepoPath.set(normalizedImportRepoPath, repo.id)
        results.push({ path: repoPath, projectId: repo.id, status: 'imported' })
      } catch (error) {
        results.push({
          path: repoPath,
          status: 'failed',
          error: sanitizeNestedRepoRuntimeImportError(
            'Failed to import nested repository in runtime',
            error
          )
        })
      }
    }
    const importedCount = results.filter((entry) => entry.status === 'imported').length
    const alreadyKnownCount = results.filter((entry) => entry.status === 'already-known').length
    const failedCount = results.filter((entry) => entry.status === 'failed').length
    if (importedCount + alreadyKnownCount === 0) {
      for (const group of groupResolver.getCreatedGroups().toReversed()) {
        this.store.deleteProjectGroup?.(group.id)
      }
    }
    this.invalidateResolvedWorktreeCache()
    this.notifyReposChanged()
    const rootGroup = groupResolver.getRootGroup()
    return {
      ...(rootGroup && importedCount + alreadyKnownCount > 0 ? { group: rootGroup } : {}),
      projects: results,
      importedCount,
      alreadyKnownCount,
      failedCount
    }
  }

  async listSparsePresets(repoSelector: string) {
    if (!this.store?.getSparsePresets) {
      throw new Error('runtime_unavailable')
    }
    const repo = await this.resolveRepoSelector(repoSelector)
    return this.store.getSparsePresets(repo.id)
  }

  async saveSparsePreset(
    repoSelector: string,
    args: { id?: string; name: string; directories: string[] }
  ) {
    if (!this.store?.getSparsePresets || !this.store.saveSparsePreset) {
      throw new Error('runtime_unavailable')
    }
    const repo = await this.resolveRepoSelector(repoSelector)
    const name = normalizeSparsePresetName(args.name)
    const directories = normalizeSparsePresetDirectoriesForSave(args.directories)
    const now = Date.now()
    const existing = args.id
      ? this.store.getSparsePresets(repo.id).find((preset) => preset.id === args.id)
      : undefined
    return this.store.saveSparsePreset({
      id: existing?.id ?? randomUUID(),
      repoId: repo.id,
      name,
      directories,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    })
  }

  async openWorkspacePath(
    path: string,
    contextWorktree?: string
  ): Promise<RuntimeWorkspaceOpenPathResult> {
    const previous = this.workspacePathOpenTail
    let release!: () => void
    this.workspacePathOpenTail = new Promise((resolveTail) => {
      release = resolveTail
    })
    await previous
    try {
      return await this.openWorkspacePathNow(path, contextWorktree)
    } finally {
      release()
    }
  }

  private async openWorkspacePathNow(
    path: string,
    contextWorktree?: string
  ): Promise<RuntimeWorkspaceOpenPathResult> {
    this.assertGraphReady()
    if (contextWorktree) {
      const worktree = await this.resolveWorktreeSelector(contextWorktree)
      if (!isPathInsideOrEqual(worktree.path, path)) {
        // Why: SSH `yiru .` is authorized by its managed-worktree context; a
        // shell that cd'd elsewhere must not reinterpret that remote path locally.
        throw new WorkspacePathOpenError(
          'context_path_mismatch',
          path,
          'The current directory is outside the Yiru-managed SSH workspace. Opening arbitrary SSH directories is not supported yet.'
        )
      }
      return await this.activateWorkspacePathTarget(path, worktree, 'activated')
    }

    const targetPath = await resolveWorkspaceOpenDirectoryPath(path)
    const existingWorktree = await findWorkspaceOpenWorktree(
      await this.listResolvedWorktrees(),
      targetPath
    )
    if (existingWorktree) {
      return await this.activateWorkspacePathTarget(path, existingWorktree, 'activated')
    }

    const kind = isGitRepo(targetPath) ? 'git' : 'folder'
    const repoPath = kind === 'git' ? getGitRepoRoot(targetPath) : targetPath
    const store = this.requireStore()
    const repoIdsBeforeOpen = new Set(store.getRepos().map((repo) => repo.id))
    const repo = await this.addRepo(repoPath, kind)
    const worktree = await findWorkspaceOpenWorktree(
      (await this.listResolvedWorktrees()).filter((candidate) => candidate.repoId === repo.id),
      targetPath
    )
    if (!worktree) {
      throw new Error(`Workspace was registered but could not be resolved: ${repoPath}`)
    }
    return await this.activateWorkspacePathTarget(
      path,
      worktree,
      repoIdsBeforeOpen.has(repo.id) ? 'activated' : 'added'
    )
  }

  private async activateWorkspacePathTarget(
    requestedPath: string,
    worktree: ResolvedWorktree,
    disposition: RuntimeWorkspaceOpenPathResult['disposition']
  ): Promise<RuntimeWorkspaceOpenPathResult> {
    const store = this.requireStore()
    let repo = store.getRepo(worktree.repoId)
    if (!repo) {
      throw new Error('repo_not_found')
    }

    if (!this.toRuntimeDetectedWorktree(repo, worktree).visible) {
      const importedExternalWorktreePaths = mergeExternalWorktreeInboxPaths(
        repo.importedExternalWorktreePaths,
        [worktree.path]
      )
      const updated = store.updateRepo(repo.id, { importedExternalWorktreePaths })
      if (!updated) {
        throw new Error('repo_not_found')
      }
      repo = updated
      this.invalidateResolvedWorktreeCache()
      this.notifyReposChanged()
      this.notifyWorktreesChanged(repo.id)
    }

    await this.activateManagedWorktree(`id:${worktree.id}`)
    return {
      requestedPath,
      resolvedPath: worktree.path,
      repoId: repo.id,
      worktreeId: worktree.id,
      kind: isFolderRepo(repo) ? 'folder' : 'git',
      disposition
    }
  }

  async addRepo(
    path: string,
    kind: 'git' | 'folder' = 'git',
    executionHostId?: ExecutionHostId | null
  ): Promise<Repo> {
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }
    if (!isAbsolute(path)) {
      // Why: remote clients may run in a different cwd than the server. Require
      // server-side repo paths to be explicit so `yiru serve` cwd is irrelevant.
      throw new Error('Project path must be an absolute path')
    }
    if (kind === 'git' && !isGitRepo(path)) {
      throw new Error(`Not a valid git repository: ${path}`)
    }

    const existing = this.store.getRepos().find((repo) => {
      if (!runtimePathsEqual(repo.path, path)) {
        return false
      }
      return runtimeRepoMatchesExecutionHost(repo, executionHostId)
    })
    if (existing) {
      // Only a runtime host backfills a legacy unstamped repo. An unstamped repo is
      // indistinguishable from a genuine local repo (both have null executionHostId and
      // connectionId), so we never stamp local/ssh onto it — that would re-attribute a
      // real local project to the wrong host. Runtime is the only host that lost its
      // identity to the pre-#7018 path-only import and needs the backfill.
      if (
        existing.executionHostId == null &&
        parseExecutionHostId(executionHostId)?.kind === 'runtime'
      ) {
        const adopted =
          this.store.updateRepo(existing.id, { executionHostId }) ??
          ({ ...existing, executionHostId } as Repo)
        this.invalidateResolvedWorktreeCache()
        this.notifyReposChanged()
        return adopted
      }
      return existing
    }

    const detected = await detectRepoIconAndUpstream({ repoPath: path, kind })
    const repo: Repo = {
      id: randomUUID(),
      path,
      displayName: getRepoName(path),
      badgeColor: DEFAULT_REPO_BADGE_COLOR,
      ...(executionHostId != null ? { executionHostId } : {}),
      ...detected,
      addedAt: Date.now(),
      kind,
      ...(kind === 'git'
        ? {
            externalWorktreeVisibility: 'hide' as const,
            externalWorktreeVisibilityLegacy: false
          }
        : {})
    }
    this.store.addRepo(repo)
    await prepareLocalWorktreeRootForRepo(this.store, repo)
    this.invalidateResolvedWorktreeCache()
    this.notifyReposChanged()
    return this.store.getRepo(repo.id) ?? repo
  }

  async createRepo(
    parentPath: string,
    name: string,
    kind: 'git' | 'folder' = 'git'
  ): Promise<{ repo: Repo } | { error: string }> {
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }
    const trimmedName = name.trim()
    const trimmedParentPath = parentPath.trim()
    const repoKind: 'git' | 'folder' = kind === 'folder' ? 'folder' : 'git'
    if (!trimmedName) {
      return { error: 'Name cannot be empty' }
    }
    if (/[\\/]/.test(trimmedName) || trimmedName === '.' || trimmedName === '..') {
      return { error: 'Name cannot contain slashes or be "." / ".."' }
    }
    if (!trimmedParentPath) {
      return { error: 'Parent directory is required' }
    }
    if (!isAbsolute(trimmedParentPath)) {
      return { error: 'Parent directory must be an absolute path' }
    }

    const targetPath = join(trimmedParentPath, trimmedName)
    const existing = this.store.getRepos().find((repo) => runtimePathsEqual(repo.path, targetPath))
    if (existing) {
      return { repo: existing }
    }

    let createdDir = false
    try {
      // Why: default create-project parents are host-home based and may not exist
      // before the first project is created on a fresh runtime.
      await mkdir(trimmedParentPath, { recursive: true })
      const existingStat = await stat(targetPath).catch((error: unknown) => {
        if (isENOENT(error)) {
          return null
        }
        throw error
      })
      if (existingStat) {
        if (!existingStat.isDirectory()) {
          return { error: `"${trimmedName}" already exists at this location and is not a folder.` }
        }
        const entries = await readdir(targetPath)
        if (entries.length > 0) {
          return { error: `"${trimmedName}" already exists at this location and is not empty.` }
        }
      } else {
        await mkdir(targetPath, { recursive: false })
        createdDir = true
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { error: `Failed to prepare directory: ${message}` }
    }

    if (repoKind === 'git') {
      let step: 'init' | 'commit' = 'init'
      try {
        await gitExecFileAsync(['init'], { cwd: targetPath })
        step = 'commit'
        await gitExecFileAsync(['commit', '--allow-empty', '-m', 'Initial commit'], {
          cwd: targetPath
        })
      } catch (error) {
        if (createdDir) {
          await rm(targetPath, { recursive: true, force: true }).catch(() => {})
        } else if (step === 'commit') {
          await rm(join(targetPath, '.git'), { recursive: true, force: true }).catch(() => {})
        }
        const message = error instanceof Error ? error.message : String(error)
        if (
          step === 'commit' &&
          /Please tell me who you are|user\.name|user\.email/i.test(message)
        ) {
          return {
            error:
              'Git author identity is not configured. Run `git config --global user.name "Your Name"` and `git config --global user.email "you@example.com"`, then try again.'
          }
        }
        const stepLabel =
          step === 'init'
            ? 'Failed to initialize git repository'
            : 'Failed to create initial commit'
        return { error: `${stepLabel}: ${message}` }
      }
    }

    const raceWinner = this.store
      .getRepos()
      .find((repo) => runtimePathsEqual(repo.path, targetPath))
    if (raceWinner) {
      return { repo: raceWinner }
    }

    const detected = await detectRepoIconAndUpstream({ repoPath: targetPath, kind: repoKind })
    const repo: Repo = {
      id: randomUUID(),
      path: targetPath,
      displayName: trimmedName,
      badgeColor: DEFAULT_REPO_BADGE_COLOR,
      ...detected,
      addedAt: Date.now(),
      kind: repoKind,
      ...(repoKind === 'git'
        ? {
            externalWorktreeVisibility: 'hide' as const,
            externalWorktreeVisibilityLegacy: false
          }
        : {})
    }
    this.store.addRepo(repo)
    await prepareLocalWorktreeRootForRepo(this.store, repo)
    invalidateAuthorizedRootsCache()
    this.invalidateResolvedWorktreeCache()
    this.notifyReposChanged()
    return { repo: this.store.getRepo(repo.id) ?? repo }
  }

  async cloneRepo(
    url: string,
    destination: string,
    executionHostId?: ExecutionHostId | null
  ): Promise<Repo> {
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }
    const trimmedUrl = url.trim()
    const trimmedDestination = destination.trim()
    if (!trimmedDestination) {
      throw new Error('Clone destination is required')
    }
    const clonePath = deriveValidatedClonePath({ url: trimmedUrl, destination: trimmedDestination })
    const clonePathKey = getClonePathComparisonKey(clonePath)
    const previous = this.cloneInFlightByPath.get(clonePathKey) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>((resolve) => {
      release = resolve
    })
    const tail = previous.then(
      () => current,
      () => current
    )
    this.cloneInFlightByPath.set(clonePathKey, tail)

    try {
      await previous
      return await runWithGitReadCacheInvalidation(() =>
        this.cloneRepoAfterPathLock(
          trimmedUrl,
          trimmedDestination,
          clonePath,
          clonePathKey,
          executionHostId
        )
      )
    } finally {
      release()
      if (this.cloneInFlightByPath.get(clonePathKey) === tail) {
        this.cloneInFlightByPath.delete(clonePathKey)
      }
    }
  }

  private async cloneRepoAfterPathLock(
    trimmedUrl: string,
    trimmedDestination: string,
    clonePath: string,
    clonePathKey: string,
    executionHostId?: ExecutionHostId | null
  ): Promise<Repo> {
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }
    const existingBeforeClone = this.store
      .getRepos()
      .find(
        (repo) =>
          getClonePathComparisonKey(repo.path) === clonePathKey &&
          runtimeRepoMatchesExecutionHost(repo, executionHostId)
      )
    if (existingBeforeClone && !isFolderRepo(existingBeforeClone)) {
      return existingBeforeClone
    }

    await mkdir(trimmedDestination, { recursive: true })
    const claimedTarget = await claimCloneTarget(clonePath)
    await new Promise<void>((resolve, reject) => {
      let proc: ReturnType<typeof gitSpawn>
      try {
        proc = gitSpawn(['clone', '--progress', '--', trimmedUrl, clonePath], {
          cwd: trimmedDestination,
          // Why: without the non-interactive guard, a clone that needs GitHub
          // auth makes Git Credential Manager pop its "Connect to GitHub" OAuth
          // window on Windows; in a network-restricted env the browser/device
          // flow can never complete and git's credential retry re-pops it
          // (issue #7652). Fail fast with a clear error instead.
          env: nonInteractiveGitEnv(),
          stdio: ['ignore', 'ignore', 'pipe']
        })
      } catch (err) {
        void cleanupClaimedCloneTarget(clonePath, claimedTarget).finally(() => {
          const message = err instanceof Error ? err.message : String(err)
          reject(new Error(`Clone failed: ${message}`))
        })
        return
      }
      let stderrTail = ''
      let settled = false
      proc.stderr?.on('data', (chunk: Buffer) => {
        stderrTail = (stderrTail + chunk.toString()).slice(-4096)
      })
      const finishClone = async (
        code: number | null,
        signal: NodeJS.Signals | null,
        error?: Error
      ) => {
        if (settled) {
          return
        }
        settled = true
        const cloneSucceeded = !error && code === 0 && !signal
        if (!cloneSucceeded) {
          await cleanupClaimedCloneTarget(clonePath, claimedTarget)
        }

        if (error) {
          reject(new Error(`Clone failed: ${error.message}`))
        } else if (signal === 'SIGTERM') {
          reject(new Error('Clone aborted'))
        } else if (code === 0) {
          resolve()
        } else {
          reject(new Error(`Clone failed: ${getGitCloneFailureMessage(stderrTail, { clonePath })}`))
        }
      }
      proc.on('error', (error) => {
        void finishClone(null, null, error)
      })
      proc.on('close', (code, signal) => {
        void finishClone(code, signal)
      })
    })

    const existing = this.store
      .getRepos()
      .find(
        (repo) =>
          getClonePathComparisonKey(repo.path) === clonePathKey &&
          runtimeRepoMatchesExecutionHost(repo, executionHostId)
      )
    if (existing) {
      if (isFolderRepo(existing)) {
        const updated = this.store.updateRepo(existing.id, { kind: 'git' })
        if (updated) {
          await prepareLocalWorktreeRootForRepo(this.store, updated)
          invalidateAuthorizedRootsCache()
          this.invalidateResolvedWorktreeCache()
          this.notifyReposChanged()
          return updated
        }
      }
      return existing
    }

    const detected = await detectRepoIconAndUpstream({ repoPath: clonePath, kind: 'git' })
    const repo: Repo = {
      id: randomUUID(),
      path: clonePath,
      displayName: getRepoName(clonePath),
      badgeColor: DEFAULT_REPO_BADGE_COLOR,
      ...(executionHostId != null ? { executionHostId } : {}),
      ...detected,
      addedAt: Date.now(),
      kind: 'git',
      externalWorktreeVisibility: 'hide',
      externalWorktreeVisibilityLegacy: false
    }
    this.store.addRepo(repo)
    await prepareLocalWorktreeRootForRepo(this.store, repo)
    invalidateAuthorizedRootsCache()
    this.invalidateResolvedWorktreeCache()
    this.notifyReposChanged()
    return this.store.getRepo(repo.id) ?? repo
  }

  async showRepo(repoSelector: string): Promise<Repo> {
    return await this.resolveRepoSelector(repoSelector)
  }

  async setRepoBaseRef(repoSelector: string, baseRef: string): Promise<Repo> {
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }
    const repo = await this.resolveRepoSelector(repoSelector)
    if (isFolderRepo(repo)) {
      throw new Error('Folder mode does not support base refs.')
    }
    const updated = this.store.updateRepo(repo.id, { worktreeBaseRef: baseRef })
    if (!updated) {
      throw new Error('repo_not_found')
    }
    this.invalidateResolvedWorktreeCache()
    this.notifyReposChanged()
    return updated
  }

  async updateRepo(
    repoSelector: string,
    updates: Partial<
      Pick<
        Repo,
        | 'displayName'
        | 'badgeColor'
        | 'repoIcon'
        | 'upstream'
        | 'hookSettings'
        | 'worktreeBaseRef'
        | 'worktreeBasePath'
        | 'kind'
        | 'symlinkPaths'
        | 'forgeRemotePreference'
        | 'externalWorktreeVisibility'
        | 'externalWorktreeVisibilityPromptDismissedAt'
        | 'externalWorktreeInboxBaselinePaths'
        | 'importedExternalWorktreePaths'
        | 'projectGroupId'
        | 'projectGroupOrder'
      >
    > & {
      sourceControlAi?: Repo['sourceControlAi'] | null
      externalWorktreeDiscoverySuppressedAt?: Repo['externalWorktreeDiscoverySuppressedAt'] | null
    }
  ): Promise<Repo> {
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }
    const repo = await this.resolveRepoSelector(repoSelector)
    const sanitizedUpdates = omitUndefinedProperties(updates)
    if ('worktreeBasePath' in updates && updates.worktreeBasePath === undefined) {
      sanitizedUpdates.worktreeBasePath = undefined
    }
    if (
      'externalWorktreeDiscoverySuppressedAt' in updates &&
      updates.externalWorktreeDiscoverySuppressedAt === null
    ) {
      sanitizedUpdates.externalWorktreeDiscoverySuppressedAt = undefined
    }
    if ('sourceControlAi' in updates && updates.sourceControlAi === null) {
      sanitizedUpdates.sourceControlAi = null
    }
    const updated = this.store.updateRepo(repo.id, sanitizedUpdates)
    if (!updated) {
      throw new Error('repo_not_found')
    }
    if ('worktreeBasePath' in updates) {
      await prepareLocalWorktreeRootForRepo(this.store, updated)
      invalidateAuthorizedRootsCache()
    }
    this.invalidateResolvedWorktreeCache()
    this.notifyReposChanged()
    return updated
  }

  async removeProject(repoSelector: string): Promise<{ removed: true }> {
    if (!this.store?.removeProject) {
      throw new Error('runtime_unavailable')
    }
    const repo = await this.resolveRepoSelector(repoSelector)
    this.store.removeProject(repo.id)
    this.invalidateResolvedWorktreeCache()
    invalidateAuthorizedRootsCache()
    this.notifyReposChanged()
    return { removed: true }
  }

  async inspectTerminalProcess(
    terminalSelector: string
  ): Promise<{ foregroundProcess: string | null; hasChildProcesses: boolean }> {
    const leaf = this.resolveLeafForHandle(terminalSelector)
    if (!leaf?.ptyId || !this.ptyController) {
      return { foregroundProcess: null, hasChildProcesses: false }
    }
    const foregroundProcess = await this.ptyController.getForegroundProcess(leaf.ptyId)
    const hasChildProcesses =
      (await this.ptyController.hasChildProcesses?.(leaf.ptyId).catch(() => false)) ?? false
    return { foregroundProcess, hasChildProcesses }
  }

  reorderRepos(orderedIds: string[]): { status: 'applied' | 'rejected' } {
    if (!this.store?.reorderRepos) {
      throw new Error('runtime_unavailable')
    }
    // Why: remote clients can race repo add/remove on the server just like
    // local drag-reorder can race another window. Let the store validate the
    // full permutation and signal a resync-worthy rejection.
    const applied = this.store.reorderRepos(orderedIds)
    if (!applied) {
      return { status: 'rejected' }
    }
    this.invalidateResolvedWorktreeCache()
    this.notifyReposChanged()
    return { status: 'applied' }
  }

  async searchRepoRefs(
    repoSelector: string,
    query: string,
    limit = DEFAULT_REPO_SEARCH_REFS_LIMIT
  ): Promise<RuntimeRepoSearchRefs> {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error('invalid_limit')
    }
    const repo = await this.resolveRepoSelector(repoSelector)
    if (isFolderRepo(repo)) {
      return {
        refs: [],
        truncated: false
      }
    }
    const refDetails = repo.connectionId
      ? await this.searchRemoteRepoRefs(repo, query, limit + 1)
      : await searchBaseRefDetails(repo.path, query, limit + 1)
    return {
      refs: refDetails.slice(0, limit).map((entry) => entry.refName),
      refDetails: refDetails.slice(0, limit),
      truncated: refDetails.length > limit
    }
  }

  async getRepoBaseRefDefault(
    repoSelector: string
  ): Promise<{ defaultBaseRef: string | null; remoteCount: number }> {
    const repo = await this.resolveRepoSelector(repoSelector)
    if (isFolderRepo(repo)) {
      return { defaultBaseRef: null, remoteCount: 0 }
    }
    if (repo.connectionId) {
      return this.getRemoteRepoBaseRefDefault(repo)
    }
    const [defaultBaseRef, remoteCount] = await Promise.all([
      getBaseRefDefault(repo.path),
      getRemoteCount(repo.path)
    ])
    return { defaultBaseRef, remoteCount }
  }

  private async getRemoteRepoBaseRefDefault(
    repo: Repo
  ): Promise<{ defaultBaseRef: string | null; remoteCount: number }> {
    const provider = repo.connectionId ? getSshGitProvider(repo.connectionId) : null
    if (!provider) {
      return { defaultBaseRef: null, remoteCount: 0 }
    }
    const [defaultBaseRef, remoteCount] = await Promise.all([
      resolveDefaultBaseRefViaExec(async (argv) => {
        try {
          return await provider.exec(argv, repo.path)
        } catch (err) {
          if (argv[0] === 'symbolic-ref') {
            console.warn('[runtime:repo.baseRefDefault] SSH symbolic-ref failed', {
              path: repo.path,
              err
            })
          }
          throw err
        }
      }),
      provider
        .exec(['remote'], repo.path)
        .then((result) => parseRemoteCount(result.stdout))
        .catch((err) => {
          console.warn('[runtime:repo.baseRefDefault] SSH git remote count failed', {
            path: repo.path,
            err
          })
          return 0
        })
    ])
    return { defaultBaseRef, remoteCount }
  }

  private async searchRemoteRepoRefs(
    repo: Repo,
    query: string,
    limit: number
  ): Promise<BaseRefSearchResult[]> {
    const provider = repo.connectionId ? getSshGitProvider(repo.connectionId) : null
    if (!provider) {
      return []
    }
    const normalizedQuery = normalizeRefSearchQuery(query)
    try {
      const remotesResult = await provider.exec(['remote'], repo.path).catch(() => ({ stdout: '' }))
      const remotes = remotesResult.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
      const capabilities = getSshGitCapabilityCache(provider)
      const runSearch = async (patternGroup?: 'segmented' | 'branchRoot'): Promise<string> => {
        return capabilities.runWithFallback(
          'for-each-ref-exclude',
          async () =>
            (
              await provider.exec(
                buildSearchBaseRefsArgv(normalizedQuery, limit, {
                  remoteNames: remotes,
                  patternGroup
                }),
                repo.path
              )
            ).stdout,
          async () =>
            (
              await provider.exec(
                buildSearchBaseRefsArgv(normalizedQuery, limit, {
                  excludeRemoteHead: false,
                  remoteNames: remotes,
                  patternGroup
                }),
                repo.path
              )
            ).stdout,
          isForEachRefExcludeUnsupportedError
        )
      }
      const searchTokens = normalizedQuery.split('/').filter((token) => token.length > 0)
      if (searchTokens.length > 1) {
        const results = await Promise.all([runSearch('segmented'), runSearch('branchRoot')])
        return mergeBaseRefSearchResultGroups(
          results.map((stdout) => parseAndFilterSearchRefDetails(stdout, limit, remotes)),
          limit
        )
      }
      return parseAndFilterSearchRefDetails(await runSearch(), limit, remotes)
    } catch (err) {
      console.warn('[runtime:repo.searchRefs] SSH for-each-ref failed', {
        path: repo.path,
        err
      })
      return []
    }
  }

  private async resolveHostedReviewTarget(args: {
    repoSelector: string
    worktreeSelector?: string
  }): Promise<{ repo: Repo; repoPath: string }> {
    const repo = await this.resolveRepoSelector(args.repoSelector)
    if (!args.worktreeSelector) {
      return { repo, repoPath: repo.path }
    }

    const worktree = await this.resolveWorktreeSelector(args.worktreeSelector)
    if (worktree.repoId !== repo.id) {
      throw new Error('Access denied: worktree does not belong to repository')
    }
    return { repo, repoPath: worktree.path }
  }

  private getHostedReviewExecutionOptions(
    repo: Repo
  ): { localGitExecOptions: { wslDistro?: string } } | undefined {
    const localGitOptions = this.getLocalGitExecutionOptionArgs(repo)[0] ?? {}
    return Object.keys(localGitOptions).length > 0
      ? { localGitExecOptions: localGitOptions }
      : undefined
  }

  private getLocalGitExecutionOptionArgs(repo: Repo): [] | [{ wslDistro?: string }] {
    const localGitOptions = getLocalProjectWorktreeGitOptions(this.requireStore(), repo)
    return Object.keys(localGitOptions).length > 0 ? [localGitOptions] : []
  }

  private getAgentLaunchPlatformForRepo(repo: Repo): NodeJS.Platform {
    const projectRuntime = repo.connectionId
      ? undefined
      : resolveLocalProjectRuntimeForRepo(this.requireStore(), repo)
    return getAgentLaunchPlatformForRepo(repo, projectRuntime)
  }

  private getAgentLaunchPlatformForWorkspace(scope: TerminalWorkspaceLaunchScope): NodeJS.Platform {
    if (scope.repo) {
      return this.getAgentLaunchPlatformForRepo(scope.repo)
    }
    if (scope.connectionId) {
      return isWindowsAbsolutePathLike(scope.path) ? 'win32' : 'linux'
    }
    return isWslUncPath(scope.path) ? 'linux' : process.platform
  }

  async getRepoSlug(repoSelector: string): Promise<{ owner: string; repo: string } | null> {
    const repo = await this.resolveRepoSelector(repoSelector)
    const options = this.getHostedReviewExecutionOptions(repo)
    return options
      ? getRepoSlug(repo.path, repo.connectionId ?? null, options)
      : getRepoSlug(repo.path, repo.connectionId ?? null)
  }

  async getRepoUpstream(repoSelector: string): Promise<{ owner: string; repo: string } | null> {
    const repo = await this.resolveRepoSelector(repoSelector)
    const options = this.getHostedReviewExecutionOptions(repo)
    return options
      ? getRepoUpstream(repo.path, repo.connectionId ?? null, options)
      : getRepoUpstream(repo.path, repo.connectionId ?? null)
  }

  // Why: repos added before fork detection existed have no stored `upstream`, so
  // their avatar/badge would never self-correct. Resolve it once at startup for
  // local git repos; SSH repos resolve lazily when their settings open (their
  // connection may not be up yet). Sequential to respect the gh rate limit;
  // failures leave `upstream` unset so the next launch retries.
  private async backfillForkUpstreams(): Promise<void> {
    try {
      const store = this.requireStore()
      let changed = false
      for (const repo of store.getRepos()) {
        if (repo.upstream !== undefined || repo.kind === 'folder' || repo.connectionId) {
          continue
        }
        let upstream: { owner: string; repo: string } | null
        try {
          upstream = await getRepoUpstream(repo.path, null)
        } catch {
          continue
        }
        const updates: Partial<Repo> = { upstream: upstream ?? null }
        // Only migrate the auto-detected origin avatar; never touch a chosen icon.
        if (upstream && repo.repoIcon?.type === 'image' && repo.repoIcon.source === 'github') {
          updates.repoIcon = githubAvatarIcon(upstream)
        }
        store.updateRepo(repo.id, updates)
        changed = true
      }
      if (changed) {
        this.notifyReposChanged()
      }
    } catch {
      // Best-effort startup backfill; never disrupt launch.
    }
  }

  async listRepoWorkItems(
    repoSelector: string,
    limit?: number,
    query?: string,
    page?: number,
    noCache?: boolean
  ): Promise<ListWorkItemsResult<MainWorkItem>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return listWorkItems(
      repo.path,
      limit,
      query,
      page,
      repo.forgeRemotePreference,
      repo.connectionId ?? null,
      noCache,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async getRepoWorkItem(
    repoSelector: string,
    number: number,
    type?: 'pr'
  ): Promise<Awaited<ReturnType<typeof getWorkItem>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return getWorkItem(
      repo.path,
      number,
      type,
      repo.connectionId ?? null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async getRepoWorkItemByOwnerRepo(
    repoSelector: string,
    ownerRepo: { owner: string; repo: string },
    number: number,
    type: 'pr'
  ): Promise<Awaited<ReturnType<typeof getWorkItemByOwnerRepo>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return getWorkItemByOwnerRepo(
      repo.path,
      ownerRepo,
      number,
      type,
      repo.connectionId ?? null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async getRepoWorkItemDetails(
    repoSelector: string,
    number: number,
    type?: 'pr'
  ): Promise<Awaited<ReturnType<typeof getWorkItemDetails>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return getWorkItemDetails(
      repo.path,
      number,
      type,
      repo.connectionId ?? null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async listRepoLabels(
    repoSelector: string
  ): Promise<Awaited<ReturnType<typeof listPullRequestLabels>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return listPullRequestLabels(
      repo.path,
      repo.connectionId ?? null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async listRepoAssignableUsers(
    repoSelector: string
  ): Promise<Awaited<ReturnType<typeof listPullRequestAssignableUsers>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return listPullRequestAssignableUsers(
      repo.path,
      repo.connectionId ?? null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  getGitHubRateLimit(options?: {
    force?: boolean
  }): Promise<Awaited<ReturnType<typeof getRateLimit>>> {
    return getRateLimit(options)
  }

  async getRepoPRForBranch(
    repoSelector: string,
    branch: string,
    linkedPRNumber?: number | null,
    fallbackPRNumber?: number | null,
    acceptMergedFallbackPR?: boolean,
    currentHeadOid?: string | null
  ): Promise<Awaited<ReturnType<typeof getPRForBranch>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    const options: GitHubPRBranchLookupOptions = this.getHostedReviewExecutionOptions(repo) ?? {}
    const lookupOptions = { ...options }
    if (acceptMergedFallbackPR === true) {
      lookupOptions.acceptMergedFallbackPR = true
    }
    if (typeof currentHeadOid === 'string' && currentHeadOid.trim().length > 0) {
      lookupOptions.currentHeadOid = currentHeadOid.trim()
    }
    const lookupOptionArgs: [] | [GitHubPRBranchLookupOptions] =
      Object.keys(lookupOptions).length > 0 ? [lookupOptions] : []
    return getPRForBranch(
      repo.path,
      branch,
      linkedPRNumber ?? null,
      repo.connectionId ?? null,
      linkedPRNumber == null ? (fallbackPRNumber ?? null) : null,
      ...lookupOptionArgs
    )
  }

  async getHostedReviewForBranch(args: {
    repoSelector: string
    branch: string
    currentHeadOid?: string | null
    linkedGitHubPR?: number | null
    fallbackGitHubPR?: number | null
    linkedGitLabMR?: number | null
    linkedBitbucketPR?: number | null
    linkedAzureDevOpsPR?: number | null
    linkedGiteaPR?: number | null
    recordStats?: boolean
    throwOnProviderError?: boolean
    signal?: AbortSignal
  }): Promise<HostedReviewInfo | null> {
    args.signal?.throwIfAborted()
    const repo = await this.resolveRepoSelector(args.repoSelector)
    args.signal?.throwIfAborted()
    const executionOptions = this.getHostedReviewExecutionOptions(repo)
    const review = await getHostedReviewForBranchFromRepo({
      repoPath: repo.path,
      connectionId: repo.connectionId ?? null,
      branch: args.branch,
      currentHeadOid: args.currentHeadOid ?? null,
      linkedGitHubPR: args.linkedGitHubPR ?? null,
      fallbackGitHubPR: args.linkedGitHubPR == null ? (args.fallbackGitHubPR ?? null) : null,
      linkedGitLabMR: args.linkedGitLabMR ?? null,
      linkedBitbucketPR: args.linkedBitbucketPR ?? null,
      linkedAzureDevOpsPR: args.linkedAzureDevOpsPR ?? null,
      linkedGiteaPR: args.linkedGiteaPR ?? null,
      ...(args.throwOnProviderError ? { throwOnProviderError: true } : {}),
      ...(args.signal ? { signal: args.signal } : {}),
      ...executionOptions
    })
    // Why: public Spool reads inspect existing reviews and must not attribute them as newly created.
    if (
      args.recordStats !== false &&
      review?.provider === 'github' &&
      this.stats &&
      !this.stats.hasCountedPR(review.url)
    ) {
      this.stats.record({
        type: 'pr_created',
        at: Date.now(),
        repoId: repo.id,
        meta: { prNumber: review.number, prUrl: review.url }
      })
    }
    return review
  }

  async getHostedReviewCreationEligibility(
    args: Omit<HostedReviewCreationEligibilityArgs, 'repoPath'> & {
      repoSelector: string
      worktreeSelector?: string
    }
  ): Promise<HostedReviewCreationEligibility> {
    const { repo, repoPath } = await this.resolveHostedReviewTarget(args)
    const executionOptions = this.getHostedReviewExecutionOptions(repo)
    return getHostedReviewCreationEligibilityFromRepo({
      repoPath,
      connectionId: repo.connectionId ?? null,
      branch: args.branch,
      base: args.base ?? null,
      hasUncommittedChanges: args.hasUncommittedChanges,
      hasUpstream: args.hasUpstream,
      ahead: args.ahead,
      behind: args.behind,
      linkedGitHubPR: args.linkedGitHubPR ?? null,
      fallbackGitHubPR: args.linkedGitHubPR == null ? (args.fallbackGitHubPR ?? null) : null,
      linkedGitLabMR: args.linkedGitLabMR ?? null,
      linkedBitbucketPR: args.linkedBitbucketPR ?? null,
      linkedAzureDevOpsPR: args.linkedAzureDevOpsPR ?? null,
      linkedGiteaPR: args.linkedGiteaPR ?? null,
      ...executionOptions
    })
  }

  async createHostedReview(
    args: CreateHostedReviewInput & { repoSelector: string; worktreeSelector?: string }
  ): Promise<CreateHostedReviewResult> {
    const { repo, repoPath } = await this.resolveHostedReviewTarget(args)
    const executionOptions = this.getHostedReviewExecutionOptions(repo)
    const input = {
      provider: args.provider,
      base: args.base,
      head: args.head,
      title: args.title,
      body: args.body,
      draft: args.draft,
      ...(args.useTemplate !== undefined ? { useTemplate: args.useTemplate } : {})
    }
    const result = executionOptions
      ? await createHostedReviewFromRepo(
          repoPath,
          input,
          repo.connectionId ?? null,
          executionOptions
        )
      : await createHostedReviewFromRepo(repoPath, input, repo.connectionId ?? null)
    if (result.ok && this.stats && !this.stats.hasCountedPR(result.url)) {
      this.stats.record({
        type: 'pr_created',
        at: Date.now(),
        repoId: repo.id,
        meta: { prNumber: result.number, prUrl: result.url }
      })
    }
    return result
  }

  async listGitLabRepoMRs(
    repoSelector: string,
    state?: MRListState,
    page?: number,
    perPage?: number,
    query?: string
  ): Promise<Awaited<ReturnType<typeof listGitLabMergeRequests>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return listGitLabMergeRequests(
      repo.path,
      normalizeGitLabMRListState(state),
      normalizeGitLabPositiveInteger(page, 1, 10_000),
      normalizeGitLabPositiveInteger(perPage, 20, 100),
      repo.forgeRemotePreference,
      query,
      repo.connectionId ?? null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async diagnoseGitLabAuth(): Promise<Awaited<ReturnType<typeof diagnoseGitLabAuthClient>>> {
    return diagnoseGitLabAuthClient()
  }

  async getGitLabRateLimit(options?: {
    force?: boolean
    host?: string | null
  }): Promise<Awaited<ReturnType<typeof getGitLabRateLimit>>> {
    return getGitLabRateLimit(options)
  }

  async listGitLabRepoLabels(
    repoSelector: string
  ): Promise<Awaited<ReturnType<typeof listGitLabLabels>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return listGitLabLabels(
      repo.path,
      repo.forgeRemotePreference,
      repo.connectionId ?? null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async addGitLabRepoMRComment(
    repoSelector: string,
    iid: number,
    body: string,
    projectRef?: GitLabProjectRef | null
  ): Promise<Awaited<ReturnType<typeof addGitLabMRComment>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return addGitLabMRComment(
      repo.path,
      iid,
      body,
      repo.forgeRemotePreference,
      repo.connectionId ?? null,
      projectRef,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async addGitLabRepoMRInlineComment(
    repoSelector: string,
    iid: number,
    input: GitLabMRInlineCommentInput,
    projectRef?: GitLabProjectRef | null
  ): Promise<Awaited<ReturnType<typeof addGitLabMRInlineComment>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return addGitLabMRInlineComment(
      repo.path,
      iid,
      input,
      repo.forgeRemotePreference,
      repo.connectionId ?? null,
      projectRef,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async resolveGitLabRepoMRDiscussion(
    repoSelector: string,
    iid: number,
    discussionId: string,
    resolved: boolean,
    projectRef?: GitLabProjectRef | null
  ): Promise<Awaited<ReturnType<typeof resolveGitLabMRDiscussion>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return resolveGitLabMRDiscussion(
      repo.path,
      iid,
      discussionId,
      resolved,
      repo.forgeRemotePreference,
      repo.connectionId ?? null,
      projectRef,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async getGitLabRepoJobTrace(
    repoSelector: string,
    jobId: number,
    projectRef?: GitLabProjectRef | null
  ): Promise<Awaited<ReturnType<typeof getGitLabJobTrace>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return getGitLabJobTrace(
      repo.path,
      jobId,
      repo.forgeRemotePreference,
      repo.connectionId ?? null,
      projectRef,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async retryGitLabRepoJob(
    repoSelector: string,
    jobId: number,
    projectRef?: GitLabProjectRef | null
  ): Promise<Awaited<ReturnType<typeof retryGitLabJob>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return retryGitLabJob(
      repo.path,
      jobId,
      repo.forgeRemotePreference,
      repo.connectionId ?? null,
      projectRef,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async mergeGitLabRepoMR(
    repoSelector: string,
    iid: number,
    method?: 'merge' | 'squash' | 'rebase',
    projectRef?: GitLabProjectRef | null
  ): Promise<Awaited<ReturnType<typeof mergeGitLabMR>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return mergeGitLabMR(
      repo.path,
      iid,
      method ?? 'merge',
      repo.forgeRemotePreference,
      repo.connectionId ?? null,
      projectRef,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async updateGitLabRepoMRState(
    repoSelector: string,
    iid: number,
    state: 'opened' | 'closed',
    projectRef?: GitLabProjectRef | null
  ): Promise<Awaited<ReturnType<typeof closeGitLabMR>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return state === 'closed'
      ? closeGitLabMR(
          repo.path,
          iid,
          repo.forgeRemotePreference,
          repo.connectionId ?? null,
          projectRef,
          ...this.getLocalGitExecutionOptionArgs(repo)
        )
      : reopenGitLabMR(
          repo.path,
          iid,
          repo.forgeRemotePreference,
          repo.connectionId ?? null,
          projectRef,
          ...this.getLocalGitExecutionOptionArgs(repo)
        )
  }

  async updateGitLabRepoMR(
    repoSelector: string,
    iid: number,
    updates: { title?: string; body?: string; addLabels?: string[]; removeLabels?: string[] },
    projectRef?: GitLabProjectRef | null
  ): Promise<Awaited<ReturnType<typeof updateGitLabMR>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return updateGitLabMR(
      repo.path,
      iid,
      updates,
      repo.forgeRemotePreference,
      repo.connectionId ?? null,
      projectRef,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async updateGitLabRepoMRReviewers(
    repoSelector: string,
    iid: number,
    reviewerIds: number[],
    projectRef?: GitLabProjectRef | null
  ): Promise<Awaited<ReturnType<typeof updateGitLabMRReviewers>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return updateGitLabMRReviewers(
      repo.path,
      iid,
      reviewerIds,
      repo.forgeRemotePreference,
      repo.connectionId ?? null,
      projectRef,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async getGitLabRepoWorkItemDetails(
    repoSelector: string,
    iid: number,
    type: 'mr',
    projectRef?: GitLabProjectRef | null
  ): Promise<Awaited<ReturnType<typeof getGitLabWorkItemDetails>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return getGitLabWorkItemDetails(
      repo.path,
      iid,
      type,
      repo.forgeRemotePreference,
      repo.connectionId ?? null,
      projectRef,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async getGitLabRepoWorkItemByPath(
    repoSelector: string,
    projectRef: GitLabProjectRef,
    iid: number,
    type: 'mr'
  ): Promise<Awaited<ReturnType<typeof getGitLabWorkItemByProjectRef>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return await getGitLabWorkItemByProjectRef(
      repo.path,
      projectRef,
      iid,
      type,
      repo.connectionId ?? null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async getRepoPRChecks(
    repoSelector: string,
    prNumber: number,
    headSha?: string,
    prRepo?: GitHubOwnerRepo | null,
    options?: { noCache?: boolean; signal?: AbortSignal }
  ): Promise<Awaited<ReturnType<typeof getPRChecks>>> {
    options?.signal?.throwIfAborted()
    const repo = await this.resolveRepoSelector(repoSelector)
    options?.signal?.throwIfAborted()
    return getPRChecks(
      repo.path,
      prNumber,
      headSha,
      prRepo ?? null,
      options,
      repo.connectionId ?? null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async rerunRepoPRChecks(
    repoSelector: string,
    prNumber: number,
    options?: { headSha?: string; failedOnly?: boolean }
  ): Promise<Awaited<ReturnType<typeof rerunPRChecks>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return rerunPRChecks(
      repo.path,
      prNumber,
      options,
      repo.connectionId ?? null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async getRepoPRCheckDetails(
    repoSelector: string,
    args: {
      checkRunId?: number
      workflowRunId?: number
      checkName?: string
      url?: string | null
      prRepo?: GitHubOwnerRepo | null
    }
  ): Promise<Awaited<ReturnType<typeof getPRCheckDetails>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return getPRCheckDetails(
      repo.path,
      { ...args, prRepo: args.prRepo ?? null },
      repo.connectionId ?? null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async getRepoPRComments(
    repoSelector: string,
    prNumber: number,
    prRepo?: GitHubOwnerRepo | null,
    options?: { noCache?: boolean }
  ): Promise<Awaited<ReturnType<typeof getPRComments>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return getPRComments(
      repo.path,
      prNumber,
      { ...options, prRepo: prRepo ?? null },
      repo.connectionId ?? null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async getRepoPRFileContents(
    repoSelector: string,
    args: {
      prNumber: number
      path: string
      oldPath?: string
      status: GitHubPRFile['status']
      headSha: string
      baseSha: string
    }
  ): Promise<Awaited<ReturnType<typeof getPRFileContents>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return getPRFileContents({
      repoPath: repo.path,
      connectionId: repo.connectionId ?? null,
      localGitOptions: this.getLocalGitExecutionOptionArgs(repo)[0],
      ...args
    })
  }

  async resolveRepoReviewThread(
    repoSelector: string,
    threadId: string,
    resolve: boolean
  ): Promise<Awaited<ReturnType<typeof resolveReviewThread>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return resolveReviewThread(
      repo.path,
      threadId,
      resolve,
      repo.connectionId ?? null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async setRepoPRFileViewed(
    repoSelector: string,
    args: {
      pullRequestId: string
      path: string
      viewed: boolean
    }
  ): Promise<Awaited<ReturnType<typeof setPRFileViewed>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return setPRFileViewed({
      repoPath: repo.path,
      connectionId: repo.connectionId ?? null,
      localGitOptions: this.getLocalGitExecutionOptionArgs(repo)[0],
      ...args
    })
  }

  async updateRepoPRTitle(
    repoSelector: string,
    prNumber: number,
    title: string,
    prRepo?: GitHubOwnerRepo | null
  ): Promise<Awaited<ReturnType<typeof updatePRTitle>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return updatePRTitle(
      repo.path,
      prNumber,
      title,
      repo.connectionId ?? null,
      prRepo ?? null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async updateRepoPRDetails(
    repoSelector: string,
    prNumber: number,
    updates: { title?: string; body?: string },
    prRepo?: GitHubOwnerRepo | null
  ): Promise<Awaited<ReturnType<typeof updatePRDetails>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return updatePRDetails(
      repo.path,
      prNumber,
      updates,
      repo.connectionId ?? null,
      prRepo ?? null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async mergeRepoPR(
    repoSelector: string,
    prNumber: number,
    method?: 'merge' | 'squash' | 'rebase',
    prRepo?: GitHubOwnerRepo | null
  ): Promise<Awaited<ReturnType<typeof mergePR>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return mergePR(
      repo.path,
      prNumber,
      method,
      repo.connectionId ?? null,
      prRepo ?? null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async setRepoPRAutoMerge(
    repoSelector: string,
    prNumber: number,
    enabled: boolean,
    method?: 'merge' | 'squash' | 'rebase',
    prRepo?: GitHubOwnerRepo | null
  ): Promise<Awaited<ReturnType<typeof setPRAutoMerge>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return setPRAutoMerge(
      repo.path,
      prNumber,
      enabled,
      method,
      repo.connectionId ?? null,
      prRepo ?? null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async updateRepoPRState(
    repoSelector: string,
    prNumber: number,
    updates: GitHubPullRequestStateUpdate
  ): Promise<Awaited<ReturnType<typeof updatePRState>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return updatePRState(
      repo.path,
      prNumber,
      updates,
      repo.connectionId ?? null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async requestRepoPRReviewers(
    repoSelector: string,
    prNumber: number,
    reviewers: string[]
  ): Promise<Awaited<ReturnType<typeof requestPRReviewers>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return requestPRReviewers(
      repo.path,
      prNumber,
      reviewers,
      repo.connectionId ?? null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async removeRepoPRReviewers(
    repoSelector: string,
    prNumber: number,
    reviewers: string[]
  ): Promise<Awaited<ReturnType<typeof removePRReviewers>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return removePRReviewers(
      repo.path,
      prNumber,
      reviewers,
      repo.connectionId ?? null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async addRepoPRComment(
    repoSelector: string,
    number: number,
    body: string,
    prRepo?: GitHubOwnerRepo | null
  ): Promise<Awaited<ReturnType<typeof addPullRequestComment>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return addPullRequestComment(
      repo.path,
      number,
      body,
      repo.connectionId ?? null,
      prRepo ?? null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  async addRepoPRReviewComment(
    repoSelector: string,
    args: Omit<GitHubPRReviewCommentInput, 'repoPath'>
  ): Promise<Awaited<ReturnType<typeof addPRReviewComment>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return addPRReviewComment({
      repoPath: repo.path,
      connectionId: repo.connectionId ?? null,
      localGitOptions: this.getLocalGitExecutionOptionArgs(repo)[0],
      ...args
    })
  }

  async addRepoPRReviewCommentReply(
    repoSelector: string,
    args: {
      prNumber: number
      commentId: number
      body: string
      threadId?: string
      path?: string
      line?: number
      prRepo?: GitHubOwnerRepo | null
    }
  ): Promise<Awaited<ReturnType<typeof addPRReviewCommentReply>>> {
    const repo = await this.resolveRepoSelector(repoSelector)
    return addPRReviewCommentReply(
      repo.path,
      args.prNumber,
      args.commentId,
      args.body,
      args.threadId,
      args.path,
      args.line,
      repo.connectionId ?? null,
      args.prRepo ?? null,
      ...this.getLocalGitExecutionOptionArgs(repo)
    )
  }

  private getSetupHookTrustPayload(
    repo: Repo,
    scriptContentValue: string | undefined
  ): { contentHash: string; scriptContent: string } | undefined {
    const scriptContent = scriptContentValue?.trim()
    if (!scriptContent || repo.hookSettings?.commandSourcePolicy === 'local-only') {
      return undefined
    }
    return {
      contentHash: createHash('sha256').update(scriptContent).digest('hex'),
      scriptContent
    }
  }

  private getSharedSetupHookTrustPayload(
    repo: Repo,
    sharedSetupScript: string | undefined
  ): { contentHash: string; scriptContent: string } | undefined {
    if (repo.hookSettings?.commandSourcePolicy === 'local-only') {
      return undefined
    }
    return this.getSetupHookTrustPayload(repo, sharedSetupScript)
  }

  async getRepoHooks(repoSelector: string) {
    const repo = await this.resolveRepoSelector(repoSelector)
    if (repo.connectionId) {
      const fsProvider = getSshFilesystemProvider(repo.connectionId)
      if (!fsProvider) {
        return {
          hasHooksFile: false,
          hooks: null,
          setupRunPolicy: getEffectiveSetupRunPolicy(repo),
          source: null
        }
      }
      try {
        const result = await fsProvider.readFile(joinWorktreeRelativePath(repo.path, 'yiru.yaml'))
        const hooks = result.isBinary ? null : parseYiruYaml(result.content)
        return {
          hasHooksFile: Boolean(hooks),
          hooks,
          setupRunPolicy: getEffectiveSetupRunPolicy(repo),
          source: hooks ? 'yiru.yaml' : null,
          setupTrust: this.getSharedSetupHookTrustPayload(
            repo,
            getDefaultTabCommandTrustContent(hooks)
          )
        }
      } catch {
        return {
          hasHooksFile: false,
          hooks: null,
          setupRunPolicy: getEffectiveSetupRunPolicy(repo),
          source: null
        }
      }
    }
    const hasFile = hasHooksFile(repo.path)
    const hooks = getEffectiveHooks(repo)
    const sharedHooks = hasFile ? loadHooks(repo.path) : null
    const setupRunPolicy = getEffectiveSetupRunPolicy(repo)
    return {
      hasHooksFile: hasFile,
      hooks,
      setupRunPolicy,
      source: hasFile ? 'yiru.yaml' : hooks ? 'legacy' : null,
      setupTrust: this.getSharedSetupHookTrustPayload(
        repo,
        getDefaultTabCommandTrustContent(sharedHooks)
      )
    }
  }

  async checkRepoHooks(repoSelector: string) {
    const repo = await this.resolveRepoSelector(repoSelector)
    if (isFolderRepo(repo)) {
      return { hasHooks: false, hooks: null, mayNeedUpdate: false }
    }

    if (repo.connectionId) {
      const fsProvider = getSshFilesystemProvider(repo.connectionId)
      if (!fsProvider) {
        return { hasHooks: false, hooks: null, mayNeedUpdate: false }
      }
      try {
        const result = await fsProvider.readFile(joinWorktreeRelativePath(repo.path, 'yiru.yaml'))
        if (result.isBinary) {
          return { hasHooks: false, hooks: null, mayNeedUpdate: false }
        }
        return { hasHooks: true, hooks: parseYiruYaml(result.content), mayNeedUpdate: false }
      } catch {
        return { hasHooks: false, hooks: null, mayNeedUpdate: false }
      }
    }

    const has = hasHooksFile(repo.path)
    const hooks = has ? loadHooks(repo.path) : null
    return {
      hasHooks: has,
      hooks,
      mayNeedUpdate: has && !hooks && hasUnrecognizedYiruYamlKeys(repo.path)
    }
  }

  async inspectRepoSetupScriptImports(repoSelector: string) {
    const repo = await this.resolveRepoSelector(repoSelector)
    if (isFolderRepo(repo)) {
      return []
    }

    return inspectSetupScriptImportCandidates(async (relativePath) => {
      const filePath = joinWorktreeRelativePath(repo.path, relativePath)
      if (repo.connectionId) {
        const fsProvider = getSshFilesystemProvider(repo.connectionId)
        if (!fsProvider) {
          return null
        }
        try {
          const result = await fsProvider.readFile(filePath)
          return result.isBinary ? null : result.content
        } catch {
          return null
        }
      }

      try {
        return await readFile(filePath, 'utf-8')
      } catch (error) {
        if (!isENOENT(error)) {
          console.warn('[runtime] Failed to inspect setup script import candidate:', error)
        }
        return null
      }
    })
  }

  async listManagedWorktrees(
    repoSelector?: string,
    limit = DEFAULT_WORKTREE_LIST_LIMIT
  ): Promise<RuntimeWorktreeListResult> {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error('invalid_limit')
    }
    const resolved = await this.listResolvedWorktrees()
    const repoId = repoSelector ? (await this.resolveRepoSelector(repoSelector)).id : null
    const worktrees = resolved.filter((worktree) => {
      if (repoId && worktree.repoId !== repoId) {
        return false
      }
      return this.isRuntimeWorktreeVisible(worktree)
    })
    return {
      worktrees: worktrees.slice(0, limit),
      totalCount: worktrees.length,
      truncated: worktrees.length > limit
    }
  }

  async listDetectedManagedWorktrees(repoSelector: string): Promise<DetectedWorktreeListResult> {
    const repo = await this.resolveRepoSelector(repoSelector)
    if (isFolderRepo(repo)) {
      const worktrees = listRuntimeFolderWorkspaces(this.requireStore(), repo)
      return {
        repoId: repo.id,
        authoritative: true,
        source: 'git',
        worktrees: worktrees.map((worktree) => this.toRuntimeDetectedWorktree(repo, worktree))
      }
    }
    let scan: RuntimeWorktreeScanResult
    try {
      scan = await this.listRepoWorktreesForResolution(repo)
    } catch {
      scan = { ok: false, worktrees: [] }
    }
    if (scan.ok) {
      this.pruneLineageForMissingRepoWorktrees(repo, scan.worktrees)
    }
    const detected = scan.worktrees.map((gitWorktree) => {
      const worktreeId = `${repo.id}::${gitWorktree.path}`
      const meta = this.store?.getWorktreeMeta(worktreeId)
      const worktree = mergeWorktree(repo.id, gitWorktree, meta, repo.displayName)
      const detectedWorktree = this.toRuntimeDetectedWorktree(repo, worktree)
      if (scan.ok) {
        return detectedWorktree
      }
      return {
        ...detectedWorktree,
        visible: true,
        ownership: detectedWorktree.ownership === 'yiru-managed' ? 'yiru-managed' : 'unknown-legacy'
      } satisfies DetectedWorktree
    })
    return {
      repoId: repo.id,
      authoritative: scan.ok,
      source: scan.ok ? 'git' : 'metadata-fallback',
      worktrees: detected
    }
  }

  private isRuntimeWorktreeVisible(worktree: Worktree): boolean {
    const repo = this.store?.getRepo(worktree.repoId)
    if (!repo || !this.store) {
      return true
    }
    return this.toRuntimeDetectedWorktree(repo, worktree).visible
  }

  private toRuntimeDetectedWorktree(repo: Repo, worktree: Worktree): DetectedWorktree {
    const settings = this.store?.getSettings()
    if (!settings) {
      return {
        ...worktree,
        ownership: 'unknown-legacy',
        selectedCheckout: false,
        visible: true
      }
    }
    return toDetectedWorktree({
      repo,
      worktree,
      meta: this.store?.getWorktreeMeta(worktree.id),
      settings,
      knownYiruLayouts: buildKnownYiruWorkspaceLayouts(settings, repo),
      isLegacyRepoForVisibility: isLegacyRepoForExternalWorktreeVisibility(repo)
    })
  }

  async showManagedWorktree(worktreeSelector: string) {
    return await this.resolveWorktreeSelector(worktreeSelector)
  }

  async resolvePairedRuntimeSpoolWorktree(
    selector: SpoolPairedRuntimeWorktreeSelector
  ): Promise<SpoolPairedRuntimeResolvedWorktree> {
    const store = this.requireStore()
    const worktree = await this.resolveWorktreeSelector(`id:${selector.worktreeId}`)
    const repo = store.getRepo(worktree.repoId)
    const kind = repo && isFolderRepo(repo) ? 'folder' : 'git'
    if (
      !repo ||
      worktree.id !== selector.worktreeId ||
      worktree.instanceId !== selector.instanceId ||
      kind !== selector.kind
    ) {
      throw new Error('selector_not_found')
    }
    const executionHostId = getRepoExecutionHostId(repo)
    const host = parseExecutionHostId(executionHostId)
    if (!host || host.kind === 'runtime') {
      // Why: an internal actual-host call must terminate here, never become a recursive gateway.
      throw new Error('recursive_runtime_host')
    }
    if (worktree.hostId && worktree.hostId !== executionHostId) {
      throw new Error('worktree_host_mismatch')
    }
    return {
      kind,
      worktreeId: worktree.id,
      instanceId: selector.instanceId,
      projectId: worktree.projectId ?? null,
      repoId: worktree.repoId,
      executionHostId,
      connectionId: host.kind === 'ssh' ? host.targetId : null,
      ...(worktree.projectHostSetupId ? { projectHostSetupId: worktree.projectHostSetupId } : {}),
      worktreePath: worktree.path,
      localWslDistro:
        host.kind === 'local'
          ? (getLocalProjectWorktreeGitOptions(store, repo).wslDistro ?? null)
          : null
    }
  }

  getPairedRuntimeSpoolStore(): Store {
    // Why: only the internal paired-runtime host adapter needs Store-backed path authorization.
    return this.requireStore()
  }

  async scanWorkspacePorts(repoId?: string): Promise<WorkspacePortScanResult> {
    return scanWorkspacePortProbes(await this.getWorkspacePortProbes(repoId))
  }

  async killWorkspacePort(args: WorkspacePortKillRequest): Promise<WorkspacePortKillResult> {
    return killWorkspacePort(await this.getWorkspacePortProbes(args.repoId), args)
  }

  // Why: remote clients may invoke this over RPC, so the runtime derives
  // allowed worktree paths from its own store instead of trusting client paths.
  private async getWorkspacePortProbes(repoId?: string): Promise<WorkspacePortProbe[]> {
    const reposById = new Map(
      this.requireStore()
        .getRepos()
        .map((repo) => [repo.id, repo])
    )
    return filterWorkspacePortProbes(
      (await this.listResolvedWorktrees()).map((worktree) => ({
        id: worktree.id,
        repoId: worktree.repoId,
        displayName: worktree.displayName,
        path: worktree.git.path,
        connectionId: reposById.get(worktree.repoId)?.connectionId ?? null
      })),
      repoId
    )
  }

  async sleepManagedWorktree(worktreeSelector: string): Promise<{ worktreeId: string }> {
    const worktree = await this.resolveWorktreeSelector(worktreeSelector)
    // Why: sleep is renderer-initiated on desktop (it tears down tab state
    // before killing PTYs). The notifier tells the renderer to run its own
    // sleep flow so all cleanup happens in the correct order.
    this.notifier?.sleepWorktree(worktree.id)
    return { worktreeId: worktree.id }
  }

  async activateManagedWorktree(
    worktreeSelector: string,
    opts: { notifyClients?: boolean; clientKind?: 'mobile' | 'runtime' } = {}
  ): Promise<{
    repoId: string
    worktreeId: string
    activated: boolean
    /** Mobile-scoped slept-agent wake outcome. `unsupported-headless` means no
     *  renderer holds the sleeping records (headless `yiru serve`), so nothing
     *  woke — clients must not present the worktree's agents as resumed. */
    sleepingAgentWake: 'requested' | 'unsupported-headless' | 'not-applicable'
  }> {
    this.assertGraphReady()
    const worktree = await this.resolveWorktreeSelector(worktreeSelector)
    const repo = this.store?.getRepo(worktree.repoId)
    if (!repo) {
      throw new Error('repo_not_found')
    }

    if (opts.notifyClients === false && this.store?.getWorktreeMeta(worktree.id)?.isUnread) {
      // Why: mobile/web session activation intentionally bypasses renderer
      // selection, so the runtime must acknowledge the unread state itself.
      this.store.setWorktreeMeta(worktree.id, { isUnread: false })
      this.notifyWorktreesChanged(repo.id)
    }

    let sleepingAgentWake: 'requested' | 'unsupported-headless' | 'not-applicable' =
      'not-applicable'
    if (opts.notifyClients !== false) {
      // Why: inactive worktree terminal panes are renderer-owned and may not have
      // live PTYs until the desktop activates the worktree and mounts them.
      this.notifyActivateWorktree(repo.id, worktree.id)
    } else {
      // Why: mobile/web selection needs fresh session surfaces without forcing
      // every attached desktop renderer to navigate to the phone's workspace.
      this.hydrateHeadlessMobileSessionTabsFromWorkspaceSession(worktree.id, {
        allowAttachedWindow: true
      })
      await this.refreshMobileSessionPtyRecords()
      this.notifyMobileSessionTabsChanged(worktree.id)
      // Why: a phone open must also wake the worktree's slept agents (experimental
      // agent sleep). Only the host renderer holds the sleeping records + wake
      // authority, so fire-and-forget ask it — mobile-scoped so web/desktop are
      // unaffected. Headless serve has no renderer to wake anything, so report
      // that explicitly instead of letting mobile assume the agents resumed.
      if (opts.clientKind === 'mobile') {
        if (this.getAvailableAuthoritativeWindow()) {
          this.notifier?.resumeSleepingAgents?.(worktree.id)
          sleepingAgentWake = 'requested'
        } else if (
          // Why: sleeping records are partitioned by execution host; reading
          // only the local partition would miss slept agents on SSH-host
          // worktrees and skip the headless warning for them.
          Object.values(
            this.store?.getWorkspaceSession?.(getRepoExecutionHostId(repo))
              .sleepingAgentSessionsByPaneKey ?? {}
          ).some((record) => record.worktreeId === worktree.id)
        ) {
          // Why: headless is only degraded when this worktree actually has a
          // persisted resume record. Ordinary mobile activation must not show
          // an unsupported warning merely because no desktop window is open.
          sleepingAgentWake = 'unsupported-headless'
        }
      }
    }
    return { repoId: repo.id, worktreeId: worktree.id, activated: true, sleepingAgentWake }
  }

  private async buildStartupForDraft(
    repo: Repo,
    draft: string,
    requestedAgent?: TuiAgent
  ): Promise<{
    agent: TuiAgent
    startup: WorktreeStartupLaunch
    draftPaste?: WorktreeStartupDraftPaste
  } | null> {
    if (!this.store) {
      return null
    }
    const content = draft.trim()
    if (!content) {
      return null
    }
    const settings = this.store.getSettings()
    const preferredAgent = requestedAgent ?? settings.defaultTuiAgent
    if (preferredAgent === 'blank') {
      // Why: `blank` is an explicit user preference to create a shell-only
      // workspace, so linked review drafts must not auto-pick a detected agent.
      return null
    }
    let agent =
      isTuiAgent(preferredAgent) && isTuiAgentEnabled(preferredAgent, settings.disabledTuiAgents)
        ? preferredAgent
        : null
    if (!agent) {
      let detected: string[] = []
      try {
        // Why: startup-draft fallback can run from sparse runtime launch envs too.
        detected = repo.connectionId
          ? await detectRemoteAgents({ connectionId: repo.connectionId })
          : await detectInstalledAgentsWithShellPathHydration()
      } catch {
        detected = []
      }
      const typedDetected = detected.filter(isTuiAgent)
      agent = pickTuiAgent(null, typedDetected, settings.disabledTuiAgents)
    }
    if (!agent) {
      return null
    }

    // Why: a mobile client can run on Windows while the workspace shell is
    // Linux over SSH. Startup command quoting must target the shell that runs it.
    const agentLaunchPlatform = this.getAgentLaunchPlatformForRepo(repo)
    const isRemote = repoIsRemote(repo)
    const queuedShell = resolveLocalWindowsAgentStartupShell({
      platform: agentLaunchPlatform,
      isRemote,
      terminalWindowsShell: settings.terminalWindowsShell
    })
    const draftLaunchPlan = buildAgentDraftLaunchPlan({
      agent,
      draft: content,
      cmdOverrides: settings.agentCmdOverrides ?? {},
      agentArgs: resolveTuiAgentLaunchArgs(agent, settings.agentDefaultArgs),
      agentEnv: resolveTuiAgentLaunchEnv(agent, settings.agentDefaultEnv),
      platform: agentLaunchPlatform,
      shell: queuedShell,
      isRemote
    })
    if (draftLaunchPlan) {
      return {
        agent,
        startup: {
          command: draftLaunchPlan.launchCommand,
          launchConfig: draftLaunchPlan.launchConfig,
          ...(draftLaunchPlan.startupCommandDelivery
            ? { startupCommandDelivery: draftLaunchPlan.startupCommandDelivery }
            : {}),
          ...(draftLaunchPlan.env ? { env: draftLaunchPlan.env } : {})
        }
      }
    }

    const startupPlan = buildAgentStartupPlan({
      agent,
      prompt: '',
      cmdOverrides: settings.agentCmdOverrides ?? {},
      agentArgs: resolveTuiAgentLaunchArgs(agent, settings.agentDefaultArgs),
      agentEnv: resolveTuiAgentLaunchEnv(agent, settings.agentDefaultEnv),
      platform: agentLaunchPlatform,
      shell: queuedShell,
      isRemote,
      allowEmptyPromptLaunch: true
    })
    if (!startupPlan) {
      return null
    }
    return {
      agent,
      startup: {
        command: startupPlan.launchCommand,
        launchConfig: startupPlan.launchConfig,
        ...(startupPlan.startupCommandDelivery
          ? { startupCommandDelivery: startupPlan.startupCommandDelivery }
          : {}),
        ...(startupPlan.env ? { env: startupPlan.env } : {})
      },
      draftPaste: { agent, content }
    }
  }

  private buildStartupForAgent(
    repo: Repo,
    agent: TuiAgent,
    prompt: string | undefined
  ): { agent: TuiAgent; startup: WorktreeStartupLaunch; followup?: WorktreeStartupFollowup } {
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }
    const settings = this.store.getSettings()
    if (!isTuiAgentEnabled(agent, settings.disabledTuiAgents)) {
      throw new Error('Selected agent is disabled. Choose an enabled agent before creating.')
    }
    // Why: CLI clients may target SSH runtimes from macOS/Windows, so quote for
    // the workspace shell rather than the client shell.
    const agentLaunchPlatform = this.getAgentLaunchPlatformForRepo(repo)
    const isRemote = repoIsRemote(repo)
    const queuedShell = resolveLocalWindowsAgentStartupShell({
      platform: agentLaunchPlatform,
      isRemote,
      terminalWindowsShell: settings.terminalWindowsShell
    })
    const startupPlan = buildAgentStartupPlan({
      agent,
      prompt: prompt ?? '',
      cmdOverrides: settings.agentCmdOverrides ?? {},
      agentArgs: resolveTuiAgentLaunchArgs(agent, settings.agentDefaultArgs),
      agentEnv: resolveTuiAgentLaunchEnv(agent, settings.agentDefaultEnv),
      platform: agentLaunchPlatform,
      shell: queuedShell,
      isRemote,
      allowEmptyPromptLaunch: true
    })
    if (!startupPlan) {
      throw new Error(`Could not build launch command for ${agent}.`)
    }
    return {
      agent,
      startup: {
        command: startupPlan.launchCommand,
        launchConfig: startupPlan.launchConfig,
        ...(startupPlan.startupCommandDelivery
          ? { startupCommandDelivery: startupPlan.startupCommandDelivery }
          : {}),
        ...(startupPlan.env ? { env: startupPlan.env } : {})
      },
      ...(startupPlan.followupPrompt
        ? {
            followup: {
              expectedProcess: startupPlan.expectedProcess,
              prompt: startupPlan.followupPrompt
            }
          }
        : {})
    }
  }

  private markLocalWorkspaceTrustedForAgent(agent: TuiAgent, workspacePath: string): void {
    const preset = TUI_AGENT_CONFIG[agent].preflightTrust
    if (!preset) {
      return
    }
    try {
      if (preset === 'cursor') {
        markCursorWorkspaceTrusted(workspacePath)
      } else if (preset === 'copilot') {
        markCopilotFolderTrusted(workspacePath)
      } else if (preset === 'codex') {
        markCodexProjectTrusted(workspacePath)
      }
    } catch {
      // Best-effort: the user can still accept the agent trust prompt manually.
    }
  }

  private async markRemoteWorkspaceTrustedForAgent(
    agent: TuiAgent,
    connectionId: string,
    workspacePath: string
  ): Promise<void> {
    const preset = TUI_AGENT_CONFIG[agent].preflightTrust
    if (!preset) {
      return
    }
    try {
      await markRemoteAgentWorkspaceTrusted({ preset, connectionId, workspacePath })
    } catch {
      // Best-effort: the user can still accept the remote agent trust prompt manually.
    }
  }

  private recordCreatedWorktreeLineage(
    worktree: Pick<Worktree, 'id' | 'instanceId'>,
    lineageResolution: WorktreeLineageResolution
  ): {
    lineage: WorktreeLineage | null
    workspaceLineage: WorkspaceLineage | null
    warnings: WorktreeLineageWarning[]
  } {
    const warnings = lineageResolution.kind === 'none' ? [...lineageResolution.warnings] : []
    let lineage: WorktreeLineage | null = null
    let workspaceLineage: WorkspaceLineage | null = null
    if (lineageResolution.kind !== 'lineage') {
      return { lineage, workspaceLineage, warnings }
    }

    const childInstanceId = worktree.instanceId
    const parentInstanceId = lineageResolution.parent.instanceId
    const createdAt = Date.now()
    if (
      lineageResolution.parent.type === 'worktree' &&
      childInstanceId &&
      parentInstanceId &&
      this.store?.setWorktreeLineage
    ) {
      lineage = this.store.setWorktreeLineage(worktree.id, {
        worktreeId: worktree.id,
        worktreeInstanceId: childInstanceId,
        parentWorktreeId: lineageResolution.parent.worktree.id,
        parentWorktreeInstanceId: parentInstanceId,
        origin: lineageResolution.origin,
        capture: lineageResolution.capture,
        ...(lineageResolution.orchestrationRunId
          ? { orchestrationRunId: lineageResolution.orchestrationRunId }
          : {}),
        ...(lineageResolution.taskId ? { taskId: lineageResolution.taskId } : {}),
        ...(lineageResolution.coordinatorHandle
          ? { coordinatorHandle: lineageResolution.coordinatorHandle }
          : {}),
        ...(lineageResolution.createdByTerminalHandle
          ? { createdByTerminalHandle: lineageResolution.createdByTerminalHandle }
          : {}),
        createdAt
      })
    } else if (lineageResolution.parent.type === 'worktree') {
      warnings.push({
        code: 'LINEAGE_PARENT_CONTEXT_MISSING',
        message:
          'Worktree created, but Yiru could not record lineage because instance identity was unavailable.',
        details: {
          childHasInstanceId: Boolean(childInstanceId),
          parentHasInstanceId: Boolean(parentInstanceId),
          storeSupportsLineage: Boolean(this.store?.setWorktreeLineage)
        }
      })
    }
    if (childInstanceId && this.store?.setWorkspaceLineage) {
      workspaceLineage = this.store.setWorkspaceLineage({
        childWorkspaceKey: worktreeWorkspaceKey(worktree.id),
        childInstanceId,
        parentWorkspaceKey: lineageResolution.parent.workspaceKey,
        parentInstanceId,
        origin: lineageResolution.origin,
        capture: lineageResolution.capture,
        ...(lineageResolution.taskId ? { taskId: lineageResolution.taskId } : {}),
        ...(lineageResolution.orchestrationRunId
          ? { orchestrationRunId: lineageResolution.orchestrationRunId }
          : {}),
        ...(lineageResolution.coordinatorHandle
          ? { coordinatorHandle: lineageResolution.coordinatorHandle }
          : {}),
        ...(lineageResolution.createdByTerminalHandle
          ? { createdByTerminalHandle: lineageResolution.createdByTerminalHandle }
          : {}),
        createdAt
      })
    }
    return { lineage, workspaceLineage, warnings }
  }

  private pasteStartupDraftWhenReady(handle: string, draft: WorktreeStartupDraftPaste): void {
    void this.waitForStartupDraftReady(handle, draft.agent)
      .then((ptyId) => {
        if (!ptyId) {
          console.warn('[worktree-create] agent did not become ready for draft paste')
          return
        }
        this.ptyController?.write(
          ptyId,
          `${BRACKETED_PASTE_BEGIN}${draft.content}${BRACKETED_PASTE_END}`
        )
      })
      .catch((error) => {
        console.warn('[worktree-create] failed to paste startup draft:', error)
      })
  }

  private sendStartupFollowupWhenReady(handle: string, followup: WorktreeStartupFollowup): void {
    void this.waitForStartupFollowupReady(handle, followup.expectedProcess)
      .then((ptyId) => {
        if (!ptyId) {
          console.warn('[worktree-create] agent did not become ready for follow-up prompt')
          return
        }
        this.ptyController?.write(ptyId, `${followup.prompt}\r`)
      })
      .catch((error) => {
        console.warn('[worktree-create] failed to send startup follow-up prompt:', error)
      })
  }

  private async createDefaultTabTerminals(
    worktreeSelector: string,
    worktreeId: string,
    defaultTabs: CreateWorktreeResult['defaultTabs'] | undefined
  ): Promise<string[]> {
    if (!defaultTabs || defaultTabs.tabs.length === 0 || !this.ptyController?.spawn) {
      return []
    }
    const handles: string[] = []
    for (const template of defaultTabs.tabs) {
      try {
        const command = template.command?.trim()
        const terminal = await this.createTerminal(worktreeSelector, {
          ...(template.title ? { title: template.title } : {}),
          ...(command && defaultTabs.runCommands ? { command } : {})
        })
        handles.push(terminal.handle)
        if (template.color && terminal.tabId) {
          await this.setMobileSessionTabProps(`id:${worktreeId}`, {
            tabId: terminal.tabId,
            color: template.color
          })
        }
      } catch (error) {
        console.warn(`[worktree-create] Failed to create default tab for ${worktreeId}:`, error)
      }
    }
    return handles
  }

  private async provisionManagedWorktreeTerminals(args: {
    worktreeSelector: string
    worktreeId: string
    worktreePath: string
    setup?: CreateWorktreeResult['setup']
    defaultTabs?: CreateWorktreeResult['defaultTabs']
    primaryTerminalHandle?: string | null
    hasStartupTerminal: boolean
    setupCommandPlatform: 'windows' | 'posix'
    // Why: when the agent startup is sequenced to wait for setup
    // (waitForAgentStartup), the startup PTY runs a wrapper that already embeds
    // the setup command. Pass that wrapped command through so the Setup tab runs
    // the same script the agent is waiting on instead of a bare runner.
    wrappedSetupCommand?: string
  }): Promise<{ setupSpawned: boolean }> {
    if (!this.ptyController?.spawn) {
      return { setupSpawned: false }
    }
    let setupSpawned = false
    try {
      const defaultTabHandles = await this.createDefaultTabTerminals(
        args.worktreeSelector,
        args.worktreeId,
        args.defaultTabs
      )
      let primaryTerminalHandle = args.primaryTerminalHandle ?? defaultTabHandles[0] ?? null
      const setupLaunchMode =
        (
          this.requireStore().getSettings() as Partial<
            Pick<GlobalSettings, 'setupScriptLaunchMode'>
          >
        ).setupScriptLaunchMode ?? 'new-tab'
      if (!args.hasStartupTerminal && !primaryTerminalHandle) {
        const terminal = await this.createTerminal(args.worktreeSelector)
        primaryTerminalHandle = terminal.handle
      }
      if (args.setup) {
        const setupCommand =
          args.wrappedSetupCommand ??
          buildSetupRunnerCommand(args.setup.runnerScriptPath, args.setupCommandPlatform)
        const shouldSplitSetup =
          primaryTerminalHandle &&
          (setupLaunchMode === 'split-vertical' || setupLaunchMode === 'split-horizontal')
        await (shouldSplitSetup
          ? this.splitTerminal(primaryTerminalHandle!, {
              direction: setupLaunchMode === 'split-horizontal' ? 'horizontal' : 'vertical',
              command: setupCommand,
              env: args.setup.envVars,
              activate: false
            })
          : this.createTerminal(args.worktreeSelector, {
              title: 'Setup',
              command: setupCommand,
              env: args.setup.envVars
            }))
        setupSpawned = true
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(
        `[worktree-create] Failed to create setup/default terminals for ${args.worktreePath}: ${message}`
      )
    }
    return { setupSpawned }
  }

  private async waitForStartupFollowupReady(
    handle: string,
    expectedProcess: string
  ): Promise<string | null> {
    const livePty = this.getLivePtyForHandle(handle)
    const ptyId = livePty?.pty.ptyId
    if (!ptyId || !this.ptyController) {
      return null
    }
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 150))
      }
      try {
        const foregroundProcess = await this.ptyController.getForegroundProcess(ptyId)
        if (isExpectedAgentProcess(foregroundProcess, expectedProcess)) {
          return ptyId
        }
        if (attempt >= 4 && !isShellProcess(foregroundProcess ?? '')) {
          const hasChildProcesses =
            (await this.ptyController.hasChildProcesses?.(ptyId).catch(() => false)) ?? false
          if (hasChildProcesses) {
            return ptyId
          }
        }
      } catch {
        // Ignore transient PTY inspection failures and keep polling.
      }
    }
    return null
  }

  private waitForStartupDraftReady(handle: string, agent: TuiAgent): Promise<string | null> {
    const livePty = this.getLivePtyForHandle(handle)
    const ptyId = livePty?.pty.ptyId
    if (!ptyId) {
      return Promise.resolve(null)
    }
    const readySignal =
      TUI_AGENT_CONFIG[agent].draftPasteReadySignal ?? 'render-quiet-after-bracketed-paste'
    return new Promise<string | null>((resolve) => {
      let settled = false
      const scanner = createDraftPasteReadyScanner(readySignal)
      let quietTimer: NodeJS.Timeout | null = null
      let hardTimer: NodeJS.Timeout | null = null
      let unsubscribe: (() => void) | null = null

      const finish = (value: string | null): void => {
        if (settled) {
          return
        }
        settled = true
        if (quietTimer) {
          clearTimeout(quietTimer)
        }
        if (hardTimer) {
          clearTimeout(hardTimer)
        }
        unsubscribe?.()
        resolve(value)
      }

      const armQuietTimer = (): void => {
        if (quietTimer) {
          clearTimeout(quietTimer)
        }
        quietTimer = setTimeout(() => finish(ptyId), BRACKETED_PASTE_QUIET_MS)
      }

      const observeData = (data: string): void => {
        const { ready, armQuietTimer: shouldArm } = scanner.observe(data)
        if (ready) {
          finish(ptyId)
          return
        }
        if (shouldArm) {
          armQuietTimer()
        }
      }

      unsubscribe = this.subscribeToTerminalData(ptyId, observeData)
      const replay = this.recentPtyOutputById.get(ptyId)
      if (replay) {
        observeData(replay)
      }
      hardTimer = setTimeout(() => finish(null), DRAFT_PASTE_READY_TIMEOUT_MS)
    })
  }

  async prefetchManagedWorktreeCreateBase(args: {
    repoSelector: string
    baseBranch?: string
  }): Promise<void> {
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }

    const repo = await this.resolveRepoSelector(args.repoSelector)
    await prefetchWorktreeCreateBase({
      repo,
      baseBranch: args.baseBranch,
      runtime: this
    })
  }

  async createManagedWorktree(args: {
    repoSelector: string
    name: string
    baseBranch?: string
    compareBaseRef?: string
    branchNameOverride?: string
    linkedPR?: number | null
    linkedGitLabMR?: number | null
    linkedBitbucketPR?: number | null
    linkedAzureDevOpsPR?: number | null
    linkedGiteaPR?: number | null
    comment?: string
    displayName?: string
    telemetrySource?: WorkspaceCreateTelemetrySource
    workspaceStatus?: string
    manualOrder?: number
    sparseCheckout?: { directories: string[]; presetId?: string }
    pushTarget?: GitPushTarget
    runHooks?: boolean
    activate?: boolean
    setupDecision?: 'run' | 'skip' | 'inherit'
    createdWithAgent?: TuiAgent
    startupAgent?: TuiAgent
    startupPrompt?: string
    pendingFirstAgentMessageRename?: boolean
    automationProvenance?: AutomationWorkspaceProvenance
    startup?: WorktreeStartupLaunch
    startupDraft?: string
    startupDraftPaste?: WorktreeStartupDraftPaste
    lineage?: WorktreeLineageInput
  }): Promise<CreateWorktreeResult> {
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }

    const repo = await this.resolveRepoSelector(args.repoSelector)
    const createSettings = this.store.getSettings()
    const requestedAgent = args.startupAgent ?? args.createdWithAgent
    const requestedAgentEnabled =
      requestedAgent !== undefined
        ? isTuiAgentEnabled(requestedAgent, createSettings.disabledTuiAgents)
        : false
    if ((args.startup || args.startupAgent) && requestedAgent && !requestedAgentEnabled) {
      throw new Error('Selected agent is disabled. Choose an enabled agent before creating.')
    }
    if (
      args.startup &&
      args.startupDraftPaste &&
      !isTuiAgentEnabled(args.startupDraftPaste.agent, createSettings.disabledTuiAgents)
    ) {
      throw new Error('Selected agent is disabled. Choose an enabled agent before creating.')
    }
    const agentStartup =
      !args.startup && args.startupAgent
        ? this.buildStartupForAgent(repo, args.startupAgent, args.startupPrompt)
        : null
    const draftStartup =
      !args.startup && !agentStartup && args.startupDraft
        ? await this.buildStartupForDraft(repo, args.startupDraft, requestedAgent)
        : null
    const effectiveStartup = args.startup ?? agentStartup?.startup ?? draftStartup?.startup
    const effectiveStartupFollowup = agentStartup?.followup
    const effectiveCreatedWithAgent = args.startup
      ? args.createdWithAgent
      : (agentStartup?.agent ??
        draftStartup?.agent ??
        (requestedAgentEnabled ? requestedAgent : undefined))
    const effectiveDraftPaste = args.startupDraftPaste ?? draftStartup?.draftPaste
    if (isFolderRepo(repo)) {
      const now = Date.now()
      const settings = createSettings
      const instanceId = randomUUID()
      const worktreeId = getRuntimeFolderWorkspaceInstanceId(repo, instanceId)
      const meta = this.store.setWorktreeMeta(worktreeId, {
        instanceId,
        ...getProjectHostSetupWorktreeMeta(this.store.getProjectHostSetups?.() ?? [], repo),
        displayName: args.displayName?.trim() || args.name,
        lastActivityAt: now,
        createdAt: now,
        yiruCreatedAt: now,
        yiruCreationSource: 'runtime',
        yiruCreationWorkspaceLayout: {
          path: settings.workspaceDir,
          nestWorkspaces: settings.nestWorkspaces
        },
        ...(args.automationProvenance ? { automationProvenance: args.automationProvenance } : {}),
        ...(args.linkedPR !== undefined ? { linkedPR: args.linkedPR } : {}),
        ...(args.linkedGitLabMR !== undefined ? { linkedGitLabMR: args.linkedGitLabMR } : {}),
        ...(args.linkedBitbucketPR !== undefined
          ? { linkedBitbucketPR: args.linkedBitbucketPR }
          : {}),
        ...(args.linkedAzureDevOpsPR !== undefined
          ? { linkedAzureDevOpsPR: args.linkedAzureDevOpsPR }
          : {}),
        ...(args.linkedGiteaPR !== undefined ? { linkedGiteaPR: args.linkedGiteaPR } : {}),
        ...(effectiveCreatedWithAgent ? { createdWithAgent: effectiveCreatedWithAgent } : {}),
        ...(args.comment !== undefined ? { comment: args.comment } : {}),
        ...(args.manualOrder !== undefined ? { manualOrder: args.manualOrder } : {}),
        ...(args.workspaceStatus !== undefined ? { workspaceStatus: args.workspaceStatus } : {})
      })
      const worktree = mergeRuntimeFolderWorkspace(repo, worktreeId, meta)
      this.invalidateResolvedWorktreeCache()
      this.notifyWorktreesChanged(repo.id)
      const shouldActivate = args.activate === true || args.runHooks === true
      let warning: string | undefined
      let didSpawnStartup = false
      let startupTerminal: CreateWorktreeResult['startupTerminal']
      if (effectiveStartup && this.ptyController?.spawn) {
        try {
          const startupTrustAgent = effectiveDraftPaste?.agent ?? effectiveCreatedWithAgent
          if (startupTrustAgent) {
            this.markLocalWorkspaceTrustedForAgent(startupTrustAgent, worktree.path)
          }
          const terminal = await this.createTerminal(`id:${worktree.id}`, {
            command: effectiveStartup.command,
            env: effectiveStartup.env,
            ...(effectiveStartup.launchConfig
              ? { launchConfig: effectiveStartup.launchConfig }
              : {}),
            ...(effectiveCreatedWithAgent ? { launchAgent: effectiveCreatedWithAgent } : {}),
            startupCommandDelivery: effectiveStartup.startupCommandDelivery,
            telemetry: effectiveStartup.telemetry
          })
          if (effectiveDraftPaste) {
            this.pasteStartupDraftWhenReady(terminal.handle, effectiveDraftPaste)
          }
          if (effectiveStartupFollowup) {
            this.sendStartupFollowupWhenReady(terminal.handle, effectiveStartupFollowup)
          }
          didSpawnStartup = true
          startupTerminal = {
            spawned: true,
            handle: terminal.handle,
            ...(terminal.tabId ? { tabId: terminal.tabId } : {}),
            ...(terminal.paneKey ? { paneKey: terminal.paneKey } : {}),
            ...(terminal.ptyId ? { ptyId: terminal.ptyId } : {}),
            surface: 'background'
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          warning = `Failed to create the startup terminal for ${worktree.path}: ${message}`
          console.warn(`[worktree-create] ${warning}`)
        }
      }
      if (shouldActivate) {
        if (effectiveStartup && !didSpawnStartup) {
          this.notifyActivateWorktree(repo.id, worktree.id, undefined, effectiveStartup)
        } else {
          this.notifyActivateWorktree(repo.id, worktree.id)
        }
      } else if (this.ptyController?.spawn && !didSpawnStartup) {
        try {
          await this.createTerminal(`id:${worktree.id}`)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          warning = warning
            ? `${warning} Also failed to create the initial terminal for ${worktree.path}: ${message}`
            : `Failed to create the initial terminal for ${worktree.path}: ${message}`
          console.warn(`[worktree-create] ${warning}`)
        }
      }
      return {
        worktree: {
          ...worktree,
          parentWorktreeId: null,
          childWorktreeIds: [],
          lineage: null,
          git: {
            path: worktree.path,
            head: worktree.head,
            branch: worktree.branch,
            isBare: worktree.isBare,
            isMainWorktree: worktree.isMainWorktree
          }
        },
        ...(startupTerminal ? { startupTerminal } : {}),
        ...(warning ? { warning } : {})
      }
    }
    const lineageInput =
      args.lineage || args.comment ? { ...args.lineage, comment: args.comment } : undefined
    const lineageResolution = await this.resolveLineageForWorktreeCreate(lineageInput)
    if (repo.connectionId) {
      const result = await this.createManagedRemoteWorktree(repo, {
        ...args,
        activate: args.activate,
        ...(effectiveStartup ? { startup: effectiveStartup } : {}),
        ...(effectiveStartupFollowup ? { startupFollowup: effectiveStartupFollowup } : {}),
        ...(effectiveCreatedWithAgent ? { createdWithAgent: effectiveCreatedWithAgent } : {}),
        ...(effectiveDraftPaste ? { startupDraftPaste: effectiveDraftPaste } : {})
      })
      const recordedLineage = this.recordCreatedWorktreeLineage(result.worktree, lineageResolution)
      return {
        ...result,
        worktree: {
          ...result.worktree,
          parentWorktreeId: recordedLineage.lineage?.parentWorktreeId ?? null,
          childWorktreeIds: result.worktree.childWorktreeIds ?? [],
          lineage: recordedLineage.lineage,
          workspaceLineage: recordedLineage.workspaceLineage
        },
        ...(lineageInput
          ? {
              lineage: recordedLineage.lineage,
              workspaceLineage: recordedLineage.workspaceLineage,
              warnings: recordedLineage.warnings
            }
          : {})
      }
    }
    const settings = createSettings
    const worktreePathSettings = getWorktreePathSettings(repo, settings)
    const localGitExecOptions = getLocalProjectGitExecOptions(this.requireStore(), repo)
    const localWorktreeGitOptions = getLocalProjectWorktreeGitOptions(this.requireStore(), repo)
    const hasLocalWorktreeGitOptions = hasLocalGitOptions(localWorktreeGitOptions)
    const localWorktreeGitOptionArgs: [] | [{ wslDistro?: string }] = hasLocalWorktreeGitOptions
      ? [localWorktreeGitOptions]
      : []
    const addProjectGitOptions = (options?: AddWorktreeOptions): AddWorktreeOptions | undefined => {
      if (!hasLocalWorktreeGitOptions) {
        return options
      }
      return { ...options, ...localWorktreeGitOptions }
    }
    const hostedReviewExecutionContext = this.getHostedReviewExecutionOptions(repo)
    let effectiveRequestedName = args.name
    const requestedDisplayName = args.displayName?.trim() || undefined
    const sanitizedName = sanitizeWorktreeName(args.name)
    let effectiveSanitizedName = sanitizedName
    // Why: explicit branches and non-username prefix modes never consume this
    // value; skipping the probes preserves the exact generated branch name.
    const username =
      !args.branchNameOverride && settings.branchPrefix === 'git-username'
        ? await resolveLocalGitUsername(repo.path)
        : ''

    const baseBranch = await resolveWorktreeCreateBase({
      requestedBaseBranch: args.baseBranch,
      repoWorktreeBaseRef: repo.worktreeBaseRef,
      resolveDefaultBaseRef: () =>
        hasLocalWorktreeGitOptions
          ? resolveDefaultBaseRefWithLocalGit(localGitExecOptions)
          : getBaseRefDefault(repo.path),
      isBaseUsable: async (baseBranchCandidate) => {
        const remoteTrackingBase = await this.resolveRemoteTrackingBase(
          repo.path,
          baseBranchCandidate,
          ...localWorktreeGitOptionArgs
        )
        if (remoteTrackingBase) {
          if (
            await this.hasRemoteTrackingRef(
              repo.path,
              remoteTrackingBase,
              ...localWorktreeGitOptionArgs
            )
          ) {
            return true
          }
          return hasLocalWorktreeBaseRef(
            repo.path,
            baseBranchCandidate,
            hasLocalWorktreeGitOptions ? localWorktreeGitOptions : {}
          )
        }
        return hasLocalWorktreeBaseRef(
          repo.path,
          baseBranchCandidate,
          hasLocalWorktreeGitOptions ? localWorktreeGitOptions : {}
        )
      }
    })
    if (!baseBranch) {
      // Why: a null default means no suitable ref exists; fail clearly instead
      // of handing Git a fabricated origin/main ref.
      throw new Error(
        'Could not resolve a default base ref for this repo. Pass an explicit --base and try again.'
      )
    }

    const workspaceRoot = computeWorkspaceRoot(repo.path, worktreePathSettings)
    // Why: CLI-managed WSL worktrees live under ~/yiru/workspaces inside the
    // distro filesystem through computeWorkspaceRoot. If home lookup fails,
    // still validate against the effective workspace dir.
    let branchName = ''
    let checkoutExistingBranch = false
    let selectedExistingLocalBranchName: string | null = null
    let branchConflictKind: 'local' | 'remote' | null = null
    let worktreePath = ''
    let worktreePathResolved = false
    // Why: runtime/mobile create-from-review callers should get a new workspace
    // even when the PR branch or review branch name is already in use.
    for (let suffix = 1; suffix <= WORKTREE_CREATE_MAX_SUFFIX_ATTEMPTS; suffix += 1) {
      effectiveSanitizedName = getWorktreeCreateCandidate(sanitizedName, suffix)
      effectiveRequestedName = args.name.trim()
        ? getWorktreeCreateCandidate(args.name, suffix)
        : effectiveSanitizedName
      branchName = await resolveCreateBranchName(
        repo.path,
        selectedExistingLocalBranchName ??
          getBranchNameOverrideCandidate(args.branchNameOverride, suffix),
        effectiveSanitizedName,
        settings,
        username,
        localWorktreeGitOptions
      )
      checkoutExistingBranch = await canCheckoutExistingLocalBranch(
        repo.path,
        branchName,
        baseBranch,
        ...localWorktreeGitOptionArgs
      )
      if (checkoutExistingBranch && !selectedExistingLocalBranchName) {
        // Why: once a user-selected branch is safe to reuse, path retries should
        // keep that branch exact instead of creating a sibling branch.
        selectedExistingLocalBranchName = branchName
      }
      branchConflictKind = checkoutExistingBranch
        ? null
        : await getBranchConflictKind(
            repo.path,
            branchName,
            baseBranch,
            ...localWorktreeGitOptionArgs
          )
      const allowedPushTargetRemoteConflict =
        branchConflictKind &&
        isAllowedPushTargetRemoteConflict(branchConflictKind, branchName, args)
      let selectedReviewConflictMatched = false
      if (branchConflictKind) {
        if (allowedPushTargetRemoteConflict) {
          let existingPR: Awaited<ReturnType<typeof getPRForBranch>> | null = null
          const selectedReview = getSelectedReviewBranch(args)
          if (selectedReview?.provider === 'github') {
            try {
              existingPR = await getLocalGitHubPrForBranch(
                repo.path,
                branchName,
                localWorktreeGitOptions
              )
            } catch {
              // Retry with a suffixed branch when selected review verification is unavailable.
            }
            if (isMatchingSelectedGitHubPr(existingPR, args, branchName)) {
              branchConflictKind = null
              selectedReviewConflictMatched = true
            }
          } else if (selectedReview) {
            const hostedReview = await getSelectedHostedReviewForBranch(
              repo,
              branchName,
              args,
              hostedReviewExecutionContext
            ).catch(() => null)
            if (hostedReview?.matchesSelected) {
              branchConflictKind = null
              selectedReviewConflictMatched = true
            }
          }
        }
        if (branchConflictKind) {
          continue
        }
      }

      if (!checkoutExistingBranch && !selectedReviewConflictMatched) {
        let existingPR: Awaited<ReturnType<typeof getPRForBranch>> | null = null
        try {
          existingPR = await getLocalGitHubPrForBranch(
            repo.path,
            branchName,
            localWorktreeGitOptions
          )
        } catch {
          // Why: GitHub reachability should not block creating a suffixed
          // workspace; git conflicts still decide whether this candidate works.
        }
        if (existingPR && !isMatchingSelectedGitHubPr(existingPR, args, branchName)) {
          continue
        }
      }
      worktreePath = ensurePathWithinWorkspace(
        computeWorktreePath(effectiveSanitizedName, repo.path, worktreePathSettings),
        workspaceRoot
      )
      if (!(await pathExists(worktreePath))) {
        worktreePathResolved = true
        break
      }
    }
    if (!worktreePathResolved) {
      if (branchConflictKind) {
        throw new Error(
          `Branch "${branchName}" already exists ${branchConflictKind === 'local' ? 'locally' : 'on a remote'}.`
        )
      }
      throw new Error(
        `Could not find an available worktree path for "${sanitizedName}". Pick a different worktree name.`
      )
    }
    let remoteTrackingBase = await this.resolveRemoteTrackingBase(
      repo.path,
      baseBranch,
      ...localWorktreeGitOptionArgs
    )
    if (remoteTrackingBase) {
      const hadRemoteTrackingBaseRef = await this.hasRemoteTrackingRef(
        repo.path,
        remoteTrackingBase,
        ...localWorktreeGitOptionArgs
      )
      const hasLocalBaseRef =
        hadRemoteTrackingBaseRef ||
        (await hasLocalWorktreeBaseRef(
          repo.path,
          baseBranch,
          hasLocalWorktreeGitOptions ? localWorktreeGitOptions : {}
        ))
      if (!hadRemoteTrackingBaseRef && hasLocalBaseRef) {
        remoteTrackingBase = null
      } else {
        const refreshResult = await this.getOrStartRemoteTrackingBaseRefresh(
          repo.path,
          remoteTrackingBase,
          ...localWorktreeGitOptionArgs
        )
        if (!refreshResult.ok && !hadRemoteTrackingBaseRef) {
          // Why: only block creation when the refresh failed AND there is no
          // usable local base ref to fall back on. If a local remote-tracking ref
          // already exists, `git worktree add` can create from it — a possibly
          // stale but valid base — so a transient offline/auth failure must not
          // make the workspace uncreatable. The compare-to-base view reflects any
          // drift once the remote is reachable again.
          throw new Error(
            `Could not refresh base ref "${baseBranch}" from "${remoteTrackingBase.remote}". Check your network and try again.`
          )
        }
        if (
          !hadRemoteTrackingBaseRef &&
          !(await this.hasRemoteTrackingRef(
            repo.path,
            remoteTrackingBase,
            ...localWorktreeGitOptionArgs
          ))
        ) {
          throw new Error(`Base ref "${baseBranch}" was not found after fetching.`)
        }
      }
    } else if (
      !(await hasLocalWorktreeBaseRef(
        repo.path,
        baseBranch,
        hasLocalWorktreeGitOptions ? localWorktreeGitOptions : {}
      ))
    ) {
      // Why: local bases keep legacy best-effort fetch behavior. Verified PR
      // SHA bases already have the commit object needed by `git worktree add`.
      try {
        await this.fetchRemoteWithCache(repo.path, 'origin', ...localWorktreeGitOptionArgs)
      } catch {
        // Why: belt-and-suspenders. fetchRemoteWithCache already logs and does
        // not throw; the outer try/catch guarantees create-path tolerance even
        // if future refactors change that contract.
      }
    }

    const sparseDirectories = args.sparseCheckout
      ? normalizeSparseDirectories(args.sparseCheckout.directories)
      : []
    if (args.sparseCheckout && sparseDirectories.length === 0) {
      throw new Error('Sparse checkout requires at least one repo-relative directory.')
    }

    let preparedPushTarget: GitPushTarget | undefined
    if (args.pushTarget) {
      // Why: fork-PR worktrees created through a remote runtime need the same
      // upstream target setup as local desktop creates, or Push would publish
      // to the wrong remote after the client/server split.
      preparedPushTarget = await prepareWorktreePushTarget(
        repo.path,
        args.pushTarget,
        this.store,
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
    const defaultAddWorktreeOption = addProjectGitOptions()
    const addResult: AddWorktreeResult =
      (await (sparseDirectories.length > 0
        ? checkoutExistingBranch
          ? addSparseWorktree(
              repo.path,
              worktreePath,
              branchName,
              sparseDirectories,
              baseBranch,
              settings.refreshLocalBaseRefOnWorktreeCreate,
              addProjectGitOptions(existingBranchOption)
            )
          : suggestLocalBaseRefUpdate
            ? addSparseWorktree(
                repo.path,
                worktreePath,
                branchName,
                sparseDirectories,
                baseBranch,
                settings.refreshLocalBaseRefOnWorktreeCreate,
                addProjectGitOptions({ ...remoteTrackingBaseOption, suggestLocalBaseRefUpdate })
              )
            : remoteTrackingBaseOption
              ? addSparseWorktree(
                  repo.path,
                  worktreePath,
                  branchName,
                  sparseDirectories,
                  baseBranch,
                  settings.refreshLocalBaseRefOnWorktreeCreate,
                  addProjectGitOptions(remoteTrackingBaseOption)
                )
              : defaultAddWorktreeOption
                ? addSparseWorktree(
                    repo.path,
                    worktreePath,
                    branchName,
                    sparseDirectories,
                    baseBranch,
                    settings.refreshLocalBaseRefOnWorktreeCreate,
                    defaultAddWorktreeOption
                  )
                : addSparseWorktree(
                    repo.path,
                    worktreePath,
                    branchName,
                    sparseDirectories,
                    baseBranch,
                    settings.refreshLocalBaseRefOnWorktreeCreate
                  )
        : checkoutExistingBranch
          ? addWorktree(
              repo.path,
              worktreePath,
              branchName,
              baseBranch,
              settings.refreshLocalBaseRefOnWorktreeCreate,
              false,
              addProjectGitOptions(existingBranchOption)
            )
          : suggestLocalBaseRefUpdate
            ? addWorktree(
                repo.path,
                worktreePath,
                branchName,
                baseBranch,
                settings.refreshLocalBaseRefOnWorktreeCreate,
                false,
                addProjectGitOptions({ ...remoteTrackingBaseOption, suggestLocalBaseRefUpdate })
              )
            : remoteTrackingBaseOption
              ? addWorktree(
                  repo.path,
                  worktreePath,
                  branchName,
                  baseBranch,
                  settings.refreshLocalBaseRefOnWorktreeCreate,
                  false,
                  addProjectGitOptions(remoteTrackingBaseOption)
                )
              : defaultAddWorktreeOption
                ? addWorktree(
                    repo.path,
                    worktreePath,
                    branchName,
                    baseBranch,
                    settings.refreshLocalBaseRefOnWorktreeCreate,
                    false,
                    defaultAddWorktreeOption
                  )
                : addWorktree(
                    repo.path,
                    worktreePath,
                    branchName,
                    baseBranch,
                    settings.refreshLocalBaseRefOnWorktreeCreate
                  ))) ?? {}

    let configuredPushTarget: GitPushTarget | undefined
    if (preparedPushTarget) {
      configuredPushTarget = await configureCreatedWorktreePushTarget(
        worktreePath,
        branchName,
        preparedPushTarget,
        localWorktreeGitOptions
      )
    }

    const gitWorktrees = hasLocalWorktreeGitOptions
      ? await listWorktrees(repo.path, localWorktreeGitOptions)
      : await listWorktrees(repo.path)
    const created = gitWorktrees.find((gw) => areWorktreePathsEqual(gw.path, worktreePath))
    if (!created) {
      throw new Error('Worktree created but not found in listing')
    }

    const worktreeId = `${repo.id}::${created.path}`
    const now = Date.now()
    // Why: PR/MR-created worktrees can start from a head ref/SHA while Source
    // Control must compare against the review target branch.
    const metadataBaseRef = args.compareBaseRef ?? remoteTrackingBase?.ref ?? baseBranch
    const displayNameMeta = requestedDisplayName
      ? { displayName: requestedDisplayName }
      : shouldSetDisplayName(effectiveRequestedName, branchName, effectiveSanitizedName)
        ? { displayName: effectiveRequestedName }
        : {}
    const meta = this.store.setWorktreeMeta(worktreeId, {
      // Why: worktree IDs are path-derived. If a path is deleted outside Yiru
      // and later recreated, creation must mint a fresh instance identity so
      // stale lineage records tied to the old occupant fail validation.
      instanceId: randomUUID(),
      ...getProjectHostSetupWorktreeMeta(this.store.getProjectHostSetups?.() ?? [], repo),
      lastActivityAt: now,
      // See createRemoteWorktree: createdAt grants the new worktree a grace
      // window in Recent sort so ambient PTY bumps in OTHER worktrees can't
      // push it down before the user has had a chance to notice it. Smart-sort
      // uses max(lastActivityAt, createdAt + CREATE_GRACE_MS).
      createdAt: now,
      yiruCreatedAt: now,
      yiruCreationSource: 'runtime',
      yiruCreationWorkspaceLayout: getWorktreeCreationLayout(repo, settings),
      ...displayNameMeta,
      baseRef: metadataBaseRef,
      ...(checkoutExistingBranch ? { preserveBranchOnDelete: true } : {}),
      ...(configuredPushTarget ? { pushTarget: configuredPushTarget } : {}),
      ...(sparseDirectories.length > 0
        ? {
            sparseDirectories,
            sparseBaseRef: metadataBaseRef,
            sparsePresetId: args.sparseCheckout?.presetId
          }
        : {}),
      ...(args.linkedPR !== undefined ? { linkedPR: args.linkedPR } : {}),
      ...(args.linkedGitLabMR !== undefined ? { linkedGitLabMR: args.linkedGitLabMR } : {}),
      ...(args.linkedBitbucketPR !== undefined
        ? { linkedBitbucketPR: args.linkedBitbucketPR }
        : {}),
      ...(args.linkedAzureDevOpsPR !== undefined
        ? { linkedAzureDevOpsPR: args.linkedAzureDevOpsPR }
        : {}),
      ...(args.linkedGiteaPR !== undefined ? { linkedGiteaPR: args.linkedGiteaPR } : {}),
      ...(effectiveCreatedWithAgent ? { createdWithAgent: effectiveCreatedWithAgent } : {}),
      ...(args.pendingFirstAgentMessageRename === true && effectiveCreatedWithAgent
        ? { pendingFirstAgentMessageRename: true }
        : {}),
      ...(args.automationProvenance ? { automationProvenance: args.automationProvenance } : {}),
      ...(args.comment !== undefined ? { comment: args.comment } : {}),
      ...(args.manualOrder !== undefined ? { manualOrder: args.manualOrder } : {}),
      ...(args.workspaceStatus !== undefined ? { workspaceStatus: args.workspaceStatus } : {})
    })
    const worktree = mergeWorktree(repo.id, created, meta)
    const {
      lineage,
      workspaceLineage,
      warnings: lineageWarnings
    } = this.recordCreatedWorktreeLineage(worktree, lineageResolution)

    if (repo.symlinkPaths && repo.symlinkPaths.length > 0) {
      await createWorktreeLinkedPaths(repo.path, created.path, repo.symlinkPaths)
    }

    let setup: CreateWorktreeResult['setup']
    let warning: string | undefined
    // Why: CLI-created worktrees do not have a renderer preview to mismatch
    // against. Trust is granted by the direct CLI invocation (`--run-hooks`),
    // so loading the setup hook from the created worktree is intentional here.
    const yamlHooks = loadHooks(worktreePath)
    const hooks = getEffectiveHooks(repo, worktreePath)
    // Why: setupDecision lets mobile/CLI callers control whether the setup
    // script runs. 'skip' suppresses it, 'run' forces it, 'inherit' (default)
    // defers to the repo's yiru.yaml setupRunPolicy. runHooks === true maps
    // to 'run' for backwards compatibility with the desktop create flow.
    const effectiveDecision = args.runHooks ? 'run' : (args.setupDecision ?? 'inherit')
    let defaultTabs: CreateWorktreeResult['defaultTabs']
    try {
      defaultTabs = getDefaultTabsLaunch(yamlHooks, repo, effectiveDecision)
    } catch (error) {
      console.warn(`[hooks] default tab commands skipped for ${worktreePath}:`, error)
      defaultTabs = yamlHooks?.defaultTabs
        ? { tabs: yamlHooks.defaultTabs, runCommands: false }
        : undefined
    }
    const shouldRunSetup = hooks?.scripts.setup && shouldRunSetupForCreate(repo, effectiveDecision)
    if (shouldRunSetup && hooks?.scripts.setup) {
      const shouldUseSetupRunner =
        this.terminalSessions.getAuthoritativeWindowId() !== null || Boolean(effectiveStartup)
      if (shouldUseSetupRunner) {
        try {
          // Why: setup+startup must share the terminal runner path even without
          // a renderer window, so the startup shell can wait on setup completion.
          setup = createSetupRunnerScript(
            repo,
            worktreePath,
            hooks.scripts.setup,
            this.getLocalGitExecutionOptionArgs(repo)[0]
          )
        } catch (error) {
          // Why: the git worktree is already real at this point. If runner
          // generation fails, keep creation successful and surface the problem in
          // logs rather than pretending the worktree was never created.
          console.error(`[hooks] Failed to prepare setup runner for ${worktreePath}:`, error)
        }
      } else {
        void runHook(
          'setup',
          worktreePath,
          repo,
          worktreePath,
          this.getLocalGitExecutionOptionArgs(repo)[0]
        ).then((result) => {
          if (!result.success) {
            console.error(`[hooks] setup hook failed for ${worktreePath}:`, result.output)
          }
        })
      }
    } else if (hooks?.scripts.setup && effectiveDecision !== 'skip') {
      // Runtime RPC calls have no renderer trust prompt, so hooks require explicit CLI opt-in.
      warning = `yiru.yaml setup hook skipped for ${worktreePath}; pass --setup run to run it.`
      console.warn(`[hooks] ${warning}`)
    }

    this.invalidateResolvedWorktreeCache()
    // Why: the filesystem-auth layer maintains a separate cache of registered
    // worktree roots used by git IPC handlers (branchCompare, diff, status, etc.)
    // to authorize paths. Without invalidating it here, CLI-created worktrees
    // are not recognized and all git operations fail with "Access denied:
    // unknown repository or worktree path".
    invalidateAuthorizedRootsCache()

    this.notifyWorktreesChanged(repo.id)
    const shouldActivate = args.activate === true || args.runHooks === true
    let didSpawnStartup = false
    // Why: tracks whether runtime itself launched the setup script (via
    // provisionManagedWorktreeTerminals). When true, renderer activation and the
    // RPC return value must omit setup so the client does not spawn it a second
    // time. Mirrors the wait-for-agent setup contract from #6298.
    let didSpawnSetup = false
    let startupTerminalHandle: string | null = null
    let startupTerminalTabId: string | null = null
    let startupTerminalPaneKey: string | null = null
    let startupTerminalPtyId: string | null = null

    let sequencedStartup = effectiveStartup
    let wrappedSetupCommandStr: string | undefined
    if (effectiveStartup && setup?.waitForAgentStartup === true) {
      const platform = getSetupRunnerCommandPlatformForPath(
        setup.runnerScriptPath,
        process.platform === 'win32' ? 'windows' : 'posix'
      )
      const sequenced = createSequencedSetupAgentCommands({
        runnerScriptPath: setup.runnerScriptPath,
        startupCommand: effectiveStartup.command,
        platform
      })
      sequencedStartup = {
        ...effectiveStartup,
        command: sequenced.startupCommand,
        ...(sequenced.startupEnv
          ? { env: { ...effectiveStartup.env, ...sequenced.startupEnv } }
          : {})
      }
      wrappedSetupCommandStr = sequenced.setupCommand
    }

    if (sequencedStartup && this.ptyController?.spawn) {
      try {
        // Why: automation startup must not depend on a renderer TerminalPane
        // mounting. Runtime-spawned PTYs run immediately and the UI adopts the
        // session later, matching `yiru terminal create` background semantics.
        const startupTrustAgent = effectiveDraftPaste?.agent ?? effectiveCreatedWithAgent
        if (startupTrustAgent) {
          this.markLocalWorkspaceTrustedForAgent(startupTrustAgent, worktreePath)
        }
        const terminal = await this.createTerminal(`id:${worktree.id}`, {
          command: sequencedStartup.command,
          ...(setup && effectiveStartup
            ? { claudeAgentTeamsSourceCommand: effectiveStartup.command }
            : {}),
          env: sequencedStartup.env,
          ...(sequencedStartup.launchConfig ? { launchConfig: sequencedStartup.launchConfig } : {}),
          ...(effectiveCreatedWithAgent ? { launchAgent: effectiveCreatedWithAgent } : {}),
          startupCommandDelivery: sequencedStartup.startupCommandDelivery,
          telemetry: sequencedStartup.telemetry
        })
        if (effectiveDraftPaste) {
          this.pasteStartupDraftWhenReady(terminal.handle, effectiveDraftPaste)
        }
        if (effectiveStartupFollowup) {
          this.sendStartupFollowupWhenReady(terminal.handle, effectiveStartupFollowup)
        }
        didSpawnStartup = true
        startupTerminalHandle = terminal.handle
        startupTerminalTabId = terminal.tabId ?? null
        startupTerminalPaneKey = terminal.paneKey ?? null
        startupTerminalPtyId = terminal.ptyId ?? null
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        warning = warning
          ? `${warning} Also failed to create the startup terminal for ${worktreePath}: ${message}`
          : `Failed to create the startup terminal for ${worktreePath}: ${message}`
        console.warn(`[worktree-create] ${warning}`)
      }
    }
    if (shouldActivate) {
      // Why: plain CLI creates should not steal the user's current workspace.
      // Explicit activation and hook-running still use renderer activation so
      // the user can watch prompts/output in a visible pane.
      const runtimeWillProvisionTerminals = didSpawnStartup && Boolean(setup || defaultTabs)
      if (runtimeWillProvisionTerminals) {
        // Why: once runtime spawned the startup PTY, renderer activation may see
        // an existing terminal and skip setup/default tabs. Await provisioning so
        // a failed setup spawn falls back to renderer activation (which still
        // carries the wrapped command for retry); #6298's wait-for-setup
        // guarantee is enforced by the shell marker, not by spawn timing.
        const provisioned = await this.provisionManagedWorktreeTerminals({
          worktreeSelector: `id:${worktree.id}`,
          worktreeId: worktree.id,
          worktreePath,
          ...(setup ? { setup } : {}),
          ...(defaultTabs ? { defaultTabs } : {}),
          primaryTerminalHandle: startupTerminalHandle,
          hasStartupTerminal: didSpawnStartup,
          setupCommandPlatform: setup
            ? isWindowsAbsolutePathLike(setup.runnerScriptPath)
              ? 'windows'
              : 'posix'
            : 'posix',
          // Why: carry the wait-for-agent wrapped setup command (#6298) so the
          // Setup tab runs the same script the sequenced agent waits on.
          ...(wrappedSetupCommandStr ? { wrappedSetupCommand: wrappedSetupCommandStr } : {})
        })
        didSpawnSetup = provisioned.setupSpawned
      }
      // Why: when runtime spawned setup, omit it from activation. When setup
      // spawn failed, fall through with the wrapped command so renderer
      // activation retries it.
      const activationSetup = didSpawnSetup
        ? undefined
        : setup
          ? {
              ...setup,
              ...(didSpawnStartup && wrappedSetupCommandStr
                ? { command: wrappedSetupCommandStr }
                : {})
            }
          : undefined
      const activationDefaultTabs = runtimeWillProvisionTerminals ? undefined : defaultTabs
      if (effectiveStartup && !didSpawnStartup) {
        this.notifyActivateWorktree(
          repo.id,
          worktree.id,
          activationSetup,
          effectiveStartup,
          activationDefaultTabs
        )
      } else {
        this.notifyActivateWorktree(
          repo.id,
          worktree.id,
          activationSetup,
          undefined,
          activationDefaultTabs
        )
      }
    } else if (this.ptyController?.spawn && (setup || defaultTabs || didSpawnStartup)) {
      // Why: inactive terminal materialization matches normal worktree creation,
      // but setup/default tab failures must not gate automation dispatch.
      void this.provisionManagedWorktreeTerminals({
        worktreeSelector: `id:${worktree.id}`,
        worktreeId: worktree.id,
        worktreePath,
        ...(setup ? { setup } : {}),
        ...(defaultTabs ? { defaultTabs } : {}),
        primaryTerminalHandle: startupTerminalHandle,
        hasStartupTerminal: didSpawnStartup,
        setupCommandPlatform: setup
          ? isWindowsAbsolutePathLike(setup.runnerScriptPath)
            ? 'windows'
            : 'posix'
          : 'posix',
        ...(wrappedSetupCommandStr ? { wrappedSetupCommand: wrappedSetupCommandStr } : {})
      })
      // Why: runtime owns setup spawning here, so the RPC result must omit setup
      // to keep the headless/mobile caller from launching it a second time.
      if (setup) {
        didSpawnSetup = true
      }
    } else if (this.ptyController?.spawn) {
      try {
        await this.createTerminal(`id:${worktree.id}`)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        warning = warning
          ? `${warning} Also failed to create the initial terminal for ${worktreePath}: ${message}`
          : `Failed to create the initial terminal for ${worktreePath}: ${message}`
        console.warn(`[worktree-create] ${warning}`)
      }
    }
    const returnedSetup = didSpawnSetup
      ? undefined
      : setup
        ? {
            ...setup,
            ...(didSpawnStartup && wrappedSetupCommandStr
              ? { command: wrappedSetupCommandStr }
              : {})
          }
        : undefined
    return {
      worktree: {
        ...worktree,
        parentWorktreeId: lineage?.parentWorktreeId ?? null,
        childWorktreeIds: [],
        lineage,
        workspaceLineage,
        git: created
      },
      ...(lineageInput ? { lineage, workspaceLineage, warnings: lineageWarnings } : {}),
      ...(returnedSetup ? { setup: returnedSetup } : {}),
      ...(defaultTabs ? { defaultTabs } : {}),
      ...(warning ? { warning } : {}),
      ...(addResult.localBaseRefRefresh
        ? { localBaseRefRefresh: addResult.localBaseRefRefresh }
        : {}),
      ...(addResult.localBaseRefUpdateSuggestion
        ? { localBaseRefUpdateSuggestion: addResult.localBaseRefUpdateSuggestion }
        : {}),
      ...(didSpawnStartup && startupTerminalHandle
        ? {
            startupTerminal: {
              spawned: true,
              handle: startupTerminalHandle,
              ...(startupTerminalTabId ? { tabId: startupTerminalTabId } : {}),
              ...(startupTerminalPaneKey ? { paneKey: startupTerminalPaneKey } : {}),
              ...(startupTerminalPtyId ? { ptyId: startupTerminalPtyId } : {}),
              surface: 'background' as const
            }
          }
        : {})
    }
  }

  private async createManagedRemoteWorktree(
    repo: Repo,
    args: {
      name: string
      baseBranch?: string
      compareBaseRef?: string
      branchNameOverride?: string
      linkedPR?: number | null
      linkedGitLabMR?: number | null
      linkedBitbucketPR?: number | null
      linkedAzureDevOpsPR?: number | null
      linkedGiteaPR?: number | null
      comment?: string
      displayName?: string
      workspaceStatus?: string
      manualOrder?: number
      sparseCheckout?: { directories: string[]; presetId?: string }
      pushTarget?: GitPushTarget
      runHooks?: boolean
      activate?: boolean
      setupDecision?: 'run' | 'skip' | 'inherit'
      createdWithAgent?: TuiAgent
      pendingFirstAgentMessageRename?: boolean
      automationProvenance?: AutomationWorkspaceProvenance
      startup?: WorktreeStartupLaunch
      startupFollowup?: WorktreeStartupFollowup
      startupDraftPaste?: WorktreeStartupDraftPaste
    }
  ): Promise<CreateWorktreeResult> {
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }

    // Why: runtime/mobile callers do not own a renderer BrowserWindow, but the
    // SSH create helper only uses it for progress and change notifications.
    // Runtime emits those through RuntimeNotifier after the create succeeds.
    const headlessWindow = {
      isDestroyed: () => false,
      webContents: { send: () => undefined }
    } as unknown as BrowserWindow

    const result = await createRemoteWorktree(
      {
        repoId: repo.id,
        name: args.name,
        ...(args.displayName ? { displayName: args.displayName } : {}),
        ...(args.baseBranch ? { baseBranch: args.baseBranch } : {}),
        ...(args.compareBaseRef ? { compareBaseRef: args.compareBaseRef } : {}),
        ...(args.branchNameOverride ? { branchNameOverride: args.branchNameOverride } : {}),
        ...(args.runHooks ? { setupDecision: 'run' as const } : {}),
        ...(!args.runHooks && args.setupDecision ? { setupDecision: args.setupDecision } : {}),
        ...(args.sparseCheckout ? { sparseCheckout: args.sparseCheckout } : {}),
        ...(args.linkedPR != null ? { linkedPR: args.linkedPR } : {}),
        ...(args.linkedGitLabMR != null ? { linkedGitLabMR: args.linkedGitLabMR } : {}),
        ...(args.linkedBitbucketPR != null ? { linkedBitbucketPR: args.linkedBitbucketPR } : {}),
        ...(args.linkedAzureDevOpsPR != null
          ? { linkedAzureDevOpsPR: args.linkedAzureDevOpsPR }
          : {}),
        ...(args.linkedGiteaPR != null ? { linkedGiteaPR: args.linkedGiteaPR } : {}),
        ...(args.pushTarget ? { pushTarget: args.pushTarget } : {}),
        ...(args.workspaceStatus ? { workspaceStatus: args.workspaceStatus as never } : {}),
        ...(args.manualOrder !== undefined ? { manualOrder: args.manualOrder } : {}),
        ...(args.createdWithAgent ? { createdWithAgent: args.createdWithAgent } : {}),
        ...(args.pendingFirstAgentMessageRename === true
          ? { pendingFirstAgentMessageRename: true }
          : {}),
        ...(args.automationProvenance ? { automationProvenance: args.automationProvenance } : {})
      },
      repo,
      this.store as unknown as Store,
      headlessWindow
    )

    if (args.comment !== undefined) {
      this.store.setWorktreeMeta(result.worktree.id, { comment: args.comment })
      result.worktree.comment = args.comment
    }

    this.invalidateResolvedWorktreeCache()
    this.notifyWorktreesChanged(repo.id)

    let warning = result.warning
    let didSpawnStartup = false
    // Why: same no-double-spawn contract as the local path — once runtime
    // provisions setup, omit it from activation and the RPC result.
    let didSpawnSetup = false
    let startupTerminalHandle: string | null = null
    let startupTerminalTabId: string | null = null
    let startupTerminalPaneKey: string | null = null
    let startupTerminalPtyId: string | null = null

    let sequencedStartup = args.startup
    let wrappedSetupCommandStr: string | undefined
    if (args.startup && result.setup?.waitForAgentStartup === true) {
      const platform = getSetupRunnerCommandPlatformForPath(result.setup.runnerScriptPath, 'posix')
      const sequenced = createSequencedSetupAgentCommands({
        runnerScriptPath: result.setup.runnerScriptPath,
        startupCommand: args.startup.command,
        platform
      })
      sequencedStartup = {
        ...args.startup,
        command: sequenced.startupCommand,
        ...(sequenced.startupEnv ? { env: { ...args.startup.env, ...sequenced.startupEnv } } : {})
      }
      wrappedSetupCommandStr = sequenced.setupCommand
    }

    if (sequencedStartup && this.ptyController?.spawn) {
      try {
        const startupTrustAgent = args.startupDraftPaste?.agent ?? args.createdWithAgent
        if (startupTrustAgent) {
          await this.markRemoteWorkspaceTrustedForAgent(
            startupTrustAgent,
            repo.connectionId!,
            result.worktree.path
          )
        }
        const terminal = await this.createTerminal(`path:${result.worktree.path}`, {
          command: sequencedStartup.command,
          ...(result.setup && args.startup
            ? { claudeAgentTeamsSourceCommand: args.startup.command }
            : {}),
          env: sequencedStartup.env,
          ...(sequencedStartup.launchConfig ? { launchConfig: sequencedStartup.launchConfig } : {}),
          ...(args.createdWithAgent ? { launchAgent: args.createdWithAgent } : {}),
          startupCommandDelivery: sequencedStartup.startupCommandDelivery,
          telemetry: sequencedStartup.telemetry
        })
        if (args.startupDraftPaste) {
          this.pasteStartupDraftWhenReady(terminal.handle, args.startupDraftPaste)
        }
        if (args.startupFollowup) {
          this.sendStartupFollowupWhenReady(terminal.handle, args.startupFollowup)
        }
        didSpawnStartup = true
        startupTerminalHandle = terminal.handle
        startupTerminalTabId = terminal.tabId ?? null
        startupTerminalPaneKey = terminal.paneKey ?? null
        startupTerminalPtyId = terminal.ptyId ?? null
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        warning = warning
          ? `${warning} Also failed to create the startup terminal for ${result.worktree.path}: ${message}`
          : `Failed to create the startup terminal for ${result.worktree.path}: ${message}`
      }
    }

    const shouldActivate = args.activate === true || args.runHooks === true
    if (shouldActivate) {
      const runtimeWillProvisionTerminals =
        didSpawnStartup && Boolean(result.setup || result.defaultTabs)
      if (runtimeWillProvisionTerminals) {
        // Why: remote/mobile task creates spawn the agent terminal in runtime,
        // so renderer activation may not materialize setup/default tabs. Await so
        // a failed setup spawn falls back to renderer activation for retry.
        const provisioned = await this.provisionManagedWorktreeTerminals({
          worktreeSelector: `path:${result.worktree.path}`,
          worktreeId: result.worktree.id,
          worktreePath: result.worktree.path,
          ...(result.setup ? { setup: result.setup } : {}),
          ...(result.defaultTabs ? { defaultTabs: result.defaultTabs } : {}),
          primaryTerminalHandle: startupTerminalHandle,
          hasStartupTerminal: didSpawnStartup,
          setupCommandPlatform: result.setup
            ? isWindowsAbsolutePathLike(result.setup.runnerScriptPath)
              ? 'windows'
              : 'posix'
            : 'posix',
          // Why: carry the wait-for-agent wrapped setup command (#6298) so the
          // remote Setup tab runs the same script the sequenced agent waits on.
          ...(wrappedSetupCommandStr ? { wrappedSetupCommand: wrappedSetupCommandStr } : {})
        })
        didSpawnSetup = provisioned.setupSpawned
      }
      // Why: omit setup from activation when runtime spawned it; on spawn
      // failure fall through with the wrapped command so renderer retries.
      const activationSetup = didSpawnSetup
        ? undefined
        : result.setup
          ? {
              ...result.setup,
              ...(didSpawnStartup && wrappedSetupCommandStr
                ? { command: wrappedSetupCommandStr }
                : {})
            }
          : undefined
      const activationDefaultTabs = runtimeWillProvisionTerminals ? undefined : result.defaultTabs
      if (args.startup && !didSpawnStartup) {
        this.notifyActivateWorktree(
          repo.id,
          result.worktree.id,
          activationSetup,
          args.startup,
          activationDefaultTabs
        )
      } else {
        this.notifyActivateWorktree(
          repo.id,
          result.worktree.id,
          activationSetup,
          undefined,
          activationDefaultTabs
        )
      }
    }

    if (
      !shouldActivate &&
      this.ptyController?.spawn &&
      (result.setup || result.defaultTabs || didSpawnStartup)
    ) {
      // Why: inactive terminal materialization matches normal worktree creation,
      // but setup/default tab failures must not gate automation dispatch.
      void this.provisionManagedWorktreeTerminals({
        worktreeSelector: `path:${result.worktree.path}`,
        worktreeId: result.worktree.id,
        worktreePath: result.worktree.path,
        ...(result.setup ? { setup: result.setup } : {}),
        ...(result.defaultTabs ? { defaultTabs: result.defaultTabs } : {}),
        primaryTerminalHandle: startupTerminalHandle,
        hasStartupTerminal: didSpawnStartup,
        setupCommandPlatform: result.setup
          ? isWindowsAbsolutePathLike(result.setup.runnerScriptPath)
            ? 'windows'
            : 'posix'
          : 'posix',
        ...(wrappedSetupCommandStr ? { wrappedSetupCommand: wrappedSetupCommandStr } : {})
      })
      // Why: runtime owns setup spawning here, so omit setup from the RPC result
      // to keep the headless/mobile caller from launching it a second time.
      if (result.setup) {
        didSpawnSetup = true
      }
    } else if (!shouldActivate && this.ptyController?.spawn) {
      try {
        await this.createTerminal(`path:${result.worktree.path}`)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        warning = warning
          ? `${warning} Also failed to create the initial terminal for ${result.worktree.path}: ${message}`
          : `Failed to create the initial terminal for ${result.worktree.path}: ${message}`
      }
    }

    const returnedSetup = didSpawnSetup
      ? undefined
      : result.setup
        ? {
            ...result.setup,
            ...(didSpawnStartup && wrappedSetupCommandStr
              ? { command: wrappedSetupCommandStr }
              : {})
          }
        : undefined
    const resultForRenderer = returnedSetup
      ? { ...result, setup: returnedSetup }
      : (() => {
          const { setup: _setup, ...resultWithoutSetup } = result
          return resultWithoutSetup
        })()

    const resultWithStartupTerminal =
      didSpawnStartup && startupTerminalHandle
        ? {
            ...resultForRenderer,
            startupTerminal: {
              spawned: true,
              handle: startupTerminalHandle,
              ...(startupTerminalTabId ? { tabId: startupTerminalTabId } : {}),
              ...(startupTerminalPaneKey ? { paneKey: startupTerminalPaneKey } : {}),
              ...(startupTerminalPtyId ? { ptyId: startupTerminalPtyId } : {}),
              surface: 'background' as const
            }
          }
        : resultForRenderer

    return warning ? { ...resultWithStartupTerminal, warning } : resultWithStartupTerminal
  }

  /**
   * Fetch `remote` in `repoPath`, sharing the 30s freshness window + in-flight
   * serialization with all other callers. Never rejects — callers
   * log-and-proceed on offline failures (§3.3 Lifecycle).
   *
   * Why a shared cache on the runtime instead of module-scoped: §7.1 relies on
   * one cache for BOTH the renderer create path and `probeWorktreeDrift`. A
   * dispatch tick that reuses a just-completed create-path fetch is the
   * primary telemetry target; splitting the cache by call-site would double
   * the fetch load on warm repos.
   */
  async getCanonicalFetchKey(
    repoPath: string,
    remote: string,
    gitOptions: { wslDistro?: string } = {}
  ): Promise<string> {
    const runtimeKey = gitOptions.wslDistro ? `wsl:${gitOptions.wslDistro}` : 'local'
    const cacheKey = `${runtimeKey}::${repoPath}::${remote}`
    const cached = this.canonicalFetchKeyCache.get(cacheKey)
    if (cached !== undefined) {
      setBoundedMapEntry(this.canonicalFetchKeyCache, cacheKey, cached, REMOTE_FETCH_CACHE_MAX)
      return cached
    }
    let resolved = cacheKey
    try {
      const { stdout } = await gitExecFileAsync(
        ['rev-parse', '--path-format=absolute', '--git-common-dir'],
        { cwd: repoPath, ...gitOptions }
      )
      const commonDir = stdout.trim()
      if (commonDir) {
        resolved = `${runtimeKey}::${commonDir}::${remote}`
      }
    } catch {
      // Fall through to the caller-provided path. The fetch still runs from
      // repoPath; this key only controls cache sharing.
    }
    setBoundedMapEntry(this.canonicalFetchKeyCache, cacheKey, resolved, REMOTE_FETCH_CACHE_MAX)
    return resolved
  }

  private enqueueRemoteFetch(
    remoteKey: string,
    runFetch: () => Promise<RemoteFetchResult>
  ): Promise<RemoteFetchResult> {
    const previous = this.remoteFetchQueueTail.get(remoteKey)
    const promise = previous ? previous.then(runFetch, runFetch) : runFetch()
    this.remoteFetchQueueTail.set(remoteKey, promise)
    promise.finally(() => {
      if (this.remoteFetchQueueTail.get(remoteKey) === promise) {
        this.remoteFetchQueueTail.delete(remoteKey)
      }
    })
    return promise
  }

  private getFreshFetchCompletedAt(key: string): number | null {
    const lastAt = this.fetchLastCompletedAt.get(key)
    if (lastAt === undefined) {
      return null
    }
    if (Date.now() - lastAt < FETCH_FRESHNESS_MS) {
      setBoundedMapEntry(this.fetchLastCompletedAt, key, lastAt, REMOTE_FETCH_CACHE_MAX)
      return lastAt
    }
    this.fetchLastCompletedAt.delete(key)
    return null
  }

  private rememberFreshFetchCompletedAt(key: string, completedAt = Date.now()): void {
    setBoundedMapEntry(this.fetchLastCompletedAt, key, completedAt, REMOTE_FETCH_CACHE_MAX)
  }

  async getOrStartRemoteFetch(
    repoPath: string,
    remote: string,
    gitOptions: { wslDistro?: string } = {}
  ): Promise<RemoteFetchResult> {
    const key = await this.getCanonicalFetchKey(repoPath, remote, gitOptions)
    if (this.getFreshFetchCompletedAt(key) !== null) {
      // Why: freshness window hit — skip the fetch entirely. Do NOT reuse any
      // in-flight promise here; the timestamp is only written on success, so
      // hitting this branch means a previous fetch did succeed recently.
      return { ok: true }
    }

    const existing = this.fetchInflight.get(key)
    if (existing) {
      // Why: genuine serialization (not check-then-set). Two callers racing
      // on the same repo+remote share the single underlying `git fetch`.
      return existing
    }

    const promise = this.enqueueRemoteFetch(key, () =>
      gitExecFileAsync(['fetch', remote], {
        cwd: repoPath,
        ...gitOptions,
        // Why: cap the create-path base-ref fetch so a stuck first-auth on
        // Windows (GCM prompt) fails fast instead of hanging creation (STA-1292).
        timeout: REMOTE_FETCH_TIMEOUT_MS
      })
        .then((): RemoteFetchResult => {
          // Why (§3.3 Lifecycle): timestamp on success ONLY. Writing on rejection
          // would make the freshness cache lie about the last known remote state.
          this.rememberFreshFetchCompletedAt(key)
          return { ok: true }
        })
        .catch((err): RemoteFetchResult => {
          // Why: swallow here so awaiters don't throw at the await site. Outer
          // create/dispatch paths are already tolerant of offline fetch failure;
          // this is the behavioral contract of this helper.
          console.warn(`[fetchRemoteWithCache] ${remote} fetch failed for ${repoPath}:`, err)
          return { ok: false, errorKind: 'git_error' }
        })
    ).finally(() => {
      // Why (§3.3 Lifecycle): evict on BOTH success and rejection. A
      // rejected entry that survived in the Map would wedge every future
      // create on this repo until Yiru restarted (the F2 bug §3.3 pins).
      this.fetchInflight.delete(key)
    })

    this.fetchInflight.set(key, promise)
    return promise
  }

  async getOrStartRemoteTrackingBaseRefresh(
    repoPath: string,
    base: RemoteTrackingBase,
    gitOptions: { wslDistro?: string } = {}
  ): Promise<RemoteFetchResult> {
    const remoteKey = await this.getCanonicalFetchKey(repoPath, base.remote, gitOptions)
    const key = await this.getCanonicalFetchKey(
      repoPath,
      `base:${base.remote}:${base.branch}`,
      gitOptions
    )
    if (this.getFreshFetchCompletedAt(key) !== null) {
      // Why: exact-base freshness is the safety boundary. A full remote fetch
      // can be narrowed by repo refspecs, so it must not prove this branch.
      return { ok: true }
    }

    const existing = this.fetchInflight.get(key)
    if (existing) {
      return existing
    }

    const promise = this.enqueueRemoteFetch(remoteKey, async () => {
      if (this.getFreshFetchCompletedAt(key) !== null) {
        return { ok: true }
      }
      // Why: this exact refresh gates worktree create; ordinary fetches still own maintenance.
      return gitExecFileAsync(
        [
          ...GIT_FETCH_SKIP_AUTO_MAINTENANCE_CONFIG_ARGS,
          'fetch',
          '--no-tags',
          base.remote,
          `+refs/heads/${base.branch}:${base.ref}`
        ],
        {
          cwd: repoPath,
          ...gitOptions,
          // Why: exact remote-base refresh is the network gate for worktree
          // creation, so honor repo SSH routing and bound custom wrappers.
          useConfiguredSshCommandForNetwork: true,
          timeout: REMOTE_FETCH_TIMEOUT_MS
        }
      )
        .then((): RemoteFetchResult => {
          this.rememberFreshFetchCompletedAt(key)
          return { ok: true }
        })
        .catch((err): RemoteFetchResult => {
          console.warn(
            `[refreshRemoteTrackingBase] ${base.base} refresh failed for ${repoPath}:`,
            err
          )
          return { ok: false, errorKind: 'git_error' }
        })
    }).finally(() => {
      this.fetchInflight.delete(key)
    })

    this.fetchInflight.set(key, promise)
    return promise
  }

  async fetchRemoteWithCache(
    repoPath: string,
    remote: string,
    gitOptions: { wslDistro?: string } = {}
  ): Promise<void> {
    await this.getOrStartRemoteFetch(repoPath, remote, gitOptions)
  }

  async resolveRemoteTrackingBase(
    repoPath: string,
    baseBranch: string,
    gitOptions: { wslDistro?: string } = {}
  ): Promise<RemoteTrackingBase | null> {
    let remotes: string[]
    try {
      const { stdout } = await gitExecFileAsync(['remote'], { cwd: repoPath, ...gitOptions })
      remotes = stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    } catch {
      return null
    }

    const remoteRefPrefix = 'refs/remotes/'
    const shortBaseBranch = baseBranch.startsWith(remoteRefPrefix)
      ? baseBranch.slice(remoteRefPrefix.length)
      : baseBranch
    const remote = remotes
      .filter((candidate) => shortBaseBranch.startsWith(`${candidate}/`))
      .sort((a, b) => b.length - a.length)[0]
    if (!remote) {
      return null
    }
    const branch = shortBaseBranch.slice(remote.length + 1)
    if (!branch) {
      return null
    }
    return {
      remote,
      branch,
      ref: `refs/remotes/${remote}/${branch}`,
      base: `${remote}/${branch}`
    }
  }

  async hasRemoteTrackingRef(
    repoPath: string,
    base: RemoteTrackingBase,
    gitOptions: { wslDistro?: string } = {}
  ): Promise<boolean> {
    try {
      await gitExecFileAsync(['rev-parse', '--verify', `${base.ref}^{commit}`], {
        cwd: repoPath,
        ...gitOptions
      })
      return true
    } catch {
      return false
    }
  }

  recordOptimisticReconcileToken(worktreeId: string): string {
    const token = randomUUID()
    this.optimisticReconcileTokens.set(worktreeId, token)
    return token
  }

  clearOptimisticReconcileToken(worktreeId: string): void {
    this.optimisticReconcileTokens.delete(worktreeId)
  }

  emitWorktreeBaseStatus(event: WorktreeBaseStatusEvent): void {
    this.notifier?.worktreeBaseStatus?.(event)
  }

  async reconcileWorktreeBaseStatus(args: {
    repoId: string
    repoPath: string
    worktreeId: string
    base: RemoteTrackingBase
    branchName: string
    createdBaseSha: string
    token: string
    fetchPromise: Promise<RemoteFetchResult>
  }): Promise<void> {
    const stillCurrent = (): boolean =>
      this.optimisticReconcileTokens.get(args.worktreeId) === args.token
    const emit = (event: Omit<WorktreeBaseStatusEvent, 'repoId' | 'worktreeId' | 'base'>): void => {
      if (!stillCurrent()) {
        return
      }
      this.notifier?.worktreeBaseStatus?.({
        repoId: args.repoId,
        worktreeId: args.worktreeId,
        base: args.base.base,
        remote: args.base.remote,
        ...event
      })
    }
    const resolvePublishRemote = async (): Promise<string> => {
      // Why: repos whose canonical publish remote is named differently (e.g.
      // `upstream`, a forked `myfork`, or any non-`origin` configuration —
      // including multi-segment names like `foo/bar` that this PR's resolver
      // explicitly supports) would otherwise silently skip the conflict
      // signal. Resolve from git config in priority order:
      //   1) branch.<name>.pushRemote (explicit per-branch override)
      //   2) remote.pushDefault (workspace-wide override)
      //   3) branch.<name>.remote (tracked remote)
      //   4) the base ref's own remote (matches resolveRemoteTrackingBase)
      //   5) `origin` as a final fallback.
      const tryConfig = async (key: string): Promise<string | null> => {
        try {
          const { stdout } = await gitExecFileAsync(['config', '--get', key], {
            cwd: args.repoPath
          })
          const value = stdout.trim()
          return value || null
        } catch {
          return null
        }
      }
      return (
        (await tryConfig(`branch.${args.branchName}.pushRemote`)) ??
        (await tryConfig('remote.pushDefault')) ??
        (await tryConfig(`branch.${args.branchName}.remote`)) ??
        args.base.remote ??
        'origin'
      )
    }
    const checkPublishRemoteConflict = async (): Promise<void> => {
      const publishRemote = await resolvePublishRemote()
      try {
        if (publishRemote !== args.base.remote) {
          const result = await this.getOrStartRemoteFetch(args.repoPath, publishRemote)
          if (!result.ok) {
            return
          }
        }
        await gitExecFileAsync(
          ['rev-parse', '--verify', `refs/remotes/${publishRemote}/${args.branchName}^{commit}`],
          { cwd: args.repoPath }
        )
        if (stillCurrent()) {
          this.notifier?.worktreeRemoteBranchConflict?.({
            repoId: args.repoId,
            worktreeId: args.worktreeId,
            remote: publishRemote,
            branchName: args.branchName
          })
        }
      } catch {
        // No publish-remote conflict is the common case; stay quiet.
      }
    }

    try {
      const fetchResult = await args.fetchPromise
      if (!stillCurrent()) {
        return
      }
      if (!fetchResult.ok) {
        emit({ status: 'unknown' })
        return
      }

      const { stdout } = await gitExecFileAsync(
        ['rev-parse', '--verify', `${args.base.ref}^{commit}`],
        { cwd: args.repoPath }
      )
      const postFetchSha = stdout.trim()
      if (postFetchSha === args.createdBaseSha) {
        emit({ status: 'current' })
        await checkPublishRemoteConflict()
        return
      }

      try {
        await gitExecFileAsync(['merge-base', '--is-ancestor', args.createdBaseSha, postFetchSha], {
          cwd: args.repoPath
        })
      } catch {
        emit({ status: 'base_changed' })
        await checkPublishRemoteConflict()
        return
      }

      const { stdout: countStdout } = await gitExecFileAsync(
        ['rev-list', '--count', `${args.createdBaseSha}..${postFetchSha}`],
        { cwd: args.repoPath }
      )
      const behind = Number(countStdout.trim())
      if (!Number.isFinite(behind) || behind <= 0) {
        emit({ status: 'current' })
        await checkPublishRemoteConflict()
        return
      }
      const { stdout: logStdout } = await gitExecFileAsync(
        ['log', '--format=%s', '-n', '5', `${args.createdBaseSha}..${postFetchSha}`],
        { cwd: args.repoPath }
      )
      emit({
        status: 'drift',
        behind,
        recentSubjects: logStdout.split('\n').filter((line) => line.trim().length > 0)
      })
      await checkPublishRemoteConflict()
    } catch (err) {
      console.warn(`[worktree-base-status] reconcile failed for ${args.worktreeId}:`, err)
      emit({ status: 'unknown' })
    } finally {
      // Why: reconcile is one-shot; clear the token so long-lived sessions
      // that create many worktrees without removing them don't grow the
      // optimisticReconcileTokens map monotonically. Removal still no-ops
      // because the entry is already gone.
      if (this.optimisticReconcileTokens.get(args.worktreeId) === args.token) {
        this.optimisticReconcileTokens.delete(args.worktreeId)
      }
    }
  }

  /**
   * Probe how far the worktree's HEAD is behind its tracking remote. Returns
   * null when the probe cannot establish a signal (no default base ref, or
   * git failure). Dispatch treats null as "unknown — proceed" (§3.1); only
   * knowing-and-stale refuses.
   */
  async probeWorktreeDrift(worktreeSelector: string): Promise<{
    base: string
    behind: number
    recentSubjects: string[]
  } | null> {
    const wt = await this.resolveWorktreeSelector(worktreeSelector)
    if (!this.store) {
      return null
    }
    const repo = this.store.getRepos().find((r) => r.id === wt.repoId)
    if (!repo) {
      return null
    }
    if (repo.connectionId) {
      // Why: the drift probe uses local git helpers. Until the SSH provider
      // exposes equivalent remote refs/log plumbing, fail closed to "unknown"
      // instead of probing a server path on the desktop filesystem.
      return null
    }
    const localGitExecOptions = getLocalProjectGitExecOptions(this.requireStore(), repo)
    const localWorktreeGitOptions = getLocalProjectWorktreeGitOptions(this.requireStore(), repo)
    const meta = this.store.getWorktreeMeta(wt.id)
    const base =
      meta?.baseRef ||
      meta?.sparseBaseRef ||
      repo.worktreeBaseRef ||
      (await getBaseRefDefault(repo.path, localWorktreeGitOptions))
    if (!base) {
      // Why: brand-new repo with no remote primary — nothing to compare
      // against, so there's no meaningful drift to report. Dispatch should
      // not block on a probe that cannot form an opinion.
      return null
    }
    const remoteTrackingBase = await this.resolveRemoteTrackingBase(
      repo.path,
      base,
      localWorktreeGitOptions
    )
    if (!remoteTrackingBase) {
      return null
    }
    const remote = remoteTrackingBase.remote
    // Why: fetch failures are non-fatal; we proceed with whatever the
    // last-known remote ref points at. `fetchRemoteWithCache` never throws.
    await this.fetchRemoteWithCache(repo.path, remote, localWorktreeGitOptions)
    const drift = getRemoteDrift(wt.path, 'HEAD', base, localGitExecOptions)
    if (!drift) {
      return null
    }
    const recentSubjects = getRecentDriftSubjects(
      wt.path,
      'HEAD',
      base,
      DRIFT_PROBE_SUBJECT_LIMIT,
      localGitExecOptions
    )
    return { base, behind: drift.behind, recentSubjects }
  }

  async updateManagedWorktreeMeta(
    worktreeSelector: string,
    updates: Omit<Partial<WorktreeMeta>, 'pushTarget'> & {
      pushTarget?: GitPushTarget | null
      lineage?: {
        parentWorktree?: string
        noParent?: boolean
      }
    }
  ) {
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }
    const worktree = await this.resolveWorktreeSelector(worktreeSelector)
    const { lineage, ...metaUpdates } = updates
    const shouldClearPushTarget =
      Object.prototype.hasOwnProperty.call(metaUpdates, 'pushTarget') &&
      metaUpdates.pushTarget === null
    const normalizedMetaUpdates: Partial<WorktreeMeta> = shouldClearPushTarget
      ? { ...metaUpdates, pushTarget: undefined }
      : (metaUpdates as Partial<WorktreeMeta>)
    const persistedMetaUpdates: Partial<WorktreeMeta> = omitUndefinedProperties(
      normalizedMetaUpdates.displayName !== undefined
        ? {
            ...normalizedMetaUpdates,
            pendingFirstAgentMessageRename: false,
            firstAgentMessageRenameError: null
          }
        : normalizedMetaUpdates
    )
    if (shouldClearPushTarget) {
      // Why: omitUndefinedProperties protects ordinary optional RPC fields, but
      // pushTarget:null is an explicit request to remove persisted target metadata.
      persistedMetaUpdates.pushTarget = undefined
    }
    if (lineage?.noParent === true) {
      this.store.removeWorktreeLineage?.(worktree.id)
      this.store.removeWorkspaceLineage?.(worktreeWorkspaceKey(worktree.id))
    } else if (lineage?.parentWorktree) {
      const parent = await this.resolveWorktreeSelector(lineage.parentWorktree)

      this.validateLineageParent(worktree, parent)
      if (!worktree.instanceId || !parent.instanceId) {
        throw new RuntimeLineageError(
          'LINEAGE_PARENT_CONTEXT_MISSING',
          'Worktree instance identity was unavailable.'
        )
      }
      if (!this.store.setWorktreeLineage) {
        throw new RuntimeLineageError(
          'LINEAGE_PARENT_CONTEXT_MISSING',
          'Worktree lineage storage was unavailable.'
        )
      }
      const createdAt = Date.now()
      this.store.setWorktreeLineage(worktree.id, {
        worktreeId: worktree.id,
        worktreeInstanceId: worktree.instanceId,
        parentWorktreeId: parent.id,
        parentWorktreeInstanceId: parent.instanceId,
        origin: 'manual',
        capture: { source: 'manual-action', confidence: 'explicit' },
        createdAt
      })
      this.store.setWorkspaceLineage?.({
        childWorkspaceKey: worktreeWorkspaceKey(worktree.id),
        childInstanceId: worktree.instanceId,
        parentWorkspaceKey: worktreeWorkspaceKey(parent.id),
        parentInstanceId: parent.instanceId,
        origin: 'manual',
        capture: { source: 'manual-action', confidence: 'explicit' },
        createdAt
      })
    }
    this.store.setWorktreeMeta(worktree.id, stripYiruProvenanceMetaUpdates(persistedMetaUpdates))
    // Why: unlike renderer-initiated optimistic updates, CLI callers need an
    // explicit push so the editor refreshes metadata changed outside the UI.
    this.invalidateResolvedWorktreeCache()
    this.notifyWorktreesChanged(worktree.repoId)
    return await this.showManagedWorktree(`id:${worktree.id}`)
  }

  persistManagedWorktreeSortOrder(orderedIds: string[]): { updated: number } {
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }
    const now = Date.now()
    let updated = 0
    for (let i = 0; i < orderedIds.length; i++) {
      this.store.setWorktreeMeta(orderedIds[i], { sortOrder: now - i * 1000 })
      updated++
    }
    this.invalidateResolvedWorktreeCache()
    this.notifyReposChanged()
    return { updated }
  }

  async resolveManagedPrBase(args: {
    repoSelector: string
    prNumber: number
    headRefName?: string
    baseRefName?: string
    isCrossRepository?: boolean
  }): Promise<GitHubPrStartPoint | { error: string }> {
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }
    let repo: Repo
    try {
      repo = await this.resolveRepoSelector(args.repoSelector)
    } catch {
      return { error: 'Repo not found' }
    }
    if (isFolderRepo(repo)) {
      return { error: 'Folder mode does not support creating worktrees.' }
    }
    const sshGitProvider = repo.connectionId ? requireSshGitProvider(repo.connectionId) : null
    const localGitExecOptions = sshGitProvider
      ? undefined
      : getLocalProjectGitExecOptions(this.requireStore(), repo)
    const localWorktreeGitOptions = sshGitProvider
      ? {}
      : getLocalProjectWorktreeGitOptions(this.requireStore(), repo)
    const gitExec = sshGitProvider
      ? (gitArgs: string[]) => sshGitProvider.exec(gitArgs, repo.path)
      : (gitArgs: string[]) => gitExecFileAsync(gitArgs, localGitExecOptions ?? { cwd: repo.path })
    const resolveRemote = sshGitProvider
      ? async () => {
          const { stdout } = await sshGitProvider.exec(['remote'], repo.path)
          const remotes = stdout
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
          if (remotes.includes('origin')) {
            return 'origin'
          }
          if (remotes.length === 1) {
            return remotes[0]!
          }
          if (remotes.length === 0) {
            throw new Error('Repo has no configured git remotes.')
          }
          throw new Error(
            `Repo has multiple remotes (${remotes.join(', ')}) and no default is configured.`
          )
        }
      : () => getDefaultRemote(repo.path, localWorktreeGitOptions)

    // Why: SSH repos can't fetch over the relay's read-only git.exec channel, so
    // route the PR head fetch through the write-capable helper instead of gitExec.
    const fetchRemoteTrackingRef = (remote: string, branch: string): Promise<void> =>
      fetchPrHeadTrackingRef(
        repo,
        sshGitProvider,
        remote,
        branch,
        localGitExecOptions ? { localGitExecOptions } : {}
      )

    return resolveGitHubPrStartPoint({
      repoPath: repo.path,
      prNumber: args.prNumber,
      headRefName: args.headRefName,
      baseRefName: args.baseRefName,
      isCrossRepository: args.isCrossRepository,
      connectionId: repo.connectionId ?? null,
      localGitOptions: localWorktreeGitOptions,
      gitExec,
      fetchRemoteTrackingRef,
      resolveRemote
    })
  }

  async resolveManagedMrBase(args: {
    repoSelector: string
    mrIid: number
    sourceBranch?: string
    targetBranch?: string
    isCrossRepository?: boolean
  }): Promise<
    { baseBranch: string; compareBaseRef?: string; pushTarget?: GitPushTarget } | { error: string }
  > {
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }
    let repo: Repo
    try {
      repo = await this.resolveRepoSelector(args.repoSelector)
    } catch {
      return { error: 'Repo not found' }
    }
    if (isFolderRepo(repo)) {
      return { error: 'Folder mode does not support creating worktrees.' }
    }
    const sshGitProvider = repo.connectionId ? requireSshGitProvider(repo.connectionId) : null
    const localGitExecOptions = sshGitProvider
      ? undefined
      : getLocalProjectGitExecOptions(this.requireStore(), repo)
    const localWorktreeGitOptions = sshGitProvider
      ? {}
      : getLocalProjectWorktreeGitOptions(this.requireStore(), repo)
    const gitExec = sshGitProvider
      ? (gitArgs: string[]) => sshGitProvider.exec(gitArgs, repo.path)
      : (gitArgs: string[]) => gitExecFileAsync(gitArgs, localGitExecOptions ?? { cwd: repo.path })

    let sourceBranch = args.sourceBranch?.trim() ?? ''
    let targetBranch = args.targetBranch?.trim() ?? ''
    let isCrossRepository = args.isCrossRepository === true

    if (!sourceBranch) {
      let remote: string
      try {
        remote = await this.resolveGitLabProjectRemote(
          repo.path,
          repo.forgeRemotePreference,
          repo.connectionId ?? null,
          localWorktreeGitOptions
        )
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Could not resolve git remote.' }
      }
      const knownHosts = await getGlabKnownHosts(repo.connectionId ?? null)
      const projectRef = await getGitLabProjectRefForRemote(
        repo.path,
        remote,
        knownHosts,
        repo.connectionId ?? null,
        localWorktreeGitOptions
      )
      if (!projectRef) {
        return { error: 'No GitLab project found for this repository.' }
      }
      const item = await getGitLabWorkItemByProjectRef(
        repo.path,
        projectRef,
        args.mrIid,
        'mr',
        repo.connectionId ?? null,
        localWorktreeGitOptions
      )
      if (!item || item.type !== 'mr') {
        return { error: `MR !${args.mrIid} not found.` }
      }
      sourceBranch = (item.branchName ?? '').trim()
      targetBranch = (item.baseRefName ?? '').trim()
      if (!sourceBranch) {
        return { error: `MR !${args.mrIid} has no source branch.` }
      }
      if (item.isCrossRepository === true) {
        isCrossRepository = true
      }
    }

    let remote: string
    try {
      remote = await this.resolveGitLabProjectRemote(
        repo.path,
        repo.forgeRemotePreference,
        repo.connectionId ?? null,
        localWorktreeGitOptions
      )
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Could not resolve git remote.' }
    }
    const compareBaseRef = targetBranch ? `refs/remotes/${remote}/${targetBranch}` : undefined
    const fetchRemoteTrackingRef = async (branch: string, ref: string): Promise<void> => {
      await (sshGitProvider
        ? sshGitProvider.fetchRemoteTrackingRef(repo.path, remote, branch, ref)
        : gitExec(['fetch', remote, `+refs/heads/${branch}:${ref}`]))
    }
    // Why: the target/compare branch is optional (it only powers the diff
    // base). A merged MR may have had its target ref deleted, so a fetch
    // failure must NOT abort the whole resolution — that would discard the
    // already-verified source-branch base and silently fall back to the repo
    // default branch. Degrade gracefully by dropping compareBaseRef instead.
    const fetchCompareBaseRef = async (): Promise<boolean> => {
      if (!targetBranch || !compareBaseRef) {
        return false
      }
      try {
        await fetchRemoteTrackingRef(targetBranch, compareBaseRef)
        return true
      } catch (error) {
        console.warn('[runtime:resolveManagedMrBase] optional compare-base fetch failed', {
          remote,
          targetBranch,
          mrIid: args.mrIid,
          error: error instanceof Error ? error.message.split('\n')[0] : String(error)
        })
        return false
      }
    }

    if (isCrossRepository) {
      const mrRef = `refs/merge-requests/${args.mrIid}/head`
      // Why: GitLab exposes fork MR heads on the target project, so mobile/SSH
      // can match desktop without adding the contributor fork as a remote.
      try {
        await (sshGitProvider
          ? sshGitProvider.fetchGitLabMergeRequestHead(repo.path, remote, args.mrIid)
          : gitExec(['fetch', remote, mrRef]))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { error: `Failed to fetch ${mrRef}: ${message.split('\n')[0]}` }
      }
      let sha: string
      try {
        const { stdout } = await gitExec(['rev-parse', '--verify', 'FETCH_HEAD'])
        sha = stdout.trim()
      } catch {
        return { error: `Could not resolve fork MR !${args.mrIid} head after fetch.` }
      }
      if (!sha) {
        return { error: `Empty SHA resolving fork MR !${args.mrIid} head.` }
      }
      const compareBaseFetched = await fetchCompareBaseRef()
      return { baseBranch: sha, ...(compareBaseFetched ? { compareBaseRef } : {}) }
    }

    try {
      await fetchRemoteTrackingRef(sourceBranch, `refs/remotes/${remote}/${sourceBranch}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { error: `Failed to fetch ${remote}/${sourceBranch}: ${message.split('\n')[0]}` }
    }

    const remoteRef = `${remote}/${sourceBranch}`
    try {
      await gitExec(['rev-parse', '--verify', remoteRef])
    } catch {
      return { error: `Remote ref ${remoteRef} does not exist after fetch.` }
    }
    const compareBaseFetched = await fetchCompareBaseRef()
    return {
      baseBranch: remoteRef,
      ...(compareBaseFetched ? { compareBaseRef } : {}),
      pushTarget: { remoteName: remote, branchName: sourceBranch }
    }
  }

  private async resolveGitLabProjectRemote(
    repoPath: string,
    preference?: Repo['forgeRemotePreference'],
    connectionId?: string | null,
    localGitOptions: { wslDistro?: string } = {}
  ): Promise<string> {
    const knownHosts = await getGlabKnownHosts(connectionId)
    const localGitOptionArgs =
      Object.keys(localGitOptions).length > 0 ? ([localGitOptions] as const) : []
    if (preference === 'origin') {
      const origin = await getGitLabProjectRefForRemote(
        repoPath,
        'origin',
        knownHosts,
        connectionId,
        ...localGitOptionArgs
      )
      if (origin) {
        return 'origin'
      }
      throw new Error('No GitLab project found for origin.')
    }
    if (preference === 'upstream') {
      const upstream = await getGitLabProjectRefForRemote(
        repoPath,
        'upstream',
        knownHosts,
        connectionId,
        ...localGitOptionArgs
      )
      if (upstream) {
        return 'upstream'
      }
      const origin = await getGitLabProjectRefForRemote(
        repoPath,
        'origin',
        knownHosts,
        connectionId,
        ...localGitOptionArgs
      )
      if (origin) {
        return 'origin'
      }
      throw new Error('No GitLab project found for upstream or origin.')
    }
    const upstream = await getGitLabProjectRefForRemote(
      repoPath,
      'upstream',
      knownHosts,
      connectionId,
      ...localGitOptionArgs
    )
    if (upstream) {
      return 'upstream'
    }
    const origin = await getGitLabProjectRefForRemote(
      repoPath,
      'origin',
      knownHosts,
      connectionId,
      ...localGitOptionArgs
    )
    if (origin) {
      return 'origin'
    }
    if (connectionId) {
      const provider = requireSshGitProvider(connectionId)
      const { stdout } = await provider.exec(['remote'], repoPath)
      const remotes = stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
      if (remotes.includes('origin')) {
        return 'origin'
      }
      if (remotes.length === 1) {
        return remotes[0]!
      }
      if (remotes.length === 0) {
        throw new Error('Repo has no configured git remotes.')
      }
      throw new Error(
        `Repo has multiple remotes (${remotes.join(', ')}) and no default is configured.`
      )
    }
    return getDefaultRemote(repoPath, localGitOptions)
  }

  private async resolveWorktreeRemovalTarget(
    worktreeSelector: string
  ): Promise<RuntimeWorktreeRemovalTarget> {
    try {
      const worktree = await this.resolveWorktreeSelector(worktreeSelector)
      const removalTarget = {
        id: worktree.id,
        repoId: worktree.repoId,
        path: worktree.path
      }
      return worktree.pushTarget
        ? { ...removalTarget, pushTarget: worktree.pushTarget }
        : removalTarget
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'selector_not_found') {
        throw error
      }
      const removalTarget = parseExactWorktreeIdSelector(worktreeSelector)
      const meta = removalTarget ? this.store?.getWorktreeMeta(removalTarget.id) : undefined
      if (!removalTarget || !meta) {
        throw error
      }
      // Why: delete requests can arrive after Git no longer lists the worktree.
      // Only exact IDs with persisted Yiru metadata are accepted here so
      // branch/path selectors cannot resolve to an arbitrary missing path.
      return meta.pushTarget ? { ...removalTarget, pushTarget: meta.pushTarget } : removalTarget
    }
  }

  private removeWorktreeMetadataAndHistory(store: RuntimeStore, worktreeId: string): void {
    // Why: worktree IDs are path-derived and can be recreated, so removal must
    // purge history and process-local caches before the ID points at new state.
    store.removeWorktreeMeta(worktreeId)
    advertisedUrlWatcher.forgetWorktree(worktreeId)
    deleteWorktreeHistoryDir(worktreeId)
    this.closeHeadlessBrowserPagesForWorktree(worktreeId)
  }

  // Why: headless offscreen browser pages are main-process BrowserWindows that
  // outlive a worktree unless explicitly closed — removing a worktree without
  // closing its open panes leaks the windows for the life of the serve process.
  private closeHeadlessBrowserPagesForWorktree(worktreeId: string): void {
    if (!this.offscreenBrowserBackend || !this.agentBrowserBridge?.tabList) {
      return
    }
    for (const tab of this.agentBrowserBridge.tabList(worktreeId).tabs) {
      void this.offscreenBrowserBackend.closeTab(tab.browserPageId).catch(() => {})
    }
  }

  private rememberPreservedBranchCleanupTarget(
    worktreeId: string,
    result: RemoveWorktreeResult | undefined,
    fallbackHead: string | undefined,
    pushTarget: GitPushTarget | undefined
  ): void {
    if (result?.preservedBranch) {
      const head = result.preservedBranch.head ?? fallbackHead
      if (!head) {
        throw new Error(
          `Cannot safely offer force-delete for preserved branch "${result.preservedBranch.branchName}" without its saved commit.`
        )
      }
      this.preservedBranchCleanupByWorktreeId.set(worktreeId, {
        branchName: result.preservedBranch.branchName,
        head,
        ...(pushTarget ? { pushTarget } : {})
      })
      return
    }
    this.preservedBranchCleanupByWorktreeId.delete(worktreeId)
  }

  private preserveBranchHeadFallback(
    result: RemoveWorktreeResult | undefined,
    fallbackHead: string | undefined
  ): RemoveWorktreeResult {
    if (!result?.preservedBranch || result.preservedBranch.head || !fallbackHead) {
      return result ?? {}
    }
    return {
      ...result,
      preservedBranch: {
        ...result.preservedBranch,
        head: fallbackHead
      }
    }
  }

  async forceDeletePreservedBranch(
    worktreeSelector: string,
    branchName: string,
    expectedHead: string
  ): Promise<ForceDeleteWorktreeBranchResult> {
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }
    const removalTarget = parseExactWorktreeIdSelector(worktreeSelector)
    const cleanupTarget = removalTarget
      ? this.preservedBranchCleanupByWorktreeId.get(removalTarget.id)
      : undefined
    if (
      !removalTarget ||
      !cleanupTarget ||
      cleanupTarget.branchName !== branchName ||
      cleanupTarget.head !== expectedHead
    ) {
      throw new Error(`No preserved branch cleanup is pending for "${branchName}".`)
    }

    const repo = this.store.getRepo(removalTarget.repoId)
    if (!repo) {
      throw new Error('repo_not_found')
    }
    if (isFolderRepo(repo)) {
      throw new Error('Folder workspaces do not have local Git branches.')
    }

    if (repo.connectionId) {
      const provider = requireSshGitProvider(repo.connectionId)
      // Why: SSH must use the write-capable relay RPC; the shared exec-based
      // helper routes through the read-only git.exec allowlist, which rejects
      // the worktree/update-ref/config writes this delete needs.
      await provider.forceDeletePreservedBranch(
        repo.path,
        cleanupTarget.branchName,
        cleanupTarget.head
      )
      await cleanupUnusedWorktreePushTargetRemoteSsh(
        provider,
        repo.path,
        removalTarget.id,
        cleanupTarget.pushTarget,
        this.store
      )
    } else {
      const localWorktreeGitOptions = getLocalProjectWorktreeGitOptions(this.requireStore(), repo)
      await (Object.keys(localWorktreeGitOptions).length > 0
        ? forceDeleteLocalBranch(
            repo.path,
            cleanupTarget.branchName,
            cleanupTarget.head,
            (argv, cwd) => gitExecFileAsync(argv, { cwd, ...localWorktreeGitOptions })
          )
        : forceDeleteLocalBranch(repo.path, cleanupTarget.branchName, cleanupTarget.head))
      await cleanupUnusedWorktreePushTargetRemote(
        repo.path,
        removalTarget.id,
        cleanupTarget.pushTarget,
        this.store,
        localWorktreeGitOptions
      )
    }

    this.preservedBranchCleanupByWorktreeId.delete(removalTarget.id)
    return { deleted: true }
  }

  async removeManagedWorktree(
    worktreeSelector: string,
    force = false,
    runHooks = false
  ): Promise<RemoveWorktreeResult & { warning?: string }> {
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }
    const store = this.store
    const removalTarget = await this.resolveWorktreeRemovalTarget(worktreeSelector)
    const optionsKey = getRuntimeWorktreeRemovalOptionsKey(force, runHooks)
    const inFlightRemoval = this.removeManagedWorktreeInFlight.get(removalTarget.id)
    if (inFlightRemoval) {
      if (inFlightRemoval.optionsKey === optionsKey) {
        return inFlightRemoval.promise
      }
      throw new Error(`Worktree deletion already in progress: ${removalTarget.id}`)
    }

    // Why: runtime callers can race the same workspace through CLI/mobile
    // retries. Share one destructive Git/filesystem operation per worktree ID.
    const removal = (async (): Promise<RemoveWorktreeResult & { warning?: string }> => {
      const repo = store.getRepo(removalTarget.repoId)
      if (!repo) {
        throw new Error('repo_not_found')
      }
      if (isFolderRepo(repo)) {
        if (removalTarget.id === getRuntimeFolderWorkspaceRootId(repo)) {
          throw new Error(
            'Cannot delete the project root workspace. Remove the folder project instead.'
          )
        }
        const localProvider = this.getLocalProvider()
        if (localProvider) {
          // Why: folder workspace deletion has no Git removal phase where PTYs
          // would otherwise be swept; tear them down before hiding the workspace.
          await killAllProcessesForWorktree(removalTarget.id, {
            runtime: this,
            localProvider,
            onPtyStopped: this.onPtyStopped ?? undefined
          }).catch((err) => {
            console.warn(`[worktree-teardown] failed for ${removalTarget.id}:`, err)
          })
        }
        this.removeWorktreeMetadataAndHistory(store, removalTarget.id)
        this.preservedBranchCleanupByWorktreeId.delete(removalTarget.id)
        this.invalidateResolvedWorktreeCache()
        this.notifyWorktreesChanged(repo.id)
        return {}
      }
      const provider = repo.connectionId ? requireSshGitProvider(repo.connectionId) : null
      const fsProvider = repo.connectionId ? getSshFilesystemProvider(repo.connectionId) : null
      const localWorktreeGitOptions = repo.connectionId
        ? {}
        : getLocalProjectWorktreeGitOptions(this.requireStore(), repo)
      const hasLocalWorktreeGitOptions = Object.keys(localWorktreeGitOptions).length > 0
      const registeredWorktrees = repo.connectionId
        ? await provider!.listWorktrees(repo.path)
        : hasLocalWorktreeGitOptions
          ? await listWorktreesStrict(repo.path, localWorktreeGitOptions)
          : await listWorktreesStrict(repo.path)
      const removedMeta = store.getWorktreeMeta(removalTarget.id)
      const removedPushTarget = removedMeta?.pushTarget ?? removalTarget.pushTarget
      const registeredWorktree = findRegisteredDeletableWorktree(
        repo.path,
        removalTarget.path,
        registeredWorktrees
      )
      if (!registeredWorktree) {
        let canCleanOrphanedDirectory = false
        if (
          canCleanupUnregisteredYiruWorktreeDirectory({
            meta: removedMeta
          })
        ) {
          if (repo.connectionId) {
            if (!fsProvider) {
              throw new Error('SSH filesystem provider unavailable')
            }
            if (!fsProvider.lstat) {
              throw new Error('SSH filesystem provider lstat unavailable')
            }
            canCleanOrphanedDirectory = await canSafelyRemoveOrphanedWorktreeDirectory(
              removalTarget.path,
              repo.path,
              (path) => fsProvider.lstat!(path),
              (path) => fsProvider.readFile(path)
            )
          } else {
            const access = getLocalWorktreePathAccess(localWorktreeGitOptions)
            canCleanOrphanedDirectory =
              !isDangerousWorktreeRemovalPath(removalTarget.path, repo.path) &&
              (await canSafelyRemoveOrphanedWorktreeDirectory(
                toLocalWorktreeRuntimePath(removalTarget.path, localWorktreeGitOptions),
                toLocalWorktreeRuntimePath(repo.path, localWorktreeGitOptions),
                access.statPath,
                access.readPath
              ))
          }
        }
        if (canCleanOrphanedDirectory) {
          assertWorktreeDoesNotContainRegisteredWorktree(removalTarget.path, registeredWorktrees)
          if (!force) {
            throw new Error(ORPHANED_WORKTREE_DIRECTORY_MESSAGE)
          }
          if (repo.connectionId) {
            const removalGate = await this.acquireFileWatcherRemoval(
              removalTarget.path,
              repo.connectionId
            )
            let removalCompleted = false
            try {
              await this.stopPtysForDestructiveWorktreeRemoval(removalTarget.id, repo.connectionId)
              await fsProvider!.deletePath(removalTarget.path, true)
              removalCompleted = true
            } finally {
              await removalGate.finish(removalCompleted)
            }
            await cleanupUnusedWorktreePushTargetRemoteSsh(
              provider!,
              repo.path,
              removalTarget.id,
              removedPushTarget,
              store
            )
          } else {
            const removalGate = await this.acquireFileWatcherRemoval(removalTarget.path)
            let removalCompleted = false
            try {
              await this.stopPtysForDestructiveWorktreeRemoval(removalTarget.id)
              await removeLocalWorktreePath(removalTarget.path, localWorktreeGitOptions)
              removalCompleted = true
            } finally {
              await removalGate.finish(removalCompleted)
            }
            await cleanupUnusedWorktreePushTargetRemote(
              repo.path,
              removalTarget.id,
              removedPushTarget,
              store,
              localWorktreeGitOptions
            )
          }
          this.clearOptimisticReconcileToken(removalTarget.id)
          this.removeWorktreeMetadataAndHistory(store, removalTarget.id)
          this.preservedBranchCleanupByWorktreeId.delete(removalTarget.id)
          this.invalidateResolvedWorktreeCache()
          invalidateAuthorizedRootsCache()
          this.notifyWorktreesChanged(repo.id)
          return {}
        }
        if (!repo.connectionId) {
          const access = getLocalWorktreePathAccess(localWorktreeGitOptions)
          const runtimeWorktreePath = toLocalWorktreeRuntimePath(
            removalTarget.path,
            localWorktreeGitOptions
          )
          if (
            await canCleanupUnregisteredYiruLeftoverDirectory({
              meta: removedMeta,
              worktreePath: removalTarget.path,
              runtimeWorktreePath,
              repo,
              runtimeRepoPath: toLocalWorktreeRuntimePath(repo.path, localWorktreeGitOptions),
              registeredWorktrees,
              statPath: access.statPath,
              isGitRepository: (path) => isLocalRuntimeGitRepository(path, localWorktreeGitOptions)
            })
          ) {
            if (!force) {
              throw new Error(ORPHANED_WORKTREE_DIRECTORY_MESSAGE)
            }
            const removalGate = await this.acquireFileWatcherRemoval(removalTarget.path)
            let removalCompleted = false
            try {
              await this.stopPtysForDestructiveWorktreeRemoval(removalTarget.id)
              await removeLocalWorktreePath(removalTarget.path, localWorktreeGitOptions)
              removalCompleted = true
            } finally {
              await removalGate.finish(removalCompleted)
            }
            await cleanupUnusedWorktreePushTargetRemote(
              repo.path,
              removalTarget.id,
              removedPushTarget,
              store,
              localWorktreeGitOptions
            )
            this.clearOptimisticReconcileToken(removalTarget.id)
            this.removeWorktreeMetadataAndHistory(store, removalTarget.id)
            this.preservedBranchCleanupByWorktreeId.delete(removalTarget.id)
            this.invalidateResolvedWorktreeCache()
            invalidateAuthorizedRootsCache()
            this.notifyWorktreesChanged(repo.id)
            return {}
          }
        }
        if (await isRuntimeWorktreePathMissing(repo, removalTarget.path, localWorktreeGitOptions)) {
          if (!force && !removedMeta) {
            // Why: without persisted metadata, require the renderer recovery
            // path before deleting Yiru-only state for an unregistered path.
            throw new Error(UNREGISTERED_MISSING_WORKTREE_MESSAGE)
          }
          // Why: a manually deleted worktree is already gone from Git and disk.
          // Finish runtime metadata cleanup without requiring force or touching
          // any unregistered path that still exists.
          await (repo.connectionId
            ? cleanupUnusedWorktreePushTargetRemoteSsh(
                provider!,
                repo.path,
                removalTarget.id,
                removedPushTarget,
                store
              )
            : cleanupUnusedWorktreePushTargetRemote(
                repo.path,
                removalTarget.id,
                removedPushTarget,
                store,
                localWorktreeGitOptions
              ))
          this.clearOptimisticReconcileToken(removalTarget.id)
          this.removeWorktreeMetadataAndHistory(store, removalTarget.id)
          this.preservedBranchCleanupByWorktreeId.delete(removalTarget.id)
          this.invalidateResolvedWorktreeCache()
          invalidateAuthorizedRootsCache()
          this.notifyWorktreesChanged(repo.id)
          return {}
        }
        throw new Error(`Refusing to delete unregistered worktree path: ${removalTarget.path}`)
      }
      const canonicalWorktreePath = registeredWorktree.path
      const deleteBranch = removedMeta?.preserveBranchOnDelete !== true

      // Why: a Git lock must block before archive hooks or linked-path cleanup
      // mutate the workspace; dirty-file force is a separate permission.
      try {
        assertWorktreeUnlockedForRemoval(registeredWorktree)
      } catch (error) {
        throw new Error(formatWorktreeRemovalError(error, canonicalWorktreePath, force))
      }

      // Why: a prior forced Windows recovery can delete the directory but leave
      // Git's stale registration; recover and verify it before clearing metadata.
      if (
        !repo.connectionId &&
        force === true &&
        process.platform === 'win32' &&
        (isWindowsAbsolutePathLike(canonicalWorktreePath) || !!localWorktreeGitOptions.wslDistro) &&
        removedMeta &&
        (await isRuntimeWorktreePathMissing(repo, canonicalWorktreePath, localWorktreeGitOptions))
      ) {
        const removalResult = await removeStaleLocalWorktreeRegistrationAfterFilesystemRemoval({
          canonicalWorktreePath,
          repoPath: repo.path,
          localWorktreeGitOptions,
          registeredWorktree,
          deleteBranch
        })
        await cleanupUnusedWorktreePushTargetRemote(
          repo.path,
          removalTarget.id,
          removedPushTarget,
          store,
          localWorktreeGitOptions
        )
        this.rememberPreservedBranchCleanupTarget(
          removalTarget.id,
          removalResult,
          registeredWorktree.head,
          removedPushTarget
        )
        this.clearOptimisticReconcileToken(removalTarget.id)
        this.removeWorktreeMetadataAndHistory(store, removalTarget.id)
        this.invalidateResolvedWorktreeCache()
        invalidateAuthorizedRootsCache()
        this.notifyWorktreesChanged(repo.id)
        return removalResult ?? {}
      }
      if (repo.connectionId) {
        const remoteRemoveOptions = !deleteBranch ? { deleteBranch } : {}
        const removalGate = await this.acquireFileWatcherRemoval(
          canonicalWorktreePath,
          repo.connectionId
        )
        let rawRemovalResult: RemoveWorktreeResult | undefined
        let removalCompleted = false
        try {
          await this.stopPtysForDestructiveWorktreeRemoval(removalTarget.id, repo.connectionId)
          rawRemovalResult = await (Object.keys(remoteRemoveOptions).length > 0
            ? provider!.removeWorktree(canonicalWorktreePath, force, remoteRemoveOptions)
            : provider!.removeWorktree(canonicalWorktreePath, force))
          removalCompleted = true
        } finally {
          await removalGate.finish(removalCompleted)
        }
        const removalResult = this.preserveBranchHeadFallback(
          rawRemovalResult,
          registeredWorktree.head
        )
        await cleanupUnusedWorktreePushTargetRemoteSsh(
          provider!,
          repo.path,
          removalTarget.id,
          removedPushTarget,
          store
        )
        this.rememberPreservedBranchCleanupTarget(
          removalTarget.id,
          removalResult,
          registeredWorktree.head,
          removedPushTarget
        )
        this.clearOptimisticReconcileToken(removalTarget.id)
        this.removeWorktreeMetadataAndHistory(store, removalTarget.id)
        this.invalidateResolvedWorktreeCache()
        invalidateAuthorizedRootsCache()
        this.notifyWorktreesChanged(repo.id)
        return removalResult ?? {}
      }

      const hooks = getEffectiveHooks(repo)
      let warning: string | undefined
      if (hooks?.scripts.archive && runHooks) {
        const result = await runHook(
          'archive',
          canonicalWorktreePath,
          repo,
          undefined,
          hasLocalWorktreeGitOptions ? localWorktreeGitOptions : undefined
        )
        if (!result.success) {
          console.error(`[hooks] archive hook failed for ${canonicalWorktreePath}:`, result.output)
        }
      } else if (hooks?.scripts.archive) {
        // Runtime RPC calls have no renderer trust prompt, so hooks require explicit CLI opt-in.
        warning = `yiru.yaml archive hook skipped for ${canonicalWorktreePath}; pass --run-hooks to run it.`
        console.warn(`[hooks] ${warning}`)
      }

      const refreshedWorktrees = hasLocalWorktreeGitOptions
        ? await listWorktreesStrict(repo.path, localWorktreeGitOptions)
        : await listWorktreesStrict(repo.path)
      const refreshedRegisteredWorktree = findRegisteredDeletableWorktree(
        repo.path,
        canonicalWorktreePath,
        refreshedWorktrees
      )
      if (!refreshedRegisteredWorktree) {
        throw new Error(
          `Worktree registration changed during deletion: ${canonicalWorktreePath}. Retry deletion.`
        )
      }
      try {
        // Why: an archive hook can race another Git client that locks the row;
        // recheck before linked-path, watcher, or terminal teardown side effects.
        assertWorktreeUnlockedForRemoval(refreshedRegisteredWorktree)
      } catch (error) {
        throw new Error(formatWorktreeRemovalError(error, canonicalWorktreePath, force))
      }

      const linkedPaths = repo.symlinkPaths ?? []
      const ignoredLinkedPaths = force
        ? []
        : await findExistingWorktreeSymlinkPaths(canonicalWorktreePath, linkedPaths)
      try {
        await (hasLocalWorktreeGitOptions
          ? assertWorktreeCleanForRemoval(canonicalWorktreePath, force, {
              ...localWorktreeGitOptions,
              ...(ignoredLinkedPaths.length > 0
                ? { ignoredUntrackedPaths: ignoredLinkedPaths }
                : {})
            })
          : ignoredLinkedPaths.length > 0
            ? assertWorktreeCleanForRemoval(canonicalWorktreePath, force, {
                ignoredUntrackedPaths: ignoredLinkedPaths
              })
            : assertWorktreeCleanForRemoval(canonicalWorktreePath, force))
      } catch (error) {
        if (!isOrphanCompatiblePreflightError(error)) {
          throw new Error(formatWorktreeRemovalError(error, canonicalWorktreePath, force))
        }
        // Why: Git can still classify this as an orphan after preflight;
        // retain strict PTY teardown before any recursive fallback deletion.
      }

      let removalResult: RemoveWorktreeResult | undefined
      const removalGate = await this.acquireFileWatcherRemoval(canonicalWorktreePath)
      let removalCompleted = false
      try {
        // Why: linked-path deletion is destructive too; PTYs must release every
        // handle before Windows or WSL filesystem cleanup starts.
        await this.stopPtysForDestructiveWorktreeRemoval(removalTarget.id)

        if (linkedPaths.length > 0) {
          await removeWorktreeLinkedPaths(canonicalWorktreePath, linkedPaths)
        }

        try {
          const removeOptions = {
            ...(!deleteBranch ? { deleteBranch } : {}),
            // Why: removal already validated the Git row under the selected
            // project runtime; keep branch cleanup on that same canonical row.
            knownRemovedWorktree: refreshedRegisteredWorktree,
            ...localWorktreeGitOptions
          }
          removalResult = this.preserveBranchHeadFallback(
            await removeWorktree(repo.path, canonicalWorktreePath, force, removeOptions),
            refreshedRegisteredWorktree.head
          )
        } catch (error) {
          // Why: Git for Windows can deregister a clean worktree before its
          // recursive filesystem deletion fails transiently.
          const recoveredRemovalResult = await recoverLocalWindowsWorktreeRemoval({
            error,
            force,
            canonicalWorktreePath,
            repoPath: repo.path,
            localWorktreeGitOptions,
            registeredWorktree: refreshedRegisteredWorktree,
            deleteBranch,
            closeWatcher: (worktreePath) => this.closeFileWatchersForRemoval(worktreePath)
          })
          if (recoveredRemovalResult) {
            removalResult = recoveredRemovalResult
            removalCompleted = true
          } else if (isOrphanedWorktreeError(error)) {
            const access = getLocalWorktreePathAccess(localWorktreeGitOptions)
            if (
              await canSafelyRemoveOrphanedWorktreeDirectory(
                toLocalWorktreeRuntimePath(canonicalWorktreePath, localWorktreeGitOptions),
                toLocalWorktreeRuntimePath(repo.path, localWorktreeGitOptions),
                access.statPath,
                access.readPath
              )
            ) {
              await this.closeFileWatchersForRemoval(canonicalWorktreePath)
              await removeLocalWorktreePath(canonicalWorktreePath, localWorktreeGitOptions).catch(
                () => {}
              )
            } else {
              console.warn(
                `[worktrees] Refusing recursive cleanup for unproven worktree directory: ${canonicalWorktreePath}`
              )
            }
            // Why: `git worktree remove` failed, so git's internal worktree tracking
            // (`.git/worktrees/<name>`) is still intact. Without pruning, `git worktree
            // list` continues to show the stale entry and the branch it had checked out
            // remains locked — other worktrees cannot check it out.
            await gitExecFileAsync(['worktree', 'prune'], {
              cwd: repo.path,
              ...localWorktreeGitOptions
            }).catch(() => {})
            await cleanupUnusedWorktreePushTargetRemote(
              repo.path,
              removalTarget.id,
              removedPushTarget,
              store,
              localWorktreeGitOptions
            )
            this.clearOptimisticReconcileToken(removalTarget.id)
            this.removeWorktreeMetadataAndHistory(store, removalTarget.id)
            this.preservedBranchCleanupByWorktreeId.delete(removalTarget.id)
            this.invalidateResolvedWorktreeCache()
            invalidateAuthorizedRootsCache()
            this.notifyWorktreesChanged(repo.id)
            removalCompleted = true
            return {
              ...(warning ? { warning } : {})
            }
          } else {
            throw new Error(formatWorktreeRemovalError(error, canonicalWorktreePath, force))
          }
        }
        removalCompleted = true
      } finally {
        await removalGate.finish(removalCompleted)
      }

      await cleanupUnusedWorktreePushTargetRemote(
        repo.path,
        removalTarget.id,
        removedPushTarget,
        store,
        localWorktreeGitOptions
      )
      this.rememberPreservedBranchCleanupTarget(
        removalTarget.id,
        removalResult,
        refreshedRegisteredWorktree.head,
        removedPushTarget
      )
      this.clearOptimisticReconcileToken(removalTarget.id)
      this.removeWorktreeMetadataAndHistory(store, removalTarget.id)
      this.invalidateResolvedWorktreeCache()
      invalidateAuthorizedRootsCache()
      this.notifyWorktreesChanged(repo.id)
      return {
        ...removalResult,
        ...(warning ? { warning } : {})
      }
    })()
    this.removeManagedWorktreeInFlight.set(removalTarget.id, { optionsKey, promise: removal })
    try {
      return await removal
    } finally {
      if (this.removeManagedWorktreeInFlight.get(removalTarget.id)?.promise === removal) {
        this.removeManagedWorktreeInFlight.delete(removalTarget.id)
      }
    }
  }

  async renameTerminal(handle: string, title: string | null): Promise<RuntimeTerminalRename> {
    const pty = this.getLivePtyForHandle(handle)
    if (pty) {
      pty.pty.title = title
      // Why: a manual rename must outrank later agent OSC title updates (which
      // win by timestamp), so stamp it as the freshest title.
      pty.pty.titleUpdatedAt = Date.now()
      this.terminalSessions.commitPtyState(pty.pty.ptyId, { pty: pty.pty })
      this.touchMobileSessionSnapshotsForPty(pty.pty.ptyId)
      // Why: without a renderer the rename only lived on the live pty and was
      // lost on restart. Persist customTitle so a headless rebuild keeps it.
      if (!this.notifier?.renameTerminal && pty.pty.tabId) {
        this.persistHeadlessTerminalTitle(pty.pty.worktreeId, pty.pty.tabId, title)
      }
      for (const leaf of this.terminalSessions.listGraphLeaves()) {
        if (leaf.ptyId === pty.pty.ptyId) {
          this.notifier?.renameTerminal(leaf.tabId, title)
          return { handle, tabId: leaf.tabId, title }
        }
      }
      return { handle, tabId: pty.pty.tabId ?? pty.record.tabId, title }
    }
    this.assertGraphReady()
    const { leaf } = this.getLiveLeafForHandle(handle)
    this.notifier?.renameTerminal(leaf.tabId, title)
    return { handle, tabId: leaf.tabId, title }
  }

  private async resolveAgentTerminalCreateOptions(
    workspace: TerminalWorkspaceLaunchScope,
    opts: TerminalCreateOptions
  ): Promise<TerminalCreateOptions> {
    // Why: raw shell commands like `codex exec` must remain user-authored shell.
    // Only unmanaged, repo-backed, bare agent launches get Settings defaults.
    if (
      !opts.command ||
      opts.env ||
      opts.launchConfig ||
      opts.launchAgent ||
      opts.startupCommandDelivery ||
      opts.claudeAgentTeamsSourceCommand ||
      !workspace.repo ||
      !this.store
    ) {
      return opts
    }

    const settings = this.store.getSettings()
    const platform = this.getAgentLaunchPlatformForWorkspace(workspace)
    const isRemote = repoIsRemote(workspace.repo)
    const queuedShell = resolveLocalWindowsAgentStartupShell({
      platform,
      isRemote,
      terminalWindowsShell: settings.terminalWindowsShell
    })
    const agent = resolveBareAgentLaunchCommand({
      command: opts.command,
      settings,
      platform,
      isRemote
    })
    if (!agent) {
      return opts
    }

    const startupPlan = buildAgentStartupPlan({
      agent,
      prompt: '',
      cmdOverrides: settings.agentCmdOverrides ?? {},
      agentArgs: resolveTuiAgentLaunchArgs(agent, settings.agentDefaultArgs),
      agentEnv: resolveTuiAgentLaunchEnv(agent, settings.agentDefaultEnv),
      platform,
      shell: queuedShell,
      isRemote,
      allowEmptyPromptLaunch: true
    })
    if (!startupPlan) {
      return opts
    }

    await opts.beforeAgentTrust?.()
    if (workspace.connectionId) {
      await this.markRemoteWorkspaceTrustedForAgent(agent, workspace.connectionId, workspace.path)
    } else {
      this.markLocalWorkspaceTrustedForAgent(agent, workspace.path)
    }

    return {
      ...opts,
      command: startupPlan.launchCommand,
      ...(startupPlan.env ? { env: startupPlan.env } : {}),
      launchConfig: startupPlan.launchConfig,
      launchAgent: agent,
      startupCommandDelivery: startupPlan.startupCommandDelivery
    }
  }

  async createTerminal(
    worktreeSelector?: string,
    opts: TerminalCreateOptions = {}
  ): Promise<RuntimeTerminalCreate> {
    const presentation = resolveTerminalPresentation(opts)
    const requiresRendererFocus = opts.presentation === 'focused' || opts.focus === true
    const availableAuthoritativeWindow = this.getAvailableAuthoritativeWindow()
    // Why: pre-diff createTerminal fell back to the renderer's active worktree
    // when no selector was provided. The new background-spawn branch hard-
    // requires a resolvable selector, so route the no-selector case through
    // the renderer IPC path to preserve that behavior.
    const rendererWindow = opts.rendererBacked === true ? availableAuthoritativeWindow : null
    const shouldCreateInBackground =
      worktreeSelector !== undefined &&
      ((!requiresRendererFocus && opts.rendererBacked !== true) ||
        // Why: `yiru serve` exposes the local runtime without a renderer
        // window. Renderer-backed Codex terminals are preferred for the app,
        // but headless CLI users still need a usable terminal handle.
        (opts.rendererBacked === true && rendererWindow === null))

    if (shouldCreateInBackground) {
      if (!this.ptyController?.spawn) {
        throw new Error('runtime_unavailable')
      }
      const workspace = await this.resolveTerminalWorkspaceLaunchScope(worktreeSelector)
      const launchOpts = await this.resolveAgentTerminalCreateOptions(workspace, opts)
      const cwd =
        this.resolveWorkspaceTerminalStartupCwd(workspace, launchOpts.cwd) ?? workspace.path
      const preAllocatedHandle = this.createPreAllocatedTerminalHandle()
      // Why: mint tabId in main before spawn so paneKey is known at PTY env
      // build time. Hook-based agent status (Claude/Codex/Cursor/Gemini) keys
      // off `${tabId}:${leafId}` — without these vars set on the PTY, the
      // hook payload arrives with an empty paneKey and the renderer cannot
      // attribute the event. Use a stable UUID leaf because hooks reject the
      // legacy numeric pane keys after the pane-id migration.
      const hintedTabId = launchOpts.tabId?.trim()
      const canAdoptPaneIdentity =
        hintedTabId !== undefined &&
        isValidHostTerminalTabId(hintedTabId) &&
        launchOpts.leafId !== undefined &&
        isTerminalLeafId(launchOpts.leafId)
      const tabId = canAdoptPaneIdentity ? (hintedTabId as string) : randomUUID()
      const leafId = canAdoptPaneIdentity ? (launchOpts.leafId as string) : randomUUID()
      const paneKey = makePaneKey(tabId, leafId)
      const launchToken = launchOpts.launchConfig
        ? (launchOpts.launchToken ?? randomUUID())
        : undefined
      const baseEnv = {
        ...launchOpts.env,
        ...(launchToken ? { YIRU_AGENT_LAUNCH_TOKEN: launchToken } : {})
      }
      const claudeAgentTeamsSourceCommand =
        launchOpts.claudeAgentTeamsSourceCommand?.trim() || launchOpts.command?.trim() || undefined
      const claudeAgentTeamsMode = this.store?.getSettings?.().claudeAgentTeamsMode
      const effectiveClaudeAgentTeamsMode = inferCapturedClaudeAgentTeamsMode(
        launchOpts.launchConfig,
        claudeAgentTeamsSourceCommand,
        claudeAgentTeamsMode
      )
      const agentTeamsPlan = await buildClaudeAgentTeamsLaunchPlan({
        command: claudeAgentTeamsSourceCommand,
        mode: effectiveClaudeAgentTeamsMode,
        baseEnv: {
          ...process.env,
          ...baseEnv
        },
        createTeamEnv: (shimDir, shimBin) =>
          this.claudeAgentTeams.createLaunchEnv({
            leaderHandle: preAllocatedHandle,
            baseEnv: {
              ...process.env,
              ...baseEnv
            },
            shimDir,
            shimBin
          }).env
      })
      const sequencedStartupCommand =
        agentTeamsPlan &&
        claudeAgentTeamsSourceCommand &&
        launchOpts.command &&
        claudeAgentTeamsSourceCommand !== launchOpts.command
          ? agentTeamsPlan.command
          : undefined
      const effectiveLaunchConfig =
        launchOpts.launchConfig && agentTeamsPlan
          ? {
              ...launchOpts.launchConfig,
              agentCommand: launchOpts.launchConfig.agentCommand
                ? effectiveClaudeAgentTeamsMode === 'in-process' || process.platform === 'win32'
                  ? addClaudeTeammateModeInProcess(launchOpts.launchConfig.agentCommand)
                  : addClaudeTeammateModeAuto(launchOpts.launchConfig.agentCommand)
                : agentTeamsPlan.command,
              agentEnv: {
                ...launchOpts.launchConfig.agentEnv,
                ...agentTeamsPlan.env
              }
            }
          : launchOpts.launchConfig
      // Why: setup/agent sequencing wraps the PTY launch in a wait shell before
      // Claude Agent Teams runs. Preserve the direct Claude command separately
      // so the wrapper can exec the teammate-mode variant after setup completes.
      const env = this.buildTerminalWorkspaceEnv(
        workspace,
        {
          ...baseEnv,
          ...(sequencedStartupCommand
            ? { [SETUP_AGENT_SEQUENCE_STARTUP_COMMAND_ENV]: sequencedStartupCommand }
            : {})
        },
        paneKey,
        tabId,
        agentTeamsPlan?.env
      )
      await launchOpts.beforeSpawn?.()
      const result = await this.ptyController.spawn({
        cols: 120,
        rows: 40,
        cwd,
        command: sequencedStartupCommand
          ? launchOpts.command
          : (agentTeamsPlan?.command ?? launchOpts.command),
        launchAgent: launchOpts.launchAgent,
        commandDelivery: 'provider',
        startupCommandDelivery: launchOpts.startupCommandDelivery,
        env,
        envToDelete: mergeTerminalEnvDeletions(launchOpts.envToDelete, agentTeamsPlan?.envToDelete),
        telemetry: launchOpts.telemetry,
        connectionId: workspace.connectionId,
        worktreeId: workspace.id,
        preAllocatedHandle,
        tabId,
        leafId,
        ...(launchOpts.sessionId ? { sessionId: launchOpts.sessionId } : {}),
        // Why: a headless-created pane has no renderer session writer. Persist
        // its tab/leaf binding at spawn so a later promoted window reattaches
        // the live daemon or SSH PTY instead of replacing it with a fresh one.
        // Re-check freshly: the entry-time snapshot can go stale across the
        // awaits above if the authoritative window is destroyed mid-spawn.
        ...(launchOpts.persistHostSessionBinding || this.getAvailableAuthoritativeWindow() === null
          ? { persistHostSessionBinding: true }
          : {})
      })
      this.registerPreAllocatedHandleForPty(result.id, preAllocatedHandle)
      this.registerPty(result.id, workspace.id, workspace.connectionId)
      const pty = this.getOrCreatePtyWorktreeRecord(result.id)
      if (pty) {
        if (launchOpts.title) {
          const observedAt = this.nextTitleObservationSequence()
          pty.title = launchOpts.title
          pty.titleUpdatedAt = observedAt
          this.setPtyManagementTitleFromObservedTitle(pty, launchOpts.title, observedAt)
        } else {
          pty.title = null
          pty.titleUpdatedAt = null
        }
        pty.tabId = tabId
        pty.paneKey = paneKey
        pty.launchConfig = effectiveLaunchConfig
          ? copySleepingAgentLaunchConfig(effectiveLaunchConfig)
          : null
        pty.launchToken = launchToken ?? null
        pty.launchAgent = launchOpts.launchAgent ?? null
        this.terminalSessions.commitPtyState(pty.ptyId, { pty })
      }
      const handle = pty ? this.issuePtyHandle(pty) : preAllocatedHandle
      if (pty && launchOpts.deferMobileSessionPublish !== true) {
        this.publishPtyBackedMobileSessionTerminal(workspace.id, pty, {
          tabId,
          leafId,
          title: launchOpts.title ?? null,
          activate: presentation === 'focused',
          // Why: explicit background presentation may carry legacy activate
          // metadata from an already-owned renderer pane; don't select it on mobile.
          selectIfNoActiveTab: presentation !== 'background',
          ...(launchOpts.viewMode ? { viewMode: launchOpts.viewMode } : {}),
          ...(cwd !== workspace.path ? { startupCwd: cwd } : {})
        })
      }
      let surface: RuntimeTerminalCreate['surface'] = 'background'
      let warning: string | undefined
      if (presentation !== 'background' && this.notifier?.revealTerminalSession) {
        try {
          // Why: after the PTY is spawned, renderer tab adoption is best-effort;
          // failing here must not strand a live process without returning a handle.
          // Pass the pre-minted tabId so the renderer adopts under the same id
          // already baked into the PTY env — keeps paneKey hook attribution intact.
          await this.notifier.revealTerminalSession(workspace.id, {
            ptyId: result.id,
            title: launchOpts.title ?? null,
            ...(cwd !== workspace.path ? { cwd } : {}),
            ...(effectiveLaunchConfig ? { launchConfig: effectiveLaunchConfig } : {}),
            ...(launchToken ? { launchToken } : {}),
            ...(launchOpts.launchAgent ? { launchAgent: launchOpts.launchAgent } : {}),
            ...(launchOpts.viewMode ? { viewMode: launchOpts.viewMode } : {}),
            activate: presentation === 'focused',
            ...(presentation ? { presentation } : {}),
            tabId,
            leafId
          })
          surface = 'visible'
        } catch (err) {
          console.warn(`[terminal-create] failed to create inactive tab for ${result.id}:`, err)
          warning = createTerminalRevealWarning(handle, err)
        }
      } else if (presentation !== 'background') {
        warning = createTerminalRevealWarning(handle)
      }
      return {
        handle,
        tabId,
        paneKey,
        ptyId: result.id,
        worktreeId: workspace.id,
        title: launchOpts.title ?? null,
        surface,
        ...(warning ? { warning } : {})
      }
    }

    this.assertGraphReady()
    const win = rendererWindow ?? this.getAuthoritativeWindow()
    // Why: mirrors browserTabCreate — when no worktree is specified, pass
    // undefined so the renderer uses its current active worktree.
    const workspace = worktreeSelector
      ? await this.resolveTerminalWorkspaceLaunchScope(worktreeSelector)
      : null
    const launchOpts = workspace
      ? await this.resolveAgentTerminalCreateOptions(workspace, opts)
      : opts
    const worktreeId = workspace?.id
    const cwd = workspace
      ? this.resolveWorkspaceTerminalStartupCwd(workspace, launchOpts.cwd)
      : launchOpts.cwd
    const requestId = randomUUID()

    // Why: terminal creation is a renderer-side Zustand store operation (like
    // browser tab creation). The main process sends a request, the renderer
    // creates the tab and replies with the tabId so we can resolve the handle.
    await launchOpts.beforeSpawn?.()
    const reply = await new Promise<{ tabId: string; title: string }>((resolve, reject) => {
      const timer = setTimeout(() => {
        ipcMain.removeListener('terminal:tabCreateReply', handler)
        reject(new Error('Terminal creation timed out'))
      }, 10_000)

      const handler = (
        event: Electron.IpcMainEvent,
        r: { requestId: string; tabId?: string; title?: string; error?: string }
      ): void => {
        if (event.sender !== win.webContents || r.requestId !== requestId) {
          return
        }
        clearTimeout(timer)
        ipcMain.removeListener('terminal:tabCreateReply', handler)
        if (r.error) {
          reject(new Error(r.error))
        } else {
          resolve({ tabId: r.tabId!, title: r.title ?? launchOpts.title ?? '' })
        }
      }
      ipcMain.on('terminal:tabCreateReply', handler)
      win.webContents.send('terminal:requestTabCreate', {
        requestId,
        worktreeId,
        command: launchOpts.command,
        cwd,
        ...(launchOpts.env ? { env: launchOpts.env } : {}),
        ...(launchOpts.envToDelete ? { envToDelete: launchOpts.envToDelete } : {}),
        ...(launchOpts.launchConfig ? { launchConfig: launchOpts.launchConfig } : {}),
        ...(launchOpts.launchToken ? { launchToken: launchOpts.launchToken } : {}),
        ...(launchOpts.launchAgent ? { launchAgent: launchOpts.launchAgent } : {}),
        ...(launchOpts.viewMode ? { viewMode: launchOpts.viewMode } : {}),
        startupCommandDelivery: launchOpts.startupCommandDelivery,
        title: launchOpts.title,
        activate: presentation === 'focused',
        ...(presentation ? { presentation } : {})
      })
    })

    // Why: the renderer created the tab immediately, but the graph sync that
    // publishing the authority graph may not have arrived yet. Wait for the leaf to
    // appear so we can return a valid handle the caller can use right away.
    const handle = await this.waitForTerminalHandle(reply.tabId)
    return {
      handle,
      tabId: reply.tabId,
      worktreeId: worktreeId ?? '',
      title: reply.title,
      surface: 'visible'
    }
  }

  async launchAgentTerminal(
    worktreeSelector: string,
    opts: { agent: TuiAgent; prompt: string; title?: string }
  ): Promise<RuntimeTerminalCreate> {
    const worktree = await this.resolveWorktreeSelector(worktreeSelector)
    const repo = this.store?.getRepo(worktree.repoId)
    if (!repo) {
      throw new Error('Repository for the selected workspace is no longer available.')
    }
    const startup = this.buildStartupForAgent(repo, opts.agent, opts.prompt)
    if (repo.connectionId) {
      await this.markRemoteWorkspaceTrustedForAgent(opts.agent, repo.connectionId, worktree.path)
    } else {
      this.markLocalWorkspaceTrustedForAgent(opts.agent, worktree.path)
    }
    return await this.createTerminal(`id:${worktree.id}`, {
      command: startup.startup.command,
      env: startup.startup.env,
      ...(startup.startup.launchConfig ? { launchConfig: startup.startup.launchConfig } : {}),
      launchAgent: startup.agent,
      startupCommandDelivery: startup.startup.startupCommandDelivery,
      telemetry: startup.startup.telemetry,
      title: opts.title
    })
  }

  async createAgentTerminal(
    worktreeSelector: string,
    opts: {
      agent: TuiAgent
      title?: string
      presentation?: RuntimeTerminalPresentation
      beforeAgentTrust?: () => void | Promise<void>
      beforeSpawn?: () => void | Promise<void>
    }
  ): Promise<RuntimeTerminalCreate> {
    const workspace = await this.resolveTerminalWorkspaceLaunchScope(worktreeSelector)
    const repo = workspace.repo
    if (!repo) {
      throw new Error('Repository for the selected workspace is no longer available.')
    }
    const startup = this.buildStartupForAgent(repo, opts.agent, '')
    // Why: remote control can be revoked while agent settings and host routing are resolved.
    await opts.beforeAgentTrust?.()
    if (workspace.connectionId) {
      await this.markRemoteWorkspaceTrustedForAgent(
        opts.agent,
        workspace.connectionId,
        workspace.path
      )
    } else {
      this.markLocalWorkspaceTrustedForAgent(opts.agent, workspace.path)
    }
    return await this.createTerminal(`id:${workspace.id}`, {
      command: startup.startup.command,
      env: startup.startup.env,
      ...(startup.startup.launchConfig ? { launchConfig: startup.startup.launchConfig } : {}),
      launchAgent: startup.agent,
      viewMode: 'chat',
      startupCommandDelivery: startup.startup.startupCommandDelivery,
      telemetry: startup.startup.telemetry,
      title: opts.title,
      presentation: opts.presentation ?? 'background',
      beforeSpawn: opts.beforeSpawn
    })
  }

  async createMobileSessionTerminal(
    worktreeSelector: string,
    opts: {
      afterTabId?: string
      targetGroupId?: string
      command?: string
      cwd?: string
      env?: Record<string, string>
      envToDelete?: string[]
      startupCommandDelivery?: WorktreeStartupLaunch['startupCommandDelivery']
      agent?: TuiAgent
      agentPrompt?: string
      launchConfig?: SleepingAgentLaunchConfig
      launchAgent?: TuiAgent
      viewMode?: 'terminal' | 'chat'
      activate?: boolean
      clientMutationId?: string
      signal?: AbortSignal
    } = {}
  ): Promise<RuntimeMobileSessionCreateTerminalResult> {
    const mutationId = opts.clientMutationId
    if (!mutationId) {
      return this.runCreateMobileSessionTerminal(worktreeSelector, opts)
    }
    const mutationKey = `${worktreeSelector}\0${mutationId}`
    // Why: a retried create (double-tap, reconnect replay) with the same
    // idempotency key must return the in-flight operation instead of spawning a
    // duplicate terminal. Successes are kept briefly so a retry whose response
    // was lost in transit reuses the created terminal; failures are dropped
    // immediately so a retry can start a fresh create.
    const inflight = this.mobileTerminalCreateByMutationId.get(mutationKey)
    if (inflight) {
      return inflight
    }
    const run = this.runCreateMobileSessionTerminal(worktreeSelector, opts)
    this.mobileTerminalCreateByMutationId.set(mutationKey, run)
    const drop = (): void => {
      if (this.mobileTerminalCreateByMutationId.get(mutationKey) === run) {
        this.mobileTerminalCreateByMutationId.delete(mutationKey)
      }
    }
    void run.then(() => {
      setTimeout(drop, MOBILE_TERMINAL_CREATE_RESULT_TTL_MS).unref?.()
    }, drop)
    return run
  }

  private async runCreateMobileSessionTerminal(
    worktreeSelector: string,
    opts: {
      afterTabId?: string
      targetGroupId?: string
      command?: string
      cwd?: string
      env?: Record<string, string>
      envToDelete?: string[]
      startupCommandDelivery?: WorktreeStartupLaunch['startupCommandDelivery']
      agent?: TuiAgent
      agentPrompt?: string
      launchConfig?: SleepingAgentLaunchConfig
      launchAgent?: TuiAgent
      viewMode?: 'terminal' | 'chat'
      activate?: boolean
      clientMutationId?: string
      signal?: AbortSignal
    } = {}
  ): Promise<RuntimeMobileSessionCreateTerminalResult> {
    this.assertGraphReady()
    const workspace = await this.resolveTerminalWorkspaceLaunchScope(worktreeSelector)
    const worktreeId = workspace.id
    const cwd = this.resolveWorkspaceTerminalStartupCwd(workspace, opts.cwd)
    this.hydrateHeadlessMobileSessionTabsFromWorkspaceSession(worktreeId)
    let afterDesktopTabId: string | undefined
    if (opts.afterTabId) {
      const snapshot = this.mobileSessionTabsByWorktree.get(worktreeId)
      const anchor = snapshot?.tabs.find((tab) => tab.id === opts.afterTabId)
      if (!anchor) {
        throw new Error('after_tab_not_found')
      }
      afterDesktopTabId = anchor.type === 'terminal' ? anchor.parentTabId : anchor.id
    }
    const startupCommand = await this.resolveMobileSessionTerminalCommand(workspace, opts)

    const win = this.getAvailableAuthoritativeWindow()
    if (!win) {
      return await this.createHeadlessMobileSessionTerminal(
        worktreeId,
        opts.activate !== false,
        opts.afterTabId,
        {
          command: startupCommand.command,
          cwd,
          env: startupCommand.env,
          envToDelete: startupCommand.envToDelete,
          startupCommandDelivery: startupCommand.startupCommandDelivery,
          launchAgent: startupCommand.launchAgent,
          viewMode: opts.viewMode,
          targetGroupId: opts.targetGroupId,
          launchConfig: startupCommand.launchConfig
        }
      )
    }
    const requestId = randomUUID()
    const reply = await new Promise<{ tabId: string; title: string }>((resolve, reject) => {
      const timer = setTimeout(() => {
        ipcMain.removeListener('terminal:tabCreateReply', handler)
        opts.signal?.removeEventListener('abort', onAbort)
        reject(new Error('Terminal creation timed out'))
      }, 10_000)
      // Why: a dead client connection cancels the wait; the renderer tab (and
      // its shell) stays alive for the host and mirrors on reconnect (#7718).
      const onAbort = (): void => {
        clearTimeout(timer)
        ipcMain.removeListener('terminal:tabCreateReply', handler)
        reject(new Error('client_disconnected'))
      }

      const handler = (
        event: Electron.IpcMainEvent,
        r: { requestId: string; tabId?: string; title?: string; error?: string }
      ): void => {
        if (event.sender !== win.webContents || r.requestId !== requestId) {
          return
        }
        clearTimeout(timer)
        ipcMain.removeListener('terminal:tabCreateReply', handler)
        opts.signal?.removeEventListener('abort', onAbort)
        if (r.error) {
          reject(new Error(r.error))
        } else {
          resolve({ tabId: r.tabId!, title: r.title ?? '' })
        }
      }
      opts.signal?.addEventListener('abort', onAbort, { once: true })
      ipcMain.on('terminal:tabCreateReply', handler)
      win.webContents.send('terminal:requestTabCreate', {
        requestId,
        worktreeId,
        afterTabId: afterDesktopTabId,
        targetGroupId: opts.targetGroupId,
        command: startupCommand.command,
        cwd,
        ...(startupCommand.env ? { env: startupCommand.env } : {}),
        ...(startupCommand.envToDelete ? { envToDelete: startupCommand.envToDelete } : {}),
        ...(startupCommand.launchConfig ? { launchConfig: startupCommand.launchConfig } : {}),
        ...(startupCommand.launchAgent ? { launchAgent: startupCommand.launchAgent } : {}),
        ...(opts.viewMode ? { viewMode: opts.viewMode } : {}),
        startupCommandDelivery: startupCommand.startupCommandDelivery,
        source: 'runtime-session',
        activate: opts.activate
      })
    })

    if (opts.activate !== false) {
      this.notifier?.focusTerminal(reply.tabId, worktreeId, null)
    }
    // Why: register the wait before the renderer's PTY spawn arrives so that
    // spawn (registerPty) can publish the pty-backed surface main-side even if
    // graph-sync is stalled (#7587). Removed in the finally below.
    const pendingCreateKey = `${worktreeId}::${reply.tabId}`
    // Why: a rescue publishes into the active group (opts.targetGroupId is not
    // threaded); the renderer's reconciling publication then moves the tab to the
    // requested group, so any wrong-group placement is cosmetic and stall-window-only.
    this.pendingMobileTerminalCreatesByKey.set(pendingCreateKey, {
      activate: opts.activate !== false,
      selectIfNoActiveTab: true,
      ...(opts.viewMode ? { viewMode: opts.viewMode } : {})
    })
    try {
      // Why: the PTY spawn and the tabCreate reply race on independent IPC
      // channels; if the spawn already registered, publish immediately so the
      // wait resolves without depending on a graph sync.
      this.ensurePtyBackedMobileSurfaceForRendererTab(worktreeId, reply.tabId)
      const surface = await this.waitForMobileTerminalSurface(worktreeId, reply.tabId, {
        timeoutMs: MOBILE_TERMINAL_SURFACE_TIMEOUT_MS,
        signal: opts.signal
      })
      if (this.isReadyMobileTerminalSurface(surface)) {
        return surface
      }
      const readySurface = await this.waitForMobileTerminalSurface(worktreeId, reply.tabId, {
        timeoutMs: MOBILE_TERMINAL_READY_FALLBACK_MS,
        requireReady: true,
        signal: opts.signal
      }).catch(() => null)
      if (readySurface) {
        return readySurface
      }
      if (opts.signal?.aborted) {
        // Why: nobody is waiting for this create anymore; do not materialize
        // or roll back — the renderer's own publication settles the tab.
        throw new Error('client_disconnected')
      }
      const pendingSurface = this.findMobileTerminalSurface(worktreeId, reply.tabId)
      if (!pendingSurface) {
        throw new Error('Timed out waiting for terminal surface after creation')
      }
      // Why: hidden/occluded renderer windows can publish the tab shell before
      // TerminalPane mounts and spawns the PTY. Materialize into the same
      // identity so later renderer focus adopts instead of creating another tab.
      return await this.createHeadlessMobileSessionTerminal(
        worktreeId,
        opts.activate !== false,
        opts.afterTabId,
        {
          command: startupCommand.command,
          cwd,
          env: startupCommand.env,
          envToDelete: startupCommand.envToDelete,
          startupCommandDelivery: startupCommand.startupCommandDelivery,
          identity: { tabId: pendingSurface.tab.parentTabId, leafId: pendingSurface.tab.leafId },
          launchAgent: startupCommand.launchAgent,
          viewMode: opts.viewMode,
          targetGroupId: opts.targetGroupId,
          launchConfig: startupCommand.launchConfig
        }
      )
    } catch (error) {
      // Why: publication latency (throttled/hidden renderer), not spawn failure,
      // can trip the surface timeout. Rescue only when a live PTY actually backs
      // the tab — gating on a surface would let a handle-less shell (or a failed
      // materialize) resolve as success and skip the ghost-tab rollback (#7587).
      if (this.findLiveRegisteredPtyForRendererTab(worktreeId, reply.tabId)) {
        const rescued = this.ensurePtyBackedMobileSurfaceForRendererTab(worktreeId, reply.tabId)
        if (rescued) {
          return rescued
        }
      }
      // Why: don't roll back when (a) the client connection died — the wait
      // was cancelled, not the spawn — or (b) a live shell already backs the
      // tab (its pane key may simply not be registered yet). Killing a real
      // terminal the host user can see is the "tab dies after ~10s" bug (#7718).
      if (
        isClientDisconnectedError(error) ||
        this.hasLiveShellForRendererTab(worktreeId, reply.tabId)
      ) {
        throw error
      }
      // Why: the renderer created the tab but no live PTY backs it (true PTY
      // spawn/handle failure). Roll the half-created tab back via the renderer
      // close path so it can't linger as a ghost in mobile snapshots, then
      // surface the failure to the caller.
      this.notifier?.closeTerminal(reply.tabId)
      throw error
    } finally {
      this.pendingMobileTerminalCreatesByKey.delete(pendingCreateKey)
    }
  }

  private async resolveMobileSessionTerminalCommand(
    workspace: TerminalWorkspaceLaunchScope,
    opts: {
      command?: string
      env?: Record<string, string>
      envToDelete?: string[]
      startupCommandDelivery?: WorktreeStartupLaunch['startupCommandDelivery']
      agent?: TuiAgent
      agentPrompt?: string
      launchConfig?: SleepingAgentLaunchConfig
      launchAgent?: TuiAgent
    }
  ): Promise<{
    command?: string
    env?: Record<string, string>
    envToDelete?: string[]
    startupCommandDelivery?: WorktreeStartupLaunch['startupCommandDelivery']
    launchConfig?: SleepingAgentLaunchConfig
    launchAgent?: TuiAgent
  }> {
    if (opts.command || !opts.agent) {
      return {
        command: opts.command,
        env: opts.env,
        envToDelete: opts.envToDelete,
        launchConfig: opts.launchConfig,
        launchAgent: opts.launchAgent,
        startupCommandDelivery: opts.startupCommandDelivery
      }
    }
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }
    const settings = this.store.getSettings()
    if (!isTuiAgentEnabled(opts.agent, settings.disabledTuiAgents)) {
      throw new Error('Selected agent is disabled. Choose an enabled agent before creating.')
    }
    // Why: mobile may be running on iOS while the actual terminal shell is
    // Windows/macOS/Linux or an SSH Linux host; quote for the host shell.
    const platform = this.getAgentLaunchPlatformForWorkspace(workspace)
    // Why: an SSH workspace runs the CLI through the relay's public command.
    const isRemote = workspace.repo ? repoIsRemote(workspace.repo) : repoIsRemote(workspace)
    const queuedShell = resolveLocalWindowsAgentStartupShell({
      platform,
      isRemote,
      terminalWindowsShell: settings.terminalWindowsShell
    })
    const startupPlan = buildAgentStartupPlan({
      agent: opts.agent,
      prompt: opts.agentPrompt ?? '',
      cmdOverrides: settings.agentCmdOverrides ?? {},
      agentArgs: resolveTuiAgentLaunchArgs(opts.agent, settings.agentDefaultArgs),
      agentEnv: resolveTuiAgentLaunchEnv(opts.agent, settings.agentDefaultEnv),
      platform,
      shell: queuedShell,
      isRemote,
      allowEmptyPromptLaunch: true
    })
    if (!startupPlan) {
      throw new Error(`Could not build launch command for ${opts.agent}.`)
    }
    if (opts.agentPrompt && startupPlan.followupPrompt) {
      throw new Error(`Agent ${opts.agent} does not support startup prompt quick commands.`)
    }
    if (workspace.connectionId) {
      await this.markRemoteWorkspaceTrustedForAgent(
        opts.agent,
        workspace.connectionId,
        workspace.path
      )
    } else {
      this.markLocalWorkspaceTrustedForAgent(opts.agent, workspace.path)
    }
    return {
      command: startupPlan.launchCommand,
      env: startupPlan.env,
      envToDelete: opts.envToDelete,
      launchConfig: startupPlan.launchConfig,
      launchAgent: opts.agent,
      startupCommandDelivery: startupPlan.startupCommandDelivery
    }
  }

  private async createHeadlessMobileSessionTerminal(
    worktreeId: string,
    activate: boolean,
    afterTabId?: string,
    opts: {
      command?: string
      cwd?: string
      env?: Record<string, string>
      envToDelete?: string[]
      startupCommandDelivery?: WorktreeStartupLaunch['startupCommandDelivery']
      identity?: { tabId: string; leafId: string; sessionId?: string }
      launchAgent?: TuiAgent
      viewMode?: 'terminal' | 'chat'
      targetGroupId?: string
      launchConfig?: SleepingAgentLaunchConfig
    } = {}
  ): Promise<RuntimeMobileSessionCreateTerminalResult> {
    const workspace = await this.resolveTerminalWorkspaceLaunchScope(`id:${worktreeId}`)
    const cwd = this.resolveWorkspaceTerminalStartupCwd(workspace, opts.cwd)
    // Why: SshPtyProvider treats sessionId as a relay reattach request. Only
    // synthesize local serve ids; SSH fresh terminals must call pty.spawn.
    const stableSessionId =
      opts.identity?.sessionId ?? (workspace.connectionId ? undefined : `serve-${randomUUID()}`)
    const terminal = await this.createTerminal(`id:${worktreeId}`, {
      focus: false,
      command: opts.command,
      cwd,
      env: opts.env,
      envToDelete: opts.envToDelete,
      ...(opts.launchConfig ? { launchConfig: opts.launchConfig } : {}),
      ...(opts.launchAgent ? { launchAgent: opts.launchAgent } : {}),
      ...(opts.viewMode ? { viewMode: opts.viewMode } : {}),
      startupCommandDelivery: opts.startupCommandDelivery,
      ...(opts.identity
        ? {
            tabId: opts.identity.tabId,
            leafId: opts.identity.leafId,
            ...(stableSessionId ? { sessionId: stableSessionId } : {})
          }
        : stableSessionId
          ? { sessionId: stableSessionId }
          : {}),
      persistHostSessionBinding: true,
      // Why: this method publishes the authoritative snapshot (with the target
      // group) below; skip the intermediate publish to avoid a wrong-group flash.
      deferMobileSessionPublish: true
    })
    const livePty = this.getLivePtyForHandle(terminal.handle)
    if (!livePty) {
      throw new Error('terminal_handle_stale')
    }
    const parentTabId = livePty.pty.tabId ?? `pty:${livePty.pty.ptyId}`
    const leafId = parsePaneKey(livePty.pty.paneKey ?? '')?.leafId ?? randomUUID()
    if (opts.viewMode) {
      // Why: the runtime-owned binding must survive a serve restart with the
      // same initial mode, not fall back to a later client's local default.
      this.persistHeadlessSessionTabProps(worktreeId, parentTabId, { viewMode: opts.viewMode })
    }
    const existing = this.mobileSessionTabsByWorktree.get(worktreeId)
    const existingSurface =
      existing?.tabs.find(
        (candidate): candidate is RuntimeMobileSessionTerminalTab =>
          candidate.type === 'terminal' &&
          candidate.parentTabId === parentTabId &&
          candidate.leafId === leafId
      ) ?? null
    const parentLayout = this.buildMaterializedHeadlessParentLayout(
      leafId,
      livePty.pty.ptyId,
      existingSurface?.parentLayout
    )
    const tab: RuntimeMobileSessionTerminalTab = {
      type: 'terminal',
      id: `${parentTabId}::${leafId}`,
      parentTabId,
      leafId,
      ptyId: livePty.pty.ptyId,
      title: terminal.title ?? livePty.pty.title ?? 'Terminal',
      ...(cwd ? { startupCwd: cwd } : {}),
      ...(opts.launchAgent ? { launchAgent: opts.launchAgent } : {}),
      ...(opts.viewMode ? { viewMode: opts.viewMode } : {}),
      parentLayout,
      isActive: activate
    }
    const tabs = (existing?.tabs ?? [])
      .filter((candidate) => candidate.id !== tab.id)
      .map((candidate) => ({
        ...candidate,
        ...(candidate.type === 'terminal' && candidate.parentTabId === parentTabId
          ? { parentLayout }
          : {}),
        isActive: activate ? false : candidate.isActive
      }))
    const insertAfter = afterTabId ? tabs.findIndex((candidate) => candidate.id === afterTabId) : -1
    if (insertAfter >= 0) {
      tabs.splice(insertAfter + 1, 0, tab)
    } else {
      tabs.push(tab)
    }
    const next: RuntimeMobileSessionTabsSnapshot = {
      worktree: worktreeId,
      publicationEpoch: `headless:${Date.now().toString(36)}`,
      snapshotVersion: (existing?.snapshotVersion ?? 0) + 1,
      // Why: activating the new tab also focuses its group, so when "+" targeted
      // a specific split group, make that group active too.
      activeGroupId:
        activate && opts.targetGroupId
          ? opts.targetGroupId
          : (existing?.activeGroupId ?? this.getHeadlessMobileSessionGroupId(worktreeId)),
      activeTabId: activate ? tab.id : (existing?.activeTabId ?? null),
      activeTabType: activate ? 'terminal' : (existing?.activeTabType ?? null),
      tabGroups: this.buildHeadlessMobileSessionTabGroups(
        worktreeId,
        tabs,
        activate ? tab : null,
        existing?.tabGroups,
        opts.targetGroupId ? { tabId: parentTabId, groupId: opts.targetGroupId } : undefined
      ),
      // Why: keep the group split geometry when a new tab is created, otherwise
      // opening a terminal while split loses the groups' arrangement.
      ...(existing?.tabGroupLayout ? { tabGroupLayout: existing.tabGroupLayout } : {}),
      tabs
    }
    this.mobileSessionTabsByWorktree.set(worktreeId, next)
    const result = this.toMobileSessionTabsResult(next)
    for (const listener of this.mobileSessionTabListeners) {
      listener(result)
    }
    const created = result.tabs.find((candidate) => candidate.id === tab.id)
    if (!created || created.type !== 'terminal') {
      throw new Error('terminal_handle_stale')
    }
    return {
      tab: created,
      publicationEpoch: result.publicationEpoch,
      snapshotVersion: result.snapshotVersion
    }
  }

  private waitForMobileTerminalSurface(
    worktreeId: string,
    parentTabId: string,
    options: { timeoutMs?: number; requireReady?: boolean; signal?: AbortSignal } = {}
  ): Promise<RuntimeMobileSessionCreateTerminalResult> {
    const timeoutMs = options.timeoutMs ?? MOBILE_TERMINAL_SURFACE_TIMEOUT_MS
    const existing = this.findMobileTerminalSurface(worktreeId, parentTabId, options)
    if (existing) {
      return Promise.resolve(existing)
    }
    if (options.signal?.aborted) {
      return Promise.reject(new Error('client_disconnected'))
    }

    return new Promise<RuntimeMobileSessionCreateTerminalResult>((resolve, reject) => {
      const cleanup = (): void => {
        clearTimeout(timer)
        options.signal?.removeEventListener('abort', onAbort)
        this.terminalSessions.removeGraphSyncCallback(check)
      }
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error('Timed out waiting for terminal surface after creation'))
      }, timeoutMs)
      // Why: a dead client connection cancels the wait immediately instead of
      // running down the timeout and triggering rollback (#7718).
      const onAbort = (): void => {
        cleanup()
        reject(new Error('client_disconnected'))
      }
      options.signal?.addEventListener('abort', onAbort, { once: true })

      const check = (): void => {
        const next = this.findMobileTerminalSurface(worktreeId, parentTabId, options)
        if (!next) {
          return
        }
        cleanup()
        resolve(next)
      }
      this.terminalSessions.addGraphSyncCallback(check)
      check()
    })
  }

  private findMobileTerminalSurface(
    worktreeId: string,
    parentTabId: string,
    options: { requireReady?: boolean } = {}
  ): RuntimeMobileSessionCreateTerminalResult | null {
    const snapshot = this.mobileSessionTabsByWorktree.get(worktreeId)
    if (!snapshot) {
      return null
    }
    const result = this.toMobileSessionTabsResult(snapshot)
    const tab = result.tabs.find(
      (candidate) => candidate.type === 'terminal' && candidate.parentTabId === parentTabId
    )
    if (!tab || tab.type !== 'terminal') {
      return null
    }
    const surface = {
      tab,
      publicationEpoch: result.publicationEpoch,
      snapshotVersion: result.snapshotVersion
    }
    if (options.requireReady === true && !this.isReadyMobileTerminalSurface(surface)) {
      return null
    }
    return surface
  }

  // Why: for an in-flight mobile create whose surface hasn't published yet,
  // publish it main-side from the live renderer PTY so the create doesn't wait
  // on a stalled graph sync and destroy the session (#7587). No-op unless a
  // matching create is pending and a live bound PTY exists; never double-inserts.
  private ensurePtyBackedMobileSurfaceForRendererTab(
    worktreeId: string,
    tabId: string
  ): RuntimeMobileSessionCreateTerminalResult | null {
    const pending = this.pendingMobileTerminalCreatesByKey.get(`${worktreeId}::${tabId}`)
    if (!pending) {
      return null
    }
    const existing = this.findMobileTerminalSurface(worktreeId, tabId)
    if (
      existing &&
      this.isReadyMobileTerminalSurface(existing) &&
      (pending.viewMode === undefined || existing.tab.viewMode === pending.viewMode)
    ) {
      // Why: the renderer's ready publication already landed with the intended
      // mode; only a pending shell still needs the main-side PTY rescue.
      return existing
    }
    const pty = this.findLiveRegisteredPtyForRendererTab(worktreeId, tabId)
    const leafId = pty ? parsePaneKey(pty.paneKey ?? '')?.leafId : undefined
    if (!pty || !leafId) {
      return existing
    }
    this.publishPtyBackedMobileSessionTerminal(worktreeId, pty, {
      tabId,
      leafId,
      title: null,
      activate: pending.activate,
      selectIfNoActiveTab: pending.selectIfNoActiveTab,
      ...(pending.viewMode ? { viewMode: pending.viewMode } : {})
    })
    // Why: waitForMobileTerminalSurface's check closures are drained only inside
    // syncWindowGraph; a main-side publish must drain them too or the pending
    // wait won't observe the insertion (mirrors syncWindowGraph's drain).
    this.terminalSessions.notifyGraphSynced()
    return this.findMobileTerminalSurface(worktreeId, tabId)
  }

  private findLiveRegisteredPtyForRendererTab(
    worktreeId: string,
    tabId: string
  ): RuntimePtyWorktreeRecord | null {
    for (const pty of this.terminalSessions.listPtyRecords()) {
      if (
        pty.worktreeId === worktreeId &&
        pty.tabId === tabId &&
        pty.connected &&
        parsePaneKey(pty.paneKey ?? '')?.leafId
      ) {
        return pty
      }
    }
    return null
  }

  // Why: rollback guard, looser than findLiveRegisteredPtyForRendererTab — a
  // shell whose pane key hasn't registered yet can't be surface-rescued, but
  // it is still a real terminal the create timeout must not kill (#7718).
  private hasLiveShellForRendererTab(worktreeId: string, tabId: string): boolean {
    for (const pty of this.terminalSessions.listPtyRecords()) {
      if (pty.worktreeId === worktreeId && pty.tabId === tabId && pty.connected) {
        return true
      }
    }
    return false
  }

  private isReadyMobileTerminalSurface(
    surface: RuntimeMobileSessionCreateTerminalResult | null
  ): boolean {
    return (
      surface?.tab.status === 'ready' &&
      typeof surface.tab.terminal === 'string' &&
      surface.tab.terminal.length > 0
    )
  }

  private waitForTerminalHandle(tabId: string, timeoutMs = 10_000): Promise<string> {
    const existing = this.resolveHandleForTab(tabId)
    if (existing) {
      return Promise.resolve(existing)
    }

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.terminalSessions.removeGraphSyncCallback(check)
        reject(new Error('Timed out waiting for terminal handle after creation'))
      }, timeoutMs)

      const check = (): void => {
        const handle = this.resolveHandleForTab(tabId)
        if (handle) {
          clearTimeout(timer)
          this.terminalSessions.removeGraphSyncCallback(check)
          resolve(handle)
        }
      }
      this.terminalSessions.addGraphSyncCallback(check)
      // Why: the graph sync may have fired between the initial check and
      // callback registration. Re-check immediately to avoid a missed wake-up.
      check()
    })
  }

  // Why: mobile clients may subscribe before the PTY spawns (the left pane
  // of a new workspace). Instead of bailing with a bare scrollback+end,
  // wait for the PTY to appear so the subscribe can proceed with phone-fit.
  waitForLeafPtyId(handle: string, timeoutMs = 10_000, signal?: AbortSignal): Promise<string> {
    const leaf = this.resolveLeafForHandle(handle)
    if (leaf?.ptyId) {
      return Promise.resolve(leaf.ptyId)
    }

    // Why: when the ptyId changes from null to a real value, the old handle
    // is invalidated in the authority's handle index. Capture the tabId+leafId
    // now so we can look up the leaf directly even after handle invalidation.
    const record = this.terminalSessions.getTerminalHandle(handle)
    const savedTabId = record?.tabId ?? null
    const savedLeafId = record?.leafId ?? null

    return new Promise<string>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null
      let check: () => void = () => {}
      const cleanup = (): void => {
        if (timer) {
          clearTimeout(timer)
          timer = null
        }
        this.terminalSessions.removeGraphSyncCallback(check)
        signal?.removeEventListener('abort', onAbort)
      }
      const finish = (ptyId: string): void => {
        cleanup()
        resolve(ptyId)
      }
      const fail = (error: Error): void => {
        cleanup()
        reject(error)
      }
      const onAbort = (): void => {
        fail(new Error('request_aborted'))
      }
      if (signal?.aborted) {
        reject(new Error('request_aborted'))
        return
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      timer = setTimeout(() => {
        fail(new Error('Timed out waiting for PTY to spawn'))
      }, timeoutMs)

      check = (): void => {
        // Try the handle first (works if handle wasn't invalidated yet)
        let ptyId = this.resolveLeafForHandle(handle)?.ptyId
        // Why: when ptyId transitions null→real, issueHandle invalidates the
        // old handle. Fall back to direct leaf lookup by the saved coordinates.
        if (!ptyId && savedTabId && savedLeafId) {
          const directLeaf = this.terminalSessions.getGraphLeafByKey(
            this.getLeafKey(savedTabId, savedLeafId)
          )
          ptyId = directLeaf?.ptyId ?? null
        }
        if (ptyId) {
          finish(ptyId)
        }
      }
      this.terminalSessions.addGraphSyncCallback(check)
      check()
    })
  }

  // Why: never-mounted tabs have no attached PTY or mobile snapshot; synthetic
  // handles need the ptyId so the renderer can mount the exact owning tab.
  requestRendererTerminalTabMount(handle: string): boolean {
    const record = this.terminalSessions.getTerminalHandle(handle)
    if (!record?.worktreeId) {
      return false
    }
    const tabId = record.tabId.startsWith('pty:') ? undefined : record.tabId
    const ptyId = record.ptyId ?? undefined
    if (!tabId && !ptyId) {
      return false
    }
    try {
      this.getAuthoritativeWindow().webContents.send('terminal:requestTabMount', {
        worktreeId: record.worktreeId,
        ...(tabId ? { tabId } : {}),
        ...(ptyId ? { ptyId } : {})
      })
      return true
    } catch {
      // No authoritative window (shutdown/headless): the subscribe keeps its
      // existing empty-snapshot fallback.
      return false
    }
  }

  getRendererTerminalSerializerGeneration(ptyId: string): number {
    return this.ptyController?.getRendererSerializerGeneration?.(ptyId) ?? 0
  }

  getRendererTerminalSerializerGenerationForHandle(handle: string): number {
    const ptyId = this.terminalSessions.getTerminalHandle(handle)?.ptyId
    return ptyId ? this.getRendererTerminalSerializerGeneration(ptyId) : 0
  }

  replaceHeadlessTerminalFromRendererSnapshotForRecovery(
    ptyId: string,
    snapshot: {
      data: string
      cols: number
      rows: number
      cwd?: string | null
      oscLinks?: TerminalOscLinkRange[]
    },
    trailingOutput: { data: string; seq: number }[] = []
  ): void {
    if (!snapshot.data) {
      return
    }
    // Why: a redraw byte can create a suffix-only model before the restored
    // renderer settles. Replace it with the exact snapshot already sent mobile.
    this.providerSnapshotPreferredPtys.add(ptyId)
    this.disposeHeadlessTerminal(ptyId)
    this.seedHeadlessTerminal(
      ptyId,
      snapshot.data,
      { cols: snapshot.cols, rows: snapshot.rows },
      { cwd: snapshot.cwd, oscLinks: snapshot.oscLinks }
    )
    for (const chunk of trailingOutput) {
      this.trackHeadlessTerminalData(ptyId, chunk.data, chunk.seq)
    }
    // The seed's write chain already owns subsequent live bytes; suppress the
    // ordinary on-data hydration path from replacing this known-good seed.
    this.terminalSessions.setEmulatorHydration(ptyId, 'done')
  }

  waitForRendererTerminalSerializer(
    ptyId: string,
    afterGeneration: number,
    timeoutMs?: number,
    signal?: AbortSignal
  ): Promise<boolean> {
    return (
      this.ptyController?.waitForRendererSerializer?.(ptyId, afterGeneration, timeoutMs, signal) ??
      Promise.resolve(false)
    )
  }

  // Why: a leaf appears in the graph before its PTY spawns. If we issue a
  // handle while ptyId is null, the next graph sync after PTY spawn will
  // change ptyId and invalidate the handle. Wait for a connected PTY so
  // the handle is stable and immediately usable for send/read/wait.
  private countLeavesInTab(tabId: string): number {
    let count = 0
    for (const leaf of this.terminalSessions.listGraphLeaves()) {
      if (leaf.tabId === tabId) {
        count++
      }
    }
    return count
  }

  private resolveHandleForTab(tabId: string): string | null {
    for (const leaf of this.terminalSessions.listGraphLeaves()) {
      if (leaf.tabId === tabId && leaf.ptyId !== null) {
        return this.issueHandle(leaf)
      }
    }
    return null
  }

  async focusTerminal(handle: string): Promise<RuntimeTerminalFocus> {
    const pty = this.getLivePtyForHandle(handle)
    if (pty) {
      if (!pty.pty.connected) {
        throw new Error('terminal_exited')
      }
      const parsedPaneKey = parsePaneKey(pty.pty.paneKey ?? '')
      const revealed = await this.notifier?.revealTerminalSession?.(pty.pty.worktreeId, {
        ptyId: pty.pty.ptyId,
        title: getLatestPtyTitle(pty.pty),
        ...(pty.pty.launchConfig
          ? { launchConfig: copySleepingAgentLaunchConfig(pty.pty.launchConfig) }
          : {}),
        ...(pty.pty.launchToken ? { launchToken: pty.pty.launchToken } : {}),
        ...(pty.pty.launchAgent ? { launchAgent: pty.pty.launchAgent } : {}),
        ...(pty.pty.tabId !== null ? { tabId: pty.pty.tabId } : {}),
        ...(parsedPaneKey ? { leafId: parsedPaneKey.leafId } : {})
      })
      return {
        handle,
        tabId: revealed?.tabId ?? pty.pty.tabId ?? pty.record.tabId,
        worktreeId: pty.pty.worktreeId
      }
    }
    this.assertGraphReady()
    const { leaf } = this.getLiveLeafForHandle(handle)
    this.notifier?.focusTerminal(leaf.tabId, leaf.worktreeId, leaf.leafId)
    return { handle, tabId: leaf.tabId, worktreeId: leaf.worktreeId }
  }

  async revealGlobalAssistantChat(handle: string): Promise<string> {
    const pty = this.getRuntimeOwnedPtyForHandle(handle)
    if (!pty || pty.pty.worktreeId !== GLOBAL_ASSISTANT_WORKTREE_ID) {
      throw new Error('global_assistant_terminal_not_found')
    }
    if (!pty.pty.connected) {
      throw new Error('terminal_exited')
    }
    if (!this.notifier?.revealTerminalSession) {
      throw new Error('runtime_unavailable')
    }
    const parsedPaneKey = parsePaneKey(pty.pty.paneKey ?? '')
    // Why: the assistant keeps a synthetic PTY owner, but its visible surface
    // is an ordinary terminal/chat tab in the local floating workspace.
    const revealed = await this.notifier.revealTerminalSession(FLOATING_TERMINAL_WORKTREE_ID, {
      ptyId: pty.pty.ptyId,
      // Why: agent OSC titles change during startup; the app-owned tab should
      // keep its stable product identity rather than becoming "Claude Code".
      title: 'Yiru Assistant',
      ...(pty.pty.launchConfig
        ? { launchConfig: copySleepingAgentLaunchConfig(pty.pty.launchConfig) }
        : {}),
      ...(pty.pty.launchToken ? { launchToken: pty.pty.launchToken } : {}),
      ...(pty.pty.launchAgent ? { launchAgent: pty.pty.launchAgent } : {}),
      ...(pty.pty.tabId !== null ? { tabId: pty.pty.tabId } : {}),
      ...(parsedPaneKey ? { leafId: parsedPaneKey.leafId } : {}),
      viewMode: 'chat',
      isGlobalAssistant: true,
      activate: false,
      presentation: 'background'
    })
    return revealed?.tabId ?? pty.pty.tabId ?? pty.record.tabId
  }

  async closeTerminal(handle: string): Promise<RuntimeTerminalClose> {
    const pty = this.getLivePtyForHandle(handle)
    this.claudeAgentTeams.removeTeamForLeaderHandle(handle)
    if (pty) {
      const ptyKilled = this.ptyController?.kill(pty.pty.ptyId) ?? false
      return { handle, tabId: pty.pty.tabId ?? pty.record.tabId, ptyKilled }
    }
    this.assertGraphReady()
    const { leaf } = this.getLiveLeafForHandle(handle)
    let ptyKilled = false
    if (leaf.ptyId) {
      ptyKilled = this.ptyController?.kill(leaf.ptyId) ?? false
    }
    // Why: killing the PTY in a multi-pane tab is sufficient — the renderer's
    // PTY exit handler already calls PaneManager.closePane() for split layouts.
    // Sending an additional IPC close would race with the exit handler and
    // incorrectly close the entire tab (the pane count drops to 1 before the
    // IPC arrives, triggering the single-pane fallback path).
    // We only send the notifier close when the PTY wasn't killed (e.g. PTY not
    // yet spawned) or when this is the only pane in the tab.
    const siblingCount = this.countLeavesInTab(leaf.tabId)
    if (!ptyKilled || siblingCount <= 1) {
      this.notifier?.closeTerminal(leaf.tabId, leaf.paneRuntimeId)
    }
    return { handle, tabId: leaf.tabId, ptyKilled }
  }

  async closeTerminalTab(handle: string): Promise<RuntimeTerminalClose> {
    const pty = this.getLivePtyForHandle(handle)
    if (pty) {
      const tabId = pty.pty.tabId
      if (!tabId) {
        throw new Error('terminal_tab_not_found')
      }
      await this.closeMobileSessionTab(`id:${pty.pty.worktreeId}`, tabId)
      this.claudeAgentTeams.removeTeamForLeaderHandle(handle)
      return { handle, tabId, closeMode: 'tab', ptyKilled: false }
    }
    this.assertGraphReady()
    const { leaf } = this.getLiveLeafForHandle(handle)
    await this.closeMobileSessionTab(`id:${leaf.worktreeId}`, leaf.tabId)
    this.claudeAgentTeams.removeTeamForLeaderHandle(handle)
    return { handle, tabId: leaf.tabId, closeMode: 'tab', ptyKilled: false }
  }

  async splitTerminal(
    handle: string,
    opts: {
      direction?: 'horizontal' | 'vertical'
      command?: string
      env?: Record<string, string>
      envToDelete?: string[]
      activate?: boolean
      telemetrySource?: TerminalPaneSplitSource
    } = {}
  ): Promise<RuntimeTerminalSplit> {
    const livePty = this.getLivePtyForHandle(handle)
    if (livePty) {
      return await this.splitPtyBackedTerminal(livePty.pty, opts)
    }
    this.assertGraphReady()
    const { leaf } = this.getLiveLeafForHandle(handle)
    const direction = opts.direction ?? 'horizontal'

    // Why: snapshot current leaf keys for this tab so we can detect the new
    // pane that appears after the split via graph sync delta.
    const leafKeysBefore = new Set<string>()
    for (const l of this.terminalSessions.listGraphLeaves()) {
      const key = this.getLeafKey(l.tabId, l.leafId)
      if (l.tabId === leaf.tabId) {
        leafKeysBefore.add(key)
      }
    }

    this.notifier?.splitTerminal(leaf.tabId, leaf.paneRuntimeId, {
      direction,
      command: opts.command,
      telemetrySource: opts.telemetrySource
    })

    const newHandle = await this.waitForNewLeafInTab(leaf.tabId, leafKeysBefore)
    return { handle: newHandle, tabId: leaf.tabId, paneRuntimeId: leaf.paneRuntimeId }
  }

  private async splitPtyBackedTerminal(
    pty: RuntimePtyWorktreeRecord,
    opts: {
      direction?: 'horizontal' | 'vertical'
      command?: string
      env?: Record<string, string>
      envToDelete?: string[]
      activate?: boolean
      telemetrySource?: TerminalPaneSplitSource
    } = {}
  ): Promise<RuntimeTerminalSplit> {
    if (!this.ptyController?.spawn) {
      throw new Error('runtime_unavailable')
    }
    if (!pty.connected) {
      throw new Error('terminal_exited')
    }
    const parsedPaneKey = parsePaneKey(pty.paneKey ?? '')
    const parentTabId = pty.tabId?.trim()
    if (!parentTabId || !parsedPaneKey) {
      throw new Error('terminal_handle_stale')
    }
    const direction = opts.direction ?? 'horizontal'
    const workspace = await this.resolveTerminalWorkspaceLaunchScope(`id:${pty.worktreeId}`)
    const leafId = randomUUID()
    const preAllocatedHandle = this.createPreAllocatedTerminalHandle()
    const paneKey = makePaneKey(parentTabId, leafId)
    const result = await this.ptyController.spawn({
      cols: 120,
      rows: 40,
      cwd: workspace.path,
      command: opts.command,
      commandDelivery: 'provider',
      env: this.buildTerminalWorkspaceEnv(workspace, opts.env ?? {}, paneKey, parentTabId),
      envToDelete: opts.envToDelete,
      connectionId: workspace.connectionId,
      worktreeId: workspace.id,
      preAllocatedHandle
    })
    this.registerPreAllocatedHandleForPty(result.id, preAllocatedHandle)
    this.registerPty(result.id, workspace.id, workspace.connectionId)
    const createdPty = this.getOrCreatePtyWorktreeRecord(result.id)
    if (createdPty) {
      createdPty.tabId = parentTabId
      createdPty.paneKey = paneKey
      this.terminalSessions.commitPtyState(createdPty.ptyId, { pty: createdPty })
    }

    try {
      await this.notifier?.revealTerminalSession?.(workspace.id, {
        ptyId: result.id,
        title: null,
        activate: opts.activate !== false,
        tabId: parentTabId,
        leafId,
        splitFromLeafId: parsedPaneKey.leafId,
        splitDirection: direction,
        splitTelemetrySource: opts.telemetrySource
      })
    } catch (error) {
      this.ptyController.kill?.(result.id)
      throw error
    }
    if (createdPty) {
      this.publishPtyBackedMobileSessionTerminal(workspace.id, createdPty, {
        tabId: parentTabId,
        leafId,
        title: null,
        activate: opts.activate !== false,
        split: { splitFromLeafId: parsedPaneKey.leafId, direction }
      })
      // Why: persist the split into the workspace session so a later snapshot
      // rebuild keeps it instead of collapsing back to a single pane.
      this.persistHeadlessTerminalSplit({
        tabId: parentTabId,
        leafId,
        ptyId: createdPty.ptyId,
        splitFromLeafId: parsedPaneKey.leafId,
        direction
      })
    }

    return { handle: this.issuePtyHandle(createdPty ?? pty), tabId: parentTabId, paneRuntimeId: -1 }
  }

  async handleAgentTeamsTmuxCompat(
    request: AgentTeamsTmuxCompatRequest
  ): Promise<AgentTeamsTmuxCompatResponse> {
    return await this.claudeAgentTeams.handleTmuxCompat(request, {
      splitTerminal: (handle, opts) => this.splitTerminal(handle, opts),
      readTerminal: (handle, opts) => this.readTerminal(handle, opts),
      sendTerminal: (handle, action) => this.sendTerminal(handle, action),
      focusTerminal: (handle) => this.focusTerminal(handle),
      closeTerminal: (handle) => this.closeTerminal(handle),
      showTerminal: (handle) => this.showTerminal(handle)
    })
  }

  async prepareClaudeAgentTeamsLeader(args: {
    paneKey: string
    baseEnv?: Record<string, string>
  }): Promise<{ env: Record<string, string> }> {
    const handle = this.getTerminalHandleForPaneKey(args.paneKey)
    if (!handle) {
      throw new Error('claude_agent_teams_requires_yiru_terminal')
    }
    return await this.prepareClaudeAgentTeamsLeaderForHandle({
      handle,
      baseEnv: args.baseEnv
    })
  }

  async prepareClaudeAgentTeamsLeaderForHandle(args: {
    handle: string
    baseEnv?: Record<string, string>
  }): Promise<{ env: Record<string, string> }> {
    const baseEnv = {
      ...process.env,
      ...args.baseEnv
    }
    const shimDir = await ensureClaudeAgentTeamsShimDir()
    const shimBin = resolveClaudeAgentTeamsShimBin(baseEnv)
    return this.claudeAgentTeams.createLaunchEnv({
      leaderHandle: args.handle,
      baseEnv,
      shimDir,
      shimBin
    })
  }

  private waitForNewLeafInTab(
    tabId: string,
    existingLeafKeys: Set<string>,
    timeoutMs = 10_000
  ): Promise<string> {
    const tryResolve = (): string | null => {
      for (const leaf of this.terminalSessions.listGraphLeaves()) {
        const key = this.getLeafKey(leaf.tabId, leaf.leafId)
        if (leaf.tabId === tabId && !existingLeafKeys.has(key) && leaf.ptyId !== null) {
          return this.issueHandle(leaf)
        }
      }
      return null
    }

    const existing = tryResolve()
    if (existing) {
      return Promise.resolve(existing)
    }

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.terminalSessions.removeGraphSyncCallback(check)
        reject(new Error('Timed out waiting for split pane handle'))
      }, timeoutMs)

      const check = (): void => {
        const handle = tryResolve()
        if (handle) {
          clearTimeout(timer)
          this.terminalSessions.removeGraphSyncCallback(check)
          resolve(handle)
        }
      }
      this.terminalSessions.addGraphSyncCallback(check)
      check()
    })
  }

  async stopTerminalsForWorktree(
    worktreeSelector: string,
    options: {
      deadline?: number
      stopPty?: (
        ptyId: string,
        stop: () => boolean | Promise<boolean>
      ) => Promise<{ stopped: boolean; owner: boolean }>
    } = {}
  ): Promise<{ stopped: number }> {
    // Why: this mutates live PTYs, so the runtime must reject it while the
    // renderer graph is reloading instead of acting on cached leaf ownership.
    const graphEpoch = this.captureReadyGraphEpoch()
    const worktree = await this.resolveWorktreeSelector(worktreeSelector)
    this.assertStableReadyGraph(graphEpoch)
    if (options.deadline !== undefined && Date.now() >= options.deadline) {
      return { stopped: 0 }
    }
    const ptyIds = new Set<string>()
    for (const leaf of this.terminalSessions.listGraphLeaves()) {
      if (leaf.worktreeId === worktree.id && leaf.ptyId) {
        ptyIds.add(leaf.ptyId)
      }
    }
    for (const pty of this.terminalSessions.listPtyRecords()) {
      if (pty.worktreeId === worktree.id && pty.connected) {
        ptyIds.add(pty.ptyId)
      }
    }

    let stopped = 0
    for (const ptyId of ptyIds) {
      if (options.deadline !== undefined && Date.now() >= options.deadline) {
        break
      }
      const stop = (): boolean | Promise<boolean> => {
        if (options.deadline !== undefined && Date.now() >= options.deadline) {
          return false
        }
        if (options.stopPty) {
          // Why: destructive worktree cleanup must not let its cross-surface
          // dedupe treat fire-and-forget controller.kill as physical exit.
          return this.ptyController?.stopAndWait?.(ptyId) ?? false
        }
        return Boolean(this.ptyController?.kill(ptyId))
      }
      const stopResult = options.stopPty
        ? await options.stopPty(ptyId, stop)
        : { stopped: stop(), owner: true }
      if (stopResult.owner && stopResult.stopped) {
        stopped += 1
      }
    }
    return { stopped }
  }

  async stopExactTerminalsForWorktree(
    worktreeSelector: string,
    expectedPtyIds: readonly string[],
    opts: { keepHistory?: boolean; targetOnly?: boolean } = {}
  ): Promise<{
    stopped: number
    stoppedPtyIds: string[]
    livePtyIds: string[]
    postStopVerified: boolean
    postStopFailure?: string
    remainingLivePtyIds?: string[]
  }> {
    // Why: worktree sleep needs proof of the complete live set; pane hibernation
    // only needs proof that its target PTY was live and is now gone.
    const graphEpoch = this.captureReadyGraphEpoch()
    const worktree = await this.resolveWorktreeSelector(worktreeSelector)
    this.assertStableReadyGraph(graphEpoch)
    const expected = new Set(expectedPtyIds.filter((ptyId) => ptyId.length > 0))
    if (expected.size !== 1) {
      throw new Error('terminal_exact_stop_requires_single_pty')
    }
    const resolvedWorktrees = [...(await this.getResolvedWorktreeMap()).values()]
    const refreshedPtyLiveness =
      await this.refreshPtyWorktreeRecordsFromController(resolvedWorktrees)
    if (!refreshedPtyLiveness) {
      throw new Error('terminal_liveness_unavailable')
    }
    const livePtyIds = this.getLivePtyIdsForWorktree(worktree.id, refreshedPtyLiveness)
    const targetOnly = opts.targetOnly === true
    const expectedIsLive = [...expected].every((ptyId) => livePtyIds.has(ptyId))
    if (targetOnly ? !expectedIsLive : !setsEqual(livePtyIds, expected)) {
      const error = Object.assign(new Error('terminal_stop_pty_set_mismatch'), {
        livePtyIds: [...livePtyIds].sort(),
        expectedPtyIds: [...expected].sort()
      })
      throw error
    }

    if (!this.ptyController?.stopAndWait) {
      throw new Error('terminal_exact_stop_unavailable')
    }

    const stoppedPtyIds: string[] = []
    for (const ptyId of [...expected].sort()) {
      if (!(await this.ptyController.stopAndWait(ptyId, { keepHistory: opts.keepHistory }))) {
        throw Object.assign(new Error('terminal_exact_stop_failed'), { ptyId })
      }
      stoppedPtyIds.push(ptyId)
    }
    const postStopLiveness = await this.refreshPtyWorktreeRecordsFromController(resolvedWorktrees)
    if (!postStopLiveness) {
      return {
        stopped: stoppedPtyIds.length,
        stoppedPtyIds,
        livePtyIds: [...livePtyIds].sort(),
        postStopVerified: false,
        postStopFailure: 'terminal_liveness_unavailable'
      }
    }
    const remainingLivePtyIds = this.getLivePtyIdsForWorktree(worktree.id, postStopLiveness)
    const stoppedTargetsStillLive = [...expected].filter((ptyId) => remainingLivePtyIds.has(ptyId))
    if (targetOnly ? stoppedTargetsStillLive.length > 0 : remainingLivePtyIds.size > 0) {
      return {
        stopped: stoppedPtyIds.length,
        stoppedPtyIds,
        livePtyIds: [...livePtyIds].sort(),
        postStopVerified: false,
        postStopFailure: 'terminal_exact_stop_still_live',
        remainingLivePtyIds: [...remainingLivePtyIds].sort()
      }
    }
    return {
      stopped: stoppedPtyIds.length,
      stoppedPtyIds,
      livePtyIds: [...livePtyIds].sort(),
      postStopVerified: true,
      ...(targetOnly && remainingLivePtyIds.size > 0
        ? { remainingLivePtyIds: [...remainingLivePtyIds].sort() }
        : {})
    }
  }

  private getLivePtyIdsForWorktree(
    worktreeId: string,
    freshPtyIds?: ReadonlySet<string>
  ): Set<string> {
    const ptyIds = new Set<string>()
    for (const leaf of this.terminalSessions.listGraphLeaves()) {
      if (
        leaf.worktreeId === worktreeId &&
        leaf.connected &&
        leaf.ptyId &&
        (!freshPtyIds || freshPtyIds.has(leaf.ptyId))
      ) {
        ptyIds.add(leaf.ptyId)
      }
    }
    for (const pty of this.terminalSessions.listPtyRecords()) {
      if (
        pty.worktreeId === worktreeId &&
        pty.connected &&
        (!freshPtyIds || freshPtyIds.has(pty.ptyId))
      ) {
        ptyIds.add(pty.ptyId)
      }
    }
    return ptyIds
  }

  async hasTerminalsForWorktree(worktreeSelector: string): Promise<boolean> {
    const graphEpoch = this.captureReadyGraphEpoch()
    const worktree = await this.resolveWorktreeSelector(worktreeSelector)
    this.assertStableReadyGraph(graphEpoch)
    for (const leaf of this.terminalSessions.listGraphLeaves()) {
      if (leaf.worktreeId === worktree.id && leaf.ptyId) {
        return true
      }
    }
    for (const pty of this.terminalSessions.listPtyRecords()) {
      if (pty.worktreeId === worktree.id && pty.connected) {
        return true
      }
    }
    return false
  }

  markRendererReloading(windowId: number): void {
    if (!this.terminalSessions.markGraphReloading(windowId)) {
      return
    }
    // Why: any renderer reload tears down the published live graph, so live
    // terminal handles must become stale immediately instead of being reused
    // against whatever the renderer rebuilds next.
    this.setTerminalSideEffectConsumerAvailable(false)
    // Why: handleByPtyId maps ptyId → pre-allocated CLI handle (YIRU_TERMINAL_HANDLE).
    // These must survive renderer reloads so CLI agents can keep controlling the
    // same terminal across graph rebuilds — adoptPreAllocatedHandle re-links
    // them when the new graph arrives.
  }

  markGraphReady(windowId: number): void {
    if (!this.terminalSessions.markGraphReady(windowId)) {
      return
    }
    this.setTerminalSideEffectConsumerAvailable(windowId !== HEADLESS_RUNTIME_WINDOW_ID)
  }

  markGraphUnavailable(windowId: number): void {
    if (!this.terminalSessions.markGraphUnavailable(windowId)) {
      return
    }
    // Why: once the authoritative renderer graph disappears, Yiru must fail
    // closed for live-terminal operations instead of guessing from old state.
    this.setTerminalSideEffectConsumerAvailable(false)
    // Why: same as markRendererReloading — pre-allocated CLI handles must
    // survive graph unavailability so they can be re-adopted on reconnect.
  }

  private assertGraphReady(): void {
    this.terminalSessions.assertGraphReady()
  }

  private captureReadyGraphEpoch(): number {
    this.assertGraphReady()
    return this.terminalSessions.getGraphEpoch()
  }

  private assertStableReadyGraph(expectedGraphEpoch: number): void {
    this.terminalSessions.assertGraphReady(expectedGraphEpoch)
  }

  private resolveFolderWorkspaceConnectionId(workspace: FolderWorkspace): string | null {
    const repos = this.store?.getRepos() ?? []
    const projectGroups = this.store?.getProjectGroups?.() ?? []
    const connection = inferFolderWorkspacePathConnection({
      folderPath: workspace.folderPath,
      projectGroupId: workspace.projectGroupId,
      connectionId: workspace.connectionId ?? null,
      projectGroups,
      repos
    })
    if (connection.kind === 'ambiguous') {
      // Why: a single PTY can only be spawned on one runtime target; mixed
      // child repo connections need an explicit V2 routing decision.
      throw new Error('folder_workspace_connection_ambiguous')
    }
    return connection.kind === 'ssh' ? connection.connectionId : null
  }

  private async resolveFolderWorkspaceLaunchScope(
    selector: string
  ): Promise<TerminalWorkspaceLaunchScope | null> {
    const workspaceSelector = selector.startsWith('id:') ? selector.slice(3) : selector
    const parsed = parseWorkspaceKey(workspaceSelector)
    if (parsed?.type !== 'folder') {
      return null
    }
    const workspace = this.store
      ?.getFolderWorkspaces?.()
      .find((entry) => entry.id === parsed.folderWorkspaceId)
    if (!workspace) {
      throw new Error('selector_not_found')
    }
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }
    const status = await getFolderWorkspacePathStatus(
      this.store,
      { scope: 'folder-workspace', folderWorkspaceId: workspace.id },
      { getSshFilesystemProvider }
    )
    assertFolderWorkspacePathUsable(status)
    return {
      id: folderWorkspaceKey(workspace.id),
      path: workspace.folderPath,
      connectionId: this.resolveFolderWorkspaceConnectionId(workspace),
      repo: null,
      folderWorkspace: workspace
    }
  }

  private folderWorkspaceToResolvedWorktree(folderWorkspace: FolderWorkspace): ResolvedWorktree {
    const worktree = folderWorkspaceToWorktree(folderWorkspace)
    return {
      ...worktree,
      parentWorktreeId: null,
      childWorktreeIds: [],
      lineage: null,
      git: {
        path: worktree.path,
        head: worktree.head,
        branch: worktree.branch,
        isBare: worktree.isBare,
        isMainWorktree: worktree.isMainWorktree
      }
    }
  }

  private resolveWorkspaceTerminalStartupCwd(
    workspace: Pick<TerminalWorkspaceLaunchScope, 'path'>,
    requestedCwd?: string | null
  ): string | undefined {
    return resolveTerminalStartupCwd(workspace.path, requestedCwd)
  }

  private async resolveTerminalWorkspaceLaunchScope(
    selector: string
  ): Promise<TerminalWorkspaceLaunchScope> {
    const floatingTerminalSelector =
      selector === FLOATING_TERMINAL_WORKTREE_ID ||
      selector === `id:${FLOATING_TERMINAL_WORKTREE_ID}`
    if (floatingTerminalSelector) {
      // Why: the floating sentinel is terminal-only; other workspace APIs must
      // keep rejecting it because there is no backing repo/worktree record.
      return {
        id: FLOATING_TERMINAL_WORKTREE_ID,
        path: homedir(),
        connectionId: null,
        repo: null,
        folderWorkspace: null
      }
    }

    const globalAssistantSelector =
      selector === GLOBAL_ASSISTANT_WORKTREE_ID || selector === `id:${GLOBAL_ASSISTANT_WORKTREE_ID}`
    if (globalAssistantSelector) {
      // Why: the assistant is local even while the user is browsing an SSH
      // workspace; its synthetic owner must never inherit a remote connection.
      return {
        id: GLOBAL_ASSISTANT_WORKTREE_ID,
        path: homedir(),
        connectionId: null,
        repo: null,
        folderWorkspace: null
      }
    }

    const folderScope = await this.resolveFolderWorkspaceLaunchScope(selector)
    if (folderScope) {
      return folderScope
    }

    const workspaceSelector = selector.startsWith('id:') ? selector.slice(3) : selector
    const parsed = parseWorkspaceKey(workspaceSelector)
    const worktreeSelector = parsed?.type === 'worktree' ? `id:${parsed.worktreeId}` : selector
    const worktree = await this.resolveWorktreeSelector(worktreeSelector)
    const repo = this.store?.getRepo(worktree.repoId) ?? null
    return {
      id: worktree.id,
      path: worktree.path,
      connectionId: repo?.connectionId ?? null,
      repo,
      folderWorkspace: null
    }
  }

  private buildTerminalWorkspaceEnv(
    scope: TerminalWorkspaceLaunchScope,
    baseEnv: Record<string, string>,
    paneKey: string,
    tabId: string,
    agentTeamsEnv?: Record<string, string>
  ): Record<string, string> {
    const cleanBaseEnv = { ...baseEnv }
    for (const key of AGENT_HOOK_RUNTIME_ENV_KEYS) {
      delete cleanBaseEnv[key]
    }
    const env = {
      ...cleanBaseEnv,
      ...agentTeamsEnv,
      ...this.buildAgentHookPtyEnv?.(),
      YIRU_PANE_KEY: paneKey,
      YIRU_TAB_ID: tabId,
      YIRU_WORKTREE_ID: scope.id
    }
    if (!scope.folderWorkspace) {
      return env
    }
    return {
      ...env,
      YIRU_WORKSPACE_ID: scope.id,
      YIRU_PROJECT_GROUP_ID: scope.folderWorkspace.projectGroupId,
      YIRU_WORKSPACE_ROOT: scope.folderWorkspace.folderPath
    }
  }

  private getValidatedExplicitWorktreeIdSelector(selector: string | undefined): string | null {
    const worktreeId = getExplicitWorktreeIdSelector(selector)
    if (
      worktreeId &&
      !worktreeId.includes(WORKTREE_ID_SEPARATOR) &&
      this.store?.getRepo(worktreeId)
    ) {
      // Why: registered repo ids are known-invalid worktree ids, so reject them
      // before exact-id fast paths or Git/SSH worktree scans can hide the mistake.
      throw new WorktreeIdRequiresFullPathError()
    }
    return worktreeId
  }

  private async resolveWorktreeSelector(selector: string): Promise<ResolvedWorktree> {
    const explicitWorktreeId = this.getValidatedExplicitWorktreeIdSelector(selector)
    const worktrees = await this.listResolvedWorktrees()
    let candidates: ResolvedWorktree[]

    if (selector === 'active') {
      throw new Error('selector_not_found')
    }

    if (selector.startsWith('id:')) {
      const worktreeId = explicitWorktreeId ?? selector.slice(3)
      candidates = worktrees.filter((worktree) => worktree.id === worktreeId)
      if (candidates.length === 0) {
        const parsed = splitWorktreeIdForFilesystem(worktreeId)
        const repo = parsed ? this.store?.getRepo(parsed.repoId) : null
        const fallback =
          repo?.connectionId && this.store?.getWorktreeMeta(worktreeId)
            ? this.buildResolvedWorktreeFromId(worktreeId)
            : null
        if (fallback !== null) {
          candidates = [fallback]
        }
      }
    } else if (selector.startsWith('path:')) {
      candidates = worktrees.filter((worktree) =>
        runtimePathsEqual(worktree.path, selector.slice(5))
      )
      if (candidates.length > 1) {
        // Why: registering another worktree from the same Git repo makes git
        // report the same physical worktree path under multiple repo IDs.
        // A path selector is already exact, so prefer the first resolved row
        // instead of surfacing a duplicate-registration ambiguity.
        candidates = [candidates[0]]
      }
    } else if (selector.startsWith('branch:')) {
      const branchSelector = selector.slice(7)
      candidates = worktrees.filter((worktree) =>
        branchSelectorMatches(worktree.branch, branchSelector)
      )
    } else if (selector.startsWith('name:')) {
      // Keep display-name matching exact so selector behavior stays deterministic
      // and duplicate names use the same ambiguity path as other selectors.
      candidates = worktrees.filter((worktree) => worktree.displayName === selector.slice(5))
    } else {
      candidates = worktrees.filter(
        (worktree) =>
          worktree.id === selector ||
          runtimePathsEqual(worktree.path, selector) ||
          branchSelectorMatches(worktree.branch, selector)
      )
    }

    if (candidates.length === 1) {
      return candidates[0]
    }
    if (candidates.length > 1) {
      throw new Error('selector_ambiguous')
    }
    throw new Error('selector_not_found')
  }

  private async resolveWorkspaceParentSelector(selector: string): Promise<ResolvedWorkspaceParent> {
    const rawSelector = selector.startsWith('id:') ? selector.slice('id:'.length) : selector
    const parsed = parseWorkspaceKey(rawSelector)
    if (parsed?.type === 'folder') {
      const folderWorkspace = this.store
        ?.getFolderWorkspaces?.()
        .find((workspace) => workspace.id === parsed.folderWorkspaceId)
      if (!folderWorkspace) {
        throw new Error('selector_not_found')
      }
      return {
        type: 'folder',
        workspaceKey: folderWorkspaceKey(folderWorkspace.id),
        folderWorkspace,
        instanceId: null
      }
    }
    const worktreeSelector = parsed?.type === 'worktree' ? `id:${parsed.worktreeId}` : selector
    const worktree = await this.resolveWorktreeSelector(worktreeSelector)
    return {
      type: 'worktree',
      workspaceKey: worktreeWorkspaceKey(worktree.id),
      worktree,
      instanceId: worktree.instanceId ?? null
    }
  }

  private validateLineageParent(child: ResolvedWorktree, parent: ResolvedWorktree): void {
    const childWorktreeId = child.id
    const parentWorktreeId = parent.id
    if (childWorktreeId === parentWorktreeId) {
      throw new RuntimeLineageError('LINEAGE_PARENT_CYCLE', 'A worktree cannot parent itself.')
    }
    const instanceByWorktreeId = new Map(
      this.resolvedWorktreeCache?.worktrees.map((worktree) => [
        worktree.id,
        worktree.instanceId
      ]) ?? [
        [child.id, child.instanceId],
        [parent.id, parent.instanceId]
      ]
    )
    let cursor: string | undefined = parentWorktreeId
    const visited = new Set<string>([childWorktreeId])
    while (cursor) {
      if (visited.has(cursor)) {
        throw new RuntimeLineageError(
          'LINEAGE_PARENT_CYCLE',
          'Parent selector would create a lineage cycle.'
        )
      }
      visited.add(cursor)
      const lineage = this.store?.getWorktreeLineage?.(cursor)
      if (!lineage) {
        break
      }
      const cursorInstanceId = instanceByWorktreeId.get(cursor)
      const parentInstanceId = instanceByWorktreeId.get(lineage.parentWorktreeId)
      if (
        cursorInstanceId !== lineage.worktreeInstanceId ||
        parentInstanceId !== lineage.parentWorktreeInstanceId
      ) {
        break
      }
      cursor = lineage.parentWorktreeId
    }
  }

  private async resolveLineageForWorktreeCreate(
    input?: WorktreeLineageInput
  ): Promise<WorktreeLineageResolution> {
    const parentSelectorNextSteps = [
      'Pass a valid --parent-worktree selector such as folder:<id>, worktree:<worktreeId>, id:<repo-id>::<path>, branch:<branch>, path:<absolute-path>, or active/current.',
      'Retry with --no-parent to create without lineage.'
    ]
    const parentSelectorNotFoundMessage = (err: unknown): string =>
      err instanceof WorktreeIdRequiresFullPathError
        ? err.message
        : 'Parent selector was not found.'

    if (!input) {
      return { kind: 'none', warnings: [] }
    }

    if (input.noParent === true && (input.parentWorkspace || input.parentWorktree)) {
      throw new RuntimeLineageError(
        'LINEAGE_PARENT_CONTEXT_CONFLICT',
        'Choose either one parent selector or --no-parent.'
      )
    }
    if (input.parentWorkspace && input.parentWorktree) {
      throw new RuntimeLineageError(
        'LINEAGE_PARENT_CONTEXT_CONFLICT',
        'Choose either one parent selector or --no-parent.'
      )
    }

    if (input.noParent === true) {
      return { kind: 'none', warnings: [] }
    }

    if (input.parentWorkspace) {
      try {
        return {
          kind: 'lineage',
          parent: await this.resolveWorkspaceParentSelector(input.parentWorkspace),
          origin: 'cli',
          capture: { source: 'explicit-cli-flag', confidence: 'explicit' }
        }
      } catch (err) {
        throw new RuntimeLineageError(
          'LINEAGE_PARENT_NOT_FOUND',
          parentSelectorNotFoundMessage(err),
          {
            nextSteps: parentSelectorNextSteps
          }
        )
      }
    }

    if (input.parentWorktree) {
      try {
        const parent = await this.resolveWorktreeSelector(input.parentWorktree)
        return {
          kind: 'lineage',
          parent: {
            type: 'worktree',
            workspaceKey: worktreeWorkspaceKey(parent.id),
            worktree: parent,
            instanceId: parent.instanceId ?? null
          },
          origin: 'cli',
          capture: { source: 'explicit-cli-flag', confidence: 'explicit' }
        }
      } catch (err) {
        throw new RuntimeLineageError(
          'LINEAGE_PARENT_NOT_FOUND',
          parentSelectorNotFoundMessage(err),
          {
            nextSteps: parentSelectorNextSteps
          }
        )
      }
    }

    const warnings: WorktreeLineageWarning[] = []
    const candidates: WorktreeLineageCandidate[] = []
    let cwdCandidate: WorktreeLineageCandidate | null = null
    let terminalContextResolved = false

    if (input.envParentWorkspace) {
      try {
        candidates.push({
          source: 'env-workspace',
          parent: await this.resolveWorkspaceParentSelector(input.envParentWorkspace)
        })
      } catch {
        warnings.push({
          code: 'LINEAGE_PARENT_CONTEXT_MISSING',
          message: 'Worktree created, but Yiru could not validate the environment parent context.',
          details: { envParentWorkspace: input.envParentWorkspace }
        })
      }
    }

    if (input.orchestrationContext?.parentWorktreeId) {
      try {
        const parent = await this.resolveWorktreeSelector(
          `id:${input.orchestrationContext.parentWorktreeId}`
        )
        candidates.push({
          source: 'orchestration-context',
          parent: {
            type: 'worktree',
            workspaceKey: worktreeWorkspaceKey(parent.id),
            worktree: parent,
            instanceId: parent.instanceId ?? null
          }
        })
      } catch {
        // Keep creation recoverable; the warning below covers missing inferred context.
      }
    }

    const commentTaskId = extractOrchestrationTaskId(input.comment)
    if (commentTaskId) {
      const candidate = await this.resolveLineageCandidateForTaskId(commentTaskId)
      if (candidate) {
        candidates.push(candidate)
      }
    }

    if (input.callerTerminalHandle) {
      try {
        const terminal = await this.showTerminal(input.callerTerminalHandle)
        const terminalParent = await this.resolveWorkspaceParentSelector(
          `id:${terminal.worktreeId}`
        )
        const activeDispatch = this._orchestrationDb?.getActiveDispatchForTerminal(
          input.callerTerminalHandle
        )
        const activeRun = this._orchestrationDb?.getActiveCoordinatorRun()
        if (activeDispatch) {
          candidates.push({
            source: 'orchestration-context',
            parent: terminalParent,
            taskId: activeDispatch.task_id,
            ...(activeRun
              ? {
                  orchestrationRunId: activeRun.id,
                  coordinatorHandle: activeRun.coordinator_handle
                }
              : {})
          })
        } else {
          candidates.push({
            source: 'terminal-context',
            parent: terminalParent
          })
        }
        terminalContextResolved = true
      } catch {
        // Why: terminal handles can go stale during reloads or SSH reconnects.
        // A valid orchestration parent is still authoritative, so keep resolving
        // other inferred candidates instead of dropping lineage completely.
        warnings.push({
          code: 'LINEAGE_PARENT_CONTEXT_MISSING',
          message:
            'Worktree created, but Yiru could not validate the caller terminal as a parent context.',
          details: { callerTerminalHandle: input.callerTerminalHandle }
        })
      }
    }

    if (input.cwdParentWorktree) {
      try {
        cwdCandidate = {
          source: 'cwd-context',
          parent: await this.resolveWorkspaceParentSelector(input.cwdParentWorktree)
        }
      } catch {
        warnings.push({
          code: 'LINEAGE_PARENT_CONTEXT_MISSING',
          message:
            'Worktree created, but Yiru could not validate the current directory as a parent context.',
          details: { cwdParentWorktree: input.cwdParentWorktree }
        })
      }
    }

    if (candidates.length === 0 && cwdCandidate) {
      candidates.push(cwdCandidate)
    }

    if (candidates.length === 0) {
      return { kind: 'none', warnings }
    }

    const [first] = candidates
    const conflict = candidates.find(
      (candidate) => candidate.parent.workspaceKey !== first.parent.workspaceKey
    )
    if (conflict) {
      return {
        kind: 'none',
        warnings: [
          {
            code: 'LINEAGE_PARENT_CONTEXT_CONFLICT',
            message: 'Worktree created, but Yiru could not prove which parent context caused it.',
            details: {
              terminalParentWorkspaceKey: candidates.find((c) => c.source === 'terminal-context')
                ?.parent.workspaceKey,
              envParentWorkspaceKey: candidates.find((c) => c.source === 'env-workspace')?.parent
                .workspaceKey,
              orchestrationParentWorkspaceKey: candidates.find(
                (c) => c.source === 'orchestration-context'
              )?.parent.workspaceKey
            }
          }
        ]
      }
    }

    const preferred =
      candidates.find((candidate) => candidate.source === 'env-workspace') ??
      candidates.find((candidate) => candidate.source === 'orchestration-context') ??
      first
    return {
      kind: 'lineage',
      parent: preferred.parent,
      origin: preferred.source === 'orchestration-context' ? 'orchestration' : 'cli',
      capture: { source: preferred.source, confidence: 'inferred' },
      ...((preferred.orchestrationRunId ?? input.orchestrationContext?.orchestrationRunId)
        ? {
            orchestrationRunId:
              preferred.orchestrationRunId ?? input.orchestrationContext?.orchestrationRunId
          }
        : {}),
      ...((preferred.taskId ?? input.orchestrationContext?.taskId)
        ? { taskId: preferred.taskId ?? input.orchestrationContext?.taskId }
        : {}),
      ...((preferred.coordinatorHandle ?? input.orchestrationContext?.coordinatorHandle)
        ? {
            coordinatorHandle:
              preferred.coordinatorHandle ?? input.orchestrationContext?.coordinatorHandle
          }
        : {}),
      ...(terminalContextResolved && input.callerTerminalHandle
        ? { createdByTerminalHandle: input.callerTerminalHandle }
        : {})
    }
  }

  private async resolveLineageCandidateForTaskId(
    taskId: string
  ): Promise<WorktreeLineageCandidate | null> {
    const db = this.getOrchestrationDbIfAvailable()
    const dispatch = db?.getDispatchContext(taskId)
    // Why: agent-created task records may never be dispatched, but the
    // creating terminal still identifies the parent workspace for descendants.
    const parentHandle =
      dispatch?.assignee_handle ?? db?.getTask(taskId)?.created_by_terminal_handle
    if (!parentHandle) {
      return null
    }
    try {
      const terminal = await this.showTerminal(parentHandle)
      const parent = await this.resolveWorktreeSelector(`id:${terminal.worktreeId}`)
      return {
        source: 'orchestration-context',
        parent: {
          type: 'worktree',
          workspaceKey: worktreeWorkspaceKey(parent.id),
          worktree: parent,
          instanceId: parent.instanceId ?? null
        },
        taskId
      }
    } catch {
      return null
    }
  }

  private getOrchestrationDbIfAvailable(): OrchestrationDb | null {
    try {
      return this._orchestrationDb ?? this.getOrchestrationDb()
    } catch {
      return this._orchestrationDb
    }
  }

  async hydrateInferredWorktreeLineage(): Promise<void> {
    const store = this.store
    if (
      !store ||
      typeof store.getWorktreeLineage !== 'function' ||
      typeof store.setWorktreeLineage !== 'function'
    ) {
      return
    }

    const worktrees = await this.listResolvedWorktrees()
    for (const worktree of worktrees) {
      if (store.getWorktreeLineage(worktree.id) || !worktree.instanceId) {
        continue
      }
      const taskId = extractOrchestrationTaskId(worktree.comment)
      if (!taskId) {
        continue
      }
      const candidate = await this.resolveLineageCandidateForTaskId(taskId)
      if (
        !candidate?.parent.instanceId ||
        candidate.parent.type !== 'worktree' ||
        candidate.parent.worktree.id === worktree.id
      ) {
        continue
      }
      try {
        this.validateLineageParent(worktree, candidate.parent.worktree)
      } catch {
        continue
      }
      store.setWorktreeLineage(worktree.id, {
        worktreeId: worktree.id,
        worktreeInstanceId: worktree.instanceId,
        parentWorktreeId: candidate.parent.worktree.id,
        parentWorktreeInstanceId: candidate.parent.instanceId,
        origin: 'orchestration',
        capture: { source: 'orchestration-context', confidence: 'inferred' },
        taskId,
        createdAt: Date.now()
      })
    }
  }

  async listWorktreeLineage(): Promise<Record<string, WorktreeLineage>> {
    await this.hydrateInferredWorktreeLineage()
    return this.store?.getAllWorktreeLineage?.() ?? {}
  }

  async listWorkspaceLineage(): Promise<Record<WorkspaceKey, WorkspaceLineage>> {
    await this.hydrateInferredWorktreeLineage()
    return this.store?.getAllWorkspaceLineage?.() ?? {}
  }

  private async resolveRepoSelector(selector: string): Promise<Repo> {
    if (!this.store) {
      throw new Error('repo_not_found')
    }
    const repos = this.store.getRepos()
    let candidates: Repo[]

    if (selector.startsWith('id:')) {
      candidates = repos.filter((repo) => repo.id === selector.slice(3))
    } else if (selector.startsWith('path:')) {
      candidates = repos.filter((repo) => runtimePathsEqual(repo.path, selector.slice(5)))
    } else if (selector.startsWith('name:')) {
      candidates = repos.filter((repo) => repo.displayName === selector.slice(5))
    } else {
      candidates = repos.filter(
        (repo) =>
          repo.id === selector ||
          runtimePathsEqual(repo.path, selector) ||
          repo.displayName === selector
      )
    }

    if (candidates.length === 1) {
      return candidates[0]
    }
    if (candidates.length > 1) {
      throw new Error('selector_ambiguous')
    }
    throw new Error('repo_not_found')
  }

  private requireStore(): Store {
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }
    return this.store as unknown as Store
  }

  private buildResolvedWorktreeFromId(worktreeId: string): ResolvedWorktree | null {
    const parsed = splitWorktreeIdForFilesystem(worktreeId)
    if (!parsed?.repoId || !parsed.worktreePath) {
      return null
    }
    const repo = this.store?.getRepos().find((entry) => entry.id === parsed.repoId)
    const git = {
      path: parsed.worktreePath,
      head: '',
      branch: '',
      isBare: false,
      isMainWorktree: repo ? areWorktreePathsEqual(parsed.worktreePath, repo.path) : false
    }
    const meta = this.store?.getWorktreeMeta(worktreeId)
    const merged = mergeWorktree(parsed.repoId, git, meta, repo?.displayName)
    return {
      ...merged,
      id: worktreeId,
      parentWorktreeId: null,
      childWorktreeIds: [],
      lineage: null,
      git,
      displayName: merged.displayName,
      comment: merged.comment
    }
  }

  private listKnownResolvedWorktreesForExplicitTarget(
    targetWorktreeId: string,
    targetWorktree: ResolvedWorktree | null
  ): ResolvedWorktree[] {
    if (!this.store || !targetWorktree) {
      return []
    }
    const target = splitWorktreeIdForFilesystem(targetWorktreeId)
    if (!target?.repoId || !target.worktreePath) {
      return []
    }
    const worktreeIds = new Set(
      Object.keys(this.store.getAllWorktreeMeta()).filter((worktreeId) => {
        const parsed = splitWorktreeIdForFilesystem(worktreeId)
        return (
          parsed?.repoId === target.repoId &&
          Boolean(parsed.worktreePath) &&
          (isPathInsideOrEqual(target.worktreePath, parsed.worktreePath) ||
            isPathInsideOrEqual(parsed.worktreePath, target.worktreePath))
        )
      })
    )
    worktreeIds.add(targetWorktreeId)

    const resolved: ResolvedWorktree[] = []
    for (const worktreeId of worktreeIds) {
      const worktree =
        worktreeId === targetWorktreeId
          ? targetWorktree
          : this.buildResolvedWorktreeFromId(worktreeId)
      if (worktree) {
        resolved.push(worktree)
      }
    }
    return resolved
  }

  private async listResolvedWorktrees(): Promise<ResolvedWorktree[]> {
    return (await this.listResolvedWorktreeSnapshot()).worktrees
  }

  private async listResolvedWorktreeSnapshot(): Promise<ResolvedWorktreeSnapshot> {
    if (!this.store) {
      return { worktrees: [], platformByRepoId: new Map() }
    }
    const now = Date.now()
    if (this.resolvedWorktreeCache && this.resolvedWorktreeCache.expiresAt > now) {
      return this.resolvedWorktreeCache
    }
    const generation = this.resolvedWorktreeGeneration
    if (this.resolvedWorktreeInFlight?.generation === generation) {
      return this.resolvedWorktreeInFlight.promise
    }

    const promise = this.computeResolvedWorktrees(generation)
    this.resolvedWorktreeInFlight = { generation, promise }
    try {
      return await promise
    } finally {
      if (this.resolvedWorktreeInFlight?.promise === promise) {
        this.resolvedWorktreeInFlight = null
      }
    }
  }

  private async computeResolvedWorktrees(generation: number): Promise<ResolvedWorktreeSnapshot> {
    if (!this.store) {
      return { worktrees: [], platformByRepoId: new Map() }
    }
    const now = Date.now()
    const metaById = this.store.getAllWorktreeMeta() ?? {}
    const repos = this.store.getRepos()
    const projectRuntimeByRepoId = resolveLocalProjectRuntimesForRepos(this.requireStore(), repos)
    const platformByRepoId = new Map(
      repos.map((repo) => [
        repo.id,
        getAgentLaunchPlatformForRepo(repo, projectRuntimeByRepoId.get(repo.id))
      ])
    )
    const perRepoWorktrees = await Promise.all(
      repos.map(async (repo) => {
        if (isFolderRepo(repo)) {
          return listRuntimeFolderWorkspaces(this.requireStore(), repo).map((worktree) => ({
            ...worktree,
            parentWorktreeId: null,
            childWorktreeIds: [],
            lineage: null,
            git: {
              path: worktree.path,
              head: worktree.head,
              branch: worktree.branch,
              isBare: worktree.isBare,
              isMainWorktree: worktree.isMainWorktree
            },
            displayName: worktree.displayName,
            comment: worktree.comment
          }))
        }
        // Why: mobile startup RPCs share this path. A slow repo scan should
        // degrade one repo's metadata, not block all terminal/session loading.
        const scan = await withTimeout(
          this.listRepoWorktreesForResolution(repo, projectRuntimeByRepoId),
          RESOLVED_WORKTREE_REPO_TIMEOUT_MS,
          { ok: false, worktrees: [] }
        )
        const gitWorktrees = scan.worktrees
        if (scan.ok) {
          this.pruneLineageForMissingRepoWorktrees(repo, gitWorktrees)
        }
        return gitWorktrees.map((gitWorktree) => {
          const worktreeId = `${repo.id}::${gitWorktree.path}`
          // Why: lineage validation needs a durable instance ID even when the
          // runtime sees a workspace before the renderer's discovery-stamp path.
          const existingMeta = metaById[worktreeId]
          const meta =
            existingMeta && existingMeta.instanceId
              ? existingMeta
              : this.store?.setWorktreeMeta(worktreeId, {})
          const merged = mergeWorktree(repo.id, gitWorktree, meta, repo.displayName)
          return {
            ...merged,
            parentWorktreeId: null,
            childWorktreeIds: [],
            lineage: null,
            git: {
              path: gitWorktree.path,
              head: gitWorktree.head,
              branch: gitWorktree.branch,
              isBare: gitWorktree.isBare,
              isMainWorktree: gitWorktree.isMainWorktree
            },
            displayName: merged.displayName,
            comment: merged.comment
          }
        })
      })
    )
    const worktrees = this.attachLineageToResolvedWorktrees(perRepoWorktrees.flat())
    // Why: terminal polling can be frequent, but git worktree state is still
    // allowed to change outside Yiru. A short TTL avoids shelling out on every
    // read without pretending the cache is authoritative for long.
    if (generation === this.resolvedWorktreeGeneration) {
      this.resolvedWorktreeCache = {
        worktrees,
        platformByRepoId,
        expiresAt: now + RESOLVED_WORKTREE_CACHE_TTL_MS
      }
    }
    return { worktrees, platformByRepoId }
  }

  private attachLineageToResolvedWorktrees(worktrees: ResolvedWorktree[]): ResolvedWorktree[] {
    const lineageById = this.store?.getAllWorktreeLineage?.() ?? {}
    const worktreeById = new Map(worktrees.map((worktree) => [worktree.id, worktree]))
    const validLineageByChildId = new Map<string, WorktreeLineage>()
    const childIdsByParentId = new Map<string, string[]>()

    for (const [childId, lineage] of Object.entries(lineageById)) {
      const child = worktreeById.get(childId)
      const parent = worktreeById.get(lineage.parentWorktreeId)
      if (
        !child ||
        !parent ||
        child.instanceId !== lineage.worktreeInstanceId ||
        parent.instanceId !== lineage.parentWorktreeInstanceId
      ) {
        // Why: worktree IDs are path-derived. Instance checks keep replacement
        // checkouts from appearing as children of stale same-path lineage.
        continue
      }
      validLineageByChildId.set(childId, lineage)
      const children = childIdsByParentId.get(lineage.parentWorktreeId) ?? []
      children.push(childId)
      childIdsByParentId.set(lineage.parentWorktreeId, children)
    }

    return worktrees.map((worktree) => {
      const lineage = validLineageByChildId.get(worktree.id) ?? null
      return {
        ...worktree,
        parentWorktreeId: lineage?.parentWorktreeId ?? null,
        childWorktreeIds: childIdsByParentId.get(worktree.id) ?? [],
        lineage
      }
    })
  }

  private pruneLineageForMissingRepoWorktrees(repo: Repo, gitWorktrees: GitWorktreeInfo[]): void {
    const store = this.store
    if (
      !store ||
      typeof store.getAllWorktreeLineage !== 'function' ||
      typeof store.removeWorktreeLineage !== 'function'
    ) {
      return
    }
    const liveIds = new Set(gitWorktrees.map((worktree) => `${repo.id}::${worktree.path}`))
    const repoPrefix = `${repo.id}::`
    for (const childWorkspaceKey of Object.keys(store.getAllWorkspaceLineage?.() ?? {})) {
      const childScope = parseWorkspaceKey(childWorkspaceKey)
      if (
        childScope?.type === 'worktree' &&
        childScope.worktreeId.startsWith(repoPrefix) &&
        !liveIds.has(childScope.worktreeId)
      ) {
        if (isWorkspaceKey(childWorkspaceKey)) {
          store.removeWorkspaceLineage?.(childWorkspaceKey)
        }
      }
    }
    for (const [childId, lineage] of Object.entries(store.getAllWorktreeLineage())) {
      if (childId.startsWith(repoPrefix) && !liveIds.has(childId)) {
        // Why: runtime selector scans can be the only scan before a path is
        // reused. Once a successful scan proves the child is gone, stale
        // lineage must not survive into the replacement checkout.
        store.removeWorktreeLineage(childId)
        store.removeWorkspaceLineage?.(worktreeWorkspaceKey(childId))
      }
      if (
        lineage.parentWorktreeId.startsWith(repoPrefix) &&
        !liveIds.has(lineage.parentWorktreeId)
      ) {
        const parentMeta = store.getWorktreeMeta(lineage.parentWorktreeId)
        if (!parentMeta || parentMeta.instanceId === lineage.parentWorktreeInstanceId) {
          // Why: preserving child lineage powers the repair UI, but a missing
          // parent path only needs one fresh identity to keep same-path
          // replacement checkouts from validating old lineage.
          store.setWorktreeMeta(lineage.parentWorktreeId, { instanceId: randomUUID() })
        }
      }
    }
  }

  private async listRepoWorktreesForResolution(
    repo: Repo,
    projectRuntimeByRepoId?: ReadonlyMap<string, ProjectExecutionRuntimeResolution>
  ): Promise<RuntimeWorktreeScanResult> {
    if (!repo.connectionId) {
      const projectRuntime = projectRuntimeByRepoId
        ? projectRuntimeByRepoId.get(repo.id)
        : resolveLocalProjectRuntimeForRepo(this.requireStore(), repo)
      return {
        ok: true,
        worktrees: await listRepoWorktrees(
          repo,
          getLocalProjectWorktreeGitOptionsForRuntime(repo, projectRuntime)
        )
      }
    }
    const provider = getSshGitProvider(repo.connectionId)
    if (!provider) {
      return { ok: false, worktrees: this.listStoredSshWorktreesForResolution(repo) }
    }
    try {
      return { ok: true, worktrees: await provider.listWorktrees(repo.path) }
    } catch {
      return { ok: false, worktrees: this.listStoredSshWorktreesForResolution(repo) }
    }
  }

  private listStoredSshWorktreesForResolution(repo: Repo): GitWorktreeInfo[] {
    const store = this.store
    if (!store) {
      return []
    }
    const byWorktreeId = new Map<string, GitWorktreeInfo>()
    for (const [worktreeId, meta] of Object.entries(store.getAllWorktreeMeta())) {
      const parsed = splitWorktreeId(worktreeId)
      if (!parsed || parsed.repoId !== repo.id) {
        continue
      }
      // Why: this mirrors desktop worktrees:list's disconnected-SSH fallback.
      // Web clients should keep showing persisted SSH worktrees while the
      // provider is reconnecting instead of dropping the repo to zero rows.
      byWorktreeId.set(worktreeId, {
        path: parsed.worktreePath,
        head: '',
        branch: '',
        isBare: false,
        isMainWorktree: areWorktreePathsEqual(parsed.worktreePath, repo.path),
        ...(meta.sparseDirectories !== undefined ||
        meta.sparseBaseRef !== undefined ||
        meta.sparsePresetId !== undefined
          ? { isSparse: true }
          : {})
      })
    }
    return [...byWorktreeId.values()]
  }

  private async getResolvedWorktreeMap(): Promise<Map<string, ResolvedWorktree>> {
    return new Map((await this.listResolvedWorktrees()).map((worktree) => [worktree.id, worktree]))
  }

  private invalidateResolvedWorktreeCache(): void {
    this.resolvedWorktreeGeneration += 1
    this.resolvedWorktreeCache = null
  }

  /** Invalidate the worktree cache and tell the renderer to re-list, after an
   *  out-of-band branch change (e.g. auto-rename-from-work) so the new branch
   *  name surfaces without waiting for the next ambient refresh. */
  notifyBranchRenamed(repoId: string): void {
    this.invalidateResolvedWorktreeCache()
    this.notifyWorktreesChanged(repoId)
  }

  /** Like {@link notifyBranchRenamed}, but carries the old->new worktree id so the
   *  renderer re-keys its worktree-scoped state instead of treating the id change
   *  (from a folder rename) as a deletion. Same channel = guaranteed ordering. */
  notifyWorktreeFolderRenamed(repoId: string, oldWorktreeId: string, newWorktreeId: string): void {
    this.invalidateResolvedWorktreeCache()
    this.notifier?.worktreesChanged(repoId, { oldWorktreeId, newWorktreeId })
    // Mirror notifyBranchRenamed so in-process onClientEvent listeners also see the rename.
    this.emitClientEvent({ type: 'worktreesChanged', repoId })
  }

  notifyFolderWorkspaceChanged(): void {
    this.invalidateResolvedWorktreeCache()
    this.notifyReposChanged()
  }

  private recordPtyWorktree(
    ptyId: string,
    worktreeId: string,
    state: Partial<
      Pick<
        RuntimePtyWorktreeRecord,
        | 'connected'
        | 'lastOutputAt'
        | 'preview'
        | 'tabId'
        | 'paneKey'
        | 'title'
        | 'connectionId'
        | 'isWsl'
      >
    > = {}
  ): RuntimePtyWorktreeRecord {
    let pty = this.terminalSessions.getPtyRecord(ptyId)
    if (!pty) {
      const titleObservedAt = state.title ? this.nextTitleObservationSequence() : null
      pty = {
        ptyId,
        worktreeId,
        worktreeInstanceId: null,
        connectionId: state.connectionId ?? parseAppSshPtyId(ptyId)?.connectionId ?? null,
        isWsl: state.isWsl ?? null,
        tabId: state.tabId ?? null,
        paneKey: state.paneKey ?? null,
        launchConfig: null,
        launchToken: null,
        launchAgent: null,
        foregroundAgent: null,
        connected: state.connected ?? true,
        disconnectedAt: state.connected === false ? Date.now() : null,
        lastExitCode: null,
        lastAgentStatus: null,
        lastOscTitle: null,
        lastOscTitleAt: null,
        managementTitle: null,
        managementTitleAt: null,
        title: state.title ?? null,
        titleUpdatedAt: titleObservedAt,
        lastOutputAt: state.lastOutputAt ?? null,
        tailBuffer: [],
        tailPartialLine: '',
        tailPendingAnsi: '',
        tailRedrawCursor: null,
        tailTruncated: false,
        tailLinesTotal: 0,
        preview: state.preview ?? '',
        waitBlockedAt: null
      }
      if (state.title) {
        this.setPtyManagementTitleFromObservedTitle(pty, state.title, titleObservedAt ?? 0)
      }
      this.terminalSessions.commitPtyState(ptyId, { pty })
      // Why: restored/controller-discovered PTYs learn their worktree here
      // without registerPty(), so URL enrichment must bind at this source.
      advertisedUrlWatcher.bindPty(ptyId, worktreeId)
      return pty
    }

    const preservesGlobalAssistantOwner =
      pty.worktreeId === GLOBAL_ASSISTANT_WORKTREE_ID &&
      worktreeId === FLOATING_TERMINAL_WORKTREE_ID
    // Why: the floating workspace is only the assistant's presentation host;
    // its runtime-owned PTY must retain the synthetic assistant owner.
    if (pty.worktreeId !== worktreeId && !preservesGlobalAssistantOwner) {
      pty.worktreeId = worktreeId
      // Why: path/controller inference can relocate a PTY but cannot attest a new instance.
      pty.worktreeInstanceId = null
    }
    if (state.connectionId !== undefined) {
      pty.connectionId = state.connectionId
    }
    if (state.isWsl !== undefined) {
      pty.isWsl = state.isWsl
    }
    if (state.tabId !== undefined) {
      pty.tabId = state.tabId
    }
    if (state.paneKey !== undefined) {
      pty.paneKey = state.paneKey
    }
    if (state.connected !== undefined) {
      pty.connected = state.connected
      pty.disconnectedAt = state.connected ? null : (pty.disconnectedAt ?? Date.now())
    }
    if (state.lastOutputAt !== undefined) {
      pty.lastOutputAt = maxTimestamp(pty.lastOutputAt, state.lastOutputAt)
    }
    if (state.preview !== undefined && state.preview.length > 0) {
      pty.preview = state.preview
    }
    if (state.title !== undefined && state.title !== null && state.title.length > 0) {
      const observedAt = this.nextTitleObservationSequence()
      pty.title = state.title
      pty.titleUpdatedAt = observedAt
      this.setPtyManagementTitleFromObservedTitle(pty, state.title, observedAt)
    }
    this.terminalSessions.commitPtyState(ptyId, { pty })
    // Why: recordPtyWorktree is the common lifecycle point for every path that
    // resolves a PTY's worktree, including renderer restore and controller list.
    advertisedUrlWatcher.bindPty(ptyId, worktreeId)
    return pty
  }

  private makeRuntimePaneKey(
    leaf: Pick<RuntimeSyncedLeaf, 'tabId' | 'leafId' | 'paneRuntimeId'>
  ): string {
    return isTerminalLeafId(leaf.leafId)
      ? makePaneKey(leaf.tabId, leaf.leafId)
      : `${leaf.tabId}:${leaf.paneRuntimeId}`
  }

  private getOrCreatePtyWorktreeRecord(ptyId: string): RuntimePtyWorktreeRecord | null {
    const existing = this.terminalSessions.getPtyRecord(ptyId)
    if (existing) {
      return existing
    }
    const inferredWorktreeId = inferWorktreeIdFromPtyId(ptyId)
    if (!inferredWorktreeId) {
      return null
    }
    // Why: daemon-backed PTY session IDs are prefixed with the worktree ID so
    // mobile summaries survive renderer graph gaps and Electron reloads.
    return this.recordPtyWorktree(ptyId, inferredWorktreeId)
  }

  /**
   * Synchronizes PTY tracking records with the running daemon sessions,
   * querying their foreground agent states.
   */
  private async refreshPtyWorktreeRecordsFromController(
    resolvedWorktrees: ResolvedWorktree[],
    targetWorktreeId: string | null = null
  ): Promise<Set<string> | null> {
    if (targetWorktreeId === FLOATING_TERMINAL_WORKTREE_ID) {
      const targetedLiveness = this.refreshFloatingWorkspacePtyLiveness()
      if (targetedLiveness !== null) {
        return targetedLiveness
      }
    }
    if (!this.ptyController?.listProcesses) {
      return null
    }
    const sessionsResult = await withTimeoutResult(
      this.ptyController.listProcesses(),
      PTY_CONTROLLER_LIST_TIMEOUT_MS
    )
    if (!sessionsResult.ok) {
      // Why: a transient controller failure is not evidence that retained PTYs exited.
      return null
    }
    const sessions = sessionsResult.value
    const persistedWorktreeIdByPtyId = indexPersistedPtyWorktreeBindings(
      this.store?.getWorkspaceSession?.()
    )
    const livePtyIds = new Set(sessions.map((session) => session.id))
    for (const session of sessions) {
      this.adoptControllerTerminalHandle(session.id, session.terminalHandle)
      // Why: workspace identity migration rekeys persisted ownership while a
      // running daemon PTY keeps the worktree id minted into its session id.
      const worktreeId =
        persistedWorktreeIdByPtyId.get(session.id) ??
        inferWorktreeIdFromPtyId(session.id) ??
        findResolvedWorktreeIdForPath(resolvedWorktrees, session.cwd)
      if (targetWorktreeId && worktreeId !== targetWorktreeId) {
        continue
      }
      if (worktreeId) {
        this.recordPtyWorktree(session.id, worktreeId, {
          connected: true
        })
      }
      // Why: fire-and-forget so this listing hot path (listTerminals/getWorktreePs)
      // does not serialize a relay round-trip per session — and a throwing snapshot
      // listener cannot abort the liveness sweep below.
      this.refreshPtyForegroundAgent(session.id)
    }
    this.terminalSessions.markDisconnectedPtysUnless(livePtyIds, (ptyId) =>
      this.leafExistsForPty(ptyId)
    )
    this.pruneDisconnectedPtyRecords()
    return livePtyIds
  }

  private refreshFloatingWorkspacePtyLiveness(): Set<string> | null {
    const controller = this.ptyController
    if (!controller?.hasPty) {
      return null
    }
    const knownPtyIds = new Set<string>()
    const persistedBindingByPtyId = new Map<string, { tabId: string; paneKey: string }>()
    for (const pty of this.terminalSessions.listPtyRecords()) {
      if (pty.worktreeId === FLOATING_TERMINAL_WORKTREE_ID) {
        knownPtyIds.add(pty.ptyId)
      }
    }
    for (const leaf of this.terminalSessions.listGraphLeaves()) {
      if (leaf.worktreeId === FLOATING_TERMINAL_WORKTREE_ID && leaf.ptyId) {
        knownPtyIds.add(leaf.ptyId)
      }
    }
    const snapshot = this.mobileSessionTabsByWorktree.get(FLOATING_TERMINAL_WORKTREE_ID)
    for (const tab of snapshot?.tabs ?? []) {
      if (tab.type !== 'terminal') {
        continue
      }
      if (tab.ptyId) {
        knownPtyIds.add(tab.ptyId)
        persistedBindingByPtyId.set(tab.ptyId, {
          tabId: tab.parentTabId,
          paneKey: this.getMobileTerminalPaneKey(tab)
        })
      }
      for (const [leafId, ptyId] of Object.entries(tab.parentLayout?.ptyIdsByLeafId ?? {})) {
        knownPtyIds.add(ptyId)
        persistedBindingByPtyId.set(ptyId, {
          tabId: tab.parentTabId,
          paneKey: isTerminalLeafId(leafId)
            ? makePaneKey(tab.parentTabId, leafId)
            : `${tab.parentTabId}:${/^pane:(\d+)$/.exec(leafId)?.[1] ?? leafId}`
        })
      }
    }

    const liveness = new Map<string, boolean>()
    try {
      for (const ptyId of knownPtyIds) {
        const live = controller.hasPty(ptyId)
        if (live === null) {
          return null
        }
        liveness.set(ptyId, live)
      }
    } catch {
      return null
    }

    const livePtyIds = new Set<string>()
    for (const [ptyId, live] of liveness) {
      let pty = this.terminalSessions.getPtyRecord(ptyId)
      if (live) {
        livePtyIds.add(ptyId)
        const binding = persistedBindingByPtyId.get(ptyId)
        if (!pty && binding) {
          // Why: a live restored daemon PTY needs pane identity before Mobile can issue a safe handle.
          pty = this.recordPtyWorktree(ptyId, FLOATING_TERMINAL_WORKTREE_ID, {
            connected: true,
            tabId: binding.tabId,
            paneKey: binding.paneKey
          })
        } else if (pty) {
          pty = this.recordPtyWorktree(ptyId, FLOATING_TERMINAL_WORKTREE_ID, {
            connected: true
          })
        }
        if (pty) {
          this.refreshPtyForegroundAgent(ptyId)
        }
      } else if (pty && !this.leafExistsForPty(ptyId)) {
        pty.connected = false
        pty.disconnectedAt ??= Date.now()
        this.terminalSessions.commitPtyState(ptyId, { pty })
      }
    }
    this.pruneDisconnectedPtyRecords()
    return livePtyIds
  }

  private pruneDisconnectedPtyTranscript(pty: RuntimePtyWorktreeRecord): void {
    if (pty.connected) {
      return
    }
    // Why: disconnected PTY records can stay addressable for status/exit reads,
    // but their retained transcripts must not accumulate after the process dies.
    pty.tailBuffer = []
    pty.tailPartialLine = ''
    pty.tailPendingAnsi = ''
    pty.tailRedrawCursor = null
    pty.tailTruncated = false
    pty.tailLinesTotal = 0
    pty.waitBlockedAt = null
    // Why: the tail is now empty, so the memoized wait scan must not be reused as
    // the next chunk's "previous" state — clear it so onPtyData recomputes from
    // the reset tail if this record resumes output (adoption/reattach).
    pty.tailWaitState = undefined
  }

  private pruneDisconnectedPtyRecords(): void {
    const retained = [...this.terminalSessions.listPtyRecords()]
      .filter((pty) => !pty.connected && !this.leafExistsForPty(pty.ptyId))
      .sort((a, b) => (a.disconnectedAt ?? 0) - (b.disconnectedAt ?? 0))
    const staleCount = Math.max(0, retained.length - DISCONNECTED_PTY_RECORD_MAX)
    for (const stale of retained.slice(0, staleCount)) {
      // Why: exited runtime-owned PTYs stay readable after exit, but long-lived
      // runtimes can churn through many background sessions. Bound the archive.
      this.dropDisconnectedPtyRecord(stale.ptyId)
    }
  }

  private dropDisconnectedPtyRecord(ptyId: string): void {
    this.terminalSessions.deletePtyRecord(ptyId)
    this.recentPtyOutputById.delete(ptyId)
    this.clearWaitBlockedCheckState(ptyId)
    this.recentPtyPathCandidatesById.delete(ptyId)
    this.ptyOutputSequenceById.delete(ptyId)
    this.providerSequenceInitializedPtys.delete(ptyId)
    this.providerSequenceOffsetByPtyId.delete(ptyId)
    this.providerSnapshotPreferredPtys.delete(ptyId)
    this.providerModeTrackersByPtyId.delete(ptyId)
    this.providerModeSnapshotScansByPtyId.delete(ptyId)
    this.agentStatusOscProcessorsByPtyId.delete(ptyId)
    this.terminalSpawnCommandsByPtyId.delete(ptyId)
    this.disposePtyTitleTracker(ptyId)
    this.oscTitleScanTailByPtyId.delete(ptyId)
    this.osc7ScanTailByPtyId.delete(ptyId)
    this.terminalCwdByPtyId.delete(ptyId)
    this.terminalFileUriHostnameByPtyId.delete(ptyId)
    this.clearAgentRowSnapshotsForPty(ptyId)
    const handle = this.terminalSessions.getTerminalHandleForPty(ptyId)
    if (handle) {
      // Why: pruning can remove a PTY without onPtyExit firing; release any agent
      // team owned by this leader handle so it does not leak.
      this.claudeAgentTeams.removeTeamForLeaderHandle(handle)
      this.terminalSessions.deleteTerminalHandleForPty(ptyId)
    }
  }

  private leafExistsForPty(ptyId: string): boolean {
    return this.terminalSessions.hasGraphLeafForPty(ptyId)
  }

  private getLeavesForPty(ptyId: string): RuntimeLeafRecord[] {
    return this.terminalSessions.getGraphLeavesForPty(ptyId)
  }

  private getSummaryForRuntimeWorktreeId(
    summaries: Map<string, RuntimeWorktreePsSummary>,
    runtimeWorktreeSummaryPathIndex: RuntimeWorktreeSummaryPathIndex,
    missingRuntimeWorktreeIds: Set<string>,
    runtimeWorktreeId: string
  ): RuntimeWorktreePsSummary | null {
    const exact = summaries.get(runtimeWorktreeId)
    if (exact) {
      return exact
    }
    if (missingRuntimeWorktreeIds.has(runtimeWorktreeId)) {
      return null
    }
    const parsed = parseRuntimeWorktreeId(runtimeWorktreeId)
    if (!parsed) {
      return null
    }
    const comparisonPlatform =
      runtimeWorktreeSummaryPathIndex.platformByRepoId.get(parsed.repoId) ?? process.platform
    const indexed = findRuntimeWorktreeSummaryByPath(
      runtimeWorktreeSummaryPathIndex,
      parsed.repoId,
      parsed.worktreePath,
      comparisonPlatform
    )
    if (indexed) {
      return indexed
    }
    missingRuntimeWorktreeIds.add(runtimeWorktreeId)
    return null
  }

  private buildTerminalSummary(
    leaf: RuntimeLeafRecord,
    worktreesById: Map<string, ResolvedWorktree>
  ): RuntimeTerminalSummary {
    const worktree = worktreesById.get(leaf.worktreeId)
    const tab = this.terminalSessions.getGraphTab(leaf.tabId) ?? null

    return {
      handle: this.issueHandle(leaf),
      ptyId: leaf.ptyId,
      worktreeId: leaf.worktreeId,
      worktreeInstanceId: leaf.ptyId
        ? (this.terminalSessions.getPtyRecord(leaf.ptyId)?.worktreeInstanceId ?? null)
        : null,
      worktreePath: worktree?.path ?? '',
      branch: worktree?.branch ?? '',
      tabId: leaf.tabId,
      leafId: leaf.leafId,
      title: getLatestLeafTitle(leaf, tab?.title ?? null),
      connected: leaf.connected,
      writable: leaf.writable,
      lastOutputAt: leaf.lastOutputAt,
      preview: leaf.preview
    }
  }

  private syncMobileSessionTabs(snapshots: RuntimeMobileSessionTabsSnapshot[] | undefined): void {
    if (snapshots === undefined) {
      return
    }
    // Why: renderer graphs are authoritative for renderer tabs, but headless
    // serve terminals never enter that graph unless we preserve their bindings.
    this.hydrateHeadlessMobileSessionTabsFromWorkspaceSession(undefined, {
      allowAttachedWindow: true,
      onlyServeOwnedTerminals: true
    })
    const nextWorktrees = new Set<string>()
    for (const snapshot of snapshots) {
      nextWorktrees.add(snapshot.worktree)
      const existing = this.mobileSessionTabsByWorktree.get(snapshot.worktree)
      const nextSnapshot = this.mergePreservedHeadlessMobileSessionTabs(snapshot, existing)
      if (
        !existing ||
        nextSnapshot.publicationEpoch !== existing.publicationEpoch ||
        nextSnapshot.snapshotVersion >= existing.snapshotVersion
      ) {
        this.mobileSessionTabsByWorktree.set(snapshot.worktree, nextSnapshot)
      }
    }
    for (const [worktreeId, existing] of [...this.mobileSessionTabsByWorktree.entries()]) {
      if (!nextWorktrees.has(worktreeId)) {
        const preserved = this.buildPreservedHeadlessMobileSessionSnapshot(existing)
        if (preserved) {
          this.mobileSessionTabsByWorktree.set(worktreeId, preserved)
          nextWorktrees.add(worktreeId)
        } else {
          this.mobileSessionTabsByWorktree.delete(worktreeId)
          // Why: drop any pending coalesced notify so a stale snapshot can't
          // land after the removed frame.
          this.mobileSessionTabsNotifyCoalescer.cancel(worktreeId)
          this.notifyMobileSessionTabsRemoved(worktreeId)
        }
      }
    }
  }

  private mergePreservedHeadlessMobileSessionTabs(
    snapshot: RuntimeMobileSessionTabsSnapshot,
    existing: RuntimeMobileSessionTabsSnapshot | undefined
  ): RuntimeMobileSessionTabsSnapshot {
    if (!existing) {
      return snapshot
    }
    const preservedTabs = this.collectPreservedHeadlessMobileSessionTabs(existing, snapshot)
    if (preservedTabs.length === 0) {
      return snapshot
    }
    const hasIncomingActiveTab = snapshot.tabs.some((tab) => tab.isActive)
    const normalizedPreservedTabs = preservedTabs.map((tab) =>
      hasIncomingActiveTab ? { ...tab, isActive: false } : tab
    )
    const tabs = this.mergeMobileSessionSnapshotTabs(snapshot.tabs, normalizedPreservedTabs)
    if (tabs.length === snapshot.tabs.length) {
      return snapshot
    }
    const activeTab =
      snapshot.tabs.find((tab) => tab.id === snapshot.activeTabId) ??
      tabs.find((tab) => tab.id === existing.activeTabId) ??
      tabs.find((tab) => tab.isActive) ??
      tabs[0] ??
      null
    const terminalTabs = tabs.filter(
      (tab): tab is RuntimeMobileSessionTerminalTab => tab.type === 'terminal'
    )
    return {
      ...snapshot,
      publicationEpoch: this.getMergedMobileSessionPublicationEpoch(
        snapshot,
        normalizedPreservedTabs
      ),
      snapshotVersion: Math.max(snapshot.snapshotVersion, existing.snapshotVersion),
      activeGroupId: snapshot.activeGroupId ?? existing.activeGroupId,
      activeTabId: activeTab?.id ?? null,
      activeTabType: activeTab?.type ?? null,
      tabGroups: this.mergeMobileSessionTabGroups(
        snapshot.worktree,
        snapshot.tabGroups ?? existing.tabGroups ?? [],
        terminalTabs,
        activeTab?.type === 'terminal' ? activeTab : null
      ),
      tabs
    }
  }

  private buildPreservedHeadlessMobileSessionSnapshot(
    existing: RuntimeMobileSessionTabsSnapshot
  ): RuntimeMobileSessionTabsSnapshot | null {
    const tabs = this.collectPreservedHeadlessMobileSessionTabs(existing)
    if (tabs.length === 0) {
      return null
    }
    const activeTab =
      tabs.find((tab) => tab.id === existing.activeTabId) ??
      tabs.find((tab) => tab.isActive) ??
      tabs[0] ??
      null
    const terminalTabs = tabs.filter(
      (tab): tab is RuntimeMobileSessionTerminalTab => tab.type === 'terminal'
    )
    return {
      ...existing,
      publicationEpoch: this.getMergedMobileSessionPublicationEpoch(existing, tabs),
      activeGroupId:
        existing.activeGroupId ?? this.getHeadlessMobileSessionGroupId(existing.worktree),
      activeTabId: activeTab?.id ?? null,
      activeTabType: activeTab?.type ?? null,
      tabGroups: this.mergeMobileSessionTabGroups(
        existing.worktree,
        existing.tabGroups ?? [],
        terminalTabs,
        activeTab?.type === 'terminal' ? activeTab : null
      ),
      tabs
    }
  }

  private collectPreservedHeadlessMobileSessionTabs(
    existing: RuntimeMobileSessionTabsSnapshot,
    incoming?: RuntimeMobileSessionTabsSnapshot
  ): RuntimeMobileSessionSnapshotTab[] {
    const incomingIds = new Set(
      incoming?.tabs.flatMap((tab) => this.getMobileSessionSnapshotTabIdentityKeys(tab)) ?? []
    )
    return existing.tabs.filter((tab) => {
      if (this.getMobileSessionSnapshotTabIdentityKeys(tab).some((id) => incomingIds.has(id))) {
        return false
      }
      return this.shouldPreserveHeadlessMobileSessionTab(existing, tab)
    })
  }

  private shouldPreserveHeadlessMobileSessionTab(
    snapshot: RuntimeMobileSessionTabsSnapshot,
    tab: RuntimeMobileSessionSnapshotTab
  ): boolean {
    // Why: headless offscreen browser tabs live only on the server and are
    // re-derived from the live bridge on each hydrate, so a renderer-graph merge
    // must keep them rather than prune them as "not in the renderer graph".
    if (tab.type === 'browser') {
      return (
        Boolean(this.offscreenBrowserBackend) &&
        this.isHeadlessMobileSessionPublication(snapshot.publicationEpoch)
      )
    }
    if (tab.type !== 'terminal') {
      return false
    }
    return (
      this.isHeadlessMobileSessionPublication(snapshot.publicationEpoch) ||
      this.hasServeOwnedPtyBinding(tab)
    )
  }

  private isHeadlessMobileSessionPublication(publicationEpoch: string): boolean {
    return (
      publicationEpoch.startsWith('headless:') ||
      publicationEpoch.startsWith('headless-hydrated:') ||
      publicationEpoch.includes(':headless-merge:')
    )
  }

  private getMergedMobileSessionPublicationEpoch(
    snapshot: RuntimeMobileSessionTabsSnapshot,
    preservedTabs: readonly RuntimeMobileSessionSnapshotTab[]
  ): string {
    // Why: preserved snapshots can be merged repeatedly; normalize the prior
    // merge suffix before recomputing so the publication epoch is idempotent.
    const normalizedPublicationEpoch = snapshot.publicationEpoch.split(':headless-merge:')[0]
    const signature = createHash('sha1')
      .update(
        preservedTabs
          .map((tab) =>
            tab.type === 'terminal'
              ? `${tab.id}:${tab.parentTabId}:${tab.ptyId ?? ''}:${tab.leafId}`
              : tab.id
          )
          .join('|')
      )
      .digest('hex')
      .slice(0, 12)
    return `${normalizedPublicationEpoch}:headless-merge:${signature}`
  }

  private notifyMobileSessionTabsRemoved(worktreeId: string): void {
    const removed: RuntimeMobileSessionTabsRemovedResult = {
      worktree: worktreeId,
      publicationEpoch: `removed:${Date.now().toString(36)}`,
      snapshotVersion: 0,
      removed: true,
      activeGroupId: null,
      activeTabId: null,
      activeTabType: null,
      tabs: []
    }
    for (const listener of this.mobileSessionTabListeners) {
      listener(removed)
    }
  }

  notifyMobileSessionTabsChanged(worktreeId?: string): void {
    if (!worktreeId) {
      this.notifyMobileSessionTabSnapshots()
      return
    }
    if (this.offscreenBrowserBackend) {
      const reconciled = this.hydrateHeadlessMobileSessionTabsFromWorkspaceSession(worktreeId)
      // Why: hydrate already reconciles an existing snapshot in place; only
      // reconcile here when it didn't (fresh build or an early-returned hydrate).
      if (!reconciled.has(worktreeId)) {
        const existing = this.mobileSessionTabsByWorktree.get(worktreeId)
        if (existing) {
          this.reconcileHeadlessMobileSessionBrowserTabs(worktreeId, existing)
        }
      }
    }
    // Why: structural changes (tab add/remove/activate) must propagate promptly,
    // so cancel any pending coalesced title/status notify — this immediate emit
    // already reflects the latest snapshot and supersedes it.
    this.mobileSessionTabsNotifyCoalescer.cancel(worktreeId)
    this.notifyMobileSessionTabsChangedNow(worktreeId)
  }

  private notifyMobileSessionTabsChangedNow(worktreeId: string): void {
    if (this.mobileSessionTabListeners.size === 0) {
      return
    }
    const snapshot = this.mobileSessionTabsByWorktree.get(worktreeId)
    if (!snapshot) {
      return
    }
    // Why: browser bridge lifecycle events are already scoped by worktree; avoid
    // fanning out every active workspace snapshot during navigation/tab churn.
    const result = this.toMobileSessionTabsResult(snapshot)
    for (const listener of this.mobileSessionTabListeners) {
      listener(result)
    }
  }

  private notifyMobileSessionTabSnapshots(): void {
    if (this.mobileSessionTabListeners.size === 0) {
      return
    }
    for (const snapshot of this.mobileSessionTabsByWorktree.values()) {
      const result = this.toMobileSessionTabsResult(snapshot)
      for (const listener of this.mobileSessionTabListeners) {
        listener(result)
      }
    }
  }

  private getMobileSessionTabsForWorktree(worktreeId: string): RuntimeMobileSessionTabsResult {
    const snapshot = this.mobileSessionTabsByWorktree.get(worktreeId)
    if (!snapshot) {
      return {
        worktree: worktreeId,
        publicationEpoch: 'none',
        snapshotVersion: 0,
        activeGroupId: null,
        activeTabId: null,
        activeTabType: null,
        tabs: []
      }
    }
    return this.toMobileSessionTabsResult(snapshot)
  }

  private async resolveMobileMarkdownWorktreeId(
    worktreeSelector: string,
    tabId: string
  ): Promise<string> {
    const worktreeId =
      this.getValidatedExplicitWorktreeIdSelector(worktreeSelector) ??
      (await this.resolveWorktreeSelector(worktreeSelector)).id
    const snapshot = this.mobileSessionTabsByWorktree.get(worktreeId)
    const tab = snapshot?.tabs.find(
      (candidate): candidate is RuntimeMobileSessionMarkdownTab =>
        candidate.type === 'markdown' && candidate.id === tabId
    )
    if (!tab) {
      throw new Error('tab_not_found')
    }
    return worktreeId
  }

  private getLiveBrowserTabsByPageId(worktreeId: string): Map<string, BrowserTabInfo> {
    if (!this.agentBrowserBridge?.tabList) {
      return new Map()
    }
    const liveTabs = this.agentBrowserBridge.tabList(worktreeId).tabs
    return new Map(liveTabs.map((tab) => [tab.browserPageId, tab]))
  }

  private collectReturnedSessionTabIds(
    tabs: readonly RuntimeMobileSessionClientTab[]
  ): Set<string> {
    const ids = new Set<string>()
    for (const tab of tabs) {
      ids.add(tab.id)
      if (tab.type === 'terminal') {
        ids.add(tab.parentTabId)
      } else if (tab.type === 'browser') {
        ids.add(tab.browserWorkspaceId)
      }
    }
    return ids
  }

  private sanitizeMobileSessionTabGroups(
    groups: readonly RuntimeMobileSessionTabGroup[] | undefined,
    returnedTabs: readonly RuntimeMobileSessionClientTab[]
  ): RuntimeMobileSessionTabGroup[] | undefined {
    if (!groups || groups.length === 0) {
      return undefined
    }
    const returnedIds = this.collectReturnedSessionTabIds(returnedTabs)
    const sanitized = groups
      .map((group): RuntimeMobileSessionTabGroup | null => {
        const tabOrder = group.tabOrder.filter((tabId) => returnedIds.has(tabId))
        if (tabOrder.length === 0) {
          return null
        }
        const activeTabId =
          group.activeTabId && tabOrder.includes(group.activeTabId)
            ? group.activeTabId
            : (tabOrder[0] ?? null)
        const recentTabIds = group.recentTabIds?.filter((tabId) => tabOrder.includes(tabId))
        return {
          id: group.id,
          activeTabId,
          tabOrder,
          ...(recentTabIds && recentTabIds.length > 0 ? { recentTabIds } : {})
        }
      })
      .filter((group): group is RuntimeMobileSessionTabGroup => group !== null)
    return sanitized.length > 0 ? sanitized : undefined
  }

  private pruneMobileSessionTabGroupLayout(
    layout: TabGroupLayoutNode | null | undefined,
    validGroupIds: ReadonlySet<string>
  ): TabGroupLayoutNode | null {
    if (!layout) {
      return null
    }
    if (layout.type === 'leaf') {
      return validGroupIds.has(layout.groupId) ? layout : null
    }
    const first = this.pruneMobileSessionTabGroupLayout(layout.first, validGroupIds)
    const second = this.pruneMobileSessionTabGroupLayout(layout.second, validGroupIds)
    if (first && second) {
      return { ...layout, first, second }
    }
    return first ?? second
  }

  /**
   * Transforms an internal mobile session tab snapshot into a sanitized client payload,
   * resolving launch agent ownership and normalizing titles.
   */
  private toMobileSessionTabsResult(
    snapshot: RuntimeMobileSessionTabsSnapshot
  ): RuntimeMobileSessionTabsResult {
    const tabs: RuntimeMobileSessionClientTab[] = []
    const liveBrowserTabsByPageId = this.getLiveBrowserTabsByPageId(snapshot.worktree)
    // Why: a live PTY backs exactly one terminal surface, so it must map to a
    // single emitted tab. After agent sleep + mobile wake, a stale
    // headless-hydrated leaf can survive beside the renderer's live leaf and both
    // resolve to the freshly-woken agent PTY (same issuePtyHandle handle) — which
    // renders two panes with the same React key and crashes the client. Claim
    // each live PTY once. Split siblings never collide because distinct leaves own
    // distinct PTYs; renderer tabs precede preserved headless tabs, so the live
    // one wins.
    const claimedLivePtyIds = new Set<string>()
    for (const tab of snapshot.tabs) {
      if (tab.type === 'browser') {
        const liveTab = tab.browserPageId
          ? liveBrowserTabsByPageId.get(tab.browserPageId)
          : undefined
        if (!liveTab) {
          continue
        }
        // Why: renderer session snapshots can lag behind BrowserView teardown or
        // process swaps. Pairing clients should only see browser pages the main
        // browser bridge can still route commands and screencasts to.
        tabs.push({
          ...tab,
          title: liveTab.title || tab.title,
          url: liveTab.url || tab.url,
          // Why: bridge "active" means active BrowserView/webContents, not
          // active Yiru tab. Preserve the renderer's app-level session focus.
          isActive: tab.isActive
        })
        continue
      }
      if (tab.type === 'markdown' || tab.type === 'file') {
        tabs.push(tab)
        continue
      }
      const syncedTab = this.terminalSessions.getGraphTab(tab.parentTabId)
      const leaf =
        this.terminalSessions.getGraphLeafByKey(this.getLeafKey(tab.parentTabId, tab.leafId)) ??
        null
      const liveLeaf = leaf?.ptyId && leaf.connected ? leaf : null
      const liveLeafPtyId = liveLeaf?.ptyId ?? null
      const liveLeafPty = liveLeafPtyId
        ? (this.terminalSessions.getPtyRecord(liveLeafPtyId) ?? null)
        : null
      const pty = liveLeaf
        ? null
        : this.findPtyForMobileTerminalTab(snapshot.worktree, tab, {
            allowWorktreeOnlyMatch: !snapshot.publicationEpoch.startsWith('headless')
          })
      const livePty = pty?.connected ? pty : null
      // Why: enforce the one-live-PTY-per-tab invariant. A later tab resolving to
      // a PTY an earlier tab already claimed is a duplicate surface (e.g. a stale
      // headless-hydrated leaf re-bound to a woken agent PTY) — drop it so the
      // client never sees two tabs sharing a terminal handle. Handles derive purely
      // from the PTY id (issuePtyHandle), so the id is a faithful proxy for the
      // emitted handle. Pending tabs (no live PTY) are left untouched.
      const resolvedLivePtyId = liveLeafPtyId ?? livePty?.ptyId ?? null
      if (resolvedLivePtyId !== null) {
        if (claimedLivePtyIds.has(resolvedLivePtyId)) {
          continue
        }
        claimedLivePtyIds.add(resolvedLivePtyId)
      }
      const legacyPaneId = /^pane:(\d+)$/.exec(tab.leafId)?.[1] ?? null
      const paneKey = isTerminalLeafId(tab.leafId)
        ? makePaneKey(tab.parentTabId, tab.leafId)
        : `${tab.parentTabId}:${legacyPaneId ?? tab.leafId}`
      const leafTitle = leaf
        ? getLatestAgentCandidateTitle(
            { title: leaf.paneTitle, updatedAt: leaf.paneTitleUpdatedAt },
            { title: leaf.lastOscTitle, updatedAt: leaf.lastOscTitleAt }
          )
        : null
      const ptyTitle = pty
        ? getLatestAgentCandidateTitle(
            { title: pty.title, updatedAt: pty.titleUpdatedAt },
            { title: pty.lastOscTitle, updatedAt: pty.lastOscTitleAt }
          )
        : null
      const launchAgent = tab.launchAgent ?? liveLeafPty?.launchAgent ?? pty?.launchAgent ?? null
      const ownerAgent = launchAgent ?? liveLeafPty?.foregroundAgent ?? pty?.foregroundAgent ?? null
      const title = normalizeCompatibleAgentTitleForOwner(
        leafTitle ?? ptyTitle ?? syncedTab?.title ?? tab.title,
        ownerAgent
      )
      const liveTitleEvidence = leafTitle ?? ptyTitle
      const liveTitleEvidenceClassification = classifyAgentTitle(liveTitleEvidence)
      const normalizedTabAgentStatus = tab.agentStatus
        ? normalizeCompatibleAgentStatusEntryForOwner(tab.agentStatus, ownerAgent)
        : null
      // Why: keep the rich hook-driven status when the agent has a live
      // interactive prompt or an active tool — those are authoritative agent
      // activity even if the terminal's title isn't agent-classified (e.g. it
      // shows a task/branch name). Otherwise the mobile/web client falls back to
      // the OSC-title-only status and never sees interactivePrompt (the question
      // card never renders).
      const hasLiveAgentSignal =
        normalizedTabAgentStatus?.interactivePrompt != null ||
        normalizedTabAgentStatus?.toolName != null
      const keepFullAgentStatus =
        normalizedTabAgentStatus &&
        (liveTitleEvidence === null ||
          liveTitleEvidenceClassification === 'agent' ||
          hasLiveAgentSignal)
      const agentStatus = keepFullAgentStatus
        ? { agentStatus: normalizedTabAgentStatus }
        : // Why: when live title evidence says the pane is idle (e.g. the Claude
          // agents picker or a neutral shell title), suppress the stale "working"
          // state so the client shows no spinner — but retain agent identity
          // (agentType + providerSession) so native chat can still address an
          // idle agent's transcript. Reset the transient state to 'done'.
          normalizedTabAgentStatus?.agentType != null
          ? {
              agentStatus: {
                state: 'done' as const,
                prompt: '',
                updatedAt: normalizedTabAgentStatus.updatedAt,
                stateStartedAt: normalizedTabAgentStatus.stateStartedAt,
                paneKey: normalizedTabAgentStatus.paneKey,
                stateHistory: [],
                agentType: normalizedTabAgentStatus.agentType,
                ...(normalizedTabAgentStatus.providerSession
                  ? { providerSession: normalizedTabAgentStatus.providerSession }
                  : {})
              }
            }
          : null
      // Why: web/mobile clients hold these handles across renderer graph syncs;
      // leaf handles are graph-epoch-bound, but PTY handles remain streamable.
      const terminalPty = liveLeafPtyId
        ? this.recordPtyWorktree(liveLeafPtyId, snapshot.worktree, {
            tabId: tab.parentTabId,
            paneKey,
            connected: true
          })
        : livePty
      const terminalHandle = terminalPty ? this.issuePtyHandle(terminalPty) : null
      tabs.push({
        type: 'terminal',
        id: tab.id,
        parentTabId: tab.parentTabId,
        leafId: tab.leafId,
        title,
        ...(tab.ptyId ? { ptyId: tab.ptyId } : {}),
        ...(tab.terminalTheme ? { terminalTheme: tab.terminalTheme } : {}),
        ...(launchAgent ? { launchAgent } : {}),
        ...(agentStatus ?? this.buildPtyMobileAgentStatus(livePty ?? pty, tab, terminalHandle)),
        ...(tab.parentLayout ? { parentLayout: tab.parentLayout } : {}),
        ...(tab.startupCwd ? { startupCwd: tab.startupCwd } : {}),
        ...(tab.color != null ? { color: tab.color } : {}),
        ...(tab.isPinned ? { isPinned: true } : {}),
        ...(tab.viewMode ? { viewMode: tab.viewMode } : {}),
        isActive: tab.isActive,
        ...(terminalHandle
          ? {
              status: 'ready' as const,
              terminal: terminalHandle,
              worktreeInstanceId: terminalPty?.worktreeInstanceId ?? null
            }
          : { status: 'pending-handle' as const, terminal: null })
      })
    }
    const active =
      tabs.find((tab) => tab.isActive && tab.id === snapshot.activeTabId) ??
      tabs.find((tab) => tab.isActive) ??
      (snapshot.activeTabId ? (tabs[0] ?? null) : null)
    const normalizedTabs =
      active && !tabs.some((tab) => tab.isActive)
        ? tabs.map((tab) => (tab.id === active.id ? { ...tab, isActive: true } : tab))
        : tabs
    const tabGroups = this.sanitizeMobileSessionTabGroups(snapshot.tabGroups, normalizedTabs)
    const validGroupIds = new Set(tabGroups?.map((group) => group.id) ?? [])
    const tabGroupLayout =
      snapshot.tabGroupLayout === undefined
        ? undefined
        : this.pruneMobileSessionTabGroupLayout(snapshot.tabGroupLayout, validGroupIds)
    const activeGroupId =
      snapshot.activeGroupId && validGroupIds.has(snapshot.activeGroupId)
        ? snapshot.activeGroupId
        : (tabGroups?.find((group) =>
            active
              ? group.tabOrder.some((tabId) =>
                  this.collectReturnedSessionTabIds([active]).has(tabId)
                )
              : false
          )?.id ??
          tabGroups?.[0]?.id ??
          null)
    return {
      worktree: snapshot.worktree,
      publicationEpoch: snapshot.publicationEpoch,
      snapshotVersion: snapshot.snapshotVersion,
      activeGroupId,
      activeTabId: active?.id ?? null,
      activeTabType: active?.type ?? null,
      ...(tabGroups ? { tabGroups } : {}),
      ...(snapshot.tabGroupLayout !== undefined ? { tabGroupLayout } : {}),
      tabs: normalizedTabs
    }
  }

  /**
   * Generates a mobile-friendly status entry for a PTY, aligning agentType
   * and titles with the active owner.
   */
  private buildPtyMobileAgentStatus(
    pty: RuntimePtyWorktreeRecord | null,
    tab: RuntimeMobileSessionTerminalTab,
    terminalHandle: string | null
  ): { agentStatus: AgentStatusEntry } | Record<string, never> {
    const paneKey = this.getMobileTerminalPaneKey(tab)
    const retained = this.getFreshRetainedAgentStatusForMobileTab(paneKey, pty, tab)
    if (!pty?.lastAgentStatus && !retained) {
      return {}
    }
    const leaf =
      this.terminalSessions.getGraphLeafByKey(this.getLeafKey(tab.parentTabId, tab.leafId)) ?? null
    const ptyTitle = pty
      ? getLatestAgentCandidateTitle(
          { title: pty.title, updatedAt: pty.titleUpdatedAt },
          { title: pty.lastOscTitle, updatedAt: pty.lastOscTitleAt }
        )
      : leaf
        ? getLatestAgentCandidateTitle(
            { title: leaf.paneTitle, updatedAt: leaf.paneTitleUpdatedAt },
            { title: leaf.lastOscTitle, updatedAt: leaf.lastOscTitleAt }
          )
        : null
    const ptyTitleClassification = classifyAgentTitle(ptyTitle)
    if (ptyTitle !== null && ptyTitleClassification !== 'agent') {
      // Why: a non-agent title means the shell owns the pane again (the agent
      // exited or was replaced) — suppressing here is what clears stuck
      // spinners (#1437). A live hook signal (question card / active tool) is
      // authoritative agent activity even under a task-named title, so it
      // survives the suppression, mirroring the renderer-synced branch above.
      const hasLiveHookSignal =
        retained?.payload.interactivePrompt != null || retained?.payload.toolName != null
      if (!hasLiveHookSignal) {
        return {}
      }
    }
    const ownerAgent = tab.launchAgent ?? pty?.launchAgent ?? pty?.foregroundAgent ?? null
    const terminalTitle = normalizeCompatibleAgentTitleForOwner(
      (pty ? getLatestPtyTitle(pty) : null) ?? tab.title,
      ownerAgent
    )
    // Why: hook (OSC 9999) payloads carry the real state, prompt, and agent
    // identity; the title heuristic below is a fallback with none of that.
    // Without this, headless-serve clients only ever saw title-derived rows
    // and hook-only transitions (e.g. opencode waiting) never surfaced (#7970).
    if (retained) {
      return {
        agentStatus: normalizeCompatibleAgentStatusEntryForOwner(
          {
            ...retained.payload,
            paneKey,
            updatedAt: retained.updatedAt,
            stateStartedAt: retained.stateStartedAt,
            stateHistory: [],
            ...(terminalHandle ? { terminalHandle } : {}),
            ...((pty?.worktreeId ?? retained.worktreeId)
              ? { worktreeId: pty?.worktreeId ?? retained.worktreeId }
              : {}),
            tabId: tab.parentTabId,
            terminalTitle
          },
          ownerAgent
        )
      }
    }
    const now = pty!.lastOutputAt ?? Date.now()
    const agentType = ownerAgent ?? undefined
    return {
      agentStatus: {
        state:
          pty!.lastAgentStatus === 'working'
            ? 'working'
            : pty!.lastAgentStatus === 'permission'
              ? 'blocked'
              : 'done',
        prompt: '',
        updatedAt: now,
        stateStartedAt: now,
        paneKey,
        ...(terminalHandle ? { terminalHandle } : {}),
        ...(agentType ? { agentType } : {}),
        worktreeId: pty!.worktreeId,
        tabId: tab.parentTabId,
        terminalTitle,
        stateHistory: []
      }
    }
  }

  /** The retained OSC 9999 hook row for this mobile tab, when fresh enough to
   *  trust. Looked up by pane identity first, then by PTY ownership because
   *  legacy `pane:N` leaf ids can drift from the hook-side pane key. */
  private getFreshRetainedAgentStatusForMobileTab(
    paneKey: string,
    pty: RuntimePtyWorktreeRecord | null,
    tab: RuntimeMobileSessionTerminalTab
  ): RuntimeAgentRowSnapshot | null {
    let retained = this.latestAgentStatusByPaneKey.get(paneKey) ?? null
    if (!retained) {
      const ptyId = pty?.ptyId ?? tab.ptyId ?? null
      if (ptyId) {
        for (const snapshot of this.latestAgentStatusByPaneKey.values()) {
          if (snapshot.ptyId !== ptyId) {
            continue
          }
          if (!retained || snapshot.updatedAt > retained.updatedAt) {
            retained = snapshot
          }
        }
      }
    }
    if (!retained || Date.now() - retained.updatedAt > AGENT_STATUS_STALE_AFTER_MS) {
      return null
    }
    return retained
  }

  private findPtyForMobileTerminalTab(
    worktreeId: string,
    tab: RuntimeMobileSessionTerminalTab,
    options: { allowWorktreeOnlyMatch?: boolean } = {}
  ): RuntimePtyWorktreeRecord | null {
    const snapshotPtyId = tab.ptyId ?? tab.parentLayout?.ptyIdsByLeafId?.[tab.leafId] ?? null
    const paneKey = this.getMobileTerminalPaneKey(tab)
    if (snapshotPtyId) {
      const pty = this.terminalSessions.getPtyRecord(snapshotPtyId)
      if (!pty) {
        return null
      }
      // Why: persisted PTY ids can collide with unrelated provider ids after a
      // restart. Only a matching spawn-time pane identity is safe to expose.
      if (this.mobileTerminalTabMatchesPty(worktreeId, tab, pty, paneKey)) {
        return pty
      }
      if (
        options.allowWorktreeOnlyMatch === true &&
        pty.worktreeId === worktreeId &&
        pty.tabId === null &&
        pty.paneKey === null
      ) {
        return pty
      }
      return null
    }
    const paneKeys = new Set([`${tab.parentTabId}:${tab.leafId}`])
    if (tab.leafId === `pane:${FIRST_PANE_ID}`) {
      paneKeys.add(`${tab.parentTabId}:${FIRST_PANE_ID}`)
    }
    for (const pty of this.terminalSessions.listPtyRecords()) {
      if (pty.tabId === tab.parentTabId && pty.paneKey && paneKeys.has(pty.paneKey)) {
        return pty
      }
    }
    return null
  }

  private getMobileTerminalPaneKey(tab: RuntimeMobileSessionTerminalTab): string {
    if (isTerminalLeafId(tab.leafId)) {
      return makePaneKey(tab.parentTabId, tab.leafId)
    }
    const legacyPaneId = /^pane:(\d+)$/.exec(tab.leafId)?.[1] ?? null
    return `${tab.parentTabId}:${legacyPaneId ?? tab.leafId}`
  }

  private mobileTerminalTabMatchesPty(
    worktreeId: string,
    tab: RuntimeMobileSessionTerminalTab,
    pty: RuntimePtyWorktreeRecord,
    paneKey = this.getMobileTerminalPaneKey(tab)
  ): boolean {
    return pty.worktreeId === worktreeId && pty.tabId === tab.parentTabId && pty.paneKey === paneKey
  }

  // Why: group address resolution (Section 4.5) needs to query per-handle agent
  // status without throwing on stale handles, so this returns null on any error.
  getAgentStatusForHandle(handle: string): string | null {
    try {
      const ptyId = this.getTerminalAgentStatusPtyId(handle)
      return this.getTerminalAgentStatusSnapshot(handle, ptyId).titleStatus
    } catch {
      return null
    }
  }

  getAgentStatusOrchestrationContextForPaneKey(
    paneKey: string
  ): AgentStatusOrchestrationContext | undefined {
    const handle = this.getTerminalHandleForPaneKey(paneKey)
    if (!handle) {
      return undefined
    }
    return this.getAgentStatusOrchestrationContextForHandle(handle)
  }

  getAgentStatusTerminalHandleForPaneKey(paneKey: string): string | undefined {
    return this.getTerminalHandleForPaneKey(paneKey) ?? undefined
  }

  getAgentStatusLaunchConfigForPaneKey(
    paneKey: string,
    args?: { launchToken?: string }
  ): SleepingAgentLaunchConfig | undefined {
    const pty = this.getPtyRecordForPaneKey(paneKey)
    if (!pty?.launchConfig) {
      return undefined
    }
    if (pty.launchToken === null || pty.launchToken !== args?.launchToken) {
      return undefined
    }
    return copySleepingAgentLaunchConfig(pty.launchConfig)
  }

  private buildAgentOrchestrationByPaneKey():
    | Record<string, AgentStatusOrchestrationContext>
    | undefined {
    const db = this.getOrchestrationDbIfAvailable()
    if (!db) {
      return undefined
    }
    const contexts: Record<string, AgentStatusOrchestrationContext> = {}
    for (const leaf of this.terminalSessions.listGraphLeaves()) {
      if (!leaf.ptyId) {
        continue
      }
      const handle = this.issueHandle(leaf)
      const context = this.getAgentStatusOrchestrationContextForHandle(handle, db)
      if (context) {
        contexts[this.makeRuntimePaneKey(leaf)] = context
      }
    }
    for (const pty of this.terminalSessions.listPtyRecords()) {
      if (!pty.paneKey || contexts[pty.paneKey]) {
        continue
      }
      const handle = this.issuePtyHandle(pty)
      const context = this.getAgentStatusOrchestrationContextForHandle(handle, db)
      if (context) {
        contexts[pty.paneKey] = context
      }
    }
    return Object.keys(contexts).length > 0 ? contexts : undefined
  }

  private getAgentStatusOrchestrationContextForHandle(
    handle: string,
    db = this.getOrchestrationDbIfAvailable()
  ): AgentStatusOrchestrationContext | undefined {
    // Why: active dispatches are authoritative for reused terminals. Completed
    // context is only useful while the corresponding done/recent row can still
    // be visible; after that it would stale-group unrelated future work.
    const dispatch =
      db?.getActiveDispatchForTerminal?.(handle) ??
      this.getRecentCompletedDispatchForTerminal(handle, db)
    if (!dispatch) {
      return undefined
    }
    const task = db?.getTask?.(dispatch.task_id)
    const display =
      typeof task?.spec === 'string'
        ? buildOrchestrationTaskDisplayMetadata({
            spec: task.spec,
            taskTitle: task.task_title,
            displayName: task.display_name
          })
        : { taskTitle: '', displayName: '' }
    const activeRun = dispatch.status === 'completed' ? undefined : db?.getActiveCoordinatorRun?.()
    const parentTerminalHandle =
      task?.created_by_terminal_handle ??
      (activeRun?.coordinator_handle && activeRun.coordinator_handle !== handle
        ? activeRun.coordinator_handle
        : undefined)
    const parentPaneKey = parentTerminalHandle
      ? this.getPaneKeyForTerminalHandle(parentTerminalHandle)
      : undefined

    return {
      taskId: dispatch.task_id,
      dispatchId: dispatch.id,
      ...(display.taskTitle ? { taskTitle: display.taskTitle } : {}),
      ...(display.displayName ? { displayName: display.displayName } : {}),
      ...(parentTerminalHandle ? { parentTerminalHandle } : {}),
      ...(parentPaneKey ? { parentPaneKey } : {}),
      ...(activeRun?.coordinator_handle ? { coordinatorHandle: activeRun.coordinator_handle } : {}),
      ...(activeRun?.id ? { orchestrationRunId: activeRun.id } : {})
    }
  }

  private getRecentCompletedDispatchForTerminal(
    handle: string,
    db = this.getOrchestrationDbIfAvailable()
  ): ReturnType<OrchestrationDb['getLatestDispatchForTerminal']> {
    const dispatch = db?.getLatestDispatchForTerminal?.(handle)
    if (dispatch?.status !== 'completed' || !dispatch.completed_at) {
      return undefined
    }
    const completedAtMs = Date.parse(
      dispatch.completed_at.includes('T')
        ? dispatch.completed_at
        : `${dispatch.completed_at.replace(' ', 'T')}Z`
    )
    if (!Number.isFinite(completedAtMs)) {
      return undefined
    }
    return Date.now() - completedAtMs <= AGENT_STATUS_STALE_AFTER_MS ? dispatch : undefined
  }

  private getTerminalHandleForPaneKey(paneKey: string): string | null {
    const parsed = parsePaneKey(paneKey)
    if (parsed) {
      const leaf = this.terminalSessions.getGraphLeafByKey(
        this.getLeafKey(parsed.tabId, parsed.leafId)
      )
      if (leaf?.ptyId) {
        return this.issueHandle(leaf)
      }
    }
    for (const pty of this.terminalSessions.listPtyRecords()) {
      if (pty.paneKey === paneKey) {
        return this.issuePtyHandle(pty)
      }
    }
    return null
  }

  private getPtyRecordForPaneKey(paneKey: string): RuntimePtyWorktreeRecord | null {
    const parsed = parsePaneKey(paneKey)
    if (parsed) {
      const leaf = this.terminalSessions.getGraphLeafByKey(
        this.getLeafKey(parsed.tabId, parsed.leafId)
      )
      const pty = leaf?.ptyId ? this.terminalSessions.getPtyRecord(leaf.ptyId) : undefined
      if (pty) {
        return pty
      }
    }
    for (const pty of this.terminalSessions.listPtyRecords()) {
      if (pty.paneKey === paneKey) {
        return pty
      }
    }
    return null
  }

  private getPaneKeyForTerminalHandle(handle: string): string | null {
    const livePty = this.getLivePtyForHandle(handle)
    if (livePty?.pty.paneKey) {
      return livePty.pty.paneKey
    }
    const record = this.terminalSessions.getTerminalHandle(handle)
    if (!record || record.runtimeId !== this.runtimeId) {
      return null
    }
    if (!isTerminalLeafId(record.leafId)) {
      return null
    }
    return makePaneKey(record.tabId, record.leafId)
  }

  private setPtyManagementTitleFromObservedTitle(
    pty: RuntimePtyWorktreeRecord,
    title: string | null | undefined,
    observedAt: number
  ): void {
    const trimmed = title?.trim()
    if (!trimmed) {
      return
    }
    if (isClaudeManagementTitle(trimmed)) {
      pty.managementTitle = trimmed
      pty.managementTitleAt = observedAt
      return
    }
    if (
      detectAgentStatusFromTitle(trimmed) !== null &&
      observedAt >= (pty.managementTitleAt ?? -1)
    ) {
      pty.managementTitle = null
      pty.managementTitleAt = null
    }
  }

  private nextTitleObservationSequence(): number {
    this.titleObservationSequence += 1
    return this.titleObservationSequence
  }

  // Why: title detection is the tightest signal for agent presence, but a
  // Claude management title is negative evidence for task-capable activity.
  // Check pane-scoped titles before tab fallback, then retained ready-tail text,
  // stale title status, and foreground process.
  async isTerminalRunningAgent(handle: string): Promise<boolean> {
    try {
      const pty = this.getLivePtyForHandle(handle)
      if (pty) {
        const leaf = this.getPrimaryLeafForPty(pty.pty.ptyId)
        return await this.isPtyRunningAgent(pty.pty, leaf)
      }
      const { leaf } = this.getLiveLeafForHandle(handle)
      // Why: check both the leaf-level pane title (synced from the renderer's
      // runtimePaneTitlesByTabId) and the tab-level title. The tab title already
      // includes OSC-enriched agent indicators (e.g. ✳ prefix) synced from the
      // renderer's xterm instance.
      const paneTitle = getLatestLeafTitle(leaf, null)
      const paneTitleClassification = classifyAgentTitle(paneTitle)
      if (paneTitleClassification === 'agent') {
        return true
      }
      const tabTitle = this.terminalSessions.getGraphTab(leaf.tabId)?.title?.trim() || null
      const tabTitleClassification = paneTitle === null ? classifyAgentTitle(tabTitle) : 'neutral'
      if (tabTitleClassification === 'agent') {
        return true
      }
      const waitText = buildTerminalWaitText(leaf.tailBuffer, leaf.tailPartialLine, leaf.preview)
      if (isKnownReadyPromptPreview(waitText)) {
        return true
      }
      const hasCurrentTitleEvidence = paneTitle !== null || tabTitle !== null
      if (leaf.lastAgentStatus !== null && !hasCurrentTitleEvidence) {
        return true
      }
      if (!leaf.ptyId || !this.ptyController) {
        return false
      }
      const fg = await this.ptyController.getForegroundProcess(leaf.ptyId)
      if (!fg) {
        return false
      }
      // Why: Claude's management UI runs under the Claude process but is not a
      // task-capable agent session. Suppress that process only; another foreground
      // agent can take over before titles update.
      const shouldSuppressClaudeForeground =
        paneTitleClassification === 'management' || tabTitleClassification === 'management'
      if (shouldSuppressClaudeForeground && isExpectedAgentProcess(fg, 'claude')) {
        return false
      }
      // Why: review-note delivery auto-submits with Enter. A generic non-shell
      // TUI can be focused in a terminal, but only known agent processes are safe.
      return await this.isRecognizedForegroundAgentProcess(leaf.ptyId, fg, {
        suppressClaude: shouldSuppressClaudeForeground
      })
    } catch {
      return false
    }
  }

  private async isPtyRunningAgent(
    pty: RuntimePtyWorktreeRecord,
    leaf: RuntimeLeafRecord | null = null
  ): Promise<boolean> {
    const leafTitle = leaf
      ? getLatestAgentCandidateTitle(
          { title: leaf.paneTitle, updatedAt: leaf.paneTitleUpdatedAt },
          { title: leaf.lastOscTitle, updatedAt: leaf.lastOscTitleAt }
        )
      : null
    const leafTitleClassification = classifyAgentTitle(leafTitle)
    if (leafTitleClassification === 'agent') {
      return true
    }
    const ptyTitle = getLatestAgentCandidateTitle(
      { title: pty.title, updatedAt: pty.titleUpdatedAt },
      { title: pty.lastOscTitle, updatedAt: pty.lastOscTitleAt }
    )
    const ptyTitleClassification = classifyAgentTitle(ptyTitle)
    if (leafTitle === null && ptyTitleClassification === 'agent') {
      return true
    }
    const managementTitleClassification = classifyLatestAgentTitle({
      title: pty.managementTitle,
      updatedAt: pty.managementTitleAt
    })
    const waitText = buildTerminalWaitText(pty.tailBuffer, pty.tailPartialLine, pty.preview)
    if (isKnownReadyPromptPreview(waitText)) {
      return true
    }
    // Why: stale status is only a fallback when no current title evidence
    // exists; neutral titles such as shells should clear it.
    if (
      pty.lastAgentStatus !== null &&
      leafTitle === null &&
      ptyTitle === null &&
      managementTitleClassification !== 'management'
    ) {
      return true
    }
    if (!this.ptyController) {
      return false
    }
    const fg = await this.ptyController.getForegroundProcess(pty.ptyId)
    if (!fg) {
      return false
    }
    const shouldSuppressClaudeForeground =
      leafTitle !== null
        ? leafTitleClassification === 'management'
        : managementTitleClassification === 'management'
    if (shouldSuppressClaudeForeground && isExpectedAgentProcess(fg, 'claude')) {
      return false
    }
    // Why: review-note delivery auto-submits with Enter. A generic non-shell
    // TUI can be focused in a terminal, but only known agent processes are safe.
    return await this.isRecognizedForegroundAgentProcess(pty.ptyId, fg, {
      suppressClaude: shouldSuppressClaudeForeground
    })
  }

  private async isRecognizedForegroundAgentProcess(
    ptyId: string,
    foregroundProcess: string,
    options: { suppressClaude?: boolean } = {}
  ): Promise<boolean> {
    const initialRecognition = recognizeAgentProcess(foregroundProcess)
    if (initialRecognition !== null) {
      return !(
        options.suppressClaude === true &&
        isExpectedAgentProcess(initialRecognition.processName, 'claude')
      )
    }
    if (!this.isAgentWrapperForegroundProcess(foregroundProcess) || !this.ptyController) {
      return false
    }
    const startedAt = Date.now()
    while (Date.now() - startedAt < FOREGROUND_AGENT_WRAPPER_RETRY_TIMEOUT_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, FOREGROUND_AGENT_WRAPPER_RETRY_INTERVAL_MS)
      )
      const refreshedProcess = await this.ptyController.getForegroundProcess(ptyId)
      const refreshedRecognition = recognizeAgentProcess(refreshedProcess)
      if (refreshedRecognition !== null) {
        return !(
          options.suppressClaude === true &&
          isExpectedAgentProcess(refreshedRecognition.processName, 'claude')
        )
      }
      if (!refreshedProcess || !this.isAgentWrapperForegroundProcess(refreshedProcess)) {
        return false
      }
    }
    return false
  }

  private isAgentWrapperForegroundProcess(processName: string): boolean {
    // Why: daemon/SSH PTYs can report the interpreter before their async
    // command-line cache resolves to the actual agent binary. Retry only
    // known wrappers, never arbitrary non-shell TUIs.
    return isAgentForegroundWrapperProcess(processName)
  }

  private getPrimaryLeafForPty(ptyId: string): RuntimeLeafRecord | null {
    return this.getLeavesForPty(ptyId)[0] ?? null
  }

  deliverPendingMessagesForHandle(handle: string): void {
    try {
      const { leaf } = this.getLiveLeafForHandle(handle)
      if (leaf.lastAgentStatus === 'idle') {
        this.deliverPendingMessages(leaf)
      }
    } catch {
      // Unknown or stale handles cannot be pushed immediately; the persisted
      // message remains available via explicit check or future idle delivery.
    }
  }

  // Why: after a message is inserted for a recipient, any blocking
  // orchestration.check --wait calls watching that handle must be woken
  // so they can return the new message immediately instead of polling.
  notifyMessageArrived(handle: string, messageType?: string): void {
    const waiters = this.terminalSessions.listMessageWaiters(handle)
    if (waiters.length === 0) {
      return
    }
    for (const waiter of waiters) {
      // Why: a coordinator waiting for worker_done/escalation should not be
      // woken by worker heartbeat noise and mistake that empty read for idleness.
      if (messageType && waiter.typeFilter && !waiter.typeFilter.includes(messageType)) {
        continue
      }
      this.resolveMessageWaiter(waiter)
    }
  }

  waitForMessage(
    handle: string,
    options?: { typeFilter?: string[]; timeoutMs?: number; signal?: AbortSignal }
  ): Promise<void> {
    return new Promise((resolve) => {
      const timeoutMs = options?.timeoutMs ?? MESSAGE_WAIT_DEFAULT_TIMEOUT_MS

      const waiter: MessageWaiter = {
        handle,
        typeFilter: options?.typeFilter,
        resolve,
        timeout: null,
        abortCleanup: null
      }

      // Why: if the caller aborts (socket closed on the RPC side — see design
      // doc §3.1 counter-lifecycle), resolve immediately so the long-poll slot
      // is released instead of counting down the full timeoutMs with a dead
      // client on the other end.
      const signal = options?.signal
      const onAbort = (): void => {
        this.removeMessageWaiter(waiter)
        resolve()
      }
      if (signal) {
        if (signal.aborted) {
          resolve()
          return
        }
        waiter.abortCleanup = () => signal.removeEventListener('abort', onAbort)
        signal.addEventListener('abort', onAbort, { once: true })
      }

      waiter.timeout = setTimeout(() => {
        this.removeMessageWaiter(waiter)
        resolve()
      }, timeoutMs)

      this.terminalSessions.addMessageWaiter(waiter)
    })
  }

  private resolveMessageWaiter(waiter: MessageWaiter): void {
    this.removeMessageWaiter(waiter)
    waiter.resolve()
  }

  private removeMessageWaiter(waiter: MessageWaiter): void {
    if (waiter.timeout) {
      clearTimeout(waiter.timeout)
      waiter.timeout = null
    }
    if (waiter.abortCleanup) {
      waiter.abortCleanup()
      waiter.abortCleanup = null
    }
    this.terminalSessions.removeMessageWaiter(waiter)
  }

  private buildPtyTerminalSummary(
    pty: RuntimePtyWorktreeRecord,
    worktreesById: Map<string, ResolvedWorktree>
  ): RuntimeTerminalSummary {
    const worktree = worktreesById.get(pty.worktreeId)

    return {
      handle: this.issuePtyHandle(pty),
      ptyId: pty.ptyId,
      worktreeId: pty.worktreeId,
      worktreeInstanceId: pty.worktreeInstanceId,
      worktreePath: worktree?.path ?? '',
      branch: worktree?.branch ?? '',
      tabId: `pty:${pty.ptyId}`,
      leafId: `pty:${pty.ptyId}`,
      title: getLatestPtyTitle(pty),
      connected: pty.connected,
      writable: pty.connected,
      lastOutputAt: pty.lastOutputAt,
      preview: pty.preview
    }
  }

  private getLiveLeafForHandle(handle: string): {
    record: TerminalHandleRecord
    leaf: RuntimeLeafRecord
  } {
    this.assertGraphReady()
    const record = this.terminalSessions.getTerminalHandle(handle)
    if (!record || record.runtimeId !== this.runtimeId) {
      throw new Error('terminal_handle_stale')
    }
    if (record.rendererGraphEpoch !== this.terminalSessions.getGraphEpoch()) {
      throw new Error('terminal_handle_stale')
    }

    const leaf = this.terminalSessions.getGraphLeafByKey(
      this.getLeafKey(record.tabId, record.leafId)
    )
    if (!leaf || leaf.ptyId !== record.ptyId || leaf.ptyGeneration !== record.ptyGeneration) {
      throw new Error('terminal_handle_stale')
    }
    return { record, leaf }
  }

  private getLivePtyForHandle(handle: string): {
    record: TerminalHandleRecord
    pty: RuntimePtyWorktreeRecord
  } | null {
    let record = this.terminalSessions.getTerminalHandle(handle)
    if (!record) {
      const ptyId = this.terminalSessions.getPtyIdForTerminalHandle(handle)
      const pty = ptyId ? this.terminalSessions.getPtyRecord(ptyId) : null
      if (pty) {
        // Why: graph reload/unavailability clears renderer handle records, but
        // runtime-owned PTY handles remain the caller's control identity.
        this.issuePtyHandle(pty)
        record = this.terminalSessions.getTerminalHandle(handle)
      }
    }
    if (!record || record.runtimeId !== this.runtimeId || !record.tabId.startsWith('pty:')) {
      return null
    }
    if (!record.ptyId) {
      return null
    }
    const pty = this.terminalSessions.getPtyRecord(record.ptyId)
    if (!pty || pty.ptyId !== record.ptyId) {
      return null
    }
    // Why: renderer adoption can race with CLI reads. If this synthetic PTY
    // handle is valid, keep ptyId -> handle populated so summaries do not mint
    // a second handle for the same terminal.
    this.terminalSessions.bindTerminalHandleToPty(record.ptyId, handle)
    return { record, pty }
  }

  private getRuntimeOwnedPtyForHandle(handle: string): {
    record: TerminalHandleRecord
    pty: RuntimePtyWorktreeRecord
  } | null {
    const syntheticPty = this.getLivePtyForHandle(handle)
    if (syntheticPty) {
      return syntheticPty
    }
    try {
      const liveLeaf = this.getLiveLeafForHandle(handle)
      const pty = liveLeaf.leaf.ptyId
        ? this.terminalSessions.getPtyRecord(liveLeaf.leaf.ptyId)
        : null
      // Why: renderer reload adopts the assistant's synthetic handle into the
      // rebuilt leaf graph; reveal must follow that live handle back to its PTY.
      return pty ? { record: liveLeaf.record, pty } : null
    } catch {
      return null
    }
  }

  private readPtyTerminal(
    handle: string,
    pty: RuntimePtyWorktreeRecord,
    opts: { cursor?: number; limit?: number } = {}
  ): RuntimeTerminalRead {
    return readTerminalTail({
      handle,
      status: pty.connected ? 'running' : pty.lastExitCode !== null ? 'exited' : 'unknown',
      completedLines: pty.tailBuffer,
      partialLine: pty.tailPartialLine,
      completedLineCount: pty.tailLinesTotal,
      bufferTruncated: pty.tailTruncated,
      cursor: opts.cursor,
      limit: opts.limit
    })
  }

  private issueHandle(leaf: RuntimeLeafRecord): string {
    return this.terminalSessions.issueLeafHandle(this.runtimeId, leaf)
  }

  private issuePtyHandle(pty: RuntimePtyWorktreeRecord): string {
    return this.terminalSessions.issuePtyHandle(this.runtimeId, pty.ptyId, pty.worktreeId)
  }

  private resolveExitWaiters(leaf: RuntimeLeafRecord): void {
    const handle = this.issueHandle(leaf)
    if (!handle) {
      return
    }
    const waiters = this.terminalSessions.listTerminalWaiters(handle)
    if (waiters.length === 0) {
      return
    }
    for (const waiter of waiters) {
      if (waiter.condition === 'exit') {
        this.resolveWaiter(waiter, buildTerminalWaitResult(handle, 'exit', leaf))
      } else {
        // Why: if the terminal exited, conditions like tui-idle can never be
        // satisfied. Reject immediately instead of letting the poll interval
        // spin until timeout on a dead process.
        this.removeWaiter(waiter)
        waiter.reject(new Error('terminal_exited'))
      }
    }
  }

  private resolveTuiIdleWaiters(leaf: RuntimeLeafRecord): void {
    const handle = this.terminalSessions.getTerminalHandleForLeafKey(
      this.getLeafKey(leaf.tabId, leaf.leafId)
    )
    if (!handle) {
      return
    }
    const waiters = this.terminalSessions.listTerminalWaiters(handle)
    if (waiters.length === 0) {
      return
    }
    for (const waiter of waiters) {
      if (waiter.condition === 'tui-idle') {
        this.resolveWaiter(waiter, buildTerminalWaitResult(handle, 'tui-idle', leaf))
      }
    }
  }

  private resolvePtyExitWaiters(pty: RuntimePtyWorktreeRecord, ptyId: string): void {
    const handle = this.terminalSessions.getTerminalHandleForPty(ptyId)
    if (!handle) {
      return
    }
    const waiters = this.terminalSessions.listTerminalWaiters(handle)
    if (waiters.length === 0) {
      return
    }
    for (const waiter of waiters) {
      if (waiter.condition === 'exit') {
        this.resolveWaiter(waiter, buildPtyTerminalWaitResult(handle, 'exit', pty))
      } else {
        this.removeWaiter(waiter)
        waiter.reject(new Error('terminal_exited'))
      }
    }
  }

  private resolvePtyTuiIdleWaiters(pty: RuntimePtyWorktreeRecord, ptyId: string): void {
    const handle = this.terminalSessions.getTerminalHandleForPty(ptyId)
    if (!handle) {
      return
    }
    const waiters = this.terminalSessions.listTerminalWaiters(handle)
    if (waiters.length === 0) {
      return
    }
    for (const waiter of waiters) {
      if (waiter.condition === 'tui-idle') {
        this.resolveWaiter(waiter, buildPtyTerminalWaitResult(handle, 'tui-idle', pty))
      }
    }
  }

  // Why: OSC title detection via onPtyData is the primary signal for tui-idle,
  // but daemon-hosted terminals don't flow PTY data through the runtime, and
  // some agents don't emit recognized titles on startup. This fallback polls
  // two signals: (1) the renderer-synced tab title (reflects xterm's OSC title
  // handler, works even for daemon terminals), and (2) the PTY foreground process
  // + output quiescence. The poll self-cancels when the primary OSC path fires.
  private startTuiIdleFallbackPoll(waiter: TerminalWaiter, leaf: RuntimeLeafRecord): void {
    let foregroundPollInFlight = false
    waiter.pollInterval = setInterval(async () => {
      if (!waiter.pollInterval) {
        return
      }
      leaf = this.terminalSessions.getGraphLeaf(leaf.tabId, leaf.leafId) ?? leaf
      let startedForegroundPoll = false
      try {
        if (leaf.lastAgentStatus === 'idle') {
          if (waiter.pollInterval) {
            clearInterval(waiter.pollInterval)
            waiter.pollInterval = null
          }
          this.resolveWaiter(waiter, buildTerminalWaitResult(waiter.handle, 'tui-idle', leaf))
          return
        }
        // Why: check the renderer-synced title. For daemon-hosted terminals,
        // this is the only path where OSC titles are visible to the runtime.
        const pollTitle = leaf.paneTitle ?? this.terminalSessions.getGraphTab(leaf.tabId)?.title
        if (pollTitle) {
          const titleStatus = detectExplicitIdleStatusFromTitle(pollTitle)
          if (titleStatus === 'idle') {
            if (waiter.pollInterval) {
              clearInterval(waiter.pollInterval)
              waiter.pollInterval = null
            }
            this.resolveWaiter(waiter, buildTerminalWaitResult(waiter.handle, 'tui-idle', leaf))
            return
          }
        }
        const leafWaitText = buildTerminalWaitText(
          leaf.tailBuffer,
          leaf.tailPartialLine,
          leaf.preview
        )
        const blockedReason = detectTerminalWaitBlockedReason(leafWaitText)
        if (blockedReason) {
          if (waiter.pollInterval) {
            clearInterval(waiter.pollInterval)
            waiter.pollInterval = null
          }
          this.resolveWaiter(
            waiter,
            buildTerminalWaitBlockedResult(waiter.handle, 'tui-idle', leaf, blockedReason)
          )
          return
        }
        if (isKnownReadyPromptPreview(leafWaitText)) {
          if (waiter.pollInterval) {
            clearInterval(waiter.pollInterval)
            waiter.pollInterval = null
          }
          this.resolveWaiter(waiter, buildTerminalWaitResult(waiter.handle, 'tui-idle', leaf))
          return
        }
        // Foreground process fallback: if the daemon/local provider can report
        // the process and it's a non-shell with quiet output, treat as idle.
        if (
          leaf.lastAgentStatus === null &&
          leaf.ptyId &&
          this.ptyController &&
          !foregroundPollInFlight
        ) {
          foregroundPollInFlight = true
          startedForegroundPoll = true
          const fg = await this.ptyController.getForegroundProcess(leaf.ptyId)
          if (fg && !isShellProcess(fg)) {
            const quietMs = leaf.lastOutputAt ? Date.now() - leaf.lastOutputAt : 0
            if (quietMs >= TUI_IDLE_QUIESCENCE_MS) {
              if (waiter.pollInterval) {
                clearInterval(waiter.pollInterval)
                waiter.pollInterval = null
              }
              this.resolveWaiter(waiter, buildTerminalWaitResult(waiter.handle, 'tui-idle', leaf))
            }
          }
        }
      } catch {
        // Swallow transient PTY inspection errors and keep polling.
      } finally {
        if (startedForegroundPoll) {
          foregroundPollInFlight = false
        }
      }
    }, TUI_IDLE_POLL_INTERVAL_MS)
  }

  private startPtyTuiIdleFallbackPoll(waiter: TerminalWaiter, pty: RuntimePtyWorktreeRecord): void {
    let foregroundPollInFlight = false
    waiter.pollInterval = setInterval(async () => {
      if (!waiter.pollInterval) {
        return
      }
      pty = this.terminalSessions.getPtyRecord(pty.ptyId) ?? pty
      let startedForegroundPoll = false
      try {
        if (pty.lastAgentStatus === 'idle') {
          if (waiter.pollInterval) {
            clearInterval(waiter.pollInterval)
            waiter.pollInterval = null
          }
          this.resolveWaiter(waiter, buildPtyTerminalWaitResult(waiter.handle, 'tui-idle', pty))
          return
        }
        const ptyWaitText = buildTerminalWaitText(pty.tailBuffer, pty.tailPartialLine, pty.preview)
        const blockedReason = detectTerminalWaitBlockedReason(ptyWaitText)
        if (blockedReason) {
          if (waiter.pollInterval) {
            clearInterval(waiter.pollInterval)
            waiter.pollInterval = null
          }
          this.resolveWaiter(
            waiter,
            buildPtyTerminalWaitBlockedResult(waiter.handle, 'tui-idle', pty, blockedReason)
          )
          return
        }
        // Why: background PTY handles can later be adopted by the renderer.
        // Use that live xterm title as the same readiness signal as leaf handles.
        if (
          this.getAdoptedPtyExplicitIdleStatus(pty) === 'idle' ||
          isKnownReadyPromptPreview(ptyWaitText)
        ) {
          if (waiter.pollInterval) {
            clearInterval(waiter.pollInterval)
            waiter.pollInterval = null
          }
          this.resolveWaiter(waiter, buildPtyTerminalWaitResult(waiter.handle, 'tui-idle', pty))
          return
        }
        if (pty.lastAgentStatus === null && this.ptyController && !foregroundPollInFlight) {
          foregroundPollInFlight = true
          startedForegroundPoll = true
          const fg = await this.ptyController.getForegroundProcess(pty.ptyId)
          if (fg && !isShellProcess(fg)) {
            const quietMs = pty.lastOutputAt ? Date.now() - pty.lastOutputAt : 0
            if (quietMs >= TUI_IDLE_QUIESCENCE_MS) {
              if (waiter.pollInterval) {
                clearInterval(waiter.pollInterval)
                waiter.pollInterval = null
              }
              this.resolveWaiter(waiter, buildPtyTerminalWaitResult(waiter.handle, 'tui-idle', pty))
            }
          }
        }
      } catch {
        // Swallow transient PTY inspection errors and keep polling.
      } finally {
        if (startedForegroundPoll) {
          foregroundPollInFlight = false
        }
      }
    }, TUI_IDLE_POLL_INTERVAL_MS)
  }

  private getAdoptedPtyExplicitIdleStatus(pty: RuntimePtyWorktreeRecord): AgentStatus | null {
    for (const leaf of this.terminalSessions.listGraphLeaves()) {
      if (leaf.ptyId !== pty.ptyId) {
        continue
      }
      const title = leaf.paneTitle ?? this.terminalSessions.getGraphTab(leaf.tabId)?.title
      if (!title) {
        continue
      }
      const status = detectExplicitIdleStatusFromTitle(title)
      if (status !== null) {
        return status
      }
    }
    return null
  }

  // Why: push-on-idle delivery — when an agent transitions working→idle, check
  // for unread orchestration messages addressed to that terminal and inject them
  // into the PTY. This is event-driven (no polling) because the runtime owns
  // both the message store and terminal status detection.
  private deliverPendingMessages(leaf: RuntimeLeafRecord): void {
    if (!this._orchestrationDb) {
      return
    }

    const handle = this.terminalSessions.getTerminalHandleForLeafKey(
      this.getLeafKey(leaf.tabId, leaf.leafId)
    )
    if (!handle) {
      return
    }

    const unread = this._orchestrationDb.getUndeliveredUnreadMessages(handle)
    if (unread.length === 0) {
      return
    }

    if (!leaf.writable || !leaf.ptyId) {
      return
    }

    const payload = formatMessagesForInjection(unread)
    const wrote = this.ptyController?.write(leaf.ptyId, payload) ?? false
    if (!wrote) {
      return
    }

    // The active coordinator prompt is user-owned input, so push-on-idle must not synthesize Enter.
    if (this._orchestrationDb.getActiveCoordinatorRun()?.coordinator_handle === handle) {
      this._orchestrationDb.markAsDelivered(unread.map((m) => m.id))
      return
    }

    const tabTitle = this.terminalSessions.getGraphTab(leaf.tabId)?.title
    if (isCursorAgentOrchestrationTarget(leaf, tabTitle)) {
      // Why: Cursor Agent treats injected PTY text as editable prompt input.
      // Push-on-idle may surface the message, but submitting it must stay
      // under user control.
      this._orchestrationDb.markAsDelivered(unread.map((m) => m.id))
      return
    }

    // Why: Claude Code treats large single PTY writes as paste events and
    // swallows a \r included in the same write. Send Enter separately after
    // a delay so the agent processes the pasted message first. Stamp
    // `delivered_at` only after \r is confirmed, so failed deliveries stay
    // queued.
    //
    // Important (design doc §3.2, feedback #2): we stamp `delivered_at` here
    // instead of flipping `read`. `read` is reserved for "a check-caller
    // consumed this message." Flipping `read` on push-on-idle would hide the
    // message from the coordinator's next `check --unread`, which is the
    // exact bug feedback #2 reported. The two bits must stay independent.
    const ptyId = leaf.ptyId
    setTimeout(() => {
      try {
        if (!leaf.writable) {
          return
        }
        const submitted = this.ptyController?.write(ptyId, '\r') ?? false
        if (submitted) {
          this._orchestrationDb?.markAsDelivered(unread.map((m) => m.id))
        }
      } catch {
        // Terminal may have closed during the delay — messages stay queued
        // (delivered_at still NULL) and will be re-delivered on the next
        // idle transition.
      }
    }, 500)
  }

  private resolveWaiter(waiter: TerminalWaiter, result: RuntimeTerminalWait): void {
    this.removeWaiter(waiter)
    waiter.resolve(result)
  }

  private bindTerminalWaiterAbort(
    waiter: TerminalWaiter,
    signal: AbortSignal | undefined
  ): boolean {
    if (!signal) {
      return true
    }
    if (signal.aborted) {
      return false
    }
    const onAbort = (): void => {
      this.removeWaiter(waiter)
      waiter.reject(new Error('request_aborted'))
    }
    waiter.abortCleanup = () => signal.removeEventListener('abort', onAbort)
    signal.addEventListener('abort', onAbort, { once: true })
    return true
  }

  private rejectWaitersForHandle(handle: string, code: string): void {
    const waiters = this.terminalSessions.listTerminalWaiters(handle)
    if (waiters.length === 0) {
      return
    }
    for (const waiter of waiters) {
      this.removeWaiter(waiter)
      waiter.reject(new Error(code))
    }
  }

  private rejectAllWaiters(code: string): void {
    for (const handle of this.terminalSessions.listTerminalWaiterHandles()) {
      this.rejectWaitersForHandle(handle, code)
    }
  }

  private removeWaiter(waiter: TerminalWaiter): void {
    if (waiter.timeout) {
      clearTimeout(waiter.timeout)
    }
    if (waiter.pollInterval) {
      clearInterval(waiter.pollInterval)
    }
    if (waiter.abortCleanup) {
      waiter.abortCleanup()
      waiter.abortCleanup = null
    }
    this.terminalSessions.removeTerminalWaiter(waiter)
  }

  private getLeafKey(tabId: string, leafId: string): string {
    return `${tabId}::${leafId}`
  }

  // ── Browser automation ──

  readonly browserCommands = new RuntimeBrowserCommands({
    getAgentBrowserBridge: () => this.agentBrowserBridge,
    resolveWorktreeSelector: (selector) => this.resolveWorktreeSelector(selector),
    getAuthoritativeWindow: () => this.getAuthoritativeWindow(),
    getAvailableAuthoritativeWindow: () => this.getAvailableAuthoritativeWindow(),
    getOffscreenBrowserBackend: () => this.offscreenBrowserBackend,
    // Why: a hand-listed wrapper previously dropped targetGroupId, so preserve
    // the browser module's full activation interface at the composition seam.
    markHeadlessBrowserSessionTabActive: this.markHeadlessBrowserSessionTabActive.bind(this),
    registerSubscriptionCleanup: (subscriptionId, cleanup, connectionId) =>
      this.registerSubscriptionCleanup(subscriptionId, cleanup, connectionId),
    cleanupSubscription: (subscriptionId) => this.cleanupSubscription(subscriptionId),
    notifyBrowserDriverChanged: (browserPageId, driver) =>
      this.notifier?.browserDriverChanged?.(browserPageId, driver)
  })

  readonly emulatorCommands = new RuntimeEmulatorCommands({
    getEmulatorBridge: () => this.emulatorBridge,
    resolveWorktreeSelector: (selector) => this.resolveWorktreeSelector(selector),
    getAuthoritativeWindow: () => this.getAuthoritativeWindow(),
    getSettings: () => this.requireStore().getSettings()
  })
  private getAuthoritativeWindow(): BrowserWindow {
    const win = this.getAvailableAuthoritativeWindow()
    if (!win || win.isDestroyed()) {
      throw new Error('No renderer window available')
    }
    return win
  }

  private getAvailableAuthoritativeWindow(): BrowserWindow | null {
    const windowId = this.terminalSessions.getAuthoritativeWindowId()
    if (windowId === null) {
      return null
    }
    if (!BrowserWindow?.fromId) {
      return null
    }
    const win = BrowserWindow.fromId(windowId)
    return win && !win.isDestroyed() ? win : null
  }
}

const WAIT_BLOCKED_CHECK_MIN_INTERVAL_MS = 50
// Why: chunks that can complete an actionable prompt bypass the throttle so
// blocked stamps stay per-chunk-immediate; the pattern heads mirror
// findTerminalWaitBlockedSignal. Scanned over the new chunk plus a short
// carry only — never the accumulated window.
const WAIT_BLOCKED_KEYWORD_PATTERN =
  /press enter|press t to trust|do you trust|trust this|trusted workspace|update available|choose working directory|codex just got an upgrade|hooks need review/
const WAIT_BLOCKED_KEYWORD_CARRY_CHARS = 31
const MAX_TAIL_LINES = 2000
const MAX_TAIL_CHARS = 256 * 1024
const MAX_TAIL_PARTIAL_CHARS = 4000
const MAX_TAIL_PENDING_ANSI_CHARS = 4096
const DEFAULT_TERMINAL_READ_LIMIT = 120
const MAX_TERMINAL_READ_LIMIT = 2000
const MAX_TERMINAL_PREVIEW_CHARS = 32 * 1024
const MAX_PREVIEW_LINES = 6
const MAX_PREVIEW_CHARS = 300
const WORKTREE_STATUS_PRIORITY: Record<RuntimeWorktreeStatus, number> = {
  inactive: 0,
  active: 1,
  done: 2,
  working: 3,
  permission: 4
}
const DEFAULT_REPO_SEARCH_REFS_LIMIT = 25
const DEFAULT_TERMINAL_LIST_LIMIT = 200
const DEFAULT_WORKTREE_LIST_LIMIT = 200
const DEFAULT_WORKTREE_PS_LIMIT = 200
const DISCONNECTED_PTY_RECORD_MAX = 128
const RESOLVED_WORKTREE_CACHE_TTL_MS = 1000
const RESOLVED_WORKTREE_REPO_TIMEOUT_MS = 5000
const PTY_CONTROLLER_LIST_TIMEOUT_MS = 3000
// Why (§3.3): 30s freshness window. A second worktree-create or dispatch-probe
// against the same repo+remote within this window reuses the previous successful
// fetch instead of repeating the round-trip. Chosen so rapid "new worktree"
// clicks and successive coordinator dispatches feel snappy, while still being
// short enough that a genuinely-changed remote is observed on the next action.
const FETCH_FRESHNESS_MS = 30_000
// Why: bound create-path remote fetches so a Windows credential-manager GUI hang
// (STA-1292) can't wedge worktree creation forever; parity with the exact-base
// refresh sibling's timeout.
const REMOTE_FETCH_TIMEOUT_MS = 60_000
const REMOTE_FETCH_CACHE_MAX = 512
const DRIFT_PROBE_SUBJECT_LIMIT = 5

function setBoundedMapEntry<K, V>(map: Map<K, V>, key: K, value: V, maxEntries: number): void {
  if (map.has(key)) {
    map.delete(key)
  }
  map.set(key, value)
  while (map.size > maxEntries) {
    const oldest = map.keys().next()
    if (oldest.done) {
      return
    }
    map.delete(oldest.value)
  }
}

function getExplicitWorktreeIdSelector(selector: string | undefined): string | null {
  if (!selector?.startsWith('id:')) {
    return null
  }
  const id = selector.slice(3)
  return id.length > 0 ? id : null
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null
  return new Promise<T>((resolve) => {
    timeout = setTimeout(() => resolve(fallback), timeoutMs)
    promise.then(
      (value) => resolve(value),
      () => resolve(fallback)
    )
  }).finally(() => {
    if (timeout) {
      clearTimeout(timeout)
    }
  })
}

function withTimeoutResult<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<{ ok: true; value: T } | { ok: false }> {
  return withTimeout(
    promise.then((value) => ({ ok: true, value }) as const),
    timeoutMs,
    {
      ok: false
    }
  )
}

export function appendRecentPtyOutput(previous: string | undefined, data: string): string {
  if (data.length >= RECENT_PTY_OUTPUT_LIMIT) {
    return data.slice(-RECENT_PTY_OUTPUT_LIMIT)
  }
  return `${previous ?? ''}${data}`.slice(-RECENT_PTY_OUTPUT_LIMIT)
}

export function appendRecentPtyPathCandidates(
  previous: string[] | undefined,
  data: string
): string[] {
  const extractedCandidates = extractTerminalOutputPathCandidates(data)
  if (extractedCandidates.length === 0) {
    // Why: pathless output is the common hot path. Reuse immutable history so
    // each PTY chunk does not clone and byte-scan up to 1,024 old candidates.
    return previous ?? []
  }
  const next = previous ? previous.slice() : []
  for (const candidate of extractedCandidates) {
    if (Buffer.byteLength(candidate, 'utf8') > RECENT_PTY_PATH_CANDIDATE_MAX_BYTES) {
      continue
    }
    next.push(candidate)
  }
  return pruneRecentPtyPathCandidates(next)
}

export function recentTerminalPathCandidatesIncludePath(
  recentCandidates: readonly string[],
  pathText: string,
  absolutePath: string
): boolean {
  const candidates = new Set(
    [
      pathText,
      absolutePath,
      ...wslTerminalOutputAliases(pathText),
      ...wslTerminalOutputAliases(absolutePath)
    ]
      .map((candidate) => candidate.trim())
      .filter((candidate) => candidate.length > 0)
  )
  for (const recent of recentCandidates) {
    if (candidates.has(recent)) {
      return true
    }
  }
  return false
}

function pruneRecentPtyPathCandidates(candidates: string[]): string[] {
  const countBounded =
    candidates.length > RECENT_PTY_PATH_CANDIDATE_LIMIT
      ? candidates.slice(-RECENT_PTY_PATH_CANDIDATE_LIMIT)
      : candidates
  let totalBytes = 0
  let startIndex = countBounded.length
  for (let index = countBounded.length - 1; index >= 0; index -= 1) {
    const nextTotal = totalBytes + Buffer.byteLength(countBounded[index]!, 'utf8')
    if (nextTotal > RECENT_PTY_PATH_CANDIDATE_TOTAL_BYTES) {
      break
    }
    totalBytes = nextTotal
    startIndex = index
  }
  return startIndex === 0 ? countBounded : countBounded.slice(startIndex)
}

export function recentTerminalOutputIncludesPath(
  recentOutput: string,
  pathText: string,
  absolutePath: string
): boolean {
  const candidates = new Set(
    [pathText, absolutePath]
      .map((candidate) => candidate.trim())
      .filter((candidate) => candidate.length > 0)
  )
  if (candidates.size === 0) {
    return false
  }
  for (const candidate of candidates) {
    if (outputContainsPathCandidate(recentOutput, candidate)) {
      return true
    }
  }
  const decodedOutput = decodeTerminalOutputPercentEscapes(recentOutput)
  if (decodedOutput !== recentOutput) {
    for (const candidate of candidates) {
      if (outputContainsPathCandidate(decodedOutput, candidate)) {
        return true
      }
    }
  }
  return false
}

function outputContainsPathCandidate(output: string, candidate: string): boolean {
  let start = output.indexOf(candidate)
  while (start !== -1) {
    const end = start + candidate.length
    if (isPathCandidateStartBoundary(output, start) && isPathCandidateEndBoundary(output, end)) {
      return true
    }
    start = output.indexOf(candidate, start + 1)
  }
  return false
}

function isPathCandidateStartBoundary(output: string, start: number): boolean {
  if (start === 0) {
    return true
  }
  if (output.slice(0, start).endsWith('file://')) {
    return true
  }
  if (
    /^[A-Za-z]:[\\/]/.test(output.slice(start)) &&
    /file:\/\/(?:localhost|127\.0\.0\.1|\[?::1\]?)?\/$/i.test(output.slice(0, start))
  ) {
    return true
  }
  if (/file:\/\/(?:localhost|127\.0\.0\.1|\[?::1\]?)$/i.test(output.slice(0, start))) {
    return true
  }
  return !isPathCandidateContinuationChar(output[start - 1]!)
}

function isPathCandidateEndBoundary(output: string, end: number): boolean {
  const next = output[end]
  if (!next) {
    return true
  }
  if (next === ':' && /^\d+(?::\d+)?(?:\D|$)/.test(output.slice(end + 1))) {
    return true
  }
  return !isPathCandidateContinuationChar(next)
}

function isPathCandidateContinuationChar(char: string): boolean {
  return /[A-Za-z0-9._~/%+@\\()[\]-]/.test(char)
}

function decodeTerminalOutputPercentEscapes(value: string): string {
  return value.replace(/(?:%[0-9a-f]{2})+/gi, (match) => {
    try {
      return decodeURIComponent(match)
    } catch {
      return match
    }
  })
}

// Why: extraction runs on the PTY hot path for every chunk, and the extension
// regex backtracks quadratically on pathological separator runs. No candidate
// can cross a newline (the regex classes exclude \r\n), so scan per line and
// skip lines already too long to yield a storable candidate —
// appendRecentPtyPathCandidates drops oversized candidates anyway, and the raw
// recent-output buffer still covers provenance inside oversized lines.
function extractTerminalOutputPathCandidates(data: string): string[] {
  const candidates: string[] = []
  const add = (value: string): void => {
    const candidate = trimTerminalOutputPathCandidate(value)
    if (candidate.length > 0) {
      candidates.push(candidate)
      const drivePath = normalizeTerminalOutputFileUriDrivePath(candidate)
      if (drivePath) {
        candidates.push(drivePath)
      }
    }
  }
  for (const line of data.split(/[\r\n]+/)) {
    if (line.length === 0 || line.length > RECENT_PTY_PATH_CANDIDATE_MAX_BYTES) {
      continue
    }
    collectTerminalOutputLinePathCandidates(line, add)
  }
  return candidates
}

function collectTerminalOutputLinePathCandidates(line: string, add: (value: string) => void): void {
  for (const match of line.matchAll(/file:\/\/([^/\s]*)(\/[^\s\x1b"'<>)]*)/gi)) {
    const authority = match[1] ?? ''
    const uriPath = match[2]
    if (uriPath) {
      const decoded = decodeTerminalOutputPercentEscapes(uriPath)
      add(isTerminalOutputLoopbackAuthority(authority) ? decoded : `//${authority}${decoded}`)
    }
  }
  for (const match of line.matchAll(
    /(?:\/(?:tmp|private\/tmp)\/|[A-Za-z]:[\\/])[^\r\n\x1b"'<>]+/g
  )) {
    if (isInsideNonLocalFileUri(line, match.index)) {
      continue
    }
    add(match[0])
  }
  for (const match of line.matchAll(
    /\/[^\r\n\x1b"'<>]*\.[A-Za-z0-9_+-]+(?:[#:\s][^\r\n\x1b"'<>]*)?/g
  )) {
    if (isInsideNonLocalFileUri(line, match.index)) {
      continue
    }
    add(match[0])
  }
}

function normalizeTerminalOutputFileUriDrivePath(candidate: string): string | null {
  return /^\/[A-Za-z]:[\\/]/.test(candidate) ? candidate.slice(1) : null
}

function trimTerminalOutputPathCandidate(value: string): string {
  let candidate = value.trim().replace(/[),;.]+$/g, '')
  if (Buffer.byteLength(candidate, 'utf8') > RECENT_PTY_PATH_CANDIDATE_MAX_BYTES) {
    return ''
  }
  let selected: string | null = null
  for (const match of candidate.matchAll(
    /.+?\.[A-Za-z0-9_+-]+(?:#L\d+(?:C\d+)?|(?::\d+)?(?::\d+)?)?(?=\s+|$)/gi
  )) {
    const end = match.index + match[0].length
    const text = candidate.slice(0, end)
    if (countTerminalOutputPathStarts(text) > 1) {
      continue
    }
    // Same rule as the tap parsers: a line-end extension token only extends
    // the candidate when the added segment is path-like, so trailing prose
    // ending in a filename is not swallowed into the candidate.
    if (
      end < candidate.length ||
      selected === null ||
      /[\\/]/.test(candidate.slice(selected.length, end))
    ) {
      selected = text
    }
  }
  return trimTerminalOutputPathLocator(selected ?? candidate)
}

function isTerminalOutputLoopbackAuthority(authority: string): boolean {
  const normalized = authority.toLowerCase()
  return (
    normalized === '' ||
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '[::1]'
  )
}

function isInsideNonLocalFileUri(output: string, pathStart: number): boolean {
  const prefix = output.slice(0, pathStart)
  const match = /file:\/\/([^/\s]*)$/i.exec(prefix)
  return !!match && !isTerminalOutputLoopbackAuthority(match[1] ?? '')
}

function countTerminalOutputPathStarts(value: string): number {
  let count = 0
  for (const match of value.matchAll(/(?:^|\s)(?:~[\\/]|[\\/]|\.{1,2}[\\/]|[A-Za-z]:[\\/])/g)) {
    void match
    count += 1
  }
  return count
}

function trimTerminalOutputPathLocator(value: string): string {
  return value.replace(/#L\d+(?:C\d+)?$/i, '').replace(/:\d+(?::\d+)?$/, '')
}

function wslTerminalOutputAliases(value: string): string[] {
  const match = /^\\\\wsl(?:\.localhost|\$)\\[^\\]+(\\.*)$/i.exec(value)
  if (!match) {
    return []
  }
  const linuxPath = match[1]!.replace(/\\/g, '/')
  return linuxPath.startsWith('/') ? [linuxPath] : [`/${linuxPath}`]
}

export function buildPreview(lines: string[], partialLine: string): string {
  const previewLines: string[] = []
  const collectVisibleLine = (line: string): void => {
    const trimmed = line.trim()
    if (trimmed.length > 0) {
      previewLines.push(trimmed)
    }
  }

  if (partialLine.length > 0) {
    collectVisibleLine(partialLine)
  }
  for (
    let index = lines.length - 1;
    index >= 0 && previewLines.length < MAX_PREVIEW_LINES;
    index--
  ) {
    collectVisibleLine(lines[index])
  }
  previewLines.reverse()

  const preview = previewLines.join('\n')
  return preview.length > MAX_PREVIEW_CHARS
    ? preview.slice(preview.length - MAX_PREVIEW_CHARS)
    : preview
}

function buildTerminalWaitText(lines: string[], partialLine: string, preview: string): string {
  const waitText = buildTailLines(lines, partialLine)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
  // Why: the user-facing preview is intentionally short, but wait readiness
  // needs the retained terminal tail so known ready headers are not truncated away.
  return waitText.length > 0 ? waitText : preview
}

export type TerminalTailWaitState = {
  waitText: string
  signal: { reason: RuntimeTerminalWaitBlockedReason; index: number } | null
  // Why: the retained tail is authoritative; `preview` is only a fallback for an
  // empty tail. A preview-derived state depends on a value that is recomputed
  // after each append, so it must not be reused as the next chunk's previous
  // state — reuse is gated on fromTail.
  fromTail: boolean
}

// Why: onPtyData runs per raw PTY chunk (hundreds/sec under load). Ordinary
// tails take one no-join sentinel pass; only candidate-bearing tails
// build, lowercase, and parse the full 256 KiB text. The cached post-append
// state also avoids repeating that work for the next chunk's previous state.
export function computeTerminalTailWaitState(
  lines: string[],
  partialLine: string,
  preview: string
): TerminalTailWaitState {
  const tailShape = inspectTerminalWaitTail(lines, partialLine)
  if (!tailShape.fromTail) {
    return {
      waitText: preview,
      signal: findActionableTerminalWaitBlockedSignal(preview.toLowerCase()),
      fromTail: false
    }
  }
  if (!tailShape.mayContainBlockedSignal) {
    // Why: tailGainedNewerBlockedReason reads waitText only when signal exists;
    // avoid retaining a rebuilt 256 KiB string for the overwhelmingly common case.
    return { waitText: '', signal: null, fromTail: true }
  }
  const tailText = buildTailLines(lines, partialLine)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
  const fromTail = tailText.length > 0
  const waitText = fromTail ? tailText : preview
  return {
    waitText,
    signal: findActionableTerminalWaitBlockedSignal(waitText.toLowerCase()),
    fromTail
  }
}

function inspectTerminalWaitTail(
  lines: string[],
  partialLine: string
): { fromTail: boolean; mayContainBlockedSignal: boolean } {
  let fromTail = false
  let mayContainBlockedSignal = false
  for (const line of lines) {
    if (!fromTail && line.trim().length > 0) {
      fromTail = true
    }
    if (!mayContainBlockedSignal && TERMINAL_WAIT_BLOCKED_SENTINEL_RE.test(line)) {
      mayContainBlockedSignal = true
    }
  }
  if (!fromTail && partialLine.trim().length > 0) {
    fromTail = true
  }
  if (!mayContainBlockedSignal && TERMINAL_WAIT_BLOCKED_SENTINEL_RE.test(partialLine)) {
    mayContainBlockedSignal = true
  }
  return { fromTail, mayContainBlockedSignal }
}

// Why: decides whether the appended chunk introduced a newer actionable blocked
// prompt, consuming precomputed wait states so the full-tail scans are not
// repeated per chunk (replaces the former inline double full-tail scan).
export function tailGainedNewerBlockedReason(
  previous: TerminalTailWaitState,
  next: TerminalTailWaitState,
  appendedText: string
): boolean {
  if (next.signal === null) {
    return false
  }
  // Why: permission prompts can arrive split across PTY chunks. Stamp when the
  // accumulated tail first becomes blocked, or when a later prompt appears after
  // stale blocked text already in the tail.
  if (previous.signal === null) {
    return true
  }
  const appendCandidateSignal = findActionableTerminalWaitBlockedSignal(
    `${previous.waitText}${appendedText}`.toLowerCase()
  )
  return appendCandidateSignal !== null && appendCandidateSignal.index > previous.signal.index
}

export function appendNormalizedToTailBuffer(
  previousLines: string[],
  previousPartialLine: string,
  normalizedChunk: string,
  previousRedrawCursor: RetainedTailRedrawCursor | null = null
): {
  lines: string[]
  partialLine: string
  redrawCursor: RetainedTailRedrawCursor | null
  truncated: boolean
  newCompleteLines: number
} {
  if (normalizedChunk.length === 0) {
    return {
      lines: previousLines,
      partialLine: previousPartialLine,
      redrawCursor: previousRedrawCursor,
      truncated: false,
      newCompleteLines: 0
    }
  }

  // Why: fullscreen TUIs often emit long, newline-free redraw streams. Keep the
  // larger line transcript for pagination, but keep partial-line work bounded.
  const previousPartialWasCapped = previousPartialLine.length > MAX_TAIL_PARTIAL_CHARS
  const boundedPreviousPartialLine = previousPartialLine.slice(-MAX_TAIL_PARTIAL_CHARS)
  const combinedChunk = `${boundedPreviousPartialLine}${normalizedChunk}`
  if (previousRedrawCursor || containsTerminalVerticalLineControl(combinedChunk)) {
    return appendNormalizedToMultilineTailBuffer(
      previousLines,
      boundedPreviousPartialLine,
      normalizedChunk,
      previousPartialWasCapped,
      previousRedrawCursor
    )
  }

  // Why: status UIs redraw a single line with CR/backspace/ANSI erase controls.
  // Terminal previews are text, not a full screen model, so retain the latest
  // visible redraw segment instead of appending every spinner frame.
  const segments = splitRetainedTerminalTailSegments(combinedChunk)
  const pieces = processTerminalTailCompleteSegments(segments.completeSegments)
  const partialResult = applyTerminalLineControls(segments.partialSegment)
  const nextPartialLine = trimTerminalLineRight(partialResult.text)
  const retainedPartialLine = nextPartialLine.slice(-MAX_TAIL_PARTIAL_CHARS)
  const newCompleteLines = segments.completeLineCount
  const omittedNewCompleteLines = newCompleteLines - pieces.length
  let nextLines =
    newCompleteLines > 0
      ? [
          ...(omittedNewCompleteLines > 0 ? [] : previousLines),
          ...pieces.map((line) => line.replace(/[ \t]+$/g, ''))
        ]
      : previousLines
  let truncated =
    previousPartialWasCapped ||
    omittedNewCompleteLines > 0 ||
    nextPartialLine.length > MAX_TAIL_PARTIAL_CHARS

  if (nextLines.length > MAX_TAIL_LINES) {
    nextLines = nextLines.slice(nextLines.length - MAX_TAIL_LINES)
    truncated = true
  }

  if (newCompleteLines > 0 || retainedPartialLine.length > previousPartialLine.length) {
    if (nextLines === previousLines) {
      nextLines = [...previousLines]
    }
    let totalChars =
      nextLines.reduce((sum, line) => sum + line.length, 0) + retainedPartialLine.length
    let trimStartIndex = 0
    while (trimStartIndex < nextLines.length && totalChars > MAX_TAIL_CHARS) {
      totalChars -= nextLines[trimStartIndex].length
      trimStartIndex += 1
    }
    if (trimStartIndex > 0) {
      nextLines = nextLines.slice(trimStartIndex)
      truncated = true
    }
  }

  const redrawCursor =
    !partialResult.hadControl || partialResult.cursorColumn === nextPartialLine.length
      ? null
      : {
          rowFromEnd: 0,
          column: partialResult.cursorColumn
        }

  return {
    lines: nextLines,
    partialLine: retainedPartialLine,
    redrawCursor,
    truncated,
    newCompleteLines
  }
}

function trimTerminalLineRight(line: string): string {
  let end = line.length
  while (end > 0) {
    const code = line.charCodeAt(end - 1)
    if (code !== 0x20 && code !== 0x09) {
      break
    }
    end -= 1
  }
  return end === line.length ? line : line.slice(0, end)
}

// Why a window: the unwindowed implementation below materializes a row object
// per retained tail line and finalize re-allocates + regex-trims every row —
// O(tail) per chunk (~0.9ms at the 2,000-line cap), measured at ~93% of the
// main-process event loop under an agent-TUI flood (findings log 2026-07-03).
// A redraw can only touch rows the cursor can reach, so run the algorithm on
// a suffix window sized by the chunk's maximum upward cursor excursion and
// share the untouched prefix by reference.
const REDRAW_WINDOW_SAFETY_ROWS = 8

function maxUpwardCursorReach(
  normalizedChunk: string,
  previousRedrawCursor: RetainedTailRedrawCursor | null
): number {
  let reach = previousRedrawCursor ? previousRedrawCursor.rowFromEnd : 0
  const cursorUpPattern = /\x1b\[(\d*)(?:;[\d;]*)?A/g
  let match: RegExpExecArray | null
  while ((match = cursorUpPattern.exec(normalizedChunk)) !== null) {
    reach += match[1] ? Number.parseInt(match[1], 10) : 1
  }
  return reach
}

function appendNormalizedToMultilineTailBuffer(
  previousLines: string[],
  boundedPreviousPartialLine: string,
  normalizedChunk: string,
  previousPartialWasCapped: boolean,
  previousRedrawCursor: RetainedTailRedrawCursor | null
): {
  lines: string[]
  partialLine: string
  redrawCursor: RetainedTailRedrawCursor | null
  truncated: boolean
  newCompleteLines: number
} {
  const windowRows =
    maxUpwardCursorReach(normalizedChunk, previousRedrawCursor) + REDRAW_WINDOW_SAFETY_ROWS
  if (windowRows >= previousLines.length) {
    return appendNormalizedToMultilineTailBufferUnwindowed(
      previousLines,
      boundedPreviousPartialLine,
      normalizedChunk,
      previousPartialWasCapped,
      previousRedrawCursor
    )
  }
  const prefixLength = previousLines.length - windowRows
  const suffix = previousLines.slice(prefixLength)
  const windowed = appendNormalizedToMultilineTailBufferUnwindowed(
    suffix,
    boundedPreviousPartialLine,
    normalizedChunk,
    previousPartialWasCapped,
    previousRedrawCursor
  )
  let lines = previousLines.slice(0, prefixLength)
  // Why: the unwindowed finalize trims trailing spaces/tabs on every row; the
  // shared prefix must match without paying a regex per untouched row.
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!
    const lastChar = line.charCodeAt(line.length - 1)
    if (lastChar === 32 || lastChar === 9) {
      lines[index] = line.replace(/[ \t]+$/g, '')
    }
  }
  for (const line of windowed.lines) {
    lines.push(line)
  }
  let truncated = windowed.truncated
  if (lines.length > MAX_TAIL_LINES) {
    lines = lines.slice(lines.length - MAX_TAIL_LINES)
    truncated = true
  }
  let totalChars = windowed.partialLine.length
  for (const line of lines) {
    totalChars += line.length
  }
  let dropCount = 0
  while (dropCount < lines.length && totalChars > MAX_TAIL_CHARS) {
    totalChars -= lines[dropCount]!.length
    dropCount += 1
  }
  if (dropCount > 0) {
    lines = lines.slice(dropCount)
    truncated = true
  }
  return {
    lines,
    partialLine: windowed.partialLine,
    redrawCursor: windowed.redrawCursor,
    truncated,
    newCompleteLines: windowed.newCompleteLines
  }
}

export function appendNormalizedToMultilineTailBufferUnwindowed(
  previousLines: string[],
  boundedPreviousPartialLine: string,
  normalizedChunk: string,
  previousPartialWasCapped: boolean,
  previousRedrawCursor: RetainedTailRedrawCursor | null
): {
  lines: string[]
  partialLine: string
  redrawCursor: RetainedTailRedrawCursor | null
  truncated: boolean
  newCompleteLines: number
} {
  const rows: RetainedTerminalRow[] = [
    ...previousLines.map((line) => ({ text: line, completed: true })),
    { text: boundedPreviousPartialLine, completed: false }
  ]
  let cursorRow = previousRedrawCursor
    ? Math.max(0, rows.length - 1 - previousRedrawCursor.rowFromEnd)
    : rows.length - 1
  let cursorColumn = previousRedrawCursor?.column ?? boundedPreviousPartialLine.length
  let newCompleteLines = 0
  let truncated = previousPartialWasCapped

  const ensureCursorRow = (): void => {
    while (cursorRow >= rows.length) {
      rows.push({ text: '', completed: false })
    }
  }
  const trimRows = (): void => {
    const maxRows = MAX_TAIL_LINES + 1
    if (rows.length <= maxRows) {
      return
    }
    const removeCount = rows.length - maxRows
    rows.splice(0, removeCount)
    cursorRow = Math.max(0, cursorRow - removeCount)
    truncated = true
  }
  const moveCursorToColumn = (nextColumn: number): void => {
    cursorColumn = clampTerminalPreviewCursor(nextColumn)
  }
  const markCursorRowRewritten = (): void => {
    ensureCursorRow()
    rows[cursorRow]!.completed = false
  }
  const writeChar = (char: string): void => {
    ensureCursorRow()
    markCursorRowRewritten()
    const row = rows[cursorRow]!
    if (cursorColumn > row.text.length) {
      row.text = `${row.text}${' '.repeat(cursorColumn - row.text.length)}`
    }
    row.text =
      cursorColumn >= row.text.length
        ? `${row.text}${char}`
        : `${row.text.slice(0, cursorColumn)}${char}${row.text.slice(cursorColumn + 1)}`
    cursorColumn += 1
  }
  const eraseLine = (mode: number): void => {
    ensureCursorRow()
    markCursorRowRewritten()
    const row = rows[cursorRow]!
    if (mode === 0) {
      row.text = row.text.slice(0, cursorColumn)
    } else if (mode === 1) {
      const deleteCount = Math.min(cursorColumn + 1, row.text.length)
      row.text = `${' '.repeat(deleteCount)}${row.text.slice(deleteCount)}`
    } else if (mode === 2) {
      row.text = ''
    }
  }

  for (let index = 0; index < normalizedChunk.length; index += 1) {
    const char = normalizedChunk[index]
    if (char === '\n') {
      ensureCursorRow()
      rows[cursorRow]!.completed = true
      newCompleteLines += 1
      cursorRow += 1
      cursorColumn = 0
      ensureCursorRow()
      trimRows()
      continue
    }
    if (char === '\r') {
      cursorColumn = 0
      continue
    }
    if (char === '\u0008') {
      cursorColumn = Math.max(0, cursorColumn - 1)
      continue
    }
    if (char === '\u001b') {
      const parsed = parseAnsiControlSequence(normalizedChunk, index)
      if (!parsed) {
        continue
      }
      index = parsed.endIndex
      if (parsed.kind !== 'csi' || !hasCanonicalNumericCsiParams(parsed.params)) {
        continue
      }
      const firstParam = parsed.firstParam ?? 1
      if (parsed.final === 'A') {
        cursorRow = Math.max(0, cursorRow - firstParam)
        rows.splice(cursorRow + 1)
      } else if (parsed.final === 'K') {
        eraseLine(parsed.firstParam ?? 0)
      } else if (parsed.final === 'G' || parsed.final === '`') {
        moveCursorToColumn(firstParam - 1)
      } else if (parsed.final === 'D') {
        cursorColumn = Math.max(0, cursorColumn - firstParam)
      } else if (parsed.final === 'C') {
        moveCursorToColumn(cursorColumn + firstParam)
      }
      continue
    }
    writeChar(char)
  }

  return finalizeRetainedTerminalRows(rows, cursorRow, cursorColumn, truncated, newCompleteLines)
}

type RetainedTailRedrawCursor = {
  rowFromEnd: number
  column: number
}

type RetainedTerminalRow = {
  text: string
  completed: boolean
}

function finalizeRetainedTerminalRows(
  rows: RetainedTerminalRow[],
  cursorRow: number,
  cursorColumn: number,
  initialTruncated: boolean,
  newCompleteLines: number
): {
  lines: string[]
  partialLine: string
  redrawCursor: RetainedTailRedrawCursor | null
  truncated: boolean
  newCompleteLines: number
} {
  let truncated = initialTruncated
  let retainedRows = rows.map((row) => ({ ...row, text: row.text.replace(/[ \t]+$/g, '') }))

  if (retainedRows.length > MAX_TAIL_LINES + 1) {
    const removeCount = retainedRows.length - (MAX_TAIL_LINES + 1)
    retainedRows = retainedRows.slice(removeCount)
    cursorRow = Math.max(0, cursorRow - removeCount)
    truncated = true
  }

  let totalChars = retainedRows.reduce((sum, row) => sum + row.text.length, 0)
  let trimStartIndex = 0
  while (trimStartIndex < retainedRows.length - 1 && totalChars > MAX_TAIL_CHARS) {
    totalChars -= retainedRows[trimStartIndex]!.text.length
    trimStartIndex += 1
  }
  if (trimStartIndex > 0) {
    retainedRows = retainedRows.slice(trimStartIndex)
    cursorRow = Math.max(0, cursorRow - trimStartIndex)
    truncated = true
  }
  while (
    retainedRows.length > 1 &&
    cursorRow < retainedRows.length - 1 &&
    retainedRows.at(-1)?.completed === false &&
    retainedRows.at(-1)?.text.length === 0
  ) {
    retainedRows.pop()
  }

  const lastRow = retainedRows.at(-1)
  let partialLine = lastRow && !lastRow.completed ? lastRow.text : ''
  let lines = (lastRow && !lastRow.completed ? retainedRows.slice(0, -1) : retainedRows).map(
    (row) => row.text
  )

  if (partialLine.length > MAX_TAIL_PARTIAL_CHARS) {
    partialLine = partialLine.slice(-MAX_TAIL_PARTIAL_CHARS)
    truncated = true
  }
  if (lines.length > MAX_TAIL_LINES) {
    lines = lines.slice(lines.length - MAX_TAIL_LINES)
    truncated = true
  }
  const outputRowCount = lines.length + 1
  const defaultCursorRow = outputRowCount - 1
  const defaultCursorColumn = partialLine.length
  const redrawCursor =
    cursorRow === defaultCursorRow && cursorColumn === defaultCursorColumn
      ? null
      : {
          rowFromEnd: Math.max(0, outputRowCount - 1 - cursorRow),
          column: clampTerminalPreviewCursor(cursorColumn)
        }

  return {
    lines,
    partialLine,
    redrawCursor,
    truncated,
    newCompleteLines
  }
}

function splitRetainedTerminalTailSegments(value: string): {
  completeSegments: string[]
  partialSegment: string
  completeLineCount: number
} {
  let completeLineCount = 0
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '\n') {
      completeLineCount += 1
    }
  }

  const retainedCompleteCount = Math.min(completeLineCount, MAX_TAIL_LINES)
  const omittedCompleteCount = completeLineCount - retainedCompleteCount
  let startIndex = 0
  if (omittedCompleteCount > 0) {
    let seen = 0
    for (let index = 0; index < value.length; index += 1) {
      if (value[index] !== '\n') {
        continue
      }
      seen += 1
      if (seen === omittedCompleteCount) {
        startIndex = index + 1
        break
      }
    }
  }

  const completeSegments: string[] = []
  let segmentStart = startIndex
  for (let index = startIndex; index < value.length; index += 1) {
    if (value[index] !== '\n') {
      continue
    }
    completeSegments.push(value.slice(segmentStart, index))
    segmentStart = index + 1
  }

  return {
    completeSegments,
    partialSegment: value.slice(segmentStart),
    completeLineCount
  }
}

function processTerminalTailCompleteSegments(segments: string[]): string[] {
  const processed: string[] = []
  let totalChars = 0
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const line = applyTerminalLineControls(segments[index]!).text
    processed.push(line)
    totalChars += line.length
    if (totalChars > MAX_TAIL_CHARS) {
      break
    }
  }
  processed.reverse()
  return processed
}

function applyTerminalLineControls(line: string): {
  text: string
  cursorColumn: number
  hadControl: boolean
} {
  const carriageIndex = line.lastIndexOf('\r')
  const latestRedraw = carriageIndex >= 0 ? line.slice(carriageIndex + 1) : line
  if (!latestRedraw.includes('\u0008') && !latestRedraw.includes('\u001b')) {
    return {
      text: latestRedraw,
      cursorColumn: latestRedraw.length,
      hadControl: carriageIndex >= 0
    }
  }

  const chars: string[] = []
  let cursor = 0
  const moveCursorTo = (nextCursor: number): void => {
    cursor = clampTerminalPreviewCursor(nextCursor)
  }
  const writeChar = (char: string): void => {
    if (cursor > chars.length) {
      const oldLength = chars.length
      chars.length = cursor
      chars.fill(' ', oldLength, cursor)
    }
    if (cursor >= chars.length) {
      chars.push(char)
    } else {
      chars[cursor] = char
    }
    cursor += 1
  }
  for (let index = 0; index < latestRedraw.length; index += 1) {
    const char = latestRedraw[index]
    if (char === '\u0008') {
      if (cursor > 0) {
        cursor -= 1
      }
    } else if (char === '\u001b') {
      const parsed = parseAnsiControlSequence(latestRedraw, index)
      if (!parsed) {
        continue
      }
      index = parsed.endIndex
      if (parsed.kind !== 'csi') {
        continue
      }
      if (!hasCanonicalNumericCsiParams(parsed.params)) {
        continue
      }
      if (parsed.final === 'K') {
        const mode = parsed.firstParam ?? 0
        if (mode === 0) {
          chars.length = cursor
        } else if (mode === 1) {
          const deleteCount = Math.min(cursor + 1, chars.length)
          chars.fill(' ', 0, deleteCount)
        } else if (mode === 2) {
          chars.length = 0
        }
      } else if (parsed.final === 'G' || parsed.final === '`') {
        moveCursorTo((parsed.firstParam ?? 1) - 1)
      } else if (parsed.final === 'D') {
        cursor = Math.max(0, cursor - (parsed.firstParam ?? 1))
      } else if (parsed.final === 'C') {
        moveCursorTo(cursor + (parsed.firstParam ?? 1))
      }
    } else {
      writeChar(char)
    }
  }
  return { text: chars.join(''), cursorColumn: cursor, hadControl: true }
}

function clampTerminalPreviewCursor(nextCursor: number): number {
  if (!Number.isFinite(nextCursor)) {
    return MAX_TAIL_PARTIAL_CHARS
  }
  return Math.min(MAX_TAIL_PARTIAL_CHARS, Math.max(0, Math.floor(nextCursor)))
}

function parseAnsiControlSequence(
  value: string,
  escapeIndex: number
):
  | { kind: 'csi'; final: string; params: string; firstParam: number | null; endIndex: number }
  | {
      kind: 'other'
      endIndex: number
    }
  | null {
  const introducer = value[escapeIndex + 1]
  if (introducer === '[') {
    for (let index = escapeIndex + 2; index < value.length; index += 1) {
      const code = value.charCodeAt(index)
      if (code < 0x40 || code > 0x7e) {
        continue
      }
      const params = value.slice(escapeIndex + 2, index)
      const firstParamMatch = /^(\d+)/.exec(params)
      return {
        kind: 'csi',
        final: value[index] ?? '',
        params,
        firstParam: firstParamMatch ? Number(firstParamMatch[1]) : null,
        endIndex: index
      }
    }
    return null
  }
  if (introducer === ']') {
    for (let index = escapeIndex + 2; index < value.length; index += 1) {
      if (value[index] === '\u0007') {
        return { kind: 'other', endIndex: index }
      }
      if (value[index] === '\u001b' && value[index + 1] === '\\') {
        return { kind: 'other', endIndex: index + 1 }
      }
    }
    return null
  }
  if (isStTerminatedStringControlIntroducer(introducer)) {
    for (let index = escapeIndex + 2; index < value.length; index += 1) {
      if (value[index] === '\u001b' && value[index + 1] === '\\') {
        return { kind: 'other', endIndex: index + 1 }
      }
    }
    return null
  }
  return { kind: 'other', endIndex: escapeIndex + 1 }
}

function isStTerminatedStringControlIntroducer(introducer: string | undefined): boolean {
  return introducer === 'P' || introducer === 'X' || introducer === '^' || introducer === '_'
}

function hasCanonicalNumericCsiParams(params: string): boolean {
  return /^[0-9;]*$/.test(params)
}

function containsTerminalVerticalLineControl(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== '\u001b') {
      continue
    }
    const parsed = parseAnsiControlSequence(value, index)
    if (!parsed) {
      return false
    }
    index = parsed.endIndex
    if (
      parsed.kind === 'csi' &&
      parsed.final === 'A' &&
      hasCanonicalNumericCsiParams(parsed.params)
    ) {
      return true
    }
  }
  return false
}

function tailStateMatches(
  lines: string[],
  partialLine: string,
  pendingAnsi: string,
  redrawCursor: RetainedTailRedrawCursor | null,
  truncated: boolean,
  linesTotal: number,
  snapshot: {
    lines: string[]
    partialLine: string
    pendingAnsi: string
    redrawCursor: RetainedTailRedrawCursor | null
    truncated: boolean
    linesTotal: number
  }
): boolean {
  if (
    partialLine !== snapshot.partialLine ||
    pendingAnsi !== snapshot.pendingAnsi ||
    !tailRedrawCursorsMatch(redrawCursor, snapshot.redrawCursor) ||
    truncated !== snapshot.truncated ||
    linesTotal !== snapshot.linesTotal ||
    lines.length !== snapshot.lines.length
  ) {
    return false
  }
  if (lines === snapshot.lines) {
    return true
  }
  for (let index = 0; index < lines.length; index++) {
    if (lines[index] !== snapshot.lines[index]) {
      return false
    }
  }
  return true
}

function tailRedrawCursorsMatch(
  left: RetainedTailRedrawCursor | null,
  right: RetainedTailRedrawCursor | null
): boolean {
  if (left === right) {
    return true
  }
  if (!left || !right) {
    return false
  }
  return left.rowFromEnd === right.rowFromEnd && left.column === right.column
}

function buildTailLines(lines: string[], partialLine: string): string[] {
  return partialLine.length > 0 ? [...lines, partialLine] : lines
}

function terminalReadLimit(limit: number | undefined, defaultLimit: number): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) {
    return defaultLimit
  }
  return Math.min(Math.max(1, Math.floor(limit)), MAX_TERMINAL_READ_LIMIT)
}

function trimTerminalPreviewToCharacterBudget(
  lines: string[],
  characterBudget: number
): { tail: string[]; limited: boolean; omittedLineCount: number; slicedFirstLine: boolean } {
  let totalCharacters = lines.reduce((sum, line) => sum + line.length, 0)
  if (totalCharacters <= characterBudget) {
    return { tail: lines, limited: false, omittedLineCount: 0, slicedFirstLine: false }
  }

  let omittedLineCount = 0
  while (
    omittedLineCount < lines.length &&
    totalCharacters - lines[omittedLineCount].length >= characterBudget
  ) {
    totalCharacters -= lines[omittedLineCount].length
    omittedLineCount += 1
  }
  const tail = omittedLineCount > 0 ? lines.slice(omittedLineCount) : [...lines]

  let slicedFirstLine = false
  if (tail.length > 0 && totalCharacters > characterBudget) {
    tail[0] = tail[0].slice(totalCharacters - characterBudget)
    slicedFirstLine = true
  }

  return { tail, limited: true, omittedLineCount, slicedFirstLine }
}

function readTerminalTail(args: {
  handle: string
  status: RuntimeTerminalState
  completedLines: string[]
  partialLine: string
  completedLineCount: number
  bufferTruncated: boolean
  cursor?: number
  limit?: number
}): RuntimeTerminalRead {
  const oldestCursor = Math.max(0, args.completedLineCount - args.completedLines.length)
  const latestCursor = args.completedLineCount

  if (typeof args.cursor === 'number' && args.cursor >= 0) {
    const limit = terminalReadLimit(args.limit, MAX_TERMINAL_READ_LIMIT)
    if (args.cursor > latestCursor) {
      return {
        handle: args.handle,
        status: args.status,
        tail: [],
        truncated: false,
        limited: false,
        oldestCursor: String(oldestCursor),
        nextCursor: String(latestCursor),
        latestCursor: String(latestCursor),
        returnedLineCount: 0
      }
    }
    // Why: cursor reads are transcript/pagination reads. They return completed
    // lines only so a partial line is not delivered once as "hel" and again as
    // "hello" after the newline arrives.
    const startCursor = Math.max(args.cursor, oldestCursor)
    const startIndex = startCursor - oldestCursor
    const available = args.completedLines.slice(startIndex)
    const tail = available.slice(0, limit)
    const nextCursor = startCursor + tail.length
    return {
      handle: args.handle,
      status: args.status,
      tail,
      truncated: args.cursor < oldestCursor,
      limited: tail.length < available.length,
      oldestCursor: String(oldestCursor),
      nextCursor: String(nextCursor),
      latestCursor: String(latestCursor),
      returnedLineCount: tail.length
    }
  }

  // Why: un-cursored reads are preview reads for humans/agents. Return the
  // latest bounded view, while the larger retained buffer remains available
  // through cursor reads plus --limit.
  const limit = terminalReadLimit(args.limit, DEFAULT_TERMINAL_READ_LIMIT)
  const allLines = buildTailLines(args.completedLines, args.partialLine)
  const lineBoundedTail = allLines.slice(-limit)
  const charBoundedTail = trimTerminalPreviewToCharacterBudget(
    lineBoundedTail,
    MAX_TERMINAL_PREVIEW_CHARS
  )
  const lineBoundedStartIndex = Math.max(0, allLines.length - lineBoundedTail.length)
  const charBoundedStartIndex = lineBoundedStartIndex + charBoundedTail.omittedLineCount
  const hasPageableOmittedCompletedLines =
    Math.min(args.completedLineCount, charBoundedStartIndex) > 0 ||
    (charBoundedTail.slicedFirstLine && charBoundedStartIndex < args.completedLineCount)
  // Why: a long unterminated partial line can exceed the preview character
  // budget, but cursor reads only page completed lines, so the trimmed bytes
  // cannot be recovered by asking for nextCursor again.
  const truncatedByNonPageablePartial = charBoundedTail.limited && !hasPageableOmittedCompletedLines
  return {
    handle: args.handle,
    status: args.status,
    tail: charBoundedTail.tail,
    truncated: args.bufferTruncated || truncatedByNonPageablePartial,
    limited: lineBoundedTail.length < allLines.length || charBoundedTail.limited,
    oldestCursor: String(oldestCursor),
    nextCursor: String(latestCursor),
    latestCursor: String(latestCursor),
    returnedLineCount: charBoundedTail.tail.length
  }
}

function shouldFallbackToVisibleTerminalSnapshot(
  read: RuntimeTerminalRead,
  opts: { cursor?: number; limit?: number }
): boolean {
  if (typeof opts.cursor === 'number') {
    return false
  }
  if (read.tail.length === 0) {
    return false
  }
  const hasSubstantialBlankTail =
    read.limited === true || read.truncated || read.tail.length >= DEFAULT_TERMINAL_READ_LIMIT
  return hasSubstantialBlankTail && read.tail.every((line) => line.trim().length === 0)
}

function buildVisibleSnapshotReadFallback(
  read: RuntimeTerminalRead,
  visibleLines: string[],
  limit: number | undefined
): RuntimeTerminalRead {
  const lineLimit = terminalReadLimit(limit, DEFAULT_TERMINAL_READ_LIMIT)
  const lineBoundedTail = visibleLines.slice(-lineLimit)
  const charBoundedTail = trimTerminalPreviewToCharacterBudget(
    lineBoundedTail,
    MAX_TERMINAL_PREVIEW_CHARS
  )
  return {
    ...read,
    tail: charBoundedTail.tail,
    limited:
      read.limited || lineBoundedTail.length < visibleLines.length || charBoundedTail.limited,
    returnedLineCount: charBoundedTail.tail.length
  }
}

function getTerminalState(leaf: RuntimeLeafRecord): RuntimeTerminalState {
  if (leaf.connected) {
    return 'running'
  }
  if (leaf.lastExitCode !== null) {
    return 'exited'
  }
  return 'unknown'
}

function buildSendPayload(action: {
  text?: string
  enter?: boolean
  interrupt?: boolean
}): string | null {
  let payload = ''
  if (typeof action.text === 'string' && action.text.length > 0) {
    payload += action.text
  }
  if (action.enter) {
    payload += '\r'
  }
  if (action.interrupt) {
    payload += '\x03'
  }
  return payload.length > 0 ? payload : null
}

async function assertTerminalInputWithinLimitWithYield(text: string | undefined): Promise<void> {
  if (!text) {
    return
  }
  if (await isTerminalInputTooLargeWithYield(text)) {
    throw new Error(TERMINAL_INPUT_TOO_LARGE_ERROR)
  }
}

// Why: tui-idle relies on recognized agent CLIs setting OSC titles. If the
// terminal runs an unsupported CLI (or a plain shell), no title transition
// will ever fire. A 5-minute ceiling prevents indefinite hangs while still
// giving real agent tasks plenty of time to complete.
const TUI_IDLE_DEFAULT_TIMEOUT_MS = 5 * 60 * 1000
const TUI_IDLE_POLL_INTERVAL_MS = 2000
const TUI_IDLE_QUIESCENCE_MS = 3000
const MESSAGE_WAIT_DEFAULT_TIMEOUT_MS = 2 * 60 * 1000
const EXPLICIT_IDLE_TITLE_RE = /(^|\s)(ready|idle|done)(\s|$|[.!?])/i
const CLAUDE_IDLE_PREFIX = '\u2733'
const GEMINI_IDLE_PREFIX = '\u25c7'
const PI_IDLE_PREFIX = '\u03c0 - '

// Clamp range for the user-facing mobileAutoRestoreFitMs preference.
// MIN floor: a couple of seconds is the smallest useful auto-restore
// (anything tighter is the legacy 300ms debounce).
// MAX ceiling: one hour — a held PTY beyond that is almost certainly
// "I forgot" rather than intentional.
const MOBILE_AUTO_RESTORE_FIT_MIN_MS = 5_000
const MOBILE_AUTO_RESTORE_FIT_MAX_MS = 60 * 60 * 1000

function detectExplicitIdleStatusFromTitle(title: string): AgentStatus | null {
  const status = detectAgentStatusFromTitle(title)
  if (status !== 'idle') {
    return null
  }
  // Why: user-supplied launch titles like "Codex YOLO" contain an agent name
  // but are not readiness signals. terminal.wait needs explicit idle evidence.
  if (
    EXPLICIT_IDLE_TITLE_RE.test(title) ||
    title.startsWith(CLAUDE_IDLE_PREFIX) ||
    title.startsWith('* ') ||
    title.includes(GEMINI_IDLE_PREFIX) ||
    title.startsWith(PI_IDLE_PREFIX)
  ) {
    return 'idle'
  }
  return null
}

function isKnownReadyPromptPreview(preview: string): boolean {
  const normalized = preview.toLowerCase()
  const readyIndex = findKnownReadyPromptIndex(normalized)
  if (readyIndex === null) {
    return false
  }
  const blockedSignal = findTerminalWaitBlockedSignal(normalized)
  if (blockedSignal !== null && blockedSignal.index > readyIndex) {
    return false
  }
  return true
}

function detectTerminalWaitBlockedReason(preview: string): RuntimeTerminalWaitBlockedReason | null {
  const normalized = preview.toLowerCase()
  return findActionableTerminalWaitBlockedSignal(normalized)?.reason ?? null
}

function findActionableTerminalWaitBlockedSignal(
  normalized: string
): { reason: RuntimeTerminalWaitBlockedReason; index: number } | null {
  const blockedSignal = findTerminalWaitBlockedSignal(normalized)
  if (blockedSignal === null) {
    return null
  }
  const dismissedModalIndex = findDismissedStartupModalIndex(normalized)
  // Why: retained terminal tails can include stale startup modals. If a known
  // agent's live prompt appears after that modal, the modal was dismissed and
  // the signal is no longer actionable — even if the agent is still mid-run
  // (Cursor never reports idle via OSC title, so its busy prompt clears too).
  return dismissedModalIndex !== null && dismissedModalIndex > blockedSignal.index
    ? null
    : blockedSignal
}

// Why: a recognized agent's live prompt (idle OR busy) proves its startup modal
// was dismissed. Broader than the idle-only ready set so a mid-run Cursor lane
// stops reporting a stale trust hit for the rest of the session.
function findDismissedStartupModalIndex(normalized: string): number | null {
  const indexes = [
    findCodexReadyPromptIndex(normalized),
    findAntigravityReadyPromptIndex(normalized),
    findCursorActivePromptIndex(normalized)
  ].filter((index): index is number => index !== null)
  return indexes.length > 0 ? Math.max(...indexes) : null
}

function findKnownReadyPromptIndex(normalized: string): number | null {
  const indexes = [
    findCodexReadyPromptIndex(normalized),
    findAntigravityReadyPromptIndex(normalized),
    findCursorReadyPromptIndex(normalized)
  ].filter((index): index is number => index !== null)
  return indexes.length > 0 ? Math.max(...indexes) : null
}

// Why: cursor-agent keeps a persistent TUI — a printed "Cursor Agent" banner and
// a "→" input-prompt line appear once its trust dialog is dismissed, in both
// busy and idle states. The banner is matched by its last occurrence so the
// trust dialog's own "Cursor Agent" body text (which precedes the banner) does
// not win. The "→" glyph is cursor-agent's input prompt marker ("→ Plan,
// search, build anything" fresh, "→ Add a follow-up" after the first turn).
function findCursorActivePromptIndex(normalized: string): number | null {
  const headerIndex = normalized.lastIndexOf('cursor agent')
  if (headerIndex === -1) {
    return null
  }
  return normalized.includes('→', headerIndex) ? headerIndex : null
}

// Why: cursor-agent never emits an idle OSC title (its bare title is dropped),
// so tui-idle can only resolve from the tail. Busy frames draw a braille
// spinner in the on-screen status line; its absence past the banner is idle.
const CURSOR_BUSY_SPINNER_RE = /[⠁-⣿]/

function findCursorReadyPromptIndex(normalized: string): number | null {
  const activeIndex = findCursorActivePromptIndex(normalized)
  if (activeIndex === null) {
    return null
  }
  return CURSOR_BUSY_SPINNER_RE.test(normalized.slice(activeIndex)) ? null : activeIndex
}

function findCodexReadyPromptIndex(normalized: string): number | null {
  const headerIndex = normalized.lastIndexOf('openai codex')
  if (headerIndex === -1) {
    return null
  }
  const readySegment = normalized.slice(headerIndex)
  // Why: current Codex prints permissions only in YOLO mode. The stable ready
  // header is OpenAI Codex + model + directory.
  return readySegment.includes('model:') && readySegment.includes('directory:') ? headerIndex : null
}

function findAntigravityReadyPromptIndex(normalized: string): number | null {
  const headerIndex = normalized.lastIndexOf('antigravity cli')
  if (headerIndex === -1) {
    return null
  }
  let lineStart = headerIndex
  let modelIndex: number | null = null
  let promptIndex: number | null = null

  // Why: ready previews can include echoed pasted output after the header;
  // scan line bounds directly instead of splitting the whole terminal tail.
  for (let cursor = headerIndex; cursor <= normalized.length; cursor += 1) {
    if (cursor < normalized.length && normalized.charCodeAt(cursor) !== 10) {
      continue
    }
    let trimmedStart = lineStart
    let trimmedEnd = cursor
    while (trimmedStart < trimmedEnd && isTerminalWaitWhitespace(normalized, trimmedStart)) {
      trimmedStart += 1
    }
    while (trimmedEnd > trimmedStart && isTerminalWaitWhitespace(normalized, trimmedEnd - 1)) {
      trimmedEnd -= 1
    }
    if (lineStart > headerIndex && trimmedStart < trimmedEnd) {
      if (modelIndex === null && normalized.startsWith('gemini', trimmedStart)) {
        modelIndex = trimmedStart
      }
      if (
        promptIndex === null &&
        trimmedEnd - trimmedStart === 1 &&
        normalized.charCodeAt(trimmedStart) === 62
      ) {
        promptIndex = trimmedStart
      }
    }
    lineStart = cursor + 1
  }

  return modelIndex !== null && promptIndex !== null ? Math.max(modelIndex, promptIndex) : null
}

function isTerminalWaitWhitespace(value: string, index: number): boolean {
  const code = value.charCodeAt(index)
  return code === 32 || (code >= 9 && code <= 13)
}

const TERMINAL_WAIT_BLOCKED_SENTINEL_RE =
  /update available|choose working directory to|codex just got an upgrade|hooks need review|do you trust|trust this|trusted workspace|press enter to (?:confirm|continue|view|insert)|press t to trust/i

function findTerminalWaitBlockedSignal(
  normalized: string
): { reason: RuntimeTerminalWaitBlockedReason; index: number } | null {
  // Why: this runs once per PTY chunk over a tail up to 256 KiB. One combined
  // negative scan avoids a dozen full-tail searches when no prompt can match.
  if (!TERMINAL_WAIT_BLOCKED_SENTINEL_RE.test(normalized)) {
    return null
  }
  const candidates: { reason: RuntimeTerminalWaitBlockedReason; index: number }[] = []
  const updateIndex = normalized.lastIndexOf('update available')
  if (updateIndex !== -1 && normalized.includes('press enter to continue', updateIndex)) {
    candidates.push({ reason: 'codex-update-prompt', index: updateIndex })
  }
  const cwdIndex = normalized.lastIndexOf('choose working directory to')
  if (cwdIndex !== -1 && normalized.includes('press enter to continue', cwdIndex)) {
    candidates.push({ reason: 'codex-cwd-prompt', index: cwdIndex })
  }
  const modelMigrationIndex = normalized.lastIndexOf('codex just got an upgrade')
  if (
    modelMigrationIndex !== -1 &&
    normalized.includes('press enter to continue', modelMigrationIndex)
  ) {
    candidates.push({ reason: 'codex-model-migration-prompt', index: modelMigrationIndex })
  }
  const hooksIndex = normalized.lastIndexOf('hooks need review')
  if (hooksIndex !== -1 && normalized.includes('press enter to confirm', hooksIndex)) {
    candidates.push({ reason: 'codex-hooks-review-prompt', index: hooksIndex })
  }
  const trustIndex = Math.max(
    normalized.lastIndexOf('do you trust'),
    normalized.lastIndexOf('trust this'),
    normalized.lastIndexOf('trusted workspace')
  )
  const trustSegment = trustIndex === -1 ? '' : normalized.slice(trustIndex)
  if (
    trustIndex !== -1 &&
    (trustSegment.includes('workspace') ||
      trustSegment.includes('folder') ||
      trustSegment.includes('directory') ||
      trustSegment.includes('repo'))
  ) {
    candidates.push({ reason: 'codex-trust-workspace', index: trustIndex })
  }
  const interactivePromptIndex = Math.max(
    normalized.lastIndexOf('press enter to confirm'),
    normalized.lastIndexOf('press enter to continue'),
    normalized.lastIndexOf('press enter to view'),
    normalized.lastIndexOf('press enter to insert'),
    normalized.lastIndexOf('press t to trust')
  )
  const interactivePromptContext =
    interactivePromptIndex === -1
      ? ''
      : normalized.slice(Math.max(0, interactivePromptIndex - 600), interactivePromptIndex + 200)
  const hasCodexInteractiveContext =
    interactivePromptContext.includes('codex') ||
    interactivePromptContext.includes('permission') ||
    interactivePromptContext.includes('sandbox') ||
    interactivePromptContext.includes('trust') ||
    interactivePromptContext.includes('hook')
  if (interactivePromptIndex !== -1 && hasCodexInteractiveContext) {
    const contextStart = Math.max(0, interactivePromptIndex - 600)
    const hasSpecificPromptInContext = candidates.some(
      (candidate) => candidate.index >= contextStart && candidate.index <= interactivePromptIndex
    )
    if (!hasSpecificPromptInContext) {
      candidates.push({ reason: 'codex-interactive-prompt', index: interactivePromptIndex })
    }
  }
  return candidates.length > 0
    ? candidates.reduce((latest, candidate) =>
        candidate.index > latest.index ? candidate : latest
      )
    : null
}

function buildTerminalWaitResult(
  handle: string,
  condition: RuntimeTerminalWaitCondition,
  leaf: RuntimeLeafRecord
): RuntimeTerminalWait {
  return buildTerminalWait(handle, condition, getTerminalState(leaf), leaf.lastExitCode)
}

function buildTerminalWaitBlockedResult(
  handle: string,
  condition: RuntimeTerminalWaitCondition,
  leaf: RuntimeLeafRecord,
  blockedReason: RuntimeTerminalWaitBlockedReason
): RuntimeTerminalWait {
  return buildTerminalWait(
    handle,
    condition,
    getTerminalState(leaf),
    leaf.lastExitCode,
    blockedReason
  )
}

function buildPtyTerminalWaitResult(
  handle: string,
  condition: RuntimeTerminalWaitCondition,
  pty: RuntimePtyWorktreeRecord
): RuntimeTerminalWait {
  return buildTerminalWait(handle, condition, getPtyTerminalState(pty), pty.lastExitCode)
}

function buildPtyTerminalWaitBlockedResult(
  handle: string,
  condition: RuntimeTerminalWaitCondition,
  pty: RuntimePtyWorktreeRecord,
  blockedReason: RuntimeTerminalWaitBlockedReason
): RuntimeTerminalWait {
  return buildTerminalWait(
    handle,
    condition,
    getPtyTerminalState(pty),
    pty.lastExitCode,
    blockedReason
  )
}

function buildTerminalWait(
  handle: string,
  condition: RuntimeTerminalWaitCondition,
  status: RuntimeTerminalState,
  exitCode: number | null,
  blockedReason?: RuntimeTerminalWaitBlockedReason
): RuntimeTerminalWait {
  return {
    handle,
    condition,
    satisfied: blockedReason === undefined,
    status,
    exitCode,
    ...(blockedReason ? { blockedReason } : {})
  }
}

function getPtyTerminalState(pty: RuntimePtyWorktreeRecord): RuntimeTerminalState {
  return pty.connected ? 'running' : pty.lastExitCode !== null ? 'exited' : 'unknown'
}

function branchSelectorMatches(branch: string, selector: string): boolean {
  // Why: Git worktree data can report local branches as either `refs/heads/foo`
  // or `foo` depending on which plumbing path produced the record. Yiru's
  // branch selectors should accept either form so newly created worktrees stay
  // discoverable without exposing internal ref-shape differences to users.
  return normalizeLocalBranchName(branch) === normalizeLocalBranchName(selector)
}

function runtimePathsEqual(left: string, right: string): boolean {
  return normalizeRuntimePathForComparison(left) === normalizeRuntimePathForComparison(right)
}

function inferWorktreeIdFromPtyId(ptyId: string): string | null {
  return parsePtySessionId(ptyId).worktreeId
}

function indexPersistedPtyWorktreeBindings(
  session: WorkspaceSessionState | null | undefined
): ReadonlyMap<string, string> {
  const worktreeIdByPtyId = new Map<string, string>()
  const ambiguousPtyIds = new Set<string>()
  const bind = (ptyId: string | null | undefined, worktreeId: string): void => {
    if (!ptyId || ambiguousPtyIds.has(ptyId)) {
      return
    }
    const existingWorktreeId = worktreeIdByPtyId.get(ptyId)
    if (existingWorktreeId && existingWorktreeId !== worktreeId) {
      // Why: corrupt/stale duplicate bindings must not attribute a live PTY to
      // whichever workspace happened to be visited first.
      worktreeIdByPtyId.delete(ptyId)
      ambiguousPtyIds.add(ptyId)
      return
    }
    worktreeIdByPtyId.set(ptyId, worktreeId)
  }

  for (const [worktreeId, tabs] of Object.entries(session?.tabsByWorktree ?? {})) {
    for (const tab of tabs) {
      bind(tab.ptyId, worktreeId)
      bind(session?.remoteSessionIdsByTabId?.[tab.id], worktreeId)
      const layout = session?.terminalLayoutsByTabId[tab.id]
      for (const ptyId of Object.values(layout?.ptyIdsByLeafId ?? {})) {
        bind(ptyId, worktreeId)
      }
    }
  }
  return worktreeIdByPtyId
}

function setsEqual<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  if (a.size !== b.size) {
    return false
  }
  for (const value of a) {
    if (!b.has(value)) {
      return false
    }
  }
  return true
}

function parseRuntimeWorktreeId(
  worktreeId: string
): { repoId: string; worktreePath: string } | null {
  const parsed = splitWorktreeId(worktreeId)
  if (!parsed?.repoId) {
    return null
  }
  if (!parsed.worktreePath) {
    return null
  }
  return parsed
}

type RuntimeWorktreeSummaryPathCandidate = {
  summary: RuntimeWorktreePsSummary
  order: number
}

type RuntimeWorktreeSummaryPathIndex = {
  platformByRepoId: ReadonlyMap<string, NodeJS.Platform>
  posixAbsolute: Map<string, RuntimeWorktreeSummaryPathCandidate>
  posixRelative: Map<string, RuntimeWorktreeSummaryPathCandidate>
  windows: Map<string, RuntimeWorktreeSummaryPathCandidate>
  windowsAbsolute: Map<string, RuntimeWorktreeSummaryPathCandidate>
}

function buildRuntimeWorktreeSummaryPathIndex(
  summaries: ReadonlyMap<string, RuntimeWorktreePsSummary>,
  resolvedWorktrees: readonly ResolvedWorktree[],
  platformByRepoId: ReadonlyMap<string, NodeJS.Platform>
): RuntimeWorktreeSummaryPathIndex {
  const index: RuntimeWorktreeSummaryPathIndex = {
    platformByRepoId,
    posixAbsolute: new Map(),
    posixRelative: new Map(),
    windows: new Map(),
    windowsAbsolute: new Map()
  }
  for (const [order, worktree] of resolvedWorktrees.entries()) {
    const summary = summaries.get(worktree.id)
    if (!summary) {
      continue
    }
    const platform = platformByRepoId.get(worktree.repoId) ?? process.platform
    const candidate = { summary, order }
    if (isPosixAbsoluteRuntimeWorktreePath(worktree.path)) {
      setFirstRuntimeWorktreePathCandidate(
        index.posixAbsolute,
        runtimeWorktreeSummaryPathKey(worktree.repoId, worktree.path, platform),
        candidate
      )
      continue
    }

    const windowsKey = runtimeWorktreeSummaryPathKey(worktree.repoId, worktree.path, 'win32')
    setFirstRuntimeWorktreePathCandidate(index.windows, windowsKey, candidate)
    if (isWindowsAbsolutePathLike(worktree.path)) {
      setFirstRuntimeWorktreePathCandidate(index.windowsAbsolute, windowsKey, candidate)
    } else if (platform !== 'win32') {
      setFirstRuntimeWorktreePathCandidate(
        index.posixRelative,
        runtimeWorktreeSummaryPathKey(worktree.repoId, worktree.path, platform),
        candidate
      )
    }
  }
  return index
}

function findRuntimeWorktreeSummaryByPath(
  index: RuntimeWorktreeSummaryPathIndex,
  repoId: string,
  worktreePath: string,
  platform: NodeJS.Platform
): RuntimeWorktreePsSummary | null {
  if (isPosixAbsoluteRuntimeWorktreePath(worktreePath)) {
    return (
      index.posixAbsolute.get(runtimeWorktreeSummaryPathKey(repoId, worktreePath, platform))
        ?.summary ?? null
    )
  }

  const windowsKey = runtimeWorktreeSummaryPathKey(repoId, worktreePath, 'win32')
  if (platform === 'win32' || isWindowsAbsolutePathLike(worktreePath)) {
    return index.windows.get(windowsKey)?.summary ?? null
  }

  const posixCandidate = index.posixRelative.get(
    runtimeWorktreeSummaryPathKey(repoId, worktreePath, platform)
  )
  const windowsCandidate = index.windowsAbsolute.get(windowsKey)
  // Why: a malformed relative path can compare as POSIX against another
  // relative path or as Windows against an absolute Windows path. Preserve the
  // old pairwise scan's first-match result without rescanning every worktree.
  if (!posixCandidate) {
    return windowsCandidate?.summary ?? null
  }
  if (!windowsCandidate || posixCandidate.order < windowsCandidate.order) {
    return posixCandidate.summary
  }
  return windowsCandidate.summary
}

function setFirstRuntimeWorktreePathCandidate(
  candidates: Map<string, RuntimeWorktreeSummaryPathCandidate>,
  key: string,
  candidate: RuntimeWorktreeSummaryPathCandidate
): void {
  if (!candidates.has(key)) {
    candidates.set(key, candidate)
  }
}

function isPosixAbsoluteRuntimeWorktreePath(worktreePath: string): boolean {
  return worktreePath.startsWith('/') && !worktreePath.startsWith('//')
}

function runtimeWorktreeSummaryPathKey(
  repoId: string,
  worktreePath: string,
  platform: NodeJS.Platform
): string {
  return `${repoId}\0${worktreePathComparisonKey(worktreePath, platform)}`
}

function includeTargetResolvedWorktree(
  resolvedWorktrees: ResolvedWorktree[],
  targetWorktree: ResolvedWorktree | null
): ResolvedWorktree[] {
  if (!targetWorktree || resolvedWorktrees.some((worktree) => worktree.id === targetWorktree.id)) {
    return resolvedWorktrees
  }
  return [...resolvedWorktrees, targetWorktree]
}

function findResolvedWorktreeIdForPath(
  resolvedWorktrees: ResolvedWorktree[],
  cwd: string
): string | null {
  if (!cwd) {
    return null
  }
  const matches = resolvedWorktrees
    .filter((worktree) => isPathInsideOrEqual(worktree.path, cwd))
    .sort((left, right) => right.path.length - left.path.length)
  return matches[0]?.id ?? null
}

function getLeafWorktreeStatus(
  leaf: RuntimeLeafRecord,
  tabTitle: string | null
): RuntimeWorktreeStatus {
  // Why: recompute from the live title each call so worktree.ps mirrors what
  // the desktop sidebar's getWorktreeStatus does (no sticky state). Prefer
  // the freshest pane/OSC title, then tab title. Falling back to lastAgentStatus
  // only when no title is available preserves a sensible signal for very fresh
  // leaves before any title has been observed.
  const titleCandidates = [
    { title: leaf.paneTitle, updatedAt: leaf.paneTitleUpdatedAt },
    { title: leaf.lastOscTitle, updatedAt: leaf.lastOscTitleAt },
    { title: tabTitle, updatedAt: 0 }
  ]
  const latestTitle = getLatestAgentCandidateTitle(...titleCandidates)
  const detected = latestTitle ? detectAgentStatusFromTitle(latestTitle) : leaf.lastAgentStatus
  return getDetectedWorktreeStatus(detected, leaf.ptyId !== null)
}

function classifyLatestAgentTitle(
  ...titles: { title: string | null | undefined; updatedAt: number | null | undefined }[]
): 'agent' | 'management' | 'neutral' {
  return classifyAgentTitle(getLatestAgentCandidateTitle(...titles))
}

function getLatestPtyTitle(pty: RuntimePtyWorktreeRecord): string | null {
  return getLatestAgentCandidateTitle(
    { title: pty.title, updatedAt: pty.titleUpdatedAt },
    { title: pty.lastOscTitle, updatedAt: pty.lastOscTitleAt }
  )
}

function getLatestLeafTitle(leaf: RuntimeLeafRecord, tabTitle: string | null): string | null {
  return getLatestAgentCandidateTitle(
    { title: leaf.paneTitle, updatedAt: leaf.paneTitleUpdatedAt },
    { title: leaf.lastOscTitle, updatedAt: leaf.lastOscTitleAt },
    { title: tabTitle, updatedAt: 0 }
  )
}

function classifyAgentTitle(title: string | null): 'agent' | 'management' | 'neutral' {
  if (!title) {
    return 'neutral'
  }
  if (isClaudeManagementTitle(title)) {
    return 'management'
  }
  return detectAgentStatusFromTitle(title) !== null ? 'agent' : 'neutral'
}

function terminalTitleBlocksExplicitAgentStatus(title: string | null): boolean {
  if (!title) {
    return false
  }
  return isClaudeManagementTitle(title) || isShellProcess(title)
}

function getLatestAgentCandidateTitle(
  ...titles: { title: string | null | undefined; updatedAt: number | null | undefined }[]
): string | null {
  return getLatestAgentCandidateTitleInfo(...titles)?.title ?? null
}

function getLatestAgentCandidateTitleInfo(
  ...titles: { title: string | null | undefined; updatedAt: number | null | undefined }[]
): { title: string; updatedAt: number } | null {
  let latest: { title: string; updatedAt: number } | null = null
  for (const candidate of titles) {
    const title = candidate.title?.trim()
    if (!title) {
      continue
    }
    const updatedAt = candidate.updatedAt ?? 0
    if (!latest || updatedAt > latest.updatedAt) {
      latest = { title, updatedAt }
    }
  }
  return latest
}

function getSavedTabWorktreeStatus(title: string, hasPty: boolean): RuntimeWorktreeStatus {
  return getDetectedWorktreeStatus(detectAgentStatusFromTitle(title), hasPty)
}

function getDetectedWorktreeStatus(
  detected: AgentStatus | null,
  hasPty: boolean
): RuntimeWorktreeStatus {
  if (detected === 'permission') {
    return 'permission'
  }
  if (detected === 'working') {
    return 'working'
  }
  return hasPty ? 'active' : 'inactive'
}

function mapExplicitAgentStateToRuntimeTerminalStatus(
  state: AgentStatusEntry['state']
): NonNullable<RuntimeTerminalAgentStatus['status']> {
  switch (state) {
    case 'blocked':
    case 'waiting':
      return 'permission'
    case 'working':
      return 'working'
    case 'done':
      return 'idle'
  }
}

function mergeWorktreeStatus(
  current: RuntimeWorktreeStatus,
  next: RuntimeWorktreeStatus
): RuntimeWorktreeStatus {
  return WORKTREE_STATUS_PRIORITY[next] > WORKTREE_STATUS_PRIORITY[current] ? next : current
}

function normalizeTerminalChunk(
  chunk: string,
  pendingAnsi: string = ''
): { text: string; pendingAnsi: string } {
  // Why: most high-throughput PTY chunks are plain printable text. Avoid
  // running every ANSI/OSC regex over megabytes that do not need normalization.
  if (pendingAnsi.length === 0 && !terminalChunkNeedsNormalization(chunk)) {
    return { text: chunk, pendingAnsi: '' }
  }
  const combined = `${pendingAnsi}${chunk}`
  const parts: string[] = []
  let textStart = 0
  for (let index = 0; index < combined.length; index += 1) {
    const char = combined[index]
    if (char === '\x1b') {
      appendTerminalNormalizedSpan(parts, combined, textStart, index)
      if (index + 1 >= combined.length) {
        return { text: parts.join(''), pendingAnsi: combined.slice(index) }
      }
      const parsed = parseAnsiControlSequence(combined, index)
      if (!parsed) {
        return {
          text: parts.join(''),
          pendingAnsi: trimPendingAnsiControl(combined.slice(index))
        }
      }
      if (parsed.kind === 'csi' && isTerminalPreviewLineControl(parsed)) {
        // Why: Codex can redraw status text with ANSI controls but no CR; keep
        // those controls so the tail buffer overwrites the previous frame.
        parts.push(combined.slice(index, parsed.endIndex + 1))
      }
      index = parsed.endIndex
      textStart = index + 1
      continue
    }
    if (char === '\r' && combined[index + 1] === '\n') {
      appendTerminalNormalizedSpan(parts, combined, textStart, index)
      parts.push('\n')
      index += 1
      textStart = index + 1
      continue
    }
    const code = combined.charCodeAt(index)
    if (code === 0x08 || code === 0x09 || code === 0x0a || code === 0x0d) {
      appendTerminalNormalizedSpan(parts, combined, textStart, index)
      parts.push(char)
      textStart = index + 1
    } else if (!isTerminalPreviewPrintableCodeUnit(code)) {
      appendTerminalNormalizedSpan(parts, combined, textStart, index)
      textStart = index + 1
    }
  }
  appendTerminalNormalizedSpan(parts, combined, textStart, combined.length)
  return { text: parts.join(''), pendingAnsi: '' }
}

function appendTerminalNormalizedSpan(
  parts: string[],
  value: string,
  start: number,
  end: number
): void {
  if (end > start) {
    parts.push(value.slice(start, end))
  }
}

function isTerminalPreviewPrintableCodeUnit(code: number): boolean {
  return code >= 0x20 && code !== 0x7f && (code < 0x80 || code > 0x9f)
}

function terminalChunkNeedsNormalization(chunk: string): boolean {
  for (let index = 0; index < chunk.length; index++) {
    const code = chunk.charCodeAt(index)
    if (
      code === 0x1b ||
      code === 0x7f ||
      code === 0x0d ||
      code < 0x09 ||
      (code > 0x0a && code < 0x20) ||
      (code >= 0x80 && code <= 0x9f)
    ) {
      return true
    }
  }
  return false
}

function trimPendingAnsiControl(value: string): string {
  if (value.length <= MAX_TAIL_PENDING_ANSI_CHARS) {
    return value
  }
  const introducer = value.slice(0, Math.min(2, value.length))
  const suffixBudget = Math.max(0, MAX_TAIL_PENDING_ANSI_CHARS - introducer.length)
  return `${introducer}${value.slice(-suffixBudget)}`
}

function normalizeRuntimeWorktreeInstanceId(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed && trimmed.length <= 512 && !trimmed.includes('\0') ? trimmed : null
}

function isTerminalPreviewLineControl(parsed: {
  final: string
  params: string
  firstParam: number | null
}): boolean {
  if (!hasCanonicalNumericCsiParams(parsed.params)) {
    return false
  }
  if (parsed.final === 'K') {
    const mode = parsed.firstParam ?? 0
    return mode === 0 || mode === 1 || mode === 2
  }
  return (
    parsed.final === 'A' ||
    parsed.final === 'G' ||
    parsed.final === '`' ||
    parsed.final === 'D' ||
    parsed.final === 'C'
  )
}

function maxTimestamp(left: number | null, right: number | null): number | null {
  if (left === null) {
    return right
  }
  if (right === null) {
    return left
  }
  return Math.max(left, right)
}

function compareWorktreePs(
  left: RuntimeWorktreePsSummary,
  right: RuntimeWorktreePsSummary
): number {
  // Pinned and unread worktrees sort above others so they survive truncation.
  if (left.isPinned !== right.isPinned) {
    return left.isPinned ? -1 : 1
  }
  if (left.unread !== right.unread) {
    return left.unread ? -1 : 1
  }
  // Why: worktree.ps is truncated for mobile, so host-visible activity must
  // survive ahead of ordinary inactive rows without displacing pinned/unread.
  if (left.hasHostSidebarActivity !== right.hasHostSidebarActivity) {
    return left.hasHostSidebarActivity ? -1 : 1
  }
  const leftLast = left.lastOutputAt ?? -1
  const rightLast = right.lastOutputAt ?? -1
  if (leftLast !== rightLast) {
    return rightLast - leftLast
  }
  if (left.liveTerminalCount !== right.liveTerminalCount) {
    return right.liveTerminalCount - left.liveTerminalCount
  }
  return left.path.localeCompare(right.path)
}
