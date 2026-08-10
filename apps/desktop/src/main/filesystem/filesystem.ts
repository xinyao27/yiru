import { randomUUID } from 'node:crypto'
import { readFile, writeFile, stat, lstat, open, rename, rm } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'

import type { HostedReviewProvider } from '@yiru/workbench-model/review'
import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  splitWorktreeId
} from '@yiru/workbench-model/workspace'
/* eslint-disable max-lines */
import { getCommitMessageModelDiscoveryHostKey } from '~shared/commit-message/host-key'
import { validateGitForkSyncExpectedUpstream } from '~shared/git/fork-sync'
import type { GitHistoryOptions, GitHistoryResult } from '~shared/git/history'
import type {
  GitAddTagResult,
  GitCheckoutCommitResult,
  GitCherryPickResult,
  GitCreateBranchResult,
  GitDropCommitResult,
  GitMergeCommitResult,
  GitRebaseOntoCommitResult,
  GitResetToCommitResult,
  GitRevertResult
} from '~shared/git/write-op-results'
import type { ResolvedSourceControlAiGenerationParams } from '~shared/source-control/ai'
import type {
  GitBranchCompareResult,
  GitCommitCompareResult,
  GitConflictOperation,
  GitDiffResult,
  GitForkSyncExpectedUpstream,
  GitForkSyncResult,
  GlobalSettings,
  GitStagingArea,
  GitPushTarget,
  GitUpstreamStatus,
  GitStatusResult,
  Repo,
  TuiAgent
} from '~shared/types'

import { localLogFileIdentity } from '../ai-vault/local-log-tail-reader'
import { createBranchFromCommit } from '../git/branch-create'
import { checkIgnoredPaths } from '../git/check-ignored-paths'
import { checkoutCommit } from '../git/checkout-commit'
import { cherryPickCommit } from '../git/cherry-pick'
import { dropCommit } from '../git/drop-commit'
import { gitSyncForkDefaultBranch } from '../git/fork-sync'
import { getHistory } from '../git/history'
import {
  appendFolderToGitignore,
  findKnownHugeFolderPathsToIgnore
} from '../git/huge-folder-ignore'
import { mergeCommit } from '../git/merge-commit'
import { validateGitPushTarget } from '../git/push-target-validation'
import { rebaseOntoCommit } from '../git/rebase-onto-commit'
import { gitFastForward, gitFetch, gitPull, gitPullRebaseFromBase, gitPush } from '../git/remote'
import { getRemoteCommitUrl, getRemoteFileUrl } from '../git/repo'
import { resetToCommit } from '../git/reset-to-commit'
import { revertCommit } from '../git/revert'
import { gitExecFileAsync } from '../git/runner'
import {
  getStatus,
  getSubmoduleStatus,
  abortMerge,
  abortRebase,
  abortRevert,
  detectConflictOperation,
  getDiff,
  commitChanges,
  stageFile,
  unstageFile,
  bulkStageFiles,
  bulkUnstageFiles,
  bulkDiscardChanges,
  discardChanges,
  getStagedCommitContext,
  getBranchCompare,
  getBranchDiff,
  getCommitCompare,
  getCommitDiff
} from '../git/status'
import { addTag } from '../git/tag'
import { getUpstreamStatus } from '../git/upstream'
import type { MainIpcRegistration } from '../ipc-registration'
import { sanitizeLocalDownloadFilename } from '../local-download-filename'
import type { Store } from '../persistence'
import type { LocalProjectWorktreeGitOptions } from '../project-runtime-git-options'
import { listRepoWorktrees } from '../repo-worktrees'
import { resolveHostedReviewBodyForGeneration } from '../source-control/pull-request-template'
import {
  prepareLocalCommitMessageAgentEnv,
  type CommitMessageAgentRuntimeTarget,
  type CommitMessageAgentEnvironmentResolvers
} from '../text-generation/commit-message-agent-environment'
import {
  cancelGenerateCommitMessageLocal,
  cancelGeneratePullRequestFieldsLocal,
  discoverCommitMessageModelsLocal,
  generateCommitMessageFromContext,
  generatePullRequestFieldsFromContext,
  resolveCommitMessageSettings,
  type DiscoverCommitMessageModelsResult,
  type CommitMessageGenerationTarget,
  type GenerateCommitMessageResult,
  type GeneratePullRequestFieldsResult
} from '../text-generation/commit-message-text-generation'
import { getPullRequestDraftContext } from '../text-generation/pull-request-context'
import { tryDeleteWslUncPath } from '../wsl-unc-delete'
import {
  resolveAuthorizedPath,
  resolveRegisteredWorktreePath,
  validateGitRelativeFilePath,
  isENOENT,
  authorizeExternalPath
} from './auth'
import { registerDownloadedFolderSessionHandlers } from './downloaded-folder-sessions'
import { initializeLocalLogTailAuthorization } from './local-log-tail'
import { getLocalGitOptionsForRegisteredWorktree } from './local-worktree-runtime-options'
import { registerFilesystemMutationHandlers } from './mutations'
import type { NativePathServices } from './native-path-services'
import { createSenderScopedRequestCancellations } from './sender-scoped-request-cancellation'

// Why: Monaco has large-file optimizations like VS Code; blocking at 5MB makes
// ordinary JSON/log files inaccessible before the editor can degrade features.
const MAX_TEXT_FILE_SIZE = 50 * 1024 * 1024 // 50MB
const BINARY_PROBE_BYTES = 8192
const FULL_GIT_OBJECT_ID_PATTERN = /^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/
// Why: previewable binaries (PDFs, images) are rendered by the viewer as
// base64 blobs, not parsed as text — 5MB is tight for real-world PDFs, and
// raising this cap only affects binary preview, not text/search paths.
// The relay runtime uses a smaller 10MB cap because its JSON-RPC frames are
// bounded by MAX_MESSAGE_SIZE = 16MB; the local IPC path has no such limit,
// so 50MB covers real-world PDFs (specs, datasheets, image-heavy contracts).
// See the relay's text-search fs handler for the remote-side reasoning.
const MAX_PREVIEWABLE_BINARY_SIZE = 50 * 1024 * 1024 // 50MB
const PREVIEWABLE_BINARY_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf'
}

async function readLocalLogSnapshot(filePath: string): Promise<{
  content: string
  isBinary: boolean
  fileIdentity?: string
}> {
  const handle = await open(filePath, 'r')
  try {
    const stats = await handle.stat()
    if (stats.size > MAX_TEXT_FILE_SIZE) {
      throw new Error(
        `File too large: ${(stats.size / 1024 / 1024).toFixed(1)}MB exceeds ${MAX_TEXT_FILE_SIZE / 1024 / 1024}MB limit`
      )
    }
    const buffer = await handle.readFile()
    if (buffer.byteLength > MAX_TEXT_FILE_SIZE) {
      throw new Error(
        `File too large: ${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB exceeds ${MAX_TEXT_FILE_SIZE / 1024 / 1024}MB limit`
      )
    }
    if (isBinaryBuffer(buffer)) {
      return { content: '', isBinary: true }
    }
    return {
      content: buffer.toString('utf8'),
      isBinary: false,
      fileIdentity: localLogFileIdentity(stats)
    }
  } finally {
    await handle.close()
  }
}

type DownloadFileResult = { canceled: true } | { canceled: false; destinationPath: string }

function validateRequiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} is required`)
  }
  return value
}

function decodeDownloadedFileContent(content: string, encoding: 'utf8' | 'base64'): Buffer {
  if (encoding === 'base64') {
    return Buffer.from(content, 'base64')
  }
  return Buffer.from(content, 'utf8')
}

type DownloadSession = {
  destinationPath: string
  tempPath: string
  destinationExisted: boolean
  handle: FileHandle
  cleanupTimer: ReturnType<typeof setTimeout>
  senderId: number
}

const DOWNLOAD_SESSION_TTL_MS = 30 * 60 * 1000

function createSiblingTransferPath(destinationPath: string, suffix: string): string {
  return join(dirname(destinationPath), `.${randomUUID()}.${suffix}`)
}

async function cleanupLocalTransferPath(filePath: string | null): Promise<void> {
  if (!filePath) {
    return
  }
  await rm(filePath, { force: true }).catch(() => {})
}

async function inspectDownloadDestination(destinationPath: string): Promise<{ existed: boolean }> {
  try {
    const destinationStat = await stat(destinationPath)
    if (destinationStat.isDirectory()) {
      throw new Error('Cannot download to a directory')
    }
    return { existed: true }
  } catch (error) {
    if (isENOENT(error)) {
      return { existed: false }
    }
    throw error
  }
}

async function assertDestinationStillUnclaimed(destinationPath: string): Promise<void> {
  try {
    await stat(destinationPath)
  } catch (error) {
    if (isENOENT(error)) {
      return
    }
    throw error
  }
  throw new Error('Destination file appeared before download completed')
}

async function promoteDownloadedFile(
  tempPath: string,
  destinationPath: string,
  destinationExisted: boolean
): Promise<void> {
  if (!destinationExisted) {
    await assertDestinationStillUnclaimed(destinationPath)
    await rename(tempPath, destinationPath)
    return
  }

  const backupPath = createSiblingTransferPath(destinationPath, 'backup')
  let backupCreated = false
  try {
    await rename(destinationPath, backupPath)
    backupCreated = true
    await rename(tempPath, destinationPath)
    await cleanupLocalTransferPath(backupPath)
  } catch (error) {
    if (backupCreated) {
      await rename(backupPath, destinationPath).catch(() => {})
    }
    throw error
  }
}

function comparableLocalPath(value: string): string {
  const normalized = resolve(value)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function getCandidateLocalWorktreePaths(
  worktreePath: string,
  resolvedWorktreePath: string
): Set<string> {
  return new Set([worktreePath, resolvedWorktreePath].map(comparableLocalPath))
}

function hasRegisteredWorktreeMetaForRepo(
  store: Store,
  repoId: string,
  candidatePaths: Set<string>
): boolean {
  for (const worktreeId of Object.keys(store.getAllWorktreeMeta())) {
    const parsed = splitWorktreeId(worktreeId)
    if (parsed?.repoId === repoId && candidatePaths.has(comparableLocalPath(parsed.worktreePath))) {
      return true
    }
  }
  return false
}

async function localRepoOwnsWorktree(
  store: Store,
  repo: Repo,
  worktreePath: string
): Promise<boolean> {
  let resolvedWorktreePath: string
  try {
    resolvedWorktreePath = await resolveRegisteredWorktreePath(worktreePath, store)
  } catch {
    return false
  }
  const candidatePaths = getCandidateLocalWorktreePaths(worktreePath, resolvedWorktreePath)
  if (candidatePaths.has(comparableLocalPath(repo.path))) {
    return true
  }
  if (hasRegisteredWorktreeMetaForRepo(store, repo.id, candidatePaths)) {
    return true
  }
  try {
    const worktrees = await listRepoWorktrees(repo)
    return worktrees.some((worktree) => candidatePaths.has(comparableLocalPath(worktree.path)))
  } catch {
    return false
  }
}

async function getRepoForSourceControlAi(
  store: Store,
  args: { repoId?: string; worktreePath: string }
): Promise<Repo | null> {
  if (!args.repoId) {
    return null
  }
  const repo = store
    .getRepos()
    .find(
      (candidate) =>
        candidate.id === args.repoId &&
        getRepoExecutionHostId(candidate) === LOCAL_EXECUTION_HOST_ID
    )
  if (!repo) {
    return null
  }
  // Why: renderer-supplied repoId is advisory; only apply repo overrides when
  // the requested local worktree is known to belong to that repo.
  return (await localRepoOwnsWorktree(store, repo, args.worktreePath)) ? repo : null
}

function getLocalAgentRuntimeTarget(
  gitOptions: LocalProjectWorktreeGitOptions
): CommitMessageAgentRuntimeTarget {
  return gitOptions.wslDistro
    ? { runtime: 'wsl', wslDistro: gitOptions.wslDistro }
    : { runtime: 'host' }
}

function getLocalTextGenerationTarget(
  worktreePath: string,
  gitOptions: LocalProjectWorktreeGitOptions,
  env?: NodeJS.ProcessEnv
): Extract<CommitMessageGenerationTarget, { kind: 'local' }> {
  return {
    kind: 'local',
    cwd: worktreePath,
    ...(gitOptions.wslDistro ? { wslDistro: gitOptions.wslDistro } : {}),
    ...(env ? { env } : {})
  }
}

function validateFullGitObjectId(value: string, label: string): string {
  if (!FULL_GIT_OBJECT_ID_PATTERN.test(value)) {
    throw new Error(`${label} must be a full git object id`)
  }
  return value
}

/**
 * Check if a buffer appears to be binary (contains null bytes in first 8KB).
 */
function isBinaryBuffer(buffer: Buffer): boolean {
  const len = Math.min(buffer.length, 8192)
  for (let i = 0; i < len; i++) {
    if (buffer[i] === 0) {
      return true
    }
  }
  return false
}

async function isBinaryFilePrefix(filePath: string): Promise<boolean> {
  const handle = await open(filePath, 'r')
  try {
    const probe = Buffer.alloc(BINARY_PROBE_BYTES)
    const { bytesRead } = await handle.read(probe, 0, probe.length, 0)
    return isBinaryBuffer(probe.subarray(0, bytesRead))
  } finally {
    await handle.close()
  }
}

export function registerFilesystemHandlers(
  ipcMain: MainIpcRegistration,
  store: Store,
  commitMessageAgentEnv: CommitMessageAgentEnvironmentResolvers | undefined,
  nativePathServices: NativePathServices
): void {
  const downloadSessions = new Map<string, DownloadSession>()

  async function closeDownloadSession(
    transferId: string,
    cleanupTemp: boolean
  ): Promise<DownloadSession | null> {
    const session = downloadSessions.get(transferId)
    if (!session) {
      return null
    }
    downloadSessions.delete(transferId)
    clearTimeout(session.cleanupTimer)
    await session.handle.close().catch(() => {})
    if (cleanupTemp) {
      await cleanupLocalTransferPath(session.tempPath)
    }
    return session
  }

  function cleanupDownloadSessionsForSender(senderId: number): void {
    for (const [transferId, session] of Array.from(downloadSessions)) {
      if (session.senderId === senderId) {
        void closeDownloadSession(transferId, true)
      }
    }
  }

  // ─── Filesystem ─────────────────────────────────────────
  ipcMain.handle(
    'file-host:readFile',
    async (
      _event,
      args: { filePath: string; connectionId?: string; includeLocalLogMetadata?: boolean }
    ): Promise<{
      content: string
      isBinary: boolean
      isImage?: boolean
      mimeType?: string
      fileIdentity?: string
    }> => {
      const filePath = await resolveAuthorizedPath(args.filePath, store)
      if (args.includeLocalLogMetadata === true) {
        return readLocalLogSnapshot(filePath)
      }
      const stats = await stat(filePath)
      const mimeType = PREVIEWABLE_BINARY_MIME_TYPES[extname(filePath).toLowerCase()]
      const sizeLimit = mimeType ? MAX_PREVIEWABLE_BINARY_SIZE : MAX_TEXT_FILE_SIZE
      if (stats.size > sizeLimit) {
        throw new Error(
          `File too large: ${(stats.size / 1024 / 1024).toFixed(1)}MB exceeds ${sizeLimit / 1024 / 1024}MB limit`
        )
      }

      if (mimeType) {
        const buffer = await readFile(filePath)
        return {
          content: buffer.toString('base64'),
          isBinary: true,
          // Why: the renderer/store contract already keys previewable binary
          // rendering off `isImage`. Keep that legacy flag for PDFs too so the
          // new preview path stays compatible with existing callers.
          isImage: true,
          mimeType
        }
      }

      // Why: the text cap is intentionally larger than the old binary cap.
      // Probe unknown large files first so archives do not get fully buffered
      // just to discover they are not editable text.
      if (stats.size > BINARY_PROBE_BYTES && (await isBinaryFilePrefix(filePath))) {
        return { content: '', isBinary: true }
      }

      const buffer = await readFile(filePath)
      if (isBinaryBuffer(buffer)) {
        return { content: '', isBinary: true }
      }

      return { content: buffer.toString('utf-8'), isBinary: false }
    }
  )

  registerDownloadedFolderSessionHandlers(ipcMain, nativePathServices)

  ipcMain.handle(
    'file-host:saveDownloadedFile',
    async (
      event,
      args: { suggestedName?: string; content?: string; encoding?: 'utf8' | 'base64' }
    ): Promise<DownloadFileResult> => {
      const suggestedName = sanitizeLocalDownloadFilename(
        validateRequiredString(args?.suggestedName, 'suggestedName')
      )
      if (typeof args?.content !== 'string') {
        throw new Error('content is required')
      }
      const content = args.content
      const encoding = args?.encoding === 'base64' ? 'base64' : 'utf8'
      const destinationPath = await nativePathServices.chooseDownloadFile(
        event.sender.id,
        suggestedName
      )
      if (!destinationPath) {
        return { canceled: true }
      }
      const { existed } = await inspectDownloadDestination(destinationPath)
      const tempPath = createSiblingTransferPath(destinationPath, 'download')
      let promoted = false
      try {
        await writeFile(tempPath, decodeDownloadedFileContent(content, encoding))
        await promoteDownloadedFile(tempPath, destinationPath, existed)
        promoted = true
        return { canceled: false, destinationPath }
      } finally {
        if (!promoted) {
          await cleanupLocalTransferPath(tempPath)
        }
      }
    }
  )

  ipcMain.handle(
    'file-host:startDownloadedFile',
    async (
      event,
      args: { suggestedName?: string }
    ): Promise<
      | { canceled: true }
      | {
          canceled: false
          transferId: string
          destinationPath: string
        }
    > => {
      const suggestedName = sanitizeLocalDownloadFilename(
        validateRequiredString(args?.suggestedName, 'suggestedName')
      )
      const destinationPath = await nativePathServices.chooseDownloadFile(
        event.sender.id,
        suggestedName
      )
      if (!destinationPath) {
        return { canceled: true }
      }
      const { existed } = await inspectDownloadDestination(destinationPath)
      const tempPath = createSiblingTransferPath(destinationPath, 'download')
      const transferId = randomUUID()
      try {
        const handle = await open(tempPath, 'wx')
        const senderId = typeof event.sender.id === 'number' ? event.sender.id : Number.NaN
        const cleanupTimer = setTimeout(() => {
          void closeDownloadSession(transferId, true)
        }, DOWNLOAD_SESSION_TTL_MS)
        if (typeof cleanupTimer.unref === 'function') {
          cleanupTimer.unref()
        }
        downloadSessions.set(transferId, {
          destinationPath,
          tempPath,
          destinationExisted: existed,
          handle,
          cleanupTimer,
          senderId
        })
        event.sender.once?.('destroyed', () => cleanupDownloadSessionsForSender(senderId))
        return { canceled: false, transferId, destinationPath }
      } catch (error) {
        await cleanupLocalTransferPath(tempPath)
        throw error
      }
    }
  )

  ipcMain.handle(
    'file-host:appendDownloadedFileChunk',
    async (
      _event,
      args: { transferId?: string; contentBase64?: string }
    ): Promise<{ ok: true }> => {
      const transferId = validateRequiredString(args?.transferId, 'transferId')
      const contentBase64 = validateRequiredString(args?.contentBase64, 'contentBase64')
      const session = downloadSessions.get(transferId)
      if (!session) {
        throw new Error('Download session not found')
      }
      await session.handle.writeFile(Buffer.from(contentBase64, 'base64'))
      return { ok: true }
    }
  )

  ipcMain.handle(
    'file-host:finishDownloadedFile',
    async (
      _event,
      args: { transferId?: string }
    ): Promise<{ canceled: false; destinationPath: string }> => {
      const transferId = validateRequiredString(args?.transferId, 'transferId')
      const session = await closeDownloadSession(transferId, false)
      if (!session) {
        throw new Error('Download session not found')
      }
      let promoted = false
      try {
        await promoteDownloadedFile(
          session.tempPath,
          session.destinationPath,
          session.destinationExisted
        )
        promoted = true
        return { canceled: false, destinationPath: session.destinationPath }
      } finally {
        if (!promoted) {
          await cleanupLocalTransferPath(session.tempPath)
        }
      }
    }
  )

  ipcMain.handle(
    'file-host:cancelDownloadedFile',
    async (_event, args: { transferId?: string }): Promise<{ ok: true }> => {
      const transferId = validateRequiredString(args?.transferId, 'transferId')
      await closeDownloadSession(transferId, true)
      return { ok: true }
    }
  )

  ipcMain.handle(
    'file-host:writeFile',
    async (
      _event,
      args: { filePath: string; content: string; connectionId?: string }
    ): Promise<void> => {
      const filePath = await resolveAuthorizedPath(args.filePath, store)

      try {
        const fileStats = await lstat(filePath)
        if (fileStats.isDirectory()) {
          throw new Error('Cannot write to a directory')
        }
      } catch (error) {
        if (!isENOENT(error)) {
          throw error
        }
      }

      await writeFile(filePath, args.content, 'utf-8')
    }
  )

  ipcMain.handle(
    'file-host:deletePath',
    async (
      _event,
      args: { targetPath: string; connectionId?: string; recursive?: boolean }
    ): Promise<void> => {
      // Why: deleting must operate on the symlink itself, not its target.
      // Following the link with realpath() would trash the real file — which
      // could be another file inside the worktree, or a path outside all
      // allowed roots that we would never be able to delete again.
      const targetPath = await resolveAuthorizedPath(args.targetPath, store, {
        preserveSymlink: true
      })

      // Why: WSL UNC targets (\\wsl.localhost\<distro>\...) have no Recycle Bin,
      // so shell.trashItem throws. Hard-delete via `rm` inside the distro instead
      // (true delete, honors Linux perms). Returns false for normal local paths,
      // which still go to the Recycle Bin (issue #6415).
      if (await tryDeleteWslUncPath(targetPath, { recursive: args.recursive })) {
        return
      }

      // Why: once auto-refresh exists, an external delete can race with a
      // UI-initiated delete. Swallowing ENOENT keeps the action idempotent
      // from the user's perspective (design §7.1).
      try {
        await nativePathServices.trashPath(targetPath)
      } catch (error) {
        if (isENOENT(error)) {
          return
        }
        throw error
      }
    }
  )

  registerFilesystemMutationHandlers(ipcMain, store)

  ipcMain.handle(
    'file-host:authorizeExternalPath',
    (_event, args: { targetPath: string }): void => {
      authorizeExternalPath(args.targetPath)
    }
  )

  ipcMain.handle(
    'file-host:stat',
    async (
      _event,
      args: { filePath: string; connectionId?: string }
    ): Promise<{ size: number; isDirectory: boolean; mtime: number }> => {
      const filePath = await resolveAuthorizedPath(args.filePath, store)
      const stats = await stat(filePath)
      return {
        size: stats.size,
        isDirectory: stats.isDirectory(),
        mtime: stats.mtimeMs
      }
    }
  )

  ipcMain.handle(
    'file-host:pathExists',
    async (_event, args: { filePath: string; connectionId?: string }): Promise<boolean> => {
      try {
        const filePath = await resolveAuthorizedPath(args.filePath, store)
        await stat(filePath)
        return true
      } catch (error) {
        if (isENOENT(error)) {
          return false
        }
        throw error
      }
    }
  )

  // ─── Git operations ─────────────────────────────────────
  const gitStatusCancellations = createSenderScopedRequestCancellations()
  ipcMain.handle(
    'git:status',
    async (
      event,
      args: {
        worktreePath: string
        connectionId?: string
        includeIgnored?: boolean
        bypassEffectiveUpstreamNegativeCache?: boolean
        reuseLineStats?: boolean
        requestToken?: string
      }
    ): Promise<GitStatusResult> => {
      const controller = gitStatusCancellations.begin(event, args.requestToken)
      const options = {
        includeIgnored: args.includeIgnored ?? false,
        ...(args.reuseLineStats === true ? { reuseLineStats: true } : {}),
        ...(args.bypassEffectiveUpstreamNegativeCache === true
          ? { bypassEffectiveUpstreamNegativeCache: true }
          : {}),
        ...(controller ? { signal: controller.signal } : {})
      }
      try {
        const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
        const gitOptions = getLocalGitOptionsForRegisteredWorktree(
          store,
          args.worktreePath,
          worktreePath
        )
        return await getStatus(worktreePath, { ...options, ...gitOptions })
      } finally {
        gitStatusCancellations.finish(event, args.requestToken, controller)
      }
    }
  )

  ipcMain.handle('git:cancelStatus', (event, args: { requestToken: string }): void => {
    gitStatusCancellations.cancel(event, args.requestToken)
  })

  // Why: the parent status only reports one gitlink row per submodule. When the
  // user expands a dirty submodule, this fetches the inner per-file changes by
  // running a plain status inside the submodule's own worktree (read-only).
  ipcMain.handle(
    'git:submoduleStatus',
    async (
      _event,
      args: {
        worktreePath: string
        submodulePath: string
        connectionId?: string
        area?: GitStagingArea
      }
    ): Promise<GitStatusResult> => {
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      return getSubmoduleStatus(worktreePath, args.submodulePath, {
        ...gitOptions,
        ...(args.area === 'staged' ? { staged: true } : {})
      })
    }
  )

  ipcMain.handle(
    'git:checkIgnored',
    async (
      _event,
      args: { worktreePath: string; paths: string[]; connectionId?: string }
    ): Promise<string[]> => {
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const paths = args.paths.map((p) => validateGitRelativeFilePath(worktreePath, p))
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      return checkIgnoredPaths(worktreePath, paths, gitOptions)
    }
  )

  // Why: when status hits the entry limit, the SCM view offers to .gitignore the
  // folder that's flooding it. These two handlers back that local-only flow.
  ipcMain.handle(
    'git:findHugeFoldersToIgnore',
    async (_event, args: { worktreePath: string }): Promise<string[]> => {
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      return findKnownHugeFolderPathsToIgnore(worktreePath, gitOptions)
    }
  )

  ipcMain.handle(
    'git:appendGitignore',
    async (_event, args: { worktreePath: string; folderName: string }): Promise<boolean> => {
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      return appendFolderToGitignore(worktreePath, args.folderName)
    }
  )

  ipcMain.handle(
    'git:history',
    async (
      _event,
      args: { worktreePath: string; connectionId?: string } & GitHistoryOptions
    ): Promise<GitHistoryResult> => {
      // Why: forward every option the contract carries. Hand-picking a subset
      // here silently dropped `skip` (so "Load More" refetched page one and
      // deduped it away) plus the graph's `refScope`/`includeRemoteBranches`
      // walk — the renderer's request must survive the IPC hop intact.
      const options: GitHistoryOptions = {
        limit: args.limit,
        baseRef: args.baseRef,
        refScope: args.refScope,
        includeRemoteBranches: args.includeRemoteBranches,
        skip: args.skip
      }
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      return getHistory(worktreePath, { ...options, ...gitOptions })
    }
  )

  // Why: lightweight fs-only check for conflict operation state. Used to poll
  // non-active worktrees so their "Rebasing"/"Merging" badges clear when the
  // operation finishes, without running a full `git status`.
  ipcMain.handle(
    'git:conflictOperation',
    async (
      _event,
      args: { worktreePath: string; connectionId?: string }
    ): Promise<GitConflictOperation> => {
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      return detectConflictOperation(worktreePath)
    }
  )

  ipcMain.handle(
    'git:abortMerge',
    async (_event, args: { worktreePath: string; connectionId?: string }): Promise<void> => {
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      await abortMerge(worktreePath, gitOptions)
    }
  )

  ipcMain.handle(
    'git:abortRebase',
    async (_event, args: { worktreePath: string; connectionId?: string }): Promise<void> => {
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      await abortRebase(worktreePath, gitOptions)
    }
  )

  ipcMain.handle(
    'git:abortRevert',
    async (_event, args: { worktreePath: string; connectionId?: string }): Promise<void> => {
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      await abortRevert(worktreePath, gitOptions)
    }
  )

  ipcMain.handle(
    'git:addTag',
    async (
      _event,
      args: {
        worktreePath: string
        name: string
        commit: string
        message?: string
        force?: boolean
        connectionId?: string
      }
    ): Promise<GitAddTagResult> => {
      const params = {
        name: args.name,
        commit: args.commit,
        message: args.message,
        force: args.force
      }
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      return addTag(worktreePath, params, gitOptions)
    }
  )

  ipcMain.handle(
    'git:createBranch',
    async (
      _event,
      args: {
        worktreePath: string
        name: string
        commit: string
        checkout?: boolean
        connectionId?: string
      }
    ): Promise<GitCreateBranchResult> => {
      const params = { name: args.name, commit: args.commit, checkout: args.checkout }
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      return createBranchFromCommit(worktreePath, params, gitOptions)
    }
  )

  ipcMain.handle(
    'git:checkoutCommit',
    async (
      _event,
      args: { worktreePath: string; commit: string; connectionId?: string }
    ): Promise<GitCheckoutCommitResult> => {
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      return checkoutCommit(worktreePath, args.commit, gitOptions)
    }
  )

  ipcMain.handle(
    'git:cherryPick',
    async (
      _event,
      args: { worktreePath: string; commit: string; mainline?: number; connectionId?: string }
    ): Promise<GitCherryPickResult> => {
      const params = { commit: args.commit, mainline: args.mainline }
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      return cherryPickCommit(worktreePath, params, gitOptions)
    }
  )

  ipcMain.handle(
    'git:revertCommit',
    async (
      _event,
      args: { worktreePath: string; commit: string; mainline?: number; connectionId?: string }
    ): Promise<GitRevertResult> => {
      const params = { commit: args.commit, mainline: args.mainline }
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      return revertCommit(worktreePath, params, gitOptions)
    }
  )

  ipcMain.handle(
    'git:dropCommit',
    async (
      _event,
      args: { worktreePath: string; commit: string; connectionId?: string }
    ): Promise<GitDropCommitResult> => {
      const params = { commit: args.commit }
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      return dropCommit(worktreePath, params, gitOptions)
    }
  )

  ipcMain.handle(
    'git:mergeCommit',
    async (
      _event,
      args: {
        worktreePath: string
        commit: string
        noFf?: boolean
        squash?: boolean
        message?: string
        connectionId?: string
      }
    ): Promise<GitMergeCommitResult> => {
      const params = {
        commit: args.commit,
        noFf: args.noFf,
        squash: args.squash,
        message: args.message
      }
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      return mergeCommit(worktreePath, params, gitOptions)
    }
  )

  ipcMain.handle(
    'git:rebaseOntoCommit',
    async (
      _event,
      args: { worktreePath: string; commit: string; connectionId?: string }
    ): Promise<GitRebaseOntoCommitResult> => {
      const params = { commit: args.commit }
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      return rebaseOntoCommit(worktreePath, params, gitOptions)
    }
  )

  ipcMain.handle(
    'git:resetToCommit',
    async (
      _event,
      args: {
        worktreePath: string
        commit: string
        mode: 'soft' | 'mixed' | 'hard'
        connectionId?: string
      }
    ): Promise<GitResetToCommitResult> => {
      const params = { commit: args.commit, mode: args.mode }
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      return resetToCommit(worktreePath, params, gitOptions)
    }
  )

  ipcMain.handle(
    'git:diff',
    async (
      _event,
      args: {
        worktreePath: string
        filePath: string
        staged: boolean
        compareAgainstHead?: boolean
        connectionId?: string
      }
    ): Promise<GitDiffResult> => {
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const filePath = validateGitRelativeFilePath(worktreePath, args.filePath)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      return getDiff(worktreePath, filePath, args.staged, args.compareAgainstHead, gitOptions)
    }
  )

  ipcMain.handle(
    'git:commit',
    async (
      _event,
      args: { worktreePath: string; message: string; connectionId?: string }
    ): Promise<{ success: boolean; error?: string }> => {
      // Why: validate at the IPC boundary so the renderer gets a clear error instead of an opaque execFile failure.
      if (typeof args.message !== 'string' || args.message.trim().length === 0) {
        throw new Error('Commit message is required')
      }
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      return commitChanges(worktreePath, args.message, gitOptions)
    }
  )

  ipcMain.handle(
    'git:generateCommitMessage',
    async (
      _event,
      args: {
        worktreePath: string
        repoId?: string
        connectionId?: string
        sourceControlAiResolvedParams?: ResolvedSourceControlAiGenerationParams
        sourceControlAi?: GlobalSettings['sourceControlAi']
        agentCmdOverrides?: GlobalSettings['agentCmdOverrides']
      }
    ): Promise<GenerateCommitMessageResult> => {
      const discoveryHostKey = getCommitMessageModelDiscoveryHostKey(null)
      const baseSettings = store.getSettings()
      const requestSettings = {
        ...baseSettings,
        ...(args.sourceControlAi !== undefined ? { sourceControlAi: args.sourceControlAi } : {}),
        ...(args.agentCmdOverrides !== undefined
          ? { agentCmdOverrides: args.agentCmdOverrides }
          : {})
      }
      const resolvedSettings = args.sourceControlAiResolvedParams
        ? { ok: true as const, params: args.sourceControlAiResolvedParams }
        : resolveCommitMessageSettings(
            requestSettings,
            discoveryHostKey,
            'commitMessage',
            await getRepoForSourceControlAi(store, args)
          )
      if (!resolvedSettings.ok) {
        return { success: false, error: resolvedSettings.error }
      }
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      let context
      try {
        context = await getStagedCommitContext(worktreePath, gitOptions)
      } catch (error) {
        console.error('[filesystem] Failed to read staged commit context:', error)
        return {
          success: false,
          error: 'Failed to read staged changes.'
        }
      }
      if (!context) {
        return { success: false, error: 'No staged changes to summarize.' }
      }
      const localEnv = await prepareLocalCommitMessageAgentEnv(
        resolvedSettings.params.agentId,
        commitMessageAgentEnv,
        getLocalAgentRuntimeTarget(gitOptions)
      )
      if (!localEnv.ok) {
        return { success: false, error: localEnv.error }
      }
      return generateCommitMessageFromContext(
        context,
        resolvedSettings.params,
        getLocalTextGenerationTarget(worktreePath, gitOptions, localEnv.env)
      )
    }
  )

  ipcMain.handle(
    'git:cancelGenerateCommitMessage',
    async (_event, args: { worktreePath: string; connectionId?: string }): Promise<void> => {
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      cancelGenerateCommitMessageLocal(worktreePath)
    }
  )

  ipcMain.handle(
    'git:discoverCommitMessageModels',
    async (
      _event,
      args: { agentId: string; worktreePath?: string; connectionId?: string }
    ): Promise<DiscoverCommitMessageModelsResult> => {
      const agentId = args.agentId
      const agentCommandOverride = store.getSettings().agentCmdOverrides?.[agentId as TuiAgent]
      let localRuntimeTarget: CommitMessageAgentRuntimeTarget = { runtime: 'host' }
      let localDiscoveryOptions: Parameters<typeof discoverCommitMessageModelsLocal>[3]
      if (args.worktreePath) {
        const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
        const gitOptions = getLocalGitOptionsForRegisteredWorktree(
          store,
          args.worktreePath,
          worktreePath
        )
        localRuntimeTarget = getLocalAgentRuntimeTarget(gitOptions)
        localDiscoveryOptions = gitOptions.wslDistro
          ? { cwd: worktreePath, wslDistro: gitOptions.wslDistro }
          : { cwd: worktreePath }
      }
      const localEnv = await prepareLocalCommitMessageAgentEnv(
        agentId,
        commitMessageAgentEnv,
        localRuntimeTarget
      )
      if (!localEnv.ok) {
        return { success: false, error: localEnv.error }
      }
      return localDiscoveryOptions
        ? discoverCommitMessageModelsLocal(
            agentId as TuiAgent,
            localEnv.env,
            agentCommandOverride,
            localDiscoveryOptions
          )
        : discoverCommitMessageModelsLocal(agentId as TuiAgent, localEnv.env, agentCommandOverride)
    }
  )

  ipcMain.handle(
    'git:generatePullRequestFields',
    async (
      _event,
      args: {
        worktreePath: string
        repoId?: string
        base: string
        title: string
        body: string
        draft: boolean
        provider?: HostedReviewProvider
        useTemplate?: boolean
        connectionId?: string
        sourceControlAiResolvedParams?: ResolvedSourceControlAiGenerationParams
        sourceControlAi?: GlobalSettings['sourceControlAi']
        agentCmdOverrides?: GlobalSettings['agentCmdOverrides']
      }
    ): Promise<GeneratePullRequestFieldsResult> => {
      const discoveryHostKey = getCommitMessageModelDiscoveryHostKey(null)
      const baseSettings = store.getSettings()
      const requestSettings = {
        ...baseSettings,
        ...(args.sourceControlAi !== undefined ? { sourceControlAi: args.sourceControlAi } : {}),
        ...(args.agentCmdOverrides !== undefined
          ? { agentCmdOverrides: args.agentCmdOverrides }
          : {})
      }
      const resolvedSettings = args.sourceControlAiResolvedParams
        ? { ok: true as const, params: args.sourceControlAiResolvedParams }
        : resolveCommitMessageSettings(
            requestSettings,
            discoveryHostKey,
            'pullRequest',
            await getRepoForSourceControlAi(store, args)
          )
      if (!resolvedSettings.ok) {
        return { success: false, error: resolvedSettings.error }
      }
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      let context: Awaited<ReturnType<typeof getPullRequestDraftContext>>
      try {
        const currentBody = await resolveHostedReviewBodyForGeneration({
          body: args.body,
          repoPath: worktreePath,
          provider: args.provider,
          useTemplate: args.useTemplate
        })
        context = await getPullRequestDraftContext(
          (argv, options) =>
            gitExecFileAsync(argv, { cwd: worktreePath, ...gitOptions, ...options }),
          {
            base: args.base,
            currentTitle: args.title,
            currentBody,
            currentDraft: args.draft
          }
        )
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to prepare branch for PR details.'
        }
      }
      if (!context) {
        return { success: false, error: 'No branch changes to summarize.' }
      }
      const localEnv = await prepareLocalCommitMessageAgentEnv(
        resolvedSettings.params.agentId,
        commitMessageAgentEnv,
        getLocalAgentRuntimeTarget(gitOptions)
      )
      if (!localEnv.ok) {
        return { success: false, error: localEnv.error }
      }
      return generatePullRequestFieldsFromContext(
        context,
        resolvedSettings.params,
        getLocalTextGenerationTarget(worktreePath, gitOptions, localEnv.env)
      )
    }
  )

  ipcMain.handle(
    'git:cancelGeneratePullRequestFields',
    async (_event, args: { worktreePath: string; connectionId?: string }): Promise<void> => {
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      cancelGeneratePullRequestFieldsLocal(worktreePath)
    }
  )

  ipcMain.handle(
    'git:branchCompare',
    async (
      _event,
      args: { worktreePath: string; baseRef: string; connectionId?: string }
    ): Promise<GitBranchCompareResult> => {
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      return getBranchCompare(worktreePath, args.baseRef, gitOptions)
    }
  )

  ipcMain.handle(
    'git:commitCompare',
    async (
      _event,
      args: { worktreePath: string; commitId: string; connectionId?: string }
    ): Promise<GitCommitCompareResult> => {
      const commitId = validateFullGitObjectId(args.commitId, 'commitId')
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      return getCommitCompare(worktreePath, commitId, gitOptions)
    }
  )

  ipcMain.handle(
    'git:upstreamStatus',
    async (
      _event,
      args: { worktreePath: string; connectionId?: string; pushTarget?: GitPushTarget }
    ): Promise<GitUpstreamStatus> => {
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      return getUpstreamStatus(worktreePath, args.pushTarget, gitOptions)
    }
  )

  ipcMain.handle(
    'git:fetch',
    async (
      _event,
      args: { worktreePath: string; connectionId?: string; pushTarget?: GitPushTarget }
    ): Promise<void> => {
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      if (args.pushTarget) {
        await validateGitPushTarget(worktreePath, args.pushTarget, gitOptions)
      }
      await gitFetch(worktreePath, args.pushTarget, gitOptions)
    }
  )

  ipcMain.handle(
    'git:syncFork',
    async (
      _event,
      args: {
        worktreePath: string
        connectionId?: string
        expectedUpstream: GitForkSyncExpectedUpstream
      }
    ): Promise<GitForkSyncResult> => {
      const expectedUpstream = validateGitForkSyncExpectedUpstream(args.expectedUpstream, {
        required: true
      })
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      return gitSyncForkDefaultBranch(worktreePath, expectedUpstream, gitOptions)
    }
  )

  ipcMain.handle(
    'git:push',
    async (
      _event,
      args: {
        worktreePath: string
        publish?: boolean
        forceWithLease?: boolean
        connectionId?: string
        pushTarget?: GitPushTarget
      }
    ): Promise<void> => {
      // Why: coerce to strict boolean at the IPC boundary so a malformed
      // renderer payload (e.g. string 'false') can't silently enable
      // --set-upstream mode. Mirrors the relay's git request handler.
      const publish = args.publish === true
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      if (args.pushTarget) {
        await validateGitPushTarget(worktreePath, args.pushTarget, gitOptions)
      }
      await gitPush(worktreePath, publish, args.pushTarget, {
        forceWithLease: args.forceWithLease === true,
        ...gitOptions
      })
    }
  )

  ipcMain.handle(
    'git:pull',
    async (
      _event,
      args: { worktreePath: string; connectionId?: string; pushTarget?: GitPushTarget }
    ): Promise<void> => {
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      if (args.pushTarget) {
        await validateGitPushTarget(worktreePath, args.pushTarget, gitOptions)
      }
      await gitPull(worktreePath, args.pushTarget, gitOptions)
    }
  )

  ipcMain.handle(
    'git:fastForward',
    async (
      _event,
      args: { worktreePath: string; connectionId?: string; pushTarget?: GitPushTarget }
    ): Promise<void> => {
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      if (args.pushTarget) {
        await validateGitPushTarget(worktreePath, args.pushTarget, gitOptions)
      }
      await gitFastForward(worktreePath, args.pushTarget, gitOptions)
    }
  )

  ipcMain.handle(
    'git:rebaseFromBase',
    async (
      _event,
      args: { worktreePath: string; baseRef: string; connectionId?: string }
    ): Promise<void> => {
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      await gitPullRebaseFromBase(worktreePath, args.baseRef, gitOptions)
    }
  )

  ipcMain.handle(
    'git:branchDiff',
    async (
      _event,
      args: {
        worktreePath: string
        compare: {
          baseRef: string
          baseOid: string
          headOid: string
          mergeBase: string
        }
        filePath: string
        oldPath?: string
        connectionId?: string
      }
    ): Promise<GitDiffResult> => {
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const filePath = validateGitRelativeFilePath(worktreePath, args.filePath)
      const oldPath = args.oldPath
        ? validateGitRelativeFilePath(worktreePath, args.oldPath)
        : undefined
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      return getBranchDiff(
        worktreePath,
        {
          mergeBase: args.compare.mergeBase,
          headOid: args.compare.headOid,
          filePath,
          oldPath
        },
        gitOptions
      )
    }
  )

  ipcMain.handle(
    'git:commitDiff',
    async (
      _event,
      args: {
        worktreePath: string
        commitOid: string
        parentOid?: string | null
        filePath: string
        oldPath?: string
        connectionId?: string
      }
    ): Promise<GitDiffResult> => {
      const commitOid = validateFullGitObjectId(args.commitOid, 'commitOid')
      const parentOid = args.parentOid ? validateFullGitObjectId(args.parentOid, 'parentOid') : null
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const filePath = validateGitRelativeFilePath(worktreePath, args.filePath)
      const oldPath = args.oldPath
        ? validateGitRelativeFilePath(worktreePath, args.oldPath)
        : undefined
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      return getCommitDiff(
        worktreePath,
        {
          commitOid,
          parentOid,
          filePath,
          oldPath
        },
        gitOptions
      )
    }
  )

  ipcMain.handle(
    'git:stage',
    async (
      _event,
      args: { worktreePath: string; filePath: string; connectionId?: string }
    ): Promise<void> => {
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const filePath = validateGitRelativeFilePath(worktreePath, args.filePath)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      await stageFile(worktreePath, filePath, gitOptions)
    }
  )

  ipcMain.handle(
    'git:unstage',
    async (
      _event,
      args: { worktreePath: string; filePath: string; connectionId?: string }
    ): Promise<void> => {
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const filePath = validateGitRelativeFilePath(worktreePath, args.filePath)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      await unstageFile(worktreePath, filePath, gitOptions)
    }
  )

  ipcMain.handle(
    'git:discard',
    async (
      _event,
      args: { worktreePath: string; filePath: string; connectionId?: string }
    ): Promise<void> => {
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const filePath = validateGitRelativeFilePath(worktreePath, args.filePath)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      await discardChanges(worktreePath, filePath, gitOptions)
    }
  )

  ipcMain.handle(
    'git:bulkDiscard',
    async (
      _event,
      args: { worktreePath: string; filePaths: string[]; connectionId?: string }
    ): Promise<void> => {
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const filePaths = args.filePaths.map((p) => validateGitRelativeFilePath(worktreePath, p))
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      await bulkDiscardChanges(worktreePath, filePaths, gitOptions)
    }
  )

  ipcMain.handle(
    'git:bulkStage',
    async (
      _event,
      args: { worktreePath: string; filePaths: string[]; connectionId?: string }
    ): Promise<void> => {
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const filePaths = args.filePaths.map((p) => validateGitRelativeFilePath(worktreePath, p))
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      await bulkStageFiles(worktreePath, filePaths, gitOptions)
    }
  )

  ipcMain.handle(
    'git:bulkUnstage',
    async (
      _event,
      args: { worktreePath: string; filePaths: string[]; connectionId?: string }
    ): Promise<void> => {
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const filePaths = args.filePaths.map((p) => validateGitRelativeFilePath(worktreePath, p))
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      await bulkUnstageFiles(worktreePath, filePaths, gitOptions)
    }
  )

  ipcMain.handle(
    'git:remoteFileUrl',
    async (
      _event,
      args: { worktreePath: string; relativePath: string; line: number; connectionId?: string }
    ): Promise<string | null> => {
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      return getRemoteFileUrl(worktreePath, args.relativePath, args.line)
    }
  )

  ipcMain.handle(
    'git:remoteCommitUrl',
    async (
      _event,
      args: { worktreePath: string; sha: string; connectionId?: string }
    ): Promise<string | null> => {
      const sha = validateFullGitObjectId(args.sha, 'sha')
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      return getRemoteCommitUrl(worktreePath, sha)
    }
  )

  initializeLocalLogTailAuthorization(store)
}
