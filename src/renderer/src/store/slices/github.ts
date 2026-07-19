/* eslint-disable max-lines -- Why: the GitHub slice co-locates pull-request cache,
checks, comments, and refresh orchestration so invalidation stays consistent. */
import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import type {
  GitHubOwnerRepo,
  GitHubPRRefreshAlias,
  PRInfo,
  GitHubPRRefreshCandidate,
  GitHubPRRefreshEvent,
  GitHubPRRefreshReason,
  GitHubCommentResult,
  PRCheckDetail,
  PRCheckRunDetails,
  PRComment,
  Repo,
  Worktree,
  GitHubWorkItem,
  ListWorkItemsResult
} from '../../../../shared/types'
import {
  isGitHubWorkItemsSshRemoteRequiredError,
  sortWorkItemsByNumber,
  PER_REPO_FETCH_LIMIT
} from '../../../../shared/work-items'
import { deriveCheckStatusFromChecks, syncPRChecksStatus } from './github-checks'
import { callRuntimeRpc, getActiveRuntimeTarget } from '../../runtime/runtime-rpc-client'
import { rightSidebarShowsPullRequestData } from '@/lib/right-sidebar-visibility'
import { hostedReviewInfoFromGitHubPRInfo } from '../../../../shared/hosted-review-github'
import { getHostedReviewCacheKey, linkedReviewHintKey } from './hosted-review-cache-identity'
import { getGitHubPRCacheKey, getGitHubRepoCacheKey } from './github-cache-key'
import { isGitHubWorkItemsQueryTooLarge } from './github-work-items-query-bounds'
import { isMacAppDataPath } from '@/lib/passive-macos-app-data-access'
import { translate } from '@/i18n/i18n'
import {
  LOCAL_EXECUTION_HOST_ID,
  getRepoExecutionHostId,
  getSettingsFocusedExecutionHostId,
  normalizeExecutionHostId,
  parseExecutionHostId,
  type ExecutionHostId
} from '../../../../shared/execution-host'
import {
  getProjectSourceCacheScope,
  getProjectSourceRuntimeSettings,
  type ProjectSourceContext
} from '../../../../shared/project-source-context'

function getRuntimeRepoTarget(
  state: AppState,
  repoPath: string,
  settings: AppState['settings'] = state.settings
): { target: { kind: 'environment'; environmentId: string }; repo: Repo } | null {
  const target = getActiveRuntimeTarget(settings)
  if (target.kind !== 'environment') {
    return null
  }
  const repo = state.repos.find((candidate) => candidate.path === repoPath)
  return repo ? { target, repo } : null
}

function getPRRefreshOwnerRuntimeEnvironmentId(
  candidate: Pick<GitHubPRRefreshCandidate, 'cacheKey' | 'executionHostId'>
): string | null {
  const parsed = parseExecutionHostId(candidate.executionHostId)
  if (parsed?.kind === 'runtime') {
    return parsed.environmentId
  }
  const cacheScope = candidate.cacheKey.split('::', 1)[0]
  const cacheScopeHost = parseExecutionHostId(cacheScope)
  return cacheScopeHost?.kind === 'runtime' ? cacheScopeHost.environmentId : null
}

function getPRRefreshRuntimeRepoTarget(
  state: AppState,
  candidate: GitHubPRRefreshCandidate
): { target: { kind: 'environment'; environmentId: string }; repo: Repo } | null {
  const ownerRuntimeEnvironmentId = getPRRefreshOwnerRuntimeEnvironmentId(candidate)
  if (!ownerRuntimeEnvironmentId) {
    return null
  }
  // Why: PR refreshes must follow the repo owner host, not the Active Server
  // dropdown. A runtime-owned worktree can be visible while Local desktop is focused.
  return getRuntimeRepoTarget(
    state,
    candidate.repoPath,
    state.settings
      ? { ...state.settings, activeRuntimeEnvironmentId: ownerRuntimeEnvironmentId }
      : ({ activeRuntimeEnvironmentId: ownerRuntimeEnvironmentId } as AppState['settings'])
  )
}

function shouldEnqueueLocalPRRefresh(candidate: GitHubPRRefreshCandidate): boolean {
  // Why: the local PR coordinator owns local git and SSH bridge refreshes, but
  // runtime-owned repos and disconnected SSH repos must not hit the IPC crash path.
  if (getPRRefreshOwnerRuntimeEnvironmentId(candidate) !== null) {
    return false
  }
  return !candidate.connectionId || candidate.connectionState === 'connected'
}

function enqueueLocalGitHubPRRefresh(
  args: {
    candidate: GitHubPRRefreshCandidate
    reason: GitHubPRRefreshReason
    priority: number
  },
  onNotQueued?: () => void | Promise<unknown>
): void {
  const enqueue = window.api.gh.enqueuePRRefresh
  if (!enqueue) {
    return
  }
  // Why: main can reject stale/unknown local paths; renderer refresh triggers
  // are best-effort and must not become unhandled rejection crash breadcrumbs.
  void enqueue(args)
    .then((queued) =>
      queued === false || queued?.kind === 'fallback' ? onNotQueued?.() : undefined
    )
    .catch((err) => {
      console.warn('Failed to enqueue PR refresh:', err)
    })
}

type GitHubWorkItemRequestContext = {
  repoId: string
  repoPath: string
  target: GitHubWorkItemRequestTarget
}

type GitHubWorkItemRequestTarget =
  | { kind: 'environment'; environmentId: string; runtimeRepoId: string }
  | { kind: 'local' }

type GitHubWorkItemsListArgs = {
  limit: number
  query?: string
  page?: number
  noCache?: true
}

function settingsForGitHubRepoOwner(
  settings: AppState['settings'],
  repo: Pick<Repo, 'connectionId' | 'executionHostId'> | undefined
): AppState['settings'] {
  if (!repo) {
    return settings
  }
  const parsed = parseExecutionHostId(getRepoExecutionHostId(repo))
  if (parsed?.kind === 'runtime') {
    return settings
      ? { ...settings, activeRuntimeEnvironmentId: parsed.environmentId }
      : ({ activeRuntimeEnvironmentId: parsed.environmentId } as AppState['settings'])
  }
  // Why: local and SSH-owned GitHub lookups are served by the desktop client;
  // host focus must not redirect them to the currently selected runtime.
  return settings
    ? { ...settings, activeRuntimeEnvironmentId: null }
    : ({ activeRuntimeEnvironmentId: null } as AppState['settings'])
}

function settingsForGitHubFocusedRepoOwner(
  settings: AppState['settings'],
  repo: Pick<Repo, 'connectionId' | 'executionHostId'> | undefined
): AppState['settings'] {
  if (!repo?.executionHostId && !repo?.connectionId) {
    return settings
  }
  return settingsForGitHubRepoOwner(settings, repo)
}

function getRefreshAliasExecutionHostId(alias: GitHubPRRefreshAlias): string {
  const explicitHostId = normalizeExecutionHostId(alias.executionHostId)
  if (explicitHostId) {
    return explicitHostId
  }
  const scope = alias.cacheKey.split('::', 1)[0]
  return normalizeExecutionHostId(scope) ?? LOCAL_EXECUTION_HOST_ID
}

function findRepoForGitHubOwner(
  state: Partial<Pick<AppState, 'repos'>>,
  repoId: string | undefined,
  repoPath: string
): Repo | undefined {
  return (state.repos ?? []).find((candidate) =>
    repoId ? candidate.id === repoId || candidate.path === repoPath : candidate.path === repoPath
  )
}

function getGitHubFocusedRepoOwnerHostId(
  settings: AppState['settings'],
  repo: Pick<Repo, 'connectionId' | 'executionHostId'> | undefined
): string {
  if (repo?.executionHostId || repo?.connectionId) {
    return getRepoExecutionHostId(repo)
  }
  return getSettingsFocusedExecutionHostId(settings)
}

function getWorkItemsCacheKeyForOwner(
  state: Partial<Pick<AppState, 'repos' | 'settings'>>,
  repoId: string,
  limit: number,
  query: string,
  repoPath?: string
): string {
  const repo = findRepoForGitHubOwner(state, repoId, repoPath ?? '')
  return workItemsCacheKey(
    repoId,
    limit,
    query,
    repo ? getGitHubFocusedRepoOwnerHostId(state.settings ?? null, repo) : undefined
  )
}

function getGitHubWorkItemSourceHostId(
  state: AppState,
  repo: Pick<Repo, 'connectionId' | 'executionHostId'> | undefined,
  sourceContext?: ProjectSourceContext | null
): ExecutionHostId | undefined {
  if (sourceContext?.provider === 'github') {
    return sourceContext.hostId
  }
  return repo
    ? (normalizeExecutionHostId(getGitHubFocusedRepoOwnerHostId(state.settings, repo)) ?? undefined)
    : undefined
}

function getGitHubWorkItemSourceCacheScope(
  state: AppState,
  repo: Pick<Repo, 'connectionId' | 'executionHostId'> | undefined,
  sourceContext?: ProjectSourceContext | null
): string | undefined {
  if (sourceContext?.provider === 'github') {
    return getProjectSourceCacheScope(sourceContext)
  }
  return getGitHubWorkItemSourceHostId(state, repo, sourceContext)
}

function getGitHubWorkItemSourceSettings(
  settings: AppState['settings'],
  repo: Pick<Repo, 'connectionId' | 'executionHostId'> | undefined,
  sourceContext?: ProjectSourceContext | null
): AppState['settings'] {
  if (sourceContext?.provider === 'github') {
    return {
      ...settings,
      ...getProjectSourceRuntimeSettings(sourceContext)
    } as AppState['settings']
  }
  return settingsForGitHubFocusedRepoOwner(settings, repo)
}

function getGitHubRepoSourceSettings(
  settings: AppState['settings'],
  repo: Pick<Repo, 'connectionId' | 'executionHostId'> | undefined,
  sourceContext?: ProjectSourceContext | null
): AppState['settings'] {
  if (sourceContext?.provider === 'github') {
    return {
      ...settings,
      ...getProjectSourceRuntimeSettings(sourceContext)
    } as AppState['settings']
  }
  return settingsForGitHubRepoOwner(settings, repo)
}

function getGitHubWorkItemRequestContext(
  state: AppState,
  settings: AppState['settings'],
  repoId: string,
  repoPath: string,
  sourceContext?: ProjectSourceContext | null
): GitHubWorkItemRequestContext {
  if (sourceContext?.provider === 'github') {
    const parsedHost = parseExecutionHostId(sourceContext.hostId)
    if (parsedHost?.kind === 'runtime') {
      return {
        repoId,
        repoPath,
        target: {
          kind: 'environment',
          environmentId: parsedHost.environmentId,
          runtimeRepoId: sourceContext.repoId ?? repoId
        }
      }
    }
  }
  const runtimeRepo = getRuntimeRepoTarget(state, repoPath, settings)
  return {
    repoId,
    repoPath,
    target: runtimeRepo
      ? {
          kind: 'environment',
          environmentId: runtimeRepo.target.environmentId,
          runtimeRepoId: runtimeRepo.repo.id
        }
      : { kind: 'local' }
  }
}

function listGitHubWorkItemsForRepo(
  context: GitHubWorkItemRequestContext,
  args: GitHubWorkItemsListArgs
): Promise<ListWorkItemsResult<Omit<GitHubWorkItem, 'repoId'>>> {
  if (context.target.kind === 'environment') {
    return callRuntimeRpc<ListWorkItemsResult<Omit<GitHubWorkItem, 'repoId'>>>(
      { kind: 'environment', environmentId: context.target.environmentId },
      'github.listWorkItems',
      {
        repo: context.target.runtimeRepoId,
        ...args
      },
      { timeoutMs: 30_000 }
    )
  }
  return window.api.gh.listWorkItems({
    repoPath: context.repoPath,
    repoId: context.repoId,
    ...args
  })
}

export type CacheEntry<T> = {
  data: T | null
  fetchedAt: number
  headSha?: string
}

type FetchOptions = {
  force?: boolean
  noCache?: boolean
  sourceContext?: ProjectSourceContext | null
}

type RepoScopedFetchOptions = FetchOptions & {
  repoId?: string
}

export type PRRefreshState = {
  status: 'queued' | 'in-flight' | 'paused' | 'skipped' | 'error'
  reason: GitHubPRRefreshReason
  updatedAt: number
  pausedUntil?: number
  message?: string
}

export type PRRefreshStateClearToken = {
  sequence: number
  status: PRRefreshState['status']
  updatedAt: number
}

const PR_REFRESH_ACTIVE_STALE_MS = 120_000
const PR_REFRESH_PAUSED_GRACE_MS = 5_000

function bypassesGitHubPRRefreshFreshness(reason: GitHubPRRefreshReason): boolean {
  return reason === 'manual' || reason === 'active' || reason === 'post-push'
}

const CACHE_TTL = 300_000 // 5 minutes (stale data shown instantly, then refreshed)
const CHECKS_CACHE_TTL = 60_000 // 1 minute — checks change more frequently
const EMPTY_CHECKS_CACHE_TTL = 10_000
// Why: the NewWorkspace page's work-item list is a browse surface, not a
// source of truth, so 60s staleness is fine — stale data renders instantly
// while a background refresh keeps it current.
const WORK_ITEMS_CACHE_TTL = 60_000
const inflightPRRequests = new Map<
  string,
  { promise: Promise<PRInfo | null>; force: boolean; generation: number; lookupHintKey: string }
>()
type InflightChecks = {
  promise: Promise<PRCheckDetail[]>
  force: boolean
  noCache: boolean
}
const inflightChecksRequests = new Map<string, InflightChecks>()
const inflightCommentsRequests = new Map<string, Promise<PRComment[]>>()
type InflightWorkItems = {
  promise: Promise<GitHubWorkItem[]>
  force: boolean
  noCache: boolean
}
const inflightWorkItemsRequests = new Map<string, InflightWorkItems>()
const prRequestGenerations = new Map<string, number>()
const prRefreshStartedHostedReviewEntries = new Map<
  string,
  AppState['hostedReviewCache'][string] | undefined
>()
const PR_REFRESH_STARTED_HOSTED_REVIEW_ENTRY_MAX = 128

/** @internal - exposed for leak-regression tests only */
export function _getGitHubPRRequestGenerationCountForTest(): number {
  return prRequestGenerations.size
}

/** @internal - exposed for leak-regression tests only */
export function _getGitHubPRRefreshStartedEntryCountForTest(): number {
  return prRefreshStartedHostedReviewEntries.size
}

/** @internal - exposed for leak-regression tests only */
export function _clearGitHubPRRefreshStartedEntriesForTest(): void {
  prRefreshStartedHostedReviewEntries.clear()
}

// Why: cap in-flight cross-repo fan-out and hover-prefetches at the renderer
// boundary — the main-side gate is behind the IPC queue, so it can't see a
// stampede until the calls are already mid-flight. 8 balances responsiveness
// against gh rate-limit pressure.
const WORK_ITEM_FETCH_CONCURRENCY = 8
let workItemFetchInFlight = 0
const workItemFetchWaiters: (() => void)[] = []

async function acquireWorkItemSlot(): Promise<void> {
  if (workItemFetchInFlight < WORK_ITEM_FETCH_CONCURRENCY) {
    workItemFetchInFlight += 1
    return
  }
  await new Promise<void>((resolve) => workItemFetchWaiters.push(resolve))
  // Why: resolver has already claimed the slot on our behalf, so we don't
  // re-increment here. Pairing convention: acquireWorkItemSlot + releaseWorkItemSlot.
}

function releaseWorkItemSlot(): void {
  const next = workItemFetchWaiters.shift()
  if (next) {
    // Hand the slot off directly — net count unchanged — so we can't race a
    // third caller into the cap between decrement and resolve.
    next()
    return
  }
  workItemFetchInFlight -= 1
}

export function workItemsCacheKey(
  repoId: string,
  limit: number,
  query: string,
  executionHostId?: string | null
): string {
  const scope = executionHostId?.trim() ?? ''
  const hostId = normalizeExecutionHostId(scope)
  const owner = `${repoId}::${limit}::${query}`
  if (hostId) {
    return hostId !== LOCAL_EXECUTION_HOST_ID ? `${hostId}::${owner}` : owner
  }
  return scope ? `${scope}::${owner}` : owner
}

function workItemsInflightRequestKey(
  cacheKey: string,
  target: GitHubWorkItemRequestTarget
): string {
  const targetPart =
    target.kind === 'environment' ? `env:${target.environmentId}:${target.runtimeRepoId}` : 'local'
  return `${cacheKey}::${targetPart}`
}

function runtimeScopedRepoCacheKey(
  repoPath: string,
  repoId: string | undefined,
  suffix: string,
  settings?: AppState['settings'],
  connectionId?: string | null,
  executionHostId?: string | null,
  hasRepoOwner = false
): string {
  return getGitHubRepoCacheKey(
    repoPath,
    repoId,
    suffix,
    settings,
    connectionId,
    executionHostId,
    hasRepoOwner
  )
}

function sourceScopedRepoCacheKey(
  repoPath: string,
  repoId: string | undefined,
  suffix: string,
  settings?: AppState['settings'],
  connectionId?: string | null,
  executionHostId?: string | null,
  sourceContext?: ProjectSourceContext | null,
  hasRepoOwner = false
): string {
  if (sourceContext?.provider === 'github') {
    return `${getProjectSourceCacheScope(sourceContext)}::${repoId ?? repoPath}::${suffix}`
  }
  return runtimeScopedRepoCacheKey(
    repoPath,
    repoId,
    suffix,
    settings,
    connectionId,
    executionHostId,
    hasRepoOwner
  )
}

function prCacheKey(
  repoPath: string,
  repoId: string | undefined,
  branch: string,
  settings?: AppState['settings'],
  connectionId?: string | null,
  executionHostId?: string | null,
  hasRepoOwner = false
): string {
  return getGitHubPRCacheKey(
    repoPath,
    repoId,
    branch,
    settings,
    connectionId,
    executionHostId,
    hasRepoOwner
  )
}

function repoCacheKeyPrefixes(repoId: string, repoPath?: string): string[] {
  const prefixes = [`${repoId}::`]
  if (repoPath && repoPath !== repoId) {
    prefixes.push(`${repoPath}::`)
  }
  return prefixes
}

function matchesRepoCacheKey(key: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => key.startsWith(prefix))
}

function clearInflightWorkItemsForRepo(repoId: string, repoPath?: string): void {
  const prefixes = repoCacheKeyPrefixes(repoId, repoPath)
  for (const key of Array.from(inflightWorkItemsRequests.keys())) {
    if (matchesRepoCacheKey(key, prefixes)) {
      inflightWorkItemsRequests.delete(key)
    }
  }
}

function evictRepoCacheEntries<T>(
  cache: Record<string, CacheEntry<T>>,
  prefixes: readonly string[]
): { cache: Record<string, CacheEntry<T>>; evicted: boolean } {
  let next: Record<string, CacheEntry<T>> | null = null
  for (const key of Object.keys(cache)) {
    if (!matchesRepoCacheKey(key, prefixes)) {
      continue
    }
    if (!next) {
      next = { ...cache }
    }
    delete next[key]
  }
  return next ? { cache: next, evicted: true } : { cache, evicted: false }
}

function normalizedRepoIdentity(repo: GitHubOwnerRepo): string {
  return `${repo.owner.toLowerCase()}/${repo.repo.toLowerCase()}`
}

function normalizedHeadSha(headSha?: string): string | null {
  const trimmed = headSha?.trim()
  return trimmed ? trimmed.toLowerCase() : null
}

export function prChecksCacheSuffix(
  prNumber: number,
  prRepo?: GitHubOwnerRepo | null,
  headSha?: string
): string {
  const headSuffix = normalizedHeadSha(headSha)
  const base = prRepo
    ? `pr-checks::${normalizedRepoIdentity(prRepo)}::${prNumber}`
    : `pr-checks::${prNumber}`
  return headSuffix ? `${base}::head::${headSuffix}` : base
}

export function prCommentsCacheSuffix(prNumber: number, prRepo?: GitHubOwnerRepo | null): string {
  if (!prRepo) {
    return `pr-comments::${prNumber}`
  }
  return `pr-comments::${normalizedRepoIdentity(prRepo)}::${prNumber}`
}

function commentTimestamp(comment: PRComment): number {
  const timestamp = new Date(comment.createdAt).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

export function mergePRCommentIntoList(
  comments: readonly PRComment[] | null | undefined,
  incoming: PRComment
): PRComment[] {
  const byId = new Map<number, PRComment>()
  for (const comment of comments ?? []) {
    byId.set(comment.id, comment)
  }
  const previous = byId.get(incoming.id)
  byId.set(incoming.id, {
    ...previous,
    ...incoming,
    threadId: incoming.threadId ?? previous?.threadId,
    path: incoming.path ?? previous?.path,
    line: incoming.line ?? previous?.line,
    startLine: incoming.startLine ?? previous?.startLine,
    isResolved: incoming.isResolved ?? previous?.isResolved,
    isOutdated: incoming.isOutdated ?? previous?.isOutdated
  })
  return Array.from(byId.values()).sort((a, b) => commentTimestamp(a) - commentTimestamp(b))
}

function hasUsableCommentPayload(result: GitHubCommentResult): result is {
  ok: true
  comment: PRComment
} {
  return (
    result.ok &&
    typeof result.comment?.id === 'number' &&
    Number.isSafeInteger(result.comment.id) &&
    result.comment.id > 0 &&
    typeof result.comment.body === 'string' &&
    typeof result.comment.createdAt === 'string'
  )
}

// Why: 500 entries is generous enough that active developers will never hit it
// during normal use, but prevents the cache from growing without bound across
// many repos and branches over a long-running session.
const MAX_CACHE_ENTRIES = 500
type GitHubPRFallbackSource = NonNullable<GitHubPRRefreshAlias['fallbackPRSource']>

function isFresh<T>(entry: CacheEntry<T> | undefined, ttl = CACHE_TTL): entry is CacheEntry<T> {
  return entry !== undefined && Date.now() - entry.fetchedAt < ttl
}

function getPRChecksCacheTtl(entry: CacheEntry<PRCheckDetail[]> | undefined): number {
  return entry?.data?.length === 0 ? EMPTY_CHECKS_CACHE_TTL : CHECKS_CACHE_TTL
}

function findWorktreeById(state: AppState, worktreeId: string): Worktree | null {
  for (const worktrees of Object.values(state.worktreesByRepo)) {
    const worktree = worktrees.find((w) => w.id === worktreeId)
    if (worktree) {
      return worktree
    }
  }
  return null
}

type WorktreeLookupEntry = {
  first: Worktree
  unique: Worktree | null
}

type WorktreeLookupIndex = {
  byId: Map<string, WorktreeLookupEntry>
  repoHostIdsByRepoId: Map<string, Set<string>>
}

function buildWorktreeLookupIndex(state: AppState): WorktreeLookupIndex {
  const byId = new Map<string, WorktreeLookupEntry>()
  for (const worktrees of Object.values(state.worktreesByRepo)) {
    for (const worktree of worktrees) {
      const worktreeId = worktree.id
      const existing = byId.get(worktreeId)
      if (existing) {
        existing.unique = null
      } else {
        byId.set(worktreeId, { first: worktree, unique: worktree })
      }
    }
  }

  const repoHostIdsByRepoId = new Map<string, Set<string>>()
  for (const repo of state.repos ?? []) {
    let hostIds = repoHostIdsByRepoId.get(repo.id)
    if (!hostIds) {
      hostIds = new Set<string>()
      repoHostIdsByRepoId.set(repo.id, hostIds)
    }
    hostIds.add(getRepoExecutionHostId(repo))
  }
  return { byId, repoHostIdsByRepoId }
}

function findUniqueWorktreeById(
  state: AppState,
  worktreeId: string,
  executionHostId?: string,
  lookupIndex = buildWorktreeLookupIndex(state)
): Worktree | null {
  const match = lookupIndex.byId.get(worktreeId)?.unique ?? null
  // Why: metadata persistence is keyed only by worktree id. If two hosts own
  // that id, the index marks it non-unique and destructive clears fail closed.
  if (!match || executionHostId === undefined) {
    return match
  }
  const expectedHostId = normalizeExecutionHostId(executionHostId) ?? LOCAL_EXECUTION_HOST_ID
  const explicitWorktreeHostId = normalizeExecutionHostId(match.hostId)
  if (explicitWorktreeHostId) {
    return explicitWorktreeHostId === expectedHostId ? match : null
  }
  const repoHostIds = lookupIndex.repoHostIdsByRepoId.get(match.repoId)
  // Pre-host persisted rows are safe only when their repo has one unambiguous owner.
  if (!repoHostIds || repoHostIds.size !== 1 || !repoHostIds.has(expectedHostId)) {
    return null
  }
  return match
}

function isStaleExactLinkedPRLookup(
  state: AppState,
  worktreeId: string | undefined,
  linkedPRNumber: number | null | undefined,
  lookupIndex?: WorktreeLookupIndex
): boolean {
  if (!worktreeId || linkedPRNumber == null) {
    return false
  }
  const worktree = lookupIndex
    ? (lookupIndex.byId.get(worktreeId)?.first ?? null)
    : findWorktreeById(state, worktreeId)
  return worktree?.linkedPR !== linkedPRNumber
}

function shouldClearDivergedLinkedMergedPR(args: {
  pr: PRInfo | null
  linkedPRNumber: number | null
  requestHeadOid: string | null
}): boolean {
  const { pr, linkedPRNumber, requestHeadOid } = args
  return (
    linkedPRNumber != null &&
    requestHeadOid !== null &&
    pr?.number === linkedPRNumber &&
    pr.state === 'merged' &&
    // Head-scoped: only clear the worktree whose exact head diverged, so a
    // PR-number-coalesced refresh broadcast cannot clear a sibling worktree that
    // is still on the PR's line of work.
    pr.headDivergedFromMergedPRAtOid === requestHeadOid &&
    pr.headSha !== requestHeadOid &&
    pr.confirmedContainedHeadOid !== requestHeadOid
  )
}

function shouldApplyDivergedLinkedPRClear(args: {
  worktree: Pick<Worktree, 'linkedPR' | 'branch' | 'head' | 'isBare' | 'isArchived'> | undefined
  linkedPRNumber: number
  branch: string
  requestHeadOid: string | null
}): boolean {
  const { worktree, linkedPRNumber, branch, requestHeadOid } = args
  return (
    Boolean(worktree) &&
    requestHeadOid !== null &&
    worktree?.linkedPR === linkedPRNumber &&
    worktree.branch.replace(/^refs\/heads\//, '') === branch &&
    worktree.head === requestHeadOid &&
    worktree.isBare !== true &&
    worktree.isArchived !== true
  )
}

// Why: a linked PR is a branch-scoped hint. When a lookup returns the linked
// open or draft PR while the worktree sits on a different branch — and neither
// the push target nor the worktree HEAD still points at the PR head — the link is stale
// (a branch switch whose identity-path clear was missed) and would otherwise
// pin Checks to the previous branch's PR on every refresh.
export function shouldClearBranchMismatchedLinkedOpenPR(args: {
  pr: PRInfo | null
  linkedPRNumber: number | null
  branch: string
  requestHeadOid: string | null
  pushTargetBranch: string | null
}): boolean {
  const { pr, linkedPRNumber, branch, requestHeadOid, pushTargetBranch } = args
  const headRefName = pr?.headRefName?.trim() ?? ''
  const currentBranch = branch.replace(/^refs\/heads\//, '').trim()
  return (
    linkedPRNumber != null &&
    pr?.number === linkedPRNumber &&
    // Draft reviews are open PRs too; their distinct renderer state must not
    // leave the same stale durable link permanently wedged after a branch switch.
    (pr.state === 'open' || pr.state === 'draft') &&
    requestHeadOid !== null &&
    headRefName !== '' &&
    currentBranch !== '' &&
    headRefName !== currentBranch &&
    (pushTargetBranch === null || pushTargetBranch !== headRefName) &&
    // A worktree parked on the PR's own head commit is the same line of work
    // (e.g. a PR checkout under a renamed local branch); keep the link.
    !(pr.headSha != null && pr.headSha === requestHeadOid)
  )
}

function shouldApplyBranchMismatchedLinkedPRClear(args: {
  worktree: Pick<Worktree, 'linkedPR' | 'branch' | 'head' | 'isBare' | 'isArchived'> | undefined
  linkedPRNumber: number
  branch: string
  requestHeadOid: string | null
}): boolean {
  const { worktree, linkedPRNumber, branch, requestHeadOid } = args
  return (
    Boolean(worktree) &&
    requestHeadOid !== null &&
    worktree?.linkedPR === linkedPRNumber &&
    // Branch-scoped: only clear while the worktree is still on the branch the
    // mismatch was computed against; a newer switch gets its own validation.
    worktree.branch.replace(/^refs\/heads\//, '') === branch.replace(/^refs\/heads\//, '') &&
    worktree.head === requestHeadOid &&
    worktree.isBare !== true &&
    worktree.isArchived !== true
  )
}

function buildPRRefreshCandidate(
  state: AppState,
  worktree: Worktree,
  repoPath?: string
): GitHubPRRefreshCandidate | null {
  const repo = state.repos.find((r) => r.id === worktree.repoId)
  if (!repo) {
    return null
  }
  if (isMacAppDataPath(repoPath ?? repo.path)) {
    return null
  }
  const branch = worktree.branch.replace(/^refs\/heads\//, '')
  const cacheKey = prCacheKey(
    repoPath ?? repo.path,
    repo.id,
    branch,
    settingsForGitHubRepoOwner(state.settings, repo),
    repo.connectionId,
    repo.executionHostId,
    true
  )
  const cachedPR = state.prCache[cacheKey]?.data ?? null
  const hostedReviewFallbackPRNumber = githubHostedReviewFallbackPRNumber(
    state,
    repoPath ?? repo.path,
    repo.id,
    branch,
    repo.connectionId,
    repo.executionHostId,
    true
  )
  const cachedFallbackPRNumber = cachedPR?.number ?? null
  // Why: a merged PR stays a valid fallback when the worktree sits on its head or
  // on a commit confirmed to be part of the PR; anything else means the branch
  // moved on and the number must not resurrect the old merged PR.
  const cachedMergedPRMovedPastHead =
    worktree.linkedPR == null &&
    cachedPR?.state === 'merged' &&
    cachedPR.headSha !== worktree.head &&
    cachedPR.confirmedContainedHeadOid !== worktree.head
  const fallbackPRNumber =
    worktree.linkedPR == null && !cachedMergedPRMovedPastHead
      ? (cachedFallbackPRNumber ?? hostedReviewFallbackPRNumber)
      : null
  const fallbackPRSource: GitHubPRFallbackSource | null =
    worktree.linkedPR != null || fallbackPRNumber == null
      ? null
      : cachedFallbackPRNumber != null
        ? 'pr-cache'
        : 'hosted-review'
  const sshStatus = repo.connectionId
    ? state.sshConnectionStates.get(repo.connectionId)?.status
    : null
  return {
    repoId: repo.id,
    repoPath: repoPath ?? repo.path,
    repoKind: repo.kind ?? 'git',
    branch,
    cacheKey,
    worktreeId: worktree.id,
    currentHeadOid: worktree.head ?? null,
    // Why: persisted linked PR metadata is exact, while PR cache numbers are
    // only fallback hints after branch lookup misses.
    linkedPRNumber: worktree.linkedPR ?? null,
    fallbackPRNumber,
    fallbackPRSource,
    isBare: worktree.isBare,
    isArchived: worktree.isArchived,
    connectionId: repo.connectionId ?? null,
    executionHostId: repo.executionHostId ?? null,
    connectionState: repo.connectionId
      ? sshStatus === 'connected'
        ? 'connected'
        : 'disconnected'
      : 'unknown',
    cachedFetchedAt: state.prCache[cacheKey]?.fetchedAt ?? null,
    cachedHasPR: cachedPR ? true : state.prCache[cacheKey] ? false : null,
    cachedPRState: cachedPR?.state ?? null,
    cachedChecksStatus: cachedPR?.checksStatus ?? null,
    cachedMergeable: cachedPR?.mergeable ?? null,
    cachedMergeStateStatus: cachedPR?.mergeStateStatus ?? null
  }
}

function githubHostedReviewFallbackPRNumber(
  state: AppState,
  repoPath: string,
  repoId: string | undefined,
  branch: string,
  connectionId?: string | null,
  executionHostId?: string | null,
  hasRepoOwner = false
): number | null {
  const hostedReviewCacheKey = getHostedReviewCacheKey(
    repoPath,
    branch,
    state.settings,
    repoId,
    connectionId,
    executionHostId,
    hasRepoOwner
  )
  const hostedReview = state.hostedReviewCache[hostedReviewCacheKey]?.data
  return hostedReview?.provider === 'github' ? hostedReview.number : null
}

function shouldClearHostedReviewForNoGitHubPR(
  entry: AppState['hostedReviewCache'][string] | undefined
): boolean {
  // Why: a GitHub-only miss should not create or refresh provider-neutral
  // branch misses that suppress discovery for GitLab/other hosted reviews.
  if (!entry) {
    return false
  }
  if (entry.data?.provider === 'github') {
    return true
  }
  return entry.data === null && isGitHubLinkedReviewHintKey(entry.linkedReviewHintKey)
}

function isGitHubLinkedReviewHintKey(hintKey: string | undefined): boolean {
  return hintKey?.split('|').some((key) => key.startsWith('github:')) ?? false
}

function prLookupHintKey(linkedPRNumber: number | null, fallbackPRNumber: number | null): string {
  if (linkedPRNumber !== null) {
    return `linked:${linkedPRNumber}`
  }
  return fallbackPRNumber !== null ? `fallback:${fallbackPRNumber}` : ''
}

function linkedReviewHintKeyForNoGitHubPR(
  entry: AppState['hostedReviewCache'][string] | undefined
): string | undefined {
  if (entry?.data?.provider === 'github') {
    return isGitHubLinkedReviewHintKey(entry.linkedReviewHintKey)
      ? entry.linkedReviewHintKey
      : linkedReviewHintKey({ linkedGitHubPR: entry.data.number })
  }
  return entry?.linkedReviewHintKey
}

function hasNewerHostedReviewCacheEntry(
  cache: AppState['hostedReviewCache'],
  cacheKey: string,
  requestStartedAt: number,
  requestStartedEntry: AppState['hostedReviewCache'][string] | undefined
): boolean {
  const entry = cache[cacheKey]
  return (
    entry !== undefined &&
    (entry.fetchedAt > requestStartedAt ||
      (entry.fetchedAt === requestStartedAt && entry !== requestStartedEntry))
  )
}

function syncHostedReviewCacheFromGitHubPRResult(args: {
  cache: AppState['hostedReviewCache']
  repoPath: string
  branch: string
  settings: AppState['settings']
  repoId?: string
  connectionId?: string | null
  executionHostId?: string | null
  hasRepoOwner?: boolean
  pr: PRInfo | null
  fetchedAt: number
  linkedPRNumber?: number | null
  fallbackPRNumber?: number | null
  fallbackPRSource?: GitHubPRFallbackSource | null
  preserveExistingPRForFallbackMiss?: boolean
  requestStartedAt?: number
  requestStartedEntry?: AppState['hostedReviewCache'][string]
}): { cache: AppState['hostedReviewCache']; accepted: boolean } {
  const hostedReviewCacheKey = getHostedReviewCacheKey(
    args.repoPath,
    args.branch,
    args.settings,
    args.repoId,
    args.connectionId,
    args.executionHostId,
    args.hasRepoOwner === true
  )
  if (
    args.requestStartedAt !== undefined &&
    hasNewerHostedReviewCacheEntry(
      args.cache,
      hostedReviewCacheKey,
      args.requestStartedAt,
      args.requestStartedEntry
    )
  ) {
    return { cache: args.cache, accepted: false }
  }
  const hostedReviewEntry = args.cache[hostedReviewCacheKey]
  if (
    args.requestStartedAt === undefined &&
    hostedReviewEntry !== undefined &&
    hostedReviewEntry.fetchedAt >= args.fetchedAt
  ) {
    return { cache: args.cache, accepted: false }
  }
  if (args.pr && hostedReviewEntry?.data && hostedReviewEntry.data.provider !== 'github') {
    return { cache: args.cache, accepted: false }
  }
  // Why: a hosted-review row may only protect itself from an authoritative
  // miss when the paired PR cache is preserving a terminal, head-current PR.
  if (
    !args.pr &&
    args.linkedPRNumber == null &&
    args.fallbackPRNumber != null &&
    args.fallbackPRSource !== 'hosted-review' &&
    hostedReviewEntry?.data?.provider === 'github' &&
    hostedReviewEntry.data.number === args.fallbackPRNumber &&
    args.preserveExistingPRForFallbackMiss === true &&
    canPreserveReviewForFallbackMiss(hostedReviewEntry.data.state)
  ) {
    return { cache: args.cache, accepted: false }
  }
  if (!args.pr && !shouldClearHostedReviewForNoGitHubPR(hostedReviewEntry)) {
    return { cache: args.cache, accepted: hostedReviewEntry?.data == null }
  }
  return {
    cache: {
      ...args.cache,
      [hostedReviewCacheKey]: {
        data: args.pr ? hostedReviewInfoFromGitHubPRInfo(args.pr) : null,
        fetchedAt: args.fetchedAt,
        linkedReviewHintKey: args.pr
          ? linkedReviewHintKey({ linkedGitHubPR: args.pr.number })
          : linkedReviewHintKeyForNoGitHubPR(hostedReviewEntry)
      }
    },
    accepted: true
  }
}

function shouldWritePRCacheForHostedReviewSync(args: {
  hostedReviewSyncAccepted: boolean
  hostedReviewEntry: AppState['hostedReviewCache'][string] | undefined
  pr: PRInfo | null
  linkedPRNumber?: number | null
  fallbackPRNumber?: number | null
}): boolean {
  // Why: PR-status grouping reads prCache while cards read hostedReviewCache.
  // If a GitHub PR result was rejected for the card, don't let grouping drift.
  if (args.hostedReviewSyncAccepted) {
    return true
  }
  const exactPRNumber = args.linkedPRNumber ?? args.fallbackPRNumber ?? null
  return (
    exactPRNumber !== null &&
    args.pr?.number === exactPRNumber &&
    args.hostedReviewEntry?.data?.provider === 'github' &&
    args.hostedReviewEntry.data.number === exactPRNumber
  )
}

function canPreserveReviewForFallbackMiss(state: PRInfo['state'] | undefined): boolean {
  return state === 'closed' || state === 'merged'
}

function shouldPreserveExistingPRForFallbackMiss(args: {
  currentPR: PRInfo | null | undefined
  nextPR: PRInfo | null
  state: AppState
  worktreeId?: string
  linkedPRNumber?: number | null
  fallbackPRNumber?: number | null
  fallbackPRSource?: GitHubPRFallbackSource | null
}): boolean {
  if (
    args.nextPR !== null ||
    args.linkedPRNumber != null ||
    args.currentPR?.state !== 'merged' ||
    typeof args.currentPR.headSha !== 'string' ||
    args.currentPR.headSha.length === 0
  ) {
    return false
  }
  // Why: the common found/non-merged paths do not depend on worktree state.
  // Gate the global lookup so batched refresh aliases do not multiply full scans.
  const worktree = args.worktreeId ? findWorktreeById(args.state, args.worktreeId) : null
  const worktreeHead = worktree?.head
  // Why: merged branch PRs are only safe to keep when cached PR metadata still
  // matches the commit this stored worktree is actually on — exactly, or via a
  // head confirmed to be part of the merged PR.
  const preservesMergedPRForCurrentHead =
    typeof worktreeHead === 'string' &&
    worktreeHead.length > 0 &&
    (args.currentPR.headSha === worktreeHead ||
      args.currentPR.confirmedContainedHeadOid === worktreeHead)

  return preservesMergedPRForCurrentHead
}

function applyPRCacheResult(
  cache: AppState['prCache'],
  cacheKey: string,
  pr: PRInfo | null,
  fetchedAt: number,
  accepted: boolean,
  preserveExisting: boolean
): AppState['prCache'] {
  if (preserveExisting) {
    return cache
  }
  if (accepted) {
    return withBoundedCacheEntry(cache, cacheKey, { data: pr, fetchedAt })
  }
  if (!cache[cacheKey]) {
    return cache
  }
  const next = { ...cache }
  delete next[cacheKey]
  return next
}

function prRefreshStartedEntryKey(sequence: number, cacheKey: string): string {
  return `${sequence}::${cacheKey}`
}

function deletePRRefreshStartedEntry(sequence: number | undefined, cacheKey: string): void {
  if (sequence !== undefined && sequence > 0) {
    prRefreshStartedHostedReviewEntries.delete(prRefreshStartedEntryKey(sequence, cacheKey))
  }
}

function setPRRefreshStartedHostedReviewEntry(
  key: string,
  entry: AppState['hostedReviewCache'][string] | undefined
): void {
  if (entry === undefined) {
    prRefreshStartedHostedReviewEntries.delete(key)
    return
  }
  prRefreshStartedHostedReviewEntries.delete(key)
  prRefreshStartedHostedReviewEntries.set(key, entry)
  while (prRefreshStartedHostedReviewEntries.size > PR_REFRESH_STARTED_HOSTED_REVIEW_ENTRY_MAX) {
    const oldest = prRefreshStartedHostedReviewEntries.keys().next()
    if (oldest.done) {
      return
    }
    prRefreshStartedHostedReviewEntries.delete(oldest.value)
  }
}

function setGitHubPRResultCaches(
  state: AppState,
  args: {
    prCacheKey: string
    repoPath: string
    branch: string
    settings: AppState['settings']
    repoId?: string
    connectionId?: string | null
    executionHostId?: string | null
    hasRepoOwner?: boolean
    pr: PRInfo | null
    fetchedAt: number
    worktreeId?: string
    linkedPRNumber?: number | null
    fallbackPRNumber?: number | null
    fallbackPRSource?: GitHubPRFallbackSource | null
    requestStartedAt?: number
    requestStartedEntry?: AppState['hostedReviewCache'][string]
  }
): Partial<AppState> {
  const preserveExistingPRForFallbackMiss = shouldPreserveExistingPRForFallbackMiss({
    currentPR: state.prCache[args.prCacheKey]?.data,
    nextPR: args.pr,
    state,
    worktreeId: args.worktreeId,
    linkedPRNumber: args.linkedPRNumber,
    fallbackPRNumber: args.fallbackPRNumber,
    fallbackPRSource: args.fallbackPRSource
  })
  const hostedReviewSync = syncHostedReviewCacheFromGitHubPRResult({
    cache: state.hostedReviewCache,
    repoPath: args.repoPath,
    branch: args.branch,
    settings: args.settings,
    repoId: args.repoId,
    connectionId: args.connectionId,
    executionHostId: args.executionHostId,
    hasRepoOwner: args.hasRepoOwner,
    pr: args.pr,
    fetchedAt: args.fetchedAt,
    linkedPRNumber: args.linkedPRNumber,
    fallbackPRNumber: args.fallbackPRNumber,
    fallbackPRSource: args.fallbackPRSource,
    preserveExistingPRForFallbackMiss,
    requestStartedAt: args.requestStartedAt,
    requestStartedEntry: args.requestStartedEntry
  })
  const hostedReviewCacheKey = getHostedReviewCacheKey(
    args.repoPath,
    args.branch,
    args.settings,
    args.repoId,
    args.connectionId,
    args.executionHostId,
    args.hasRepoOwner === true
  )
  const nextPRCache = applyPRCacheResult(
    state.prCache,
    args.prCacheKey,
    args.pr,
    args.fetchedAt,
    shouldWritePRCacheForHostedReviewSync({
      hostedReviewSyncAccepted: hostedReviewSync.accepted,
      hostedReviewEntry: state.hostedReviewCache[hostedReviewCacheKey],
      pr: args.pr,
      linkedPRNumber: args.linkedPRNumber,
      fallbackPRNumber: args.fallbackPRNumber
    }),
    preserveExistingPRForFallbackMiss
  )
  return {
    ...(nextPRCache === state.prCache ? {} : { prCache: nextPRCache }),
    ...(hostedReviewSync.cache === state.hostedReviewCache
      ? {}
      : { hostedReviewCache: hostedReviewSync.cache })
  }
}

function applyGitHubPRResultToCaches(args: {
  prCache: AppState['prCache']
  hostedReviewCache: AppState['hostedReviewCache']
  prCacheKey: string
  repoPath: string
  branch: string
  settings: AppState['settings']
  repoId?: string
  connectionId?: string | null
  executionHostId?: string | null
  hasRepoOwner?: boolean
  pr: PRInfo | null
  fetchedAt: number
  state: AppState
  worktreeId?: string
  linkedPRNumber?: number | null
  fallbackPRNumber?: number | null
  fallbackPRSource?: GitHubPRFallbackSource | null
  requestStartedAt?: number
  requestStartedEntry?: AppState['hostedReviewCache'][string]
}): {
  prCache: AppState['prCache']
  hostedReviewCache: AppState['hostedReviewCache']
} {
  const preserveExistingPRForFallbackMiss = shouldPreserveExistingPRForFallbackMiss({
    currentPR: args.prCache[args.prCacheKey]?.data,
    nextPR: args.pr,
    state: args.state,
    worktreeId: args.worktreeId,
    linkedPRNumber: args.linkedPRNumber,
    fallbackPRNumber: args.fallbackPRNumber,
    fallbackPRSource: args.fallbackPRSource
  })
  const hostedReviewSync = syncHostedReviewCacheFromGitHubPRResult({
    cache: args.hostedReviewCache,
    repoPath: args.repoPath,
    branch: args.branch,
    settings: args.settings,
    repoId: args.repoId,
    connectionId: args.connectionId,
    executionHostId: args.executionHostId,
    hasRepoOwner: args.hasRepoOwner,
    pr: args.pr,
    fetchedAt: args.fetchedAt,
    linkedPRNumber: args.linkedPRNumber,
    fallbackPRNumber: args.fallbackPRNumber,
    fallbackPRSource: args.fallbackPRSource,
    preserveExistingPRForFallbackMiss,
    requestStartedAt: args.requestStartedAt,
    requestStartedEntry: args.requestStartedEntry
  })
  const hostedReviewCacheKey = getHostedReviewCacheKey(
    args.repoPath,
    args.branch,
    args.settings,
    args.repoId,
    args.connectionId,
    args.executionHostId,
    args.hasRepoOwner === true
  )
  return {
    prCache: applyPRCacheResult(
      args.prCache,
      args.prCacheKey,
      args.pr,
      args.fetchedAt,
      shouldWritePRCacheForHostedReviewSync({
        hostedReviewSyncAccepted: hostedReviewSync.accepted,
        hostedReviewEntry: args.hostedReviewCache[hostedReviewCacheKey],
        pr: args.pr,
        linkedPRNumber: args.linkedPRNumber,
        fallbackPRNumber: args.fallbackPRNumber
      }),
      preserveExistingPRForFallbackMiss
    ),
    hostedReviewCache: hostedReviewSync.cache
  }
}

/**
 * Evict the oldest entries from a cache record when it exceeds the max size.
 * Returns a pruned copy, or the original reference if no eviction was needed.
 */
function evictStaleEntries<T extends { fetchedAt: number }>(
  cache: Record<string, T>,
  maxEntries = MAX_CACHE_ENTRIES
): Record<string, T> {
  const keys = Object.keys(cache)
  if (keys.length <= maxEntries) {
    return cache
  }
  const sorted = keys
    .map((k) => ({ key: k, fetchedAt: cache[k].fetchedAt }))
    .sort((a, b) => b.fetchedAt - a.fetchedAt)
  const keep = new Set(sorted.slice(0, maxEntries).map((e) => e.key))
  const pruned: Record<string, T> = {}
  for (const k of keep) {
    pruned[k] = cache[k]
  }
  return pruned
}

function withBoundedCacheEntry<T extends { fetchedAt: number }>(
  cache: Record<string, T>,
  key: string,
  entry: T
): Record<string, T> {
  return evictStaleEntries({ ...cache, [key]: entry })
}

// Why: the prRefresh* maps are keyed by PR cache key (repo/branch/execution-host)
// — an ephemeral, unbounded key space over a long session. They have no
// `fetchedAt` to sort by, so bound them by insertion order (oldest-touched keys
// evicted first; the writers move each touched key to the end). An evicted
// long-idle branch simply restarts from a clean state, which is acceptable.
function capRecordByInsertionOrder<T>(
  record: Record<string, T>,
  maxEntries = MAX_CACHE_ENTRIES
): Record<string, T> {
  const keys = Object.keys(record)
  if (keys.length <= maxEntries) {
    return record
  }
  const capped: Record<string, T> = {}
  for (const key of keys.slice(keys.length - maxEntries)) {
    capped[key] = record[key]
  }
  return capped
}

function capPrRefreshSequences(
  sequences: Record<string, number>,
  maxEntries = MAX_CACHE_ENTRIES
): Record<string, number> {
  return capRecordByInsertionOrder(sequences, maxEntries)
}

// Why: prRefreshStates backs visible status pills (refreshing/queued/paused/error)
// so — unlike the invisible sequence guard — eviction must never drop an in-progress
// indicator. Bound it well above any realistic tracked-branch count, and when over
// cap evict *settled* statuses (error/skipped) first; only fall back to evicting an
// active (in-flight/queued/paused) entry as a last-resort hard memory bound that
// realistic usage never reaches. Evicted entries self-heal on the next refresh event.
const MAX_PR_REFRESH_STATE_ENTRIES = 2000
const SETTLED_PR_REFRESH_STATUSES = new Set<PRRefreshState['status']>(['error', 'skipped'])
const ACTIVE_PR_REFRESH_STATUSES = new Set<PRRefreshState['status']>([
  'queued',
  'in-flight',
  'paused'
])

function isPRRefreshStateExpired(state: PRRefreshState, now: number): boolean {
  const expiryAt = getGitHubPRRefreshStateExpiryAt(state)
  return expiryAt !== null && now > expiryAt
}

/**
 * Captures the exact refresh snapshot a later timeout or request is allowed to clear.
 */
export function buildGitHubPRRefreshStateClearToken(
  state: PRRefreshState | undefined,
  sequences: Record<string, number>,
  cacheKey: string
): PRRefreshStateClearToken | null {
  if (!state) {
    return null
  }
  return {
    sequence: sequences[cacheKey] ?? 0,
    status: state.status,
    updatedAt: state.updatedAt
  }
}

/**
 * Returns the wall-clock expiry for transient refresh states; settled states persist.
 */
export function getGitHubPRRefreshStateExpiryAt(state: PRRefreshState | undefined): number | null {
  if (!state) {
    return null
  }
  if (state.status === 'queued' || state.status === 'in-flight') {
    return Number.isFinite(state.updatedAt) ? state.updatedAt + PR_REFRESH_ACTIVE_STALE_MS : 0
  }
  if (state.status === 'paused') {
    return Number.isFinite(state.pausedUntil)
      ? (state.pausedUntil ?? 0) + PR_REFRESH_PAUSED_GRACE_MS
      : 0
  }
  return null
}

function isExpiredActivePRRefreshState(state: PRRefreshState, now: number): boolean {
  return ACTIVE_PR_REFRESH_STATUSES.has(state.status) && isPRRefreshStateExpired(state, now)
}

/**
 * Reads refresh state for UI selectors while hiding stale active entries from view.
 */
export function getEffectiveGitHubPRRefreshState(
  states: Record<string, PRRefreshState>,
  cacheKey: string,
  now = Date.now()
): PRRefreshState | undefined {
  const state = states[cacheKey]
  if (!state || isExpiredActivePRRefreshState(state, now)) {
    return undefined
  }
  return state
}

function pruneExpiredPRRefreshStates(
  states: Record<string, PRRefreshState>,
  now = Date.now()
): Record<string, PRRefreshState> {
  let next: Record<string, PRRefreshState> | null = null
  for (const [cacheKey, state] of Object.entries(states)) {
    if (!isExpiredActivePRRefreshState(state, now)) {
      continue
    }
    if (!next) {
      next = { ...states }
    }
    delete next[cacheKey]
  }
  return next ?? states
}

function capPrRefreshStates(
  states: Record<string, PRRefreshState>,
  maxEntries = MAX_PR_REFRESH_STATE_ENTRIES
): Record<string, PRRefreshState> {
  const keys = Object.keys(states)
  let toEvict = keys.length - maxEntries
  if (toEvict <= 0) {
    return states
  }
  const evicted = new Set<string>()
  // First pass: evict oldest settled (error/skipped) entries.
  for (const key of keys) {
    if (toEvict === 0) {
      break
    }
    if (SETTLED_PR_REFRESH_STATUSES.has(states[key].status)) {
      evicted.add(key)
      toEvict--
    }
  }
  // Last resort: evict oldest remaining keys to enforce the hard bound.
  for (const key of keys) {
    if (toEvict === 0) {
      break
    }
    if (!evicted.has(key)) {
      evicted.add(key)
      toEvict--
    }
  }
  const capped: Record<string, PRRefreshState> = {}
  for (const key of keys) {
    if (!evicted.has(key)) {
      capped[key] = states[key]
    }
  }
  return capped
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

function debouncedSaveCache(state: AppState): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
  }
  saveTimer = setTimeout(() => {
    saveTimer = null
    window.api.cache.setGitHub({
      cache: {
        pr: state.prCache
      }
    })
  }, 1000) // Save at most once per second
}

export type GitHubSlice = {
  prCache: Record<string, CacheEntry<PRInfo>>
  checksCache: Record<string, CacheEntry<PRCheckDetail[]>>
  commentsCache: Record<string, CacheEntry<PRComment[]>>
  prRefreshSequences: Record<string, number>
  prRefreshStates: Record<string, PRRefreshState>
  prVisibleRefreshGeneration: number
  // Why: keyed by repoId + limit + query so remote repos with the same path on
  // different SSH targets do not share issue/PR results.
  // from cache instantly on mount (and on hover-prefetch from sidebar buttons)
  // while a background refresh keeps the list fresh.
  workItemsCache: Record<string, CacheEntry<GitHubWorkItem[]>>
  fetchPRForBranch: (
    repoPath: string,
    branch: string,
    options?: RepoScopedFetchOptions & {
      worktreeId?: string
      linkedPRNumber?: number | null
      fallbackPRNumber?: number | null
      fallbackPRSource?: GitHubPRFallbackSource | null
    }
  ) => Promise<PRInfo | null>
  fetchPRChecks: (
    repoPath: string,
    prNumber: number,
    branch?: string,
    headSha?: string,
    prRepo?: GitHubOwnerRepo | null,
    options?: RepoScopedFetchOptions
  ) => Promise<PRCheckDetail[]>
  fetchPRCheckDetails: (
    repoPath: string,
    args: {
      checkRunId?: number
      workflowRunId?: number
      checkName?: string
      url?: string | null
      prRepo?: GitHubOwnerRepo | null
    },
    options?: RepoScopedFetchOptions
  ) => Promise<PRCheckRunDetails | null>
  fetchPRComments: (
    repoPath: string,
    prNumber: number,
    options?: RepoScopedFetchOptions & { prRepo?: GitHubOwnerRepo | null }
  ) => Promise<PRComment[]>
  addPRConversationComment: (
    repoPath: string,
    prNumber: number,
    body: string,
    options?: RepoScopedFetchOptions & { prRepo?: GitHubOwnerRepo | null }
  ) => Promise<GitHubCommentResult>
  addPRReviewCommentReply: (
    repoPath: string,
    prNumber: number,
    commentId: number,
    body: string,
    options?: RepoScopedFetchOptions & {
      prRepo?: GitHubOwnerRepo | null
      threadId?: string
      path?: string
      line?: number
    }
  ) => Promise<GitHubCommentResult>
  resolveReviewThread: (
    repoPath: string,
    prNumber: number,
    threadId: string,
    resolve: boolean,
    options?: RepoScopedFetchOptions & { prRepo?: GitHubOwnerRepo | null }
  ) => Promise<boolean>
  initGitHubCache: () => Promise<void>
  refreshAllGitHub: () => void
  refreshGitHubForWorktree: (worktreeId: string) => void
  refreshGitHubForWorktreeIfStale: (worktreeId: string) => void
  enqueueGitHubPRRefresh: (
    worktreeId: string,
    reason: GitHubPRRefreshReason,
    priority?: number
  ) => void
  reportVisibleGitHubPRRefreshCandidates: (worktreeIds: string[], generation: number) => void
  bumpGitHubPRVisibleRefreshGeneration: () => void
  applyGitHubPRRefreshEvent: (event: GitHubPRRefreshEvent) => void
  getEffectiveGitHubPRRefreshState: (cacheKey: string, now?: number) => PRRefreshState | undefined
  expireGitHubPRRefreshState: (
    cacheKey: string,
    token: PRRefreshStateClearToken,
    now?: number
  ) => void
  /**
   * Why: returns cached work items immediately (null if none) and fires a
   * background refresh when stale. Callers can render the cached list while
   * the SWR revalidate hydrates the latest.
   */
  getCachedWorkItems: (
    repoId: string,
    limit: number,
    query: string,
    repoPath?: string,
    sourceContext?: ProjectSourceContext | null
  ) => GitHubWorkItem[] | null
  fetchWorkItems: (
    repoId: string,
    repoPath: string,
    limit: number,
    query: string,
    options?: FetchOptions
  ) => Promise<GitHubWorkItem[]>
  /**
   * Why: fan out a single work-item query across multiple repos. Partial
   * failures don't reject — a repo that both fails to fetch *and* has no
   * cached fallback contributes nothing and increments `failedCount`, which
   * the caller surfaces as a "N of M projects failed to load" banner. A repo
   * served from stale cache on rejection is NOT counted as failed — matching
   * the single-repo behavior of quietly serving stale data.
   */
  fetchWorkItemsAcrossRepos: (
    repos: {
      repoId: string
      path: string
      executionHostId?: string | null
      sourceContext?: ProjectSourceContext | null
    }[],
    perRepoLimit: number,
    displayLimit: number,
    query: string,
    options?: FetchOptions
  ) => Promise<{ items: GitHubWorkItem[]; failedCount: number }>
  /** Fetch one numbered provider page. Pagination pages remain renderer-local. */
  prefetchWorkItems: (
    repoId: string,
    repoPath: string,
    limit?: number,
    query?: string,
    options?: { sourceContext?: ProjectSourceContext | null }
  ) => void
  evictGitHubRepoCaches: (repoId: string, repoPath?: string) => void
}

export const createGitHubSlice: StateCreator<AppState, [], [], GitHubSlice> = (set, get) => ({
  prCache: {},
  checksCache: {},
  commentsCache: {},
  prRefreshSequences: {},
  prRefreshStates: {},
  prVisibleRefreshGeneration: 0,
  workItemsCache: {},

  getEffectiveGitHubPRRefreshState: (cacheKey, now) =>
    getEffectiveGitHubPRRefreshState(get().prRefreshStates, cacheKey, now),

  expireGitHubPRRefreshState: (cacheKey, token, now = Date.now()) => {
    const currentState = get()
    const currentRefreshState = currentState.prRefreshStates[cacheKey]
    if (
      !currentRefreshState ||
      !ACTIVE_PR_REFRESH_STATUSES.has(currentRefreshState.status) ||
      !isExpiredActivePRRefreshState(currentRefreshState, now) ||
      (currentState.prRefreshSequences[cacheKey] ?? 0) !== token.sequence ||
      currentRefreshState.status !== token.status ||
      currentRefreshState.updatedAt !== token.updatedAt
    ) {
      return
    }
    set((s) => {
      const state = s.prRefreshStates[cacheKey]
      if (
        !state ||
        !ACTIVE_PR_REFRESH_STATUSES.has(state.status) ||
        !isExpiredActivePRRefreshState(state, now) ||
        (s.prRefreshSequences[cacheKey] ?? 0) !== token.sequence ||
        state.status !== token.status ||
        state.updatedAt !== token.updatedAt
      ) {
        return s
      }
      const nextStates = { ...s.prRefreshStates }
      delete nextStates[cacheKey]
      return { prRefreshStates: nextStates }
    })
  },

  getCachedWorkItems: (repoId, limit, query, repoPath, sourceContext) => {
    if (isGitHubWorkItemsQueryTooLarge(query)) {
      return null
    }
    const state = get()
    const key =
      sourceContext?.provider === 'github'
        ? workItemsCacheKey(repoId, limit, query, getProjectSourceCacheScope(sourceContext))
        : getWorkItemsCacheKeyForOwner(state, repoId, limit, query, repoPath)
    return get().workItemsCache[key]?.data ?? null
  },

  fetchWorkItems: async (repoId, repoPath, limit, query, options): Promise<GitHubWorkItem[]> => {
    if (isGitHubWorkItemsQueryTooLarge(query)) {
      return []
    }
    const requestState = get()
    const repo = findRepoForGitHubOwner(requestState, repoId, repoPath)
    const requestSettings = getGitHubWorkItemSourceSettings(
      requestState.settings,
      repo,
      options?.sourceContext
    )
    const ownerHostId = getGitHubWorkItemSourceHostId(requestState, repo, options?.sourceContext)
    const cacheScope = getGitHubWorkItemSourceCacheScope(requestState, repo, options?.sourceContext)
    const key = workItemsCacheKey(repoId, limit, query, cacheScope)
    const cached = get().workItemsCache[key]
    if (!options?.force && isFresh(cached, WORK_ITEMS_CACHE_TTL)) {
      return cached.data ?? []
    }

    const requestContext = getGitHubWorkItemRequestContext(
      requestState,
      requestSettings,
      repoId,
      repoPath,
      options?.sourceContext
    )
    const inflightKey = workItemsInflightRequestKey(key, requestContext.target)
    const existing = inflightWorkItemsRequests.get(inflightKey)
    if (existing) {
      // Why: a user-initiated refresh (force=true) must not silently dedupe to
      // a less-fresh fetch already in flight. noCache=true is stricter than a
      // cacheable forced landing probe because it must bypass gh api's cache too.
      if ((options?.force && !existing.force) || (options?.noCache && !existing.noCache)) {
        await existing.promise.catch(() => {})
      } else {
        return existing.promise
      }
    }

    const request = (async () => {
      await acquireWorkItemSlot()
      try {
        const envelope = await listGitHubWorkItemsForRepo(requestContext, {
          limit,
          query: query || undefined,
          ...(options?.noCache ? { noCache: true } : {})
        })
        // Why: main does not know Yiru's Repo.id, so stamp it at the renderer boundary.
        const items: GitHubWorkItem[] = envelope.items.map((item) => ({ ...item, repoId }))
        const currentRepo = findRepoForGitHubOwner(get(), repoId, repoPath)
        const currentHostId = getGitHubWorkItemSourceHostId(
          get(),
          currentRepo,
          options?.sourceContext
        )
        // Why: host focus changes are allowed, but repo ownership changes mean
        // this response belongs to an older execution host bucket.
        if ((currentHostId ?? null) !== (ownerHostId ?? null)) {
          return items
        }
        set((s) => ({
          workItemsCache: withBoundedCacheEntry(s.workItemsCache, key, {
            data: items,
            fetchedAt: Date.now()
          })
        }))
        return items
      } catch (err) {
        // Why: surface the error to the caller; keep stale cache entry so the
        // UI can continue to render something useful while the user retries.
        if (!isGitHubWorkItemsSshRemoteRequiredError(err)) {
          console.error('Failed to fetch GitHub work items:', err)
        }
        throw err
      } finally {
        releaseWorkItemSlot()
        inflightWorkItemsRequests.delete(inflightKey)
      }
    })()

    inflightWorkItemsRequests.set(inflightKey, {
      promise: request,
      force: Boolean(options?.force),
      noCache: Boolean(options?.noCache)
    })
    return request
  },

  fetchWorkItemsAcrossRepos: async (repos, perRepoLimit, displayLimit, query, options) => {
    if (isGitHubWorkItemsQueryTooLarge(query)) {
      return { items: [], failedCount: 0 }
    }
    const state = get()
    let failedCount = 0
    const perProjectResults = await Promise.all(
      repos.map(async (r) => {
        try {
          return await state.fetchWorkItems(r.repoId, r.path, perRepoLimit, query, {
            ...options,
            sourceContext: r.sourceContext ?? options?.sourceContext
          })
        } catch (err) {
          // Why: fall back to any cache entry (stale or not) before declaring
          // this repo failed. Matches single-repo behavior of silently serving
          // stale data on error. A repo is only counted as failed when it has
          // nothing at all to contribute.
          // Why: must use perRepoLimit (not displayLimit) so the cache key
          // matches what fetchWorkItems wrote.
          if (isGitHubWorkItemsSshRemoteRequiredError(err)) {
            return [] as GitHubWorkItem[]
          }
          const key =
            r.sourceContext?.provider === 'github'
              ? workItemsCacheKey(
                  r.repoId,
                  perRepoLimit,
                  query,
                  getProjectSourceCacheScope(r.sourceContext)
                )
              : getWorkItemsCacheKeyForOwner(get(), r.repoId, perRepoLimit, query, r.path)
          const cached = get().workItemsCache[key]?.data
          if (cached) {
            console.warn(`[workItems] ${r.repoId} failed, serving cached:`, err)
            return cached
          }
          console.warn(`[workItems] ${r.repoId} failed:`, err)
          failedCount += 1
          return [] as GitHubWorkItem[]
        }
      })
    )
    const merged = sortWorkItemsByNumber(perProjectResults.flat()).slice(0, displayLimit)
    return { items: merged, failedCount }
  },

  prefetchWorkItems: (repoId, repoPath, limit = PER_REPO_FETCH_LIMIT, query = '', options) => {
    if (isGitHubWorkItemsQueryTooLarge(query)) {
      return
    }
    const requestState = get()
    const repo = findRepoForGitHubOwner(requestState, repoId, repoPath)
    const key =
      options?.sourceContext?.provider === 'github'
        ? workItemsCacheKey(repoId, limit, query, getProjectSourceCacheScope(options.sourceContext))
        : getWorkItemsCacheKeyForOwner(requestState, repoId, limit, query, repoPath)
    const cached = get().workItemsCache[key]
    const requestSettings = getGitHubWorkItemSourceSettings(
      requestState.settings,
      repo,
      options?.sourceContext
    )
    const requestContext = getGitHubWorkItemRequestContext(
      requestState,
      requestSettings,
      repoId,
      repoPath,
      options?.sourceContext
    )
    const inflightKey = workItemsInflightRequestKey(key, requestContext.target)
    // Skip when the cache is fresh or a request is already in flight.
    if (isFresh(cached, WORK_ITEMS_CACHE_TTL) || inflightWorkItemsRequests.has(inflightKey)) {
      return
    }
    void get()
      .fetchWorkItems(repoId, repoPath, limit, query, { sourceContext: options?.sourceContext })
      .catch(() => {})
  },

  initGitHubCache: async () => {
    try {
      const persisted = await window.api.cache.getGitHub()
      if (persisted) {
        set({
          prCache: evictStaleEntries(persisted.pr || {})
        })
      }
    } catch (err) {
      console.error('Failed to load GitHub cache from disk:', err)
    }
  },

  fetchPRForBranch: async (repoPath, branch, options): Promise<PRInfo | null> => {
    const repo = get().repos?.find((candidate) =>
      options?.repoId ? candidate.id === options.repoId : candidate.path === repoPath
    )
    const repoId = options?.repoId ?? repo?.id
    const requestSettings = settingsForGitHubRepoOwner(get().settings, repo)
    const cacheKey = prCacheKey(
      repoPath,
      repoId,
      branch,
      requestSettings,
      repo?.connectionId,
      repo?.executionHostId,
      repo !== undefined
    )
    const cached = get().prCache[cacheKey]
    const hostedReviewCacheKey = getHostedReviewCacheKey(
      repoPath,
      branch,
      requestSettings,
      repoId,
      repo?.connectionId,
      repo?.executionHostId,
      repo !== undefined
    )
    // Why: if a prior caller without a linkedPR cached `null` for this branch,
    // the worktree-card lookup (which has a linked PR fallback) would otherwise
    // return null forever. Refetch when the cached miss could now resolve via
    // the linkedPR path.
    const linkedPRNumber = options?.linkedPRNumber ?? null
    const explicitFallbackPRNumber = options?.fallbackPRNumber ?? null
    const hostedReviewFallbackPRNumber = githubHostedReviewFallbackPRNumber(
      get(),
      repoPath,
      repoId,
      branch,
      repo?.connectionId,
      repo?.executionHostId,
      repo !== undefined
    )
    const fallbackPRNumber =
      linkedPRNumber == null ? (explicitFallbackPRNumber ?? hostedReviewFallbackPRNumber) : null
    const fallbackPRSource: GitHubPRFallbackSource | null =
      linkedPRNumber != null || fallbackPRNumber == null
        ? null
        : (options?.fallbackPRSource ??
          (explicitFallbackPRNumber != null ? 'explicit' : 'hosted-review'))
    const lookupHintKey = prLookupHintKey(linkedPRNumber, fallbackPRNumber)
    const linkedRefetch =
      cached?.data === null && (linkedPRNumber !== null || fallbackPRNumber !== null)
    if (!options?.force && !linkedRefetch && isFresh(cached)) {
      // Why: a fresh cache hit still carries the head-scoped divergence signal.
      // If a prior clear was declined because the head moved mid-request and the
      // worktree is now back on that diverged head, clear the durable link the
      // cache would otherwise keep serving until it expires.
      if (
        options?.worktreeId &&
        linkedPRNumber != null &&
        cached?.data?.headDivergedFromMergedPRAtOid != null
      ) {
        const currentHeadOid = findWorktreeById(get(), options.worktreeId)?.head ?? null
        if (
          shouldClearDivergedLinkedMergedPR({
            pr: cached.data,
            linkedPRNumber,
            requestHeadOid: currentHeadOid
          })
        ) {
          void get().updateWorktreeMeta(
            options.worktreeId,
            { linkedPR: null },
            {
              shouldApply: (worktree) =>
                shouldApplyDivergedLinkedPRClear({
                  worktree,
                  linkedPRNumber,
                  branch,
                  requestHeadOid: currentHeadOid
                })
            }
          )
        }
      }
      return cached.data
    }

    const inflightRequest = inflightPRRequests.get(cacheKey)
    if (
      inflightRequest &&
      (!options?.force || inflightRequest.force) &&
      inflightRequest.lookupHintKey === lookupHintKey &&
      !linkedRefetch
    ) {
      return inflightRequest.promise
    }

    const generation = (prRequestGenerations.get(cacheKey) ?? 0) + 1
    const requestStartedAt = Date.now()
    const requestStartedHostedReviewEntry = get().hostedReviewCache[hostedReviewCacheKey]
    const requestStartedPRRefreshState = get().prRefreshStates[cacheKey]
    const requestStartedPRRefreshToken = buildGitHubPRRefreshStateClearToken(
      requestStartedPRRefreshState,
      get().prRefreshSequences,
      cacheKey
    )
    prRequestGenerations.set(cacheKey, generation)

    const request = (async () => {
      try {
        const runtimeRepo = getRuntimeRepoTarget(get(), repoPath, requestSettings)
        const candidateWorktree = options?.worktreeId
          ? findWorktreeById(get(), options.worktreeId)
          : null
        const requestHeadOid = candidateWorktree?.head ?? null
        const outcome = runtimeRepo
          ? await callRuntimeRpc<PRInfo | null>(
              runtimeRepo.target,
              'github.prForBranch',
              {
                repo: runtimeRepo.repo.id,
                branch,
                linkedPRNumber,
                currentHeadOid: requestHeadOid,
                ...(fallbackPRNumber !== null
                  ? { fallbackPRNumber, acceptMergedFallbackPR: fallbackPRSource !== null }
                  : {})
              },
              { timeoutMs: 30_000 }
            ).then((pr) =>
              pr
                ? ({ kind: 'found', pr, fetchedAt: Date.now() } as const)
                : ({ kind: 'no-pr', fetchedAt: Date.now() } as const)
            )
          : await (async () => {
              const candidate: GitHubPRRefreshCandidate = {
                repoId: repoId ?? '',
                repoPath,
                repoKind: repo?.kind ?? 'git',
                branch,
                cacheKey,
                worktreeId: options?.worktreeId,
                currentHeadOid: requestHeadOid,
                linkedPRNumber,
                fallbackPRNumber,
                fallbackPRSource,
                connectionId: repo?.connectionId ?? null,
                executionHostId: repo?.executionHostId ?? null,
                cachedFetchedAt: cached?.fetchedAt ?? null,
                cachedHasPR: cached?.data ? true : cached ? false : null,
                cachedPRState: cached?.data?.state ?? null,
                cachedChecksStatus: cached?.data?.checksStatus ?? null,
                cachedMergeable: cached?.data?.mergeable ?? null,
                cachedMergeStateStatus: cached?.data?.mergeStateStatus ?? null
              }
              return window.api.gh.refreshPRNow
                ? await window.api.gh.refreshPRNow({ candidate })
                : await window.api.gh
                    .prForBranch({
                      repoPath,
                      repoId,
                      branch,
                      linkedPRNumber,
                      fallbackPRNumber,
                      acceptMergedFallbackPR:
                        fallbackPRNumber !== null && fallbackPRSource !== null,
                      currentHeadOid: requestHeadOid
                    })
                    .then((pr) =>
                      pr
                        ? ({ kind: 'found', pr, fetchedAt: Date.now() } as const)
                        : ({ kind: 'no-pr', fetchedAt: Date.now() } as const)
                    )
            })()
        const pr: PRInfo | null =
          outcome.kind === 'found' ? outcome.pr : outcome.kind === 'no-pr' ? null : null
        if (outcome.kind === 'upstream-error') {
          return cached?.data ?? null
        }
        if (prRequestGenerations.get(cacheKey) === generation) {
          let skippedStaleLinkedPRLookup = false
          let didUpdatePRCache = false
          set((s) => {
            // Why: unlinking a PR while an exact linked-PR lookup is in flight
            // must prevent that older result from restoring the manual link UI.
            if (isStaleExactLinkedPRLookup(s, options?.worktreeId, linkedPRNumber)) {
              skippedStaleLinkedPRLookup = true
              return {}
            }
            const updates = setGitHubPRResultCaches(s, {
              prCacheKey: cacheKey,
              repoPath,
              branch,
              settings: requestSettings,
              repoId,
              connectionId: repo?.connectionId,
              executionHostId: repo?.executionHostId,
              hasRepoOwner: repo !== undefined,
              pr,
              fetchedAt: outcome.fetchedAt,
              worktreeId: options?.worktreeId,
              linkedPRNumber,
              fallbackPRNumber,
              fallbackPRSource,
              requestStartedAt,
              requestStartedEntry: requestStartedHostedReviewEntry
            })
            didUpdatePRCache = updates.prCache !== undefined
            return updates
          })
          if (skippedStaleLinkedPRLookup) {
            return null
          }
          if (didUpdatePRCache) {
            debouncedSaveCache(get())
          }
          const linkedPRWorktree =
            options?.worktreeId && linkedPRNumber != null
              ? findUniqueWorktreeById(
                  get(),
                  options.worktreeId,
                  repo ? getRepoExecutionHostId(repo) : LOCAL_EXECUTION_HOST_ID
                )
              : null
          if (
            options?.worktreeId &&
            linkedPRWorktree &&
            linkedPRNumber != null &&
            shouldClearDivergedLinkedMergedPR({ pr, linkedPRNumber, requestHeadOid })
          ) {
            // Why: only clear the durable link that produced this exact probe;
            // branch/head drift means the stale result no longer owns the worktree.
            void get().updateWorktreeMeta(
              options.worktreeId,
              { linkedPR: null },
              {
                shouldApply: () =>
                  shouldApplyDivergedLinkedPRClear({
                    worktree:
                      findUniqueWorktreeById(
                        get(),
                        options.worktreeId!,
                        repo ? getRepoExecutionHostId(repo) : LOCAL_EXECUTION_HOST_ID
                      ) ?? undefined,
                    linkedPRNumber,
                    branch,
                    requestHeadOid
                  })
              }
            )
          }
          if (
            options?.worktreeId &&
            linkedPRWorktree &&
            linkedPRNumber != null &&
            shouldClearBranchMismatchedLinkedOpenPR({
              pr,
              linkedPRNumber,
              branch,
              requestHeadOid,
              pushTargetBranch: linkedPRWorktree.pushTarget?.branchName ?? null
            })
          ) {
            void get().updateWorktreeMeta(
              options.worktreeId,
              { linkedPR: null },
              {
                // Why: the branch-scoped PR refetch below updates both GitHub
                // caches; the generic metadata refresh would duplicate provider work.
                suppressHostedReviewRefresh: true,
                shouldApply: () =>
                  shouldApplyBranchMismatchedLinkedPRClear({
                    worktree:
                      findUniqueWorktreeById(
                        get(),
                        options.worktreeId!,
                        repo ? getRepoExecutionHostId(repo) : LOCAL_EXECUTION_HOST_ID
                      ) ?? undefined,
                    linkedPRNumber,
                    branch,
                    requestHeadOid
                  })
              }
            )
            // Re-resolve by branch right away so visible Checks recover on this
            // refresh instead of keeping the stale linked PR cached.
            void get().fetchPRForBranch(repoPath, branch, {
              force: true,
              repoId,
              worktreeId: options.worktreeId
            })
          }
        }
        if (
          shouldPreserveExistingPRForFallbackMiss({
            currentPR: get().prCache[cacheKey]?.data,
            nextPR: pr,
            state: get(),
            worktreeId: options?.worktreeId,
            linkedPRNumber,
            fallbackPRNumber,
            fallbackPRSource
          })
        ) {
          return get().prCache[cacheKey]?.data ?? null
        }
        return pr ?? null
      } catch (err) {
        console.error('Failed to fetch PR:', err)
        return null
      } finally {
        const activeRequest = inflightPRRequests.get(cacheKey)
        if (activeRequest?.generation === generation) {
          inflightPRRequests.delete(cacheKey)
          if (prRequestGenerations.get(cacheKey) === generation) {
            prRequestGenerations.delete(cacheKey)
          }
        }
        if (requestStartedPRRefreshToken) {
          get().expireGitHubPRRefreshState(cacheKey, requestStartedPRRefreshToken)
        }
      }
    })()

    inflightPRRequests.set(cacheKey, {
      promise: request,
      force: Boolean(options?.force),
      generation,
      lookupHintKey
    })
    return request
  },

  fetchPRChecks: async (
    repoPath,
    prNumber,
    branch,
    headSha,
    prRepo,
    options
  ): Promise<PRCheckDetail[]> => {
    const repo = get().repos?.find((candidate) =>
      options?.repoId ? candidate.id === options.repoId : candidate.path === repoPath
    )
    const repoId = options?.repoId ?? repo?.id
    const requestSettings = getGitHubRepoSourceSettings(
      get().settings,
      repo,
      options?.sourceContext
    )
    const cacheKey = sourceScopedRepoCacheKey(
      repoPath,
      repoId,
      prChecksCacheSuffix(prNumber, prRepo, headSha),
      requestSettings,
      repo?.connectionId,
      repo?.executionHostId,
      options?.sourceContext,
      repo !== undefined
    )
    const legacyCacheKey = headSha
      ? sourceScopedRepoCacheKey(
          repoPath,
          repoId,
          prChecksCacheSuffix(prNumber, prRepo),
          requestSettings,
          repo?.connectionId,
          repo?.executionHostId,
          options?.sourceContext,
          repo !== undefined
        )
      : cacheKey
    const inflightKey = cacheKey
    const cached = get().checksCache[cacheKey] ?? get().checksCache[legacyCacheKey]
    if (
      !options?.force &&
      !options?.noCache &&
      isFresh(cached, getPRChecksCacheTtl(cached)) &&
      (!headSha || cached.headSha === headSha)
    ) {
      const cachedChecks = cached.data ?? []
      const prStatusUpdate = syncPRChecksStatus(
        get(),
        repoPath,
        repoId,
        branch,
        cachedChecks,
        cached.headSha,
        prRepo,
        requestSettings,
        repo?.connectionId,
        repo?.executionHostId,
        repo !== undefined
      )
      if (prStatusUpdate) {
        set(prStatusUpdate)
        debouncedSaveCache(get())
      }
      return cachedChecks
    }

    const inflightRequest = inflightChecksRequests.get(inflightKey)
    if (inflightRequest) {
      if (
        (options?.force && !inflightRequest.force) ||
        (options?.noCache && !inflightRequest.noCache)
      ) {
        await inflightRequest.promise.catch(() => {})
      } else {
        return inflightRequest.promise
      }
    }

    const request = (async () => {
      try {
        const requestContext = getGitHubWorkItemRequestContext(
          get(),
          requestSettings,
          repoId ?? repoPath,
          repoPath,
          options?.sourceContext
        )
        const checks =
          requestContext.target.kind === 'environment'
            ? await callRuntimeRpc<PRCheckDetail[]>(
                { kind: 'environment', environmentId: requestContext.target.environmentId },
                'github.prChecks',
                {
                  repo: requestContext.target.runtimeRepoId,
                  prNumber,
                  headSha,
                  prRepo: prRepo ?? null,
                  noCache: Boolean(options?.force || options?.noCache)
                },
                { timeoutMs: 30_000 }
              )
            : ((await window.api.gh.prChecks({
                repoPath,
                repoId,
                prNumber,
                headSha,
                prRepo: prRepo ?? null,
                noCache: Boolean(options?.force || options?.noCache)
              })) as PRCheckDetail[])
        set((s) => {
          const nextState: Partial<AppState> = {
            checksCache: withBoundedCacheEntry(s.checksCache, cacheKey, {
              data: checks,
              fetchedAt: Date.now(),
              headSha
            })
          }

          const prStatusUpdate = syncPRChecksStatus(
            s,
            repoPath,
            repoId,
            branch,
            checks,
            headSha,
            prRepo,
            requestSettings,
            repo?.connectionId,
            repo?.executionHostId,
            repo !== undefined
          )
          if (prStatusUpdate?.prCache) {
            nextState.prCache = prStatusUpdate.prCache
          }

          return nextState
        })
        debouncedSaveCache(get())
        return checks
      } catch (err) {
        console.error('Failed to fetch PR checks:', err)
        const latestCached = get().checksCache[cacheKey] ?? get().checksCache[legacyCacheKey]
        if (latestCached?.data && (!headSha || latestCached.headSha === headSha)) {
          return latestCached.data
        }
        return []
      } finally {
        inflightChecksRequests.delete(inflightKey)
      }
    })()

    inflightChecksRequests.set(inflightKey, {
      promise: request,
      force: Boolean(options?.force),
      noCache: Boolean(options?.force || options?.noCache)
    })
    return request
  },

  fetchPRCheckDetails: async (repoPath, args, options): Promise<PRCheckRunDetails | null> => {
    const repo = get().repos?.find((candidate) =>
      options?.repoId ? candidate.id === options.repoId : candidate.path === repoPath
    )
    const repoId = options?.repoId ?? repo?.id
    const requestSettings = getGitHubRepoSourceSettings(
      get().settings,
      repo,
      options?.sourceContext
    )
    const requestContext = getGitHubWorkItemRequestContext(
      get(),
      requestSettings,
      repoId ?? repoPath,
      repoPath,
      options?.sourceContext
    )
    return requestContext.target.kind === 'environment'
      ? await callRuntimeRpc<PRCheckRunDetails | null>(
          { kind: 'environment', environmentId: requestContext.target.environmentId },
          'github.prCheckDetails',
          {
            repo: requestContext.target.runtimeRepoId,
            checkRunId: args.checkRunId,
            workflowRunId: args.workflowRunId,
            checkName: args.checkName,
            url: args.url,
            prRepo: args.prRepo ?? null
          },
          { timeoutMs: 30_000 }
        )
      : ((await window.api.gh.prCheckDetails({
          repoPath,
          repoId,
          checkRunId: args.checkRunId,
          workflowRunId: args.workflowRunId,
          checkName: args.checkName,
          url: args.url,
          prRepo: args.prRepo ?? null
        })) as PRCheckRunDetails | null)
  },

  fetchPRComments: async (repoPath, prNumber, options): Promise<PRComment[]> => {
    const repo = get().repos?.find((candidate) =>
      options?.repoId ? candidate.id === options.repoId : candidate.path === repoPath
    )
    const repoId = options?.repoId ?? repo?.id
    const requestSettings = getGitHubRepoSourceSettings(
      get().settings,
      repo,
      options?.sourceContext
    )
    const cacheKey = sourceScopedRepoCacheKey(
      repoPath,
      repoId,
      prCommentsCacheSuffix(prNumber, options?.prRepo),
      requestSettings,
      repo?.connectionId,
      repo?.executionHostId,
      options?.sourceContext,
      repo !== undefined
    )
    const cached = get().commentsCache[cacheKey]
    if (!options?.force && isFresh(cached)) {
      return cached.data ?? []
    }

    const inflightRequest = inflightCommentsRequests.get(cacheKey)
    if (inflightRequest) {
      return inflightRequest
    }

    const request = (async () => {
      try {
        const requestContext = getGitHubWorkItemRequestContext(
          get(),
          requestSettings,
          repoId ?? repoPath,
          repoPath,
          options?.sourceContext
        )
        const comments =
          requestContext.target.kind === 'environment'
            ? await callRuntimeRpc<PRComment[]>(
                { kind: 'environment', environmentId: requestContext.target.environmentId },
                'github.prComments',
                {
                  repo: requestContext.target.runtimeRepoId,
                  prNumber,
                  prRepo: options?.prRepo ?? null,
                  noCache: options?.force
                },
                { timeoutMs: 30_000 }
              )
            : ((await window.api.gh.prComments({
                repoPath,
                repoId,
                prNumber,
                prRepo: options?.prRepo ?? null,
                noCache: options?.force
              })) as PRComment[])
        set((s) => ({
          commentsCache: withBoundedCacheEntry(s.commentsCache, cacheKey, {
            data: comments,
            fetchedAt: Date.now()
          })
        }))
        return comments
      } catch (err) {
        console.error('Failed to fetch PR comments:', err)
        return get().commentsCache[cacheKey]?.data ?? []
      } finally {
        inflightCommentsRequests.delete(cacheKey)
      }
    })()

    inflightCommentsRequests.set(cacheKey, request)
    return request
  },

  addPRConversationComment: async (repoPath, prNumber, body, options) => {
    const repo = get().repos?.find((candidate) =>
      options?.repoId ? candidate.id === options.repoId : candidate.path === repoPath
    )
    const repoId = options?.repoId ?? repo?.id
    const requestSettings = getGitHubRepoSourceSettings(
      get().settings,
      repo,
      options?.sourceContext
    )
    const cacheKey = sourceScopedRepoCacheKey(
      repoPath,
      repoId,
      prCommentsCacheSuffix(prNumber, options?.prRepo),
      requestSettings,
      repo?.connectionId,
      repo?.executionHostId,
      options?.sourceContext,
      repo !== undefined
    )
    const requestContext = getGitHubWorkItemRequestContext(
      get(),
      requestSettings,
      repoId ?? repoPath,
      repoPath,
      options?.sourceContext
    )
    let result: GitHubCommentResult
    try {
      result =
        requestContext.target.kind === 'environment'
          ? await callRuntimeRpc<GitHubCommentResult>(
              { kind: 'environment', environmentId: requestContext.target.environmentId },
              'github.addPRComment',
              {
                repo: requestContext.target.runtimeRepoId,
                number: prNumber,
                body,
                prRepo: options?.prRepo ?? null
              },
              { timeoutMs: 30_000 }
            )
          : await window.api.gh.addPRComment({
              repoPath,
              repoId,
              number: prNumber,
              body,
              prRepo: options?.prRepo ?? null
            })
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to post comment.'
      return { ok: false, error }
    }
    if (!hasUsableCommentPayload(result)) {
      return result.ok
        ? {
            ok: false,
            error: translate(
              'auto.store.slices.github.f129c42773',
              'GitHub did not return the new comment.'
            )
          }
        : result
    }
    set((s) => {
      const entry = s.commentsCache[cacheKey]
      return {
        commentsCache: withBoundedCacheEntry(s.commentsCache, cacheKey, {
          data: mergePRCommentIntoList(entry?.data, result.comment),
          fetchedAt: Date.now()
        })
      }
    })
    return result
  },

  addPRReviewCommentReply: async (repoPath, prNumber, commentId, body, options) => {
    const repo = get().repos?.find((candidate) =>
      options?.repoId ? candidate.id === options.repoId : candidate.path === repoPath
    )
    const repoId = options?.repoId ?? repo?.id
    const requestSettings = getGitHubRepoSourceSettings(
      get().settings,
      repo,
      options?.sourceContext
    )
    const cacheKey = sourceScopedRepoCacheKey(
      repoPath,
      repoId,
      prCommentsCacheSuffix(prNumber, options?.prRepo),
      requestSettings,
      repo?.connectionId,
      repo?.executionHostId,
      options?.sourceContext,
      repo !== undefined
    )
    const requestContext = getGitHubWorkItemRequestContext(
      get(),
      requestSettings,
      repoId ?? repoPath,
      repoPath,
      options?.sourceContext
    )
    let result: GitHubCommentResult
    try {
      result =
        requestContext.target.kind === 'environment'
          ? await callRuntimeRpc<GitHubCommentResult>(
              { kind: 'environment', environmentId: requestContext.target.environmentId },
              'github.addPRReviewCommentReply',
              {
                repo: requestContext.target.runtimeRepoId,
                prNumber,
                commentId,
                body,
                threadId: options?.threadId,
                path: options?.path,
                line: options?.line,
                prRepo: options?.prRepo ?? null
              },
              { timeoutMs: 30_000 }
            )
          : await window.api.gh.addPRReviewCommentReply({
              repoPath,
              repoId,
              prNumber,
              commentId,
              body,
              threadId: options?.threadId,
              path: options?.path,
              line: options?.line,
              prRepo: options?.prRepo ?? null
            })
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to post reply.'
      return { ok: false, error }
    }
    if (!hasUsableCommentPayload(result)) {
      return result.ok
        ? {
            ok: false,
            error: translate(
              'auto.store.slices.github.f129c42773',
              'GitHub did not return the new comment.'
            )
          }
        : result
    }
    const comment: PRComment = {
      ...result.comment,
      threadId: result.comment.threadId ?? options?.threadId,
      path: result.comment.path ?? options?.path,
      line: result.comment.line ?? options?.line
    }
    set((s) => {
      const entry = s.commentsCache[cacheKey]
      return {
        commentsCache: withBoundedCacheEntry(s.commentsCache, cacheKey, {
          data: mergePRCommentIntoList(entry?.data, comment),
          fetchedAt: Date.now()
        })
      }
    })
    return { ok: true, comment }
  },

  resolveReviewThread: async (repoPath, prNumber, threadId, resolve, options) => {
    const repo = get().repos?.find((candidate) =>
      options?.repoId ? candidate.id === options.repoId : candidate.path === repoPath
    )
    const repoId = options?.repoId ?? repo?.id
    const requestSettings = getGitHubRepoSourceSettings(
      get().settings,
      repo,
      options?.sourceContext
    )
    const cacheKey = sourceScopedRepoCacheKey(
      repoPath,
      repoId,
      prCommentsCacheSuffix(prNumber, options?.prRepo),
      requestSettings,
      repo?.connectionId,
      repo?.executionHostId,
      options?.sourceContext,
      repo !== undefined
    )

    // Optimistic update: toggle isResolved on all comments in this thread immediately
    // so the UI feels instant. Reverts if the API call fails.
    const prev = get().commentsCache[cacheKey]?.data
    if (prev) {
      set((s) => ({
        commentsCache: {
          ...s.commentsCache,
          [cacheKey]: {
            ...s.commentsCache[cacheKey],
            data: prev.map((c) => (c.threadId === threadId ? { ...c, isResolved: resolve } : c))
          }
        }
      }))
    }

    const requestContext = getGitHubWorkItemRequestContext(
      get(),
      requestSettings,
      repoId ?? repoPath,
      repoPath,
      options?.sourceContext
    )
    let ok = false
    try {
      ok =
        requestContext.target.kind === 'environment'
          ? await callRuntimeRpc<boolean>(
              { kind: 'environment', environmentId: requestContext.target.environmentId },
              'github.resolveReviewThread',
              { repo: requestContext.target.runtimeRepoId, threadId, resolve },
              { timeoutMs: 30_000 }
            )
          : await window.api.gh.resolveReviewThread({
              repoPath,
              repoId,
              threadId,
              resolve
            })
    } catch (err) {
      console.error('Failed to update review thread:', err)
      ok = false
    }
    if (!ok && prev) {
      // Revert optimistic update on failure
      set((s) => ({
        commentsCache: {
          ...s.commentsCache,
          [cacheKey]: { ...s.commentsCache[cacheKey], data: prev }
        }
      }))
    }
    return ok
  },

  enqueueGitHubPRRefresh: (worktreeId, reason, priority = 0) => {
    const state = get()
    const worktree = findWorktreeById(state, worktreeId)
    const candidate = worktree ? buildPRRefreshCandidate(state, worktree) : null
    if (!candidate) {
      return
    }
    if (getPRRefreshRuntimeRepoTarget(state, candidate)) {
      void get().fetchPRForBranch(candidate.repoPath, candidate.branch, {
        force: bypassesGitHubPRRefreshFreshness(reason),
        repoId: candidate.repoId,
        worktreeId: candidate.worktreeId,
        linkedPRNumber: candidate.linkedPRNumber ?? null,
        fallbackPRNumber: candidate.fallbackPRNumber ?? null,
        fallbackPRSource: candidate.fallbackPRSource ?? null
      })
      return
    }
    if (!shouldEnqueueLocalPRRefresh(candidate)) {
      return
    }
    enqueueLocalGitHubPRRefresh({ candidate, reason, priority }, async () => {
      await get().fetchPRForBranch(candidate.repoPath, candidate.branch, {
        force: bypassesGitHubPRRefreshFreshness(reason),
        repoId: candidate.repoId,
        worktreeId: candidate.worktreeId,
        linkedPRNumber: candidate.linkedPRNumber ?? null,
        fallbackPRNumber: candidate.fallbackPRNumber ?? null,
        fallbackPRSource: candidate.fallbackPRSource ?? null
      })
    })
  },

  reportVisibleGitHubPRRefreshCandidates: (worktreeIds, generation) => {
    const state = get()
    const candidates = worktreeIds
      .map((id) => {
        const worktree = findWorktreeById(state, id)
        return worktree ? buildPRRefreshCandidate(state, worktree) : null
      })
      .filter((candidate): candidate is GitHubPRRefreshCandidate => candidate !== null)
    const localCandidates: GitHubPRRefreshCandidate[] = []
    for (const candidate of candidates) {
      if (getPRRefreshRuntimeRepoTarget(state, candidate)) {
        void get().fetchPRForBranch(candidate.repoPath, candidate.branch, {
          repoId: candidate.repoId,
          worktreeId: candidate.worktreeId,
          linkedPRNumber: candidate.linkedPRNumber ?? null,
          fallbackPRNumber: candidate.fallbackPRNumber ?? null,
          fallbackPRSource: candidate.fallbackPRSource ?? null
        })
        continue
      }
      if (shouldEnqueueLocalPRRefresh(candidate)) {
        localCandidates.push(candidate)
      }
    }
    const reportVisible = window.api.gh.reportVisiblePRRefreshCandidates
    if (reportVisible) {
      void reportVisible({ candidates: localCandidates, generation }).catch((err) => {
        console.warn('Failed to report visible PR refresh candidates:', err)
      })
    }
  },

  bumpGitHubPRVisibleRefreshGeneration: () => {
    set((s) => ({ prVisibleRefreshGeneration: s.prVisibleRefreshGeneration + 1 }))
  },

  applyGitHubPRRefreshEvent: (event) => {
    // Why: the sidebar/left-list refresh for local repos flows through the main
    // PR coordinator (not fetchPRForBranch), so it must run the same guarded
    // clear when main stamps a merged linked PR whose head has diverged.
    const divergedLinkedPRClears: {
      worktreeId: string
      linkedPRNumber: number
      branch: string
      requestHeadOid: string | null
      executionHostId: string
    }[] = []
    const branchMismatchedLinkedPRClears: {
      worktreeId: string
      linkedPRNumber: number
      branch: string
      requestHeadOid: string | null
      executionHostId: string
    }[] = []
    let didUpdatePRCache = false
    set((s) => {
      let linkedWorktreeLookupIndex: WorktreeLookupIndex | undefined
      const nextSequences = { ...s.prRefreshSequences }
      const prunedStates = pruneExpiredPRRefreshStates(s.prRefreshStates)
      const nextStates = { ...prunedStates }
      let nextPRCache = s.prCache
      let nextHostedReviewCache = s.hostedReviewCache ?? {}
      let changed = prunedStates !== s.prRefreshStates

      for (const alias of event.aliases) {
        const aliasExecutionHostId = getRefreshAliasExecutionHostId(alias)
        const previousSequence = nextSequences[alias.cacheKey] ?? 0
        if (
          event.outcome ? event.sequence < previousSequence : event.sequence <= previousSequence
        ) {
          if (event.outcome || event.status !== 'in-flight') {
            deletePRRefreshStartedEntry(event.sequence, alias.cacheKey)
          }
          continue
        }
        // Why: delete-then-set moves this key to the end of insertion order so
        // capPrRefreshSequences evicts genuinely idle keys, not active ones.
        delete nextSequences[alias.cacheKey]
        nextSequences[alias.cacheKey] = event.sequence
        changed = true

        if (event.outcome) {
          const startedEntryKey = prRefreshStartedEntryKey(event.sequence, alias.cacheKey)
          const requestStartedEntry = prRefreshStartedHostedReviewEntries.get(startedEntryKey)
          prRefreshStartedHostedReviewEntries.delete(startedEntryKey)
          if (previousSequence !== event.sequence) {
            deletePRRefreshStartedEntry(previousSequence, alias.cacheKey)
          }
          delete nextStates[alias.cacheKey]
          if (event.outcome.kind === 'upstream-error') {
            nextStates[alias.cacheKey] = {
              status: 'error',
              reason: event.reason,
              updatedAt: Date.now(),
              message: event.outcome.message
            }
            continue
          }
          const data =
            event.outcome.kind === 'found'
              ? (() => {
                  const pr = event.outcome.pr
                  const checksCacheKeys = [
                    ...(alias.repoId
                      ? [
                          ...(pr.headSha
                            ? [
                                runtimeScopedRepoCacheKey(
                                  alias.repoPath,
                                  alias.repoId,
                                  prChecksCacheSuffix(pr.number, pr.prRepo, pr.headSha),
                                  s.settings,
                                  alias.connectionId,
                                  aliasExecutionHostId,
                                  true
                                )
                              ]
                            : []),
                          runtimeScopedRepoCacheKey(
                            alias.repoPath,
                            alias.repoId,
                            prChecksCacheSuffix(pr.number, pr.prRepo),
                            s.settings,
                            alias.connectionId,
                            aliasExecutionHostId,
                            true
                          )
                        ]
                      : []),
                    ...(pr.headSha
                      ? [
                          runtimeScopedRepoCacheKey(
                            alias.repoPath,
                            undefined,
                            prChecksCacheSuffix(pr.number, pr.prRepo, pr.headSha),
                            s.settings,
                            alias.connectionId,
                            aliasExecutionHostId,
                            true
                          )
                        ]
                      : []),
                    runtimeScopedRepoCacheKey(
                      alias.repoPath,
                      undefined,
                      prChecksCacheSuffix(pr.number, pr.prRepo),
                      s.settings,
                      alias.connectionId,
                      aliasExecutionHostId,
                      true
                    ),
                    `${alias.repoPath}::pr-checks::${pr.number}`
                  ]
                  const checksEntry = checksCacheKeys
                    .map((key) => s.checksCache[key])
                    .find((entry) => entry?.data)
                  if (
                    checksEntry?.data &&
                    checksEntry.headSha &&
                    pr.headSha &&
                    checksEntry.headSha === pr.headSha &&
                    event.outcome.fetchedAt - checksEntry.fetchedAt <
                      getPRChecksCacheTtl(checksEntry)
                  ) {
                    return { ...pr, checksStatus: deriveCheckStatusFromChecks(checksEntry.data) }
                  }
                  return pr
                })()
              : null
          const linkedPRNumber = alias.linkedPRNumber ?? null
          // Why: one coordinator outcome can fan out to many linked aliases.
          // Build one lazy index instead of rescanning all worktrees per alias.
          const worktreeLookupIndex =
            alias.worktreeId && linkedPRNumber != null
              ? (linkedWorktreeLookupIndex ??= buildWorktreeLookupIndex(s))
              : undefined
          // Why: queued local refreshes may finish after the user unlinks an
          // exact PR; those older results must not restore the manual-link UI.
          if (
            isStaleExactLinkedPRLookup(s, alias.worktreeId, linkedPRNumber, worktreeLookupIndex)
          ) {
            continue
          }
          if (event.outcome.kind === 'found' && alias.worktreeId) {
            const requestHeadOid = alias.currentHeadOid ?? null
            const worktree =
              linkedPRNumber != null
                ? findUniqueWorktreeById(
                    s,
                    alias.worktreeId,
                    aliasExecutionHostId,
                    worktreeLookupIndex
                  )
                : null
            // Why: only an event that won the sequence gate above owns metadata
            // side effects; rejected late outcomes must not unlink a newer PR.
            if (
              worktree &&
              linkedPRNumber != null &&
              shouldClearDivergedLinkedMergedPR({
                pr: event.outcome.pr,
                linkedPRNumber,
                requestHeadOid
              })
            ) {
              divergedLinkedPRClears.push({
                worktreeId: alias.worktreeId,
                linkedPRNumber,
                branch: alias.branch,
                requestHeadOid,
                executionHostId: aliasExecutionHostId
              })
            } else if (
              worktree &&
              linkedPRNumber != null &&
              shouldClearBranchMismatchedLinkedOpenPR({
                pr: event.outcome.pr,
                linkedPRNumber,
                branch: alias.branch,
                requestHeadOid,
                pushTargetBranch: worktree.pushTarget?.branchName ?? null
              })
            ) {
              branchMismatchedLinkedPRClears.push({
                worktreeId: alias.worktreeId,
                linkedPRNumber,
                branch: alias.branch,
                requestHeadOid,
                executionHostId: aliasExecutionHostId
              })
            }
          }
          const nextCaches = applyGitHubPRResultToCaches({
            prCache: nextPRCache,
            hostedReviewCache: nextHostedReviewCache,
            prCacheKey: alias.cacheKey,
            repoPath: alias.repoPath,
            branch: alias.branch,
            settings: s.settings,
            repoId: alias.repoId,
            connectionId: alias.connectionId,
            executionHostId: aliasExecutionHostId,
            hasRepoOwner: true,
            pr: data,
            fetchedAt: event.outcome.fetchedAt,
            state: s,
            worktreeId: alias.worktreeId,
            linkedPRNumber: alias.linkedPRNumber,
            fallbackPRNumber: alias.fallbackPRNumber,
            fallbackPRSource: alias.fallbackPRSource,
            requestStartedAt: event.requestStartedAt,
            requestStartedEntry
          })
          didUpdatePRCache = didUpdatePRCache || nextCaches.prCache !== nextPRCache
          nextPRCache = nextCaches.prCache
          nextHostedReviewCache = nextCaches.hostedReviewCache
          continue
        }

        if (event.status) {
          if (previousSequence !== event.sequence) {
            deletePRRefreshStartedEntry(previousSequence, alias.cacheKey)
          }
          if (event.status === 'in-flight' && event.requestStartedAt !== undefined) {
            const hostedReviewCacheKey = getHostedReviewCacheKey(
              alias.repoPath,
              alias.branch,
              s.settings,
              alias.repoId,
              alias.connectionId,
              aliasExecutionHostId,
              true
            )
            setPRRefreshStartedHostedReviewEntry(
              prRefreshStartedEntryKey(event.sequence, alias.cacheKey),
              s.hostedReviewCache[hostedReviewCacheKey]
            )
          } else {
            // Why: rate-limit pauses/skips can follow an in-flight broadcast
            // without an outcome; the cached request-start snapshot is no
            // longer live and would otherwise accumulate per refresh sequence.
            deletePRRefreshStartedEntry(event.sequence, alias.cacheKey)
          }
          // Why: delete-then-set moves this key to the end of insertion order so
          // capRecordByInsertionOrder evicts genuinely idle keys, not active ones.
          delete nextStates[alias.cacheKey]
          nextStates[alias.cacheKey] = {
            status: event.status,
            reason: event.reason,
            updatedAt: Date.now(),
            pausedUntil: event.pausedUntil
          }
        }
      }

      return changed
        ? {
            prRefreshSequences: capPrRefreshSequences(nextSequences),
            // Why: bound prRefreshStates too (same unbounded PR-cache-key space),
            // but with status-aware eviction so visible in-progress pills survive.
            prRefreshStates: capPrRefreshStates(nextStates),
            prCache: nextPRCache,
            hostedReviewCache: nextHostedReviewCache
          }
        : {}
    })
    if (didUpdatePRCache && event.outcome && event.outcome.kind !== 'upstream-error') {
      debouncedSaveCache(get())
    }
    for (const clear of divergedLinkedPRClears) {
      void get().updateWorktreeMeta(
        clear.worktreeId,
        { linkedPR: null },
        {
          shouldApply: () =>
            shouldApplyDivergedLinkedPRClear({
              worktree:
                findUniqueWorktreeById(get(), clear.worktreeId, clear.executionHostId) ?? undefined,
              linkedPRNumber: clear.linkedPRNumber,
              branch: clear.branch,
              requestHeadOid: clear.requestHeadOid
            })
        }
      )
    }
    for (const clear of branchMismatchedLinkedPRClears) {
      void get().updateWorktreeMeta(
        clear.worktreeId,
        { linkedPR: null },
        {
          shouldApply: () =>
            shouldApplyBranchMismatchedLinkedPRClear({
              worktree:
                findUniqueWorktreeById(get(), clear.worktreeId, clear.executionHostId) ?? undefined,
              linkedPRNumber: clear.linkedPRNumber,
              branch: clear.branch,
              requestHeadOid: clear.requestHeadOid
            })
        }
      )
    }
  },

  refreshAllGitHub: () => {
    set((state) => ({
      commentsCache: {},
      prCache: evictStaleEntries(state.prCache),
      checksCache: evictStaleEntries(state.checksCache),
      workItemsCache: evictStaleEntries(state.workItemsCache),
      prRefreshStates: pruneExpiredPRRefreshStates(state.prRefreshStates)
    }))

    const state = get()
    const now = Date.now()
    const stalePRCandidates: { candidate: GitHubPRRefreshCandidate; score: number }[] = []
    const cardProps = state.worktreeCardProperties ?? []
    const isPRStatusGrouping = state.groupBy === 'pr-status'
    const shouldRefreshPRs =
      isPRStatusGrouping || rightSidebarShowsPullRequestData(state) || cardProps.includes('status')

    for (const worktrees of Object.values(state.worktreesByRepo)) {
      for (const worktree of worktrees) {
        const repo = state.repos.find((candidate) => candidate.id === worktree.repoId)
        if (!repo) {
          continue
        }

        const branch = worktree.branch.replace(/^refs\/heads\//, '')
        if (!shouldRefreshPRs || worktree.isBare || !branch) {
          continue
        }

        const ownerSettings = settingsForGitHubRepoOwner(state.settings, repo)
        const cacheKey = prCacheKey(
          repo.path,
          repo.id,
          branch,
          ownerSettings,
          repo.connectionId,
          repo.executionHostId
        )
        const entry = state.prCache[cacheKey]
        if (!entry || now - entry.fetchedAt >= CACHE_TTL) {
          const candidate = buildPRRefreshCandidate(state, worktree)
          if (candidate) {
            stalePRCandidates.push({
              candidate,
              score:
                (state.activeWorktreeId === worktree.id ? Number.MAX_SAFE_INTEGER : 0) +
                worktree.lastActivityAt
            })
          }
        }
      }
    }

    for (const { candidate } of stalePRCandidates
      .sort((a, b) => b.score - a.score)
      .slice(0, isPRStatusGrouping ? stalePRCandidates.length : 5)) {
      const candidateSettings = settingsForGitHubRepoOwner(
        state.settings,
        candidate as Pick<Repo, 'connectionId' | 'executionHostId'>
      )
      if (getRuntimeRepoTarget(state, candidate.repoPath, candidateSettings)) {
        void get().fetchPRForBranch(candidate.repoPath, candidate.branch, {
          repoId: candidate.repoId,
          worktreeId: candidate.worktreeId,
          linkedPRNumber: candidate.linkedPRNumber ?? null,
          fallbackPRNumber: candidate.fallbackPRNumber ?? null,
          fallbackPRSource: candidate.fallbackPRSource ?? null
        })
      } else if (shouldEnqueueLocalPRRefresh(candidate)) {
        enqueueLocalGitHubPRRefresh({ candidate, reason: 'swr', priority: 10 })
      }
    }
  },

  refreshGitHubForWorktree: (worktreeId) => {
    const state = get()
    const worktree = Object.values(state.worktreesByRepo)
      .flat()
      .find((candidate) => candidate.id === worktreeId)
    if (!worktree) {
      return
    }

    const repo = state.repos.find((candidate) => candidate.id === worktree.repoId)
    if (!repo) {
      return
    }

    const branch = worktree.branch.replace(/^refs\/heads\//, '')
    const ownerSettings = settingsForGitHubRepoOwner(state.settings, repo)
    const cacheKey = prCacheKey(
      repo.path,
      repo.id,
      branch,
      ownerSettings,
      repo.connectionId,
      repo.executionHostId
    )
    set((current) =>
      current.prCache[cacheKey]
        ? {
            prCache: {
              ...current.prCache,
              [cacheKey]: { ...current.prCache[cacheKey], fetchedAt: 0 }
            }
          }
        : current
    )

    if (worktree.isBare || !branch) {
      return
    }
    const candidate = buildPRRefreshCandidate(get(), worktree)
    if (!candidate) {
      return
    }

    if (getPRRefreshRuntimeRepoTarget(get(), candidate)) {
      void get().fetchPRForBranch(candidate.repoPath, candidate.branch, {
        force: true,
        repoId: candidate.repoId,
        worktreeId: candidate.worktreeId,
        linkedPRNumber: candidate.linkedPRNumber ?? null,
        fallbackPRNumber: candidate.fallbackPRNumber ?? null,
        fallbackPRSource: candidate.fallbackPRSource ?? null
      })
    } else if (shouldEnqueueLocalPRRefresh(candidate)) {
      enqueueLocalGitHubPRRefresh({ candidate, reason: 'post-push', priority: 100 })
    }
  },

  evictGitHubRepoCaches: (repoId, repoPath) => {
    clearInflightWorkItemsForRepo(repoId, repoPath)
    set((state) => {
      const prefixes = repoCacheKeyPrefixes(repoId, repoPath)
      const workItems = evictRepoCacheEntries(state.workItemsCache, prefixes)
      const prs = evictRepoCacheEntries(state.prCache, prefixes)
      const checks = evictRepoCacheEntries(state.checksCache, prefixes)
      const comments = evictRepoCacheEntries(state.commentsCache, prefixes)
      const updates: Partial<AppState> = {}

      if (workItems.evicted) {
        updates.workItemsCache = workItems.cache
      }
      if (prs.evicted) {
        updates.prCache = prs.cache
      }
      if (checks.evicted) {
        updates.checksCache = checks.cache
      }
      if (comments.evicted) {
        updates.commentsCache = comments.cache
      }
      return updates
    })
  },

  // Why: activation is the strongest freshness signal; route it through the
  // coordinator so clicks revalidate PR state without bypassing coalescing.
  refreshGitHubForWorktreeIfStale: (worktreeId) => {
    const state = get()
    const worktree = Object.values(state.worktreesByRepo)
      .flat()
      .find((candidate) => candidate.id === worktreeId)
    if (!worktree) {
      return
    }

    const shouldRefreshPR =
      state.groupBy === 'pr-status' ||
      (state.worktreeCardProperties ?? []).includes('status') ||
      rightSidebarShowsPullRequestData(state)
    const branch = worktree.branch.replace(/^refs\/heads\//, '')
    if (!shouldRefreshPR || worktree.isBare || !branch) {
      return
    }

    const candidate = buildPRRefreshCandidate(state, worktree)
    if (!candidate) {
      return
    }

    if (getPRRefreshRuntimeRepoTarget(state, candidate)) {
      void get().fetchPRForBranch(candidate.repoPath, candidate.branch, {
        force: true,
        repoId: candidate.repoId,
        worktreeId: candidate.worktreeId,
        linkedPRNumber: candidate.linkedPRNumber ?? null,
        fallbackPRNumber: candidate.fallbackPRNumber ?? null,
        fallbackPRSource: candidate.fallbackPRSource ?? null
      })
    } else if (shouldEnqueueLocalPRRefresh(candidate)) {
      enqueueLocalGitHubPRRefresh({ candidate, reason: 'active', priority: 80 })
    }
  }
})
