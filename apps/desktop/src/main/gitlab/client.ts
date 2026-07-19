/* eslint-disable max-lines -- Why: parallel to src/main/github/client.ts —
co-locating GitLab merge-request operations keeps concurrency and error handling consistent. */
import type {
  GitLabAssignableUser,
  GitLabAuthDiagnostic,
  GitLabDiscussionResolveResult,
  GitLabJobTraceResult,
  GitLabPipelineJob,
  GitLabRateLimitSnapshot,
  GitLabMRInlineCommentInput,
  GitLabMRReviewersUpdateResult,
  GitLabRetryJobResult,
  GitLabViewer,
  GitLabWorkItem,
  GetGitLabRateLimitResult,
  ForgeRemotePreference,
  ListMergeRequestsResult,
  MRComment,
  MRInfo,
  MRListState
} from '../../shared/types'
import { extractExecError } from '../git/runner'
import {
  hasHostedReviewLocalGitOptions,
  getHostedReviewLocalGitOptions,
  type HostedReviewExecutionOptions
} from '../source-control/hosted-review-git-options'
import type { HostedReviewLookupOptions } from '../source-control/hosted-review-lookup-options'
import {
  acquire,
  classifyGlabError,
  classifyListError,
  getGlabKnownHosts,
  getProjectRef,
  getProjectRefForRemote,
  glabHostnameArgs,
  glabRepoExecOptions,
  glabApiWithHeaders,
  glabExecFileAsync,
  parseGlabAuthStatusHosts,
  release,
  resolveProjectRemote,
  type LocalGitExecOptions,
  type ProjectRef
} from './gl-utils'
import { derivePipelineStatus, mapMRInfo, mapMRToWorkItem } from './mappers'

// Why: glab REST API addresses projects by URL-encoded path. Centralized
// so call sites don't forget the slash escapes for nested groups.
function encodedProject(projectPath: string): string {
  return encodeURIComponent(projectPath)
}

const GITLAB_RATE_LIMIT_CACHE_TTL_MS = 30_000
const GITLAB_RATE_LIMIT_CACHE_MAX_ENTRIES = 64
const GITLAB_BRANCH_LOOKUP_TIMEOUT_MS = 10_000
const gitLabRateLimitCache = new Map<string, GitLabRateLimitSnapshot>()

type HostedReviewLocalGitOptions = ReturnType<typeof getHostedReviewLocalGitOptions>

function hostedReviewLocalGitOptionArgs(
  options: HostedReviewExecutionOptions = {}
): [] | [HostedReviewLocalGitOptions] {
  return hasHostedReviewLocalGitOptions(options) ? [getHostedReviewLocalGitOptions(options)] : []
}

/**
 * Get the authenticated GitLab viewer. Mirrors getAuthenticatedViewer
 * from the GitHub client — returns null when glab is unavailable, the
 * user is unauthenticated, or the lookup fails.
 */
export async function getAuthenticatedViewer(): Promise<GitLabViewer | null> {
  await acquire()
  try {
    const { stdout } = await glabExecFileAsync(['api', 'user'])
    const viewer = JSON.parse(stdout) as { username?: string; email?: string | null }
    if (!viewer.username?.trim()) {
      return null
    }
    return {
      username: viewer.username.trim(),
      email: viewer.email?.trim() || null
    }
  } catch {
    return null
  } finally {
    release()
  }
}

export async function diagnoseAuth(): Promise<GitLabAuthDiagnostic> {
  const envTokenInProcess = process.env.GITLAB_TOKEN
    ? 'GITLAB_TOKEN'
    : process.env.GLAB_TOKEN
      ? 'GLAB_TOKEN'
      : null
  try {
    // Why: a host-global diagnostic must not wake an unrelated default WSL distro.
    const { stdout, stderr } = await glabExecFileAsync(['auth', 'status'], {
      allowDefaultWslFallback: false
    })
    const output = `${stdout}\n${stderr}`
    const hosts = parseGlabAuthStatusHosts(output)
    return {
      glabAvailable: true,
      authenticated:
        /logged in|authenticated|token/i.test(output) && !/not logged in/i.test(output),
      hosts,
      activeHost: hosts[0] ?? null,
      envTokenInProcess,
      error: null
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      glabAvailable: !/ENOENT|not found|spawn/i.test(message),
      authenticated: false,
      hosts: [],
      activeHost: null,
      envTokenInProcess,
      error: message
    }
  }
}

function parseRateLimitHeader(
  headers: Record<string, string>,
  keys: readonly string[]
): number | null {
  for (const key of keys) {
    const parsed = Number.parseInt(headers[key], 10)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return null
}

function parseRateLimitResetAt(headers: Record<string, string>): number | null {
  const numeric = parseRateLimitHeader(headers, ['ratelimit-reset', 'x-ratelimit-reset'])
  if (numeric !== null) {
    return numeric
  }
  const resetTime = headers['ratelimit-resettime'] ?? headers['x-ratelimit-resettime']
  if (!resetTime) {
    return null
  }
  const millis = Date.parse(resetTime)
  return Number.isFinite(millis) ? Math.floor(millis / 1000) : null
}

function parseGitLabRateLimitSnapshot(
  headers: Record<string, string>,
  host: string | null
): GitLabRateLimitSnapshot {
  const limit = parseRateLimitHeader(headers, ['ratelimit-limit', 'x-ratelimit-limit'])
  const remaining = parseRateLimitHeader(headers, ['ratelimit-remaining', 'x-ratelimit-remaining'])
  const resetAt = parseRateLimitResetAt(headers)
  return {
    host,
    fetchedAt: Date.now(),
    rest:
      limit === null && remaining === null && resetAt === null
        ? null
        : {
            limit: limit ?? 0,
            remaining: remaining ?? 0,
            resetAt
          }
  }
}

function pruneGitLabRateLimitCache(now = Date.now()): void {
  for (const [cacheKey, snapshot] of gitLabRateLimitCache) {
    if (now - snapshot.fetchedAt >= GITLAB_RATE_LIMIT_CACHE_TTL_MS) {
      gitLabRateLimitCache.delete(cacheKey)
    }
  }
  while (gitLabRateLimitCache.size > GITLAB_RATE_LIMIT_CACHE_MAX_ENTRIES) {
    const oldestKey = gitLabRateLimitCache.keys().next().value
    if (oldestKey === undefined) {
      break
    }
    gitLabRateLimitCache.delete(oldestKey)
  }
}

function rememberGitLabRateLimitSnapshot(
  cacheKey: string,
  snapshot: GitLabRateLimitSnapshot
): void {
  pruneGitLabRateLimitCache()
  // Why: self-managed GitLab hostnames come from repo config; keep this
  // process cache bounded even across many transient hosts.
  gitLabRateLimitCache.delete(cacheKey)
  gitLabRateLimitCache.set(cacheKey, snapshot)
  pruneGitLabRateLimitCache()
}

export async function getRateLimit(options?: {
  force?: boolean
  host?: string | null
}): Promise<GetGitLabRateLimitResult> {
  const host = options?.host?.trim() || null
  const cacheKey = host ?? 'default'
  pruneGitLabRateLimitCache()
  const cached = gitLabRateLimitCache.get(cacheKey)
  if (!options?.force && cached && Date.now() - cached.fetchedAt < GITLAB_RATE_LIMIT_CACHE_TTL_MS) {
    return { ok: true, snapshot: cached }
  }

  await acquire()
  try {
    // Why: GitLab.com and self-managed GitLab instances expose REST budget
    // headers inconsistently. Query a cheap authenticated endpoint and report
    // the headers when present; a null bucket means this host omitted them.
    const args = host ? ['--hostname', host, 'user'] : ['user']
    const { headers } = await glabApiWithHeaders(args)
    const snapshot = parseGitLabRateLimitSnapshot(headers, host)
    rememberGitLabRateLimitSnapshot(cacheKey, snapshot)
    return { ok: true, snapshot }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  } finally {
    release()
  }
}

/**
 * Resolve a project's full GitLab project ref (host + path). Mirrors
 * github/getRepoSlug. Returns null for non-GitLab remotes.
 */
export async function getProjectSlug(
  repoPath: string,
  connectionId?: string | null,
  options: HostedReviewExecutionOptions = {}
): Promise<ProjectRef | null> {
  const knownHosts = options.signal
    ? await getGlabKnownHosts(connectionId, { signal: options.signal })
    : await getGlabKnownHosts(connectionId)
  return getProjectRef(
    repoPath,
    knownHosts,
    connectionId,
    ...hostedReviewLocalGitOptionArgs(options)
  )
}

/**
 * Fetch a single merge request with the pipeline status rolled up.
 * Returns null when the MR doesn't exist or glab fails — callers
 * decide whether to surface "not found" UI.
 */
export async function getMergeRequest(
  repoPath: string,
  iid: number,
  connectionId?: string | null,
  options: HostedReviewExecutionOptions = {}
): Promise<MRInfo | null> {
  const knownHosts = await getGlabKnownHosts(connectionId)
  const localGitArgs = hostedReviewLocalGitOptionArgs(options)
  const localGitOptions = localGitArgs[0] ?? {}
  const projectRef = await getProjectRef(repoPath, knownHosts, connectionId, ...localGitArgs)
  await acquire()
  try {
    const args = projectRef
      ? [
          'api',
          ...glabHostnameArgs(projectRef, connectionId),
          `projects/${encodedProject(projectRef.path)}/merge_requests/${iid}`
        ]
      : ['mr', 'view', String(iid), '--output', 'json']
    const { stdout } = await glabExecFileAsync(
      args,
      glabRepoExecOptions(repoPath, connectionId, localGitOptions)
    )
    const data = JSON.parse(stdout) as Parameters<typeof mapMRInfo>[0] & {
      head_pipeline?: { status?: string } | null
      pipeline?: { status?: string } | null
    }
    // Why: GitLab's MR detail surfaces the head pipeline directly.
    // Older instances expose `pipeline` instead of `head_pipeline` — try
    // both. If neither is set the rollup falls back to neutral.
    const pipelineStatus = derivePipelineStatus(data.head_pipeline ?? data.pipeline ?? null)
    return mapMRInfo(data, pipelineStatus)
  } catch {
    return null
  } finally {
    release()
  }
}

/**
 * Find the merge request whose source branch matches the given branch
 * name. Mirrors github/getPRForBranch — returns the most recently
 * updated MR for the branch, or null when none exists. The branch is the
 * local checkout's current ref (Yiru strips refs/heads/ prefix upstream
 * so we don't need to here).
 */
export async function getMergeRequestForBranch(
  repoPath: string,
  branch: string,
  linkedMRIid?: number | null,
  connectionId?: string | null,
  options: HostedReviewLookupOptions = {}
): Promise<MRInfo | null> {
  const branchName = branch.replace(/^refs\/heads\//, '')
  if (!branchName && linkedMRIid == null) {
    return null
  }
  options.signal?.throwIfAborted()
  const knownHosts = options.signal
    ? await getGlabKnownHosts(connectionId, { signal: options.signal })
    : await getGlabKnownHosts(connectionId)
  const localGitArgs = hostedReviewLocalGitOptionArgs(options)
  const localGitOptions = localGitArgs[0] ?? {}
  const projectRef = await getProjectRef(repoPath, knownHosts, connectionId, ...localGitArgs)
  options.signal?.throwIfAborted()
  if (!projectRef) {
    if (options.throwOnProviderError) {
      throw new Error('GitLab project lookup became unavailable.')
    }
    return null
  }
  // Why: the GitLab client has only four shared CLI lanes; one stalled branch
  // lookup must release its lane even when glab's own network timeout does not.
  const timeoutSignal = AbortSignal.timeout(GITLAB_BRANCH_LOOKUP_TIMEOUT_MS)
  const lookupSignal = options.signal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : timeoutSignal
  await acquire(lookupSignal)
  let exactLinkedLookup = false
  const lookupExecOptions = {
    ...glabRepoExecOptions(repoPath, connectionId, localGitOptions),
    signal: lookupSignal
  }
  try {
    if (branchName) {
      const { stdout } = await glabExecFileAsync(
        [
          'api',
          ...glabHostnameArgs(projectRef, connectionId),
          `projects/${encodedProject(projectRef.path)}/merge_requests?source_branch=${encodeURIComponent(branchName)}&order_by=updated_at&sort=desc&per_page=1`
        ],
        lookupExecOptions
      )
      const data = JSON.parse(stdout) as (Parameters<typeof mapMRInfo>[0] & {
        head_pipeline?: { status?: string } | null
        pipeline?: { status?: string } | null
      })[]
      if (Array.isArray(data) && data.length > 0) {
        const raw = data[0]
        // Why: older GitLab list payloads expose `pipeline` instead of
        // `head_pipeline`, matching the detail endpoint compatibility path.
        const pipelineStatus = derivePipelineStatus(raw.head_pipeline ?? raw.pipeline ?? null)
        return mapMRInfo(raw, pipelineStatus)
      }
    }
    if (typeof linkedMRIid !== 'number') {
      return null
    }
    // Why: create-from-MR worktrees may use a fresh local branch name rather
    // than the MR source branch. Fall back to the durable linked iid so the
    // core review status still follows the workspace.
    exactLinkedLookup = true
    const { stdout } = await glabExecFileAsync(
      [
        'api',
        ...glabHostnameArgs(projectRef, connectionId),
        `projects/${encodedProject(projectRef.path)}/merge_requests/${linkedMRIid}`
      ],
      lookupExecOptions
    )
    const raw = JSON.parse(stdout) as Parameters<typeof mapMRInfo>[0] & {
      head_pipeline?: { status?: string } | null
      pipeline?: { status?: string } | null
    }
    const pipelineStatus = derivePipelineStatus(raw.head_pipeline ?? raw.pipeline ?? null)
    return mapMRInfo(raw, pipelineStatus)
  } catch (error) {
    // Why: a linked exact-id 404 is a stale link; branch-list failures remain unavailable.
    if (options.throwOnProviderError && !(exactLinkedLookup && isGitLabNotFoundError(error))) {
      throw error
    }
    return null
  } finally {
    release()
  }
}

function isGitLabNotFoundError(error: unknown): boolean {
  const output = extractExecError(error)
  return classifyGlabError(`${output.stderr}\n${output.stdout}`).type === 'not_found'
}

function mrListStateFlags(state: MRListState): string[] {
  switch (state) {
    case 'opened':
      return []
    case 'merged':
      return ['--merged']
    case 'closed':
      return ['--closed']
    case 'all':
      return ['--all']
  }
}

/**
 * List merge requests for a project. Uses glab CLI pagination because
 * it handles self-hosted auth and project selection consistently.
 */
export async function listMergeRequests(
  repoPath: string,
  state: MRListState = 'opened',
  page = 1,
  perPage = 20,
  preference?: ForgeRemotePreference,
  query?: string,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<ListMergeRequestsResult> {
  const knownHosts = await getGlabKnownHosts(connectionId)
  // Why: MRs sit on `origin` in the fork model (the user's fork is where
  // they push branches and submit MRs). Mirror github's `getOwnerRepo`
  // call site by going through the upstream/origin preference resolver
  // so cross-fork workflows reuse the same plumbing.
  const { source: projectRef } = await resolveProjectRemote(
    repoPath,
    preference,
    knownHosts,
    connectionId,
    localGitOptions
  )
  if (!projectRef) {
    if (connectionId) {
      // Why: SSH-backed repos have no local cwd for glab to infer from.
      // Running cwd-less could resolve an unrelated local project instead.
      return {
        items: [],
        page,
        perPage,
        totalCount: 0,
        totalPages: 0,
        error: {
          type: 'not_found',
          message: 'No GitLab project found for this repository.'
        }
      }
    }
    // Why: fallback — let glab infer the project from cwd when remote parsing fails.
    // Used when the repo's remote host is not in getGlabKnownHosts(connectionId)
    // (e.g. a fresh self-hosted instance), but glab itself can still
    // resolve it from the local git config.
    const stateFlag = mrListStateFlags(state)
    // Why: the cwd-inferred fallback must honor the same search the API path
    // does, otherwise typing a query against a self-hosted / unresolved-projectRef
    // repo silently returns the unfiltered list (the original #6263 symptom).
    const searchFlag = query?.trim() ? ['--search', query.trim()] : []
    await acquire()
    try {
      const { stdout } = await glabExecFileAsync(
        [
          'mr',
          'list',
          '--output',
          'json',
          '--per-page',
          String(perPage),
          '--page',
          String(page),
          '--order',
          'updated_at',
          '--sort',
          'desc',
          ...stateFlag,
          ...searchFlag
        ],
        glabRepoExecOptions(repoPath, connectionId, localGitOptions)
      )
      const data = JSON.parse(stdout) as Parameters<typeof mapMRToWorkItem>[0][]
      return {
        items: data.map((d) => mapMRToWorkItem(d, 'unknown')),
        page,
        perPage,
        // Why: the CLI doesn't return x-total headers, so totals are
        // approximate. For the merge-request picker this is acceptable.
        totalCount: data.length,
        totalPages: data.length < perPage ? page : page + 1
      }
    } catch (err) {
      const stderr = err instanceof Error ? err.message : String(err)
      return {
        items: [],
        page,
        perPage,
        totalCount: 0,
        totalPages: 0,
        error: classifyListError(stderr)
      }
    } finally {
      release()
    }
  }
  // Why: 'all' is exposed as the picker filter but GitLab's API expects
  // no state param to mean "any state". Drop the param when 'all'.
  const stateParam = state === 'all' ? '' : `&state=${state}`
  const searchParam = query?.trim() ? `&search=${encodeURIComponent(query.trim())}` : ''
  const path =
    `projects/${encodedProject(projectRef.path)}/merge_requests?` +
    `page=${page}&per_page=${perPage}&order_by=updated_at&sort=desc&with_merge_status_recheck=false${stateParam}${searchParam}`
  const repoId = projectRef.path

  await acquire()
  try {
    const { body, headers } = await glabApiWithHeaders(
      [...glabHostnameArgs(projectRef, connectionId), path],
      glabRepoExecOptions(repoPath, connectionId, localGitOptions)
    )
    const data = JSON.parse(body) as Parameters<typeof mapMRToWorkItem>[0][]
    return {
      items: data.map((d) => mapMRToWorkItem(d, repoId, projectRef)),
      page,
      perPage,
      totalCount: parseHeaderInt(headers['x-total'], 0),
      // Why: when 'all' state is requested or the per_page is large,
      // GitLab may not include x-total-pages; fall back to ceil(total/perPage).
      totalPages:
        parseHeaderInt(headers['x-total-pages'], 0) ||
        Math.max(1, Math.ceil(parseHeaderInt(headers['x-total'], 0) / perPage))
    }
  } catch (err) {
    const stderr = err instanceof Error ? err.message : String(err)
    return {
      items: [],
      page,
      perPage,
      totalCount: 0,
      totalPages: 0,
      error: classifyListError(stderr)
    }
  } finally {
    release()
  }
}

function parseHeaderInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback
  }
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * Fetch a merge request given an explicit project ref +
 * iid + type. Mirrors github/getWorkItemByOwnerRepo — used by the
 * paste-URL flow in the picker where the URL determines the project
 * directly rather than going through the local repo's remotes.
 */
export async function getWorkItemByProjectRef(
  repoPath: string,
  projectRef: ProjectRef,
  iid: number,
  _type: 'mr',
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GitLabWorkItem | null> {
  await acquire()
  try {
    const resource = 'merge_requests'
    const { stdout } = await glabExecFileAsync(
      [
        'api',
        // Why: pasted GitLab URLs carry an explicit host; preserve it even for
        // local/runtime-local repos so cwd remotes cannot redirect the lookup.
        ...(projectRef.host ? ['--hostname', projectRef.host] : []),
        `projects/${encodedProject(projectRef.path)}/${resource}/${iid}`
      ],
      glabRepoExecOptions(repoPath, connectionId, localGitOptions)
    )
    const data = JSON.parse(stdout)
    return mapMRToWorkItem(data, projectRef.path, projectRef)
  } catch {
    return null
  } finally {
    release()
  }
}

// ── MR mutations ──────────────────────────────────────────────────
// Why: mirror the GitHub-side review actions for the GitLab dialog footer. All take a
// repoPath + iid and resolve the project ref via the existing helper.

async function withProjectRef<T>(
  repoPath: string,
  preference: ForgeRemotePreference | undefined,
  connectionId: string | null | undefined,
  explicitProjectRef: ProjectRef | null | undefined,
  fn: (projectRef: ProjectRef, repoFlag: string) => Promise<T>,
  fallback: T,
  localGitOptions: LocalGitExecOptions = {}
): Promise<T> {
  const projectRef =
    explicitProjectRef ??
    (
      await resolveProjectRemote(
        repoPath,
        preference,
        await getGlabKnownHosts(connectionId),
        connectionId,
        localGitOptions
      )
    ).source
  if (!projectRef) {
    return fallback
  }
  return fn(projectRef, projectRef.path)
}

export async function closeMR(
  repoPath: string,
  iid: number,
  preference?: ForgeRemotePreference,
  connectionId?: string | null,
  projectRef?: ProjectRef | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<{ ok: true } | { ok: false; error: string }> {
  return withProjectRef<{ ok: true } | { ok: false; error: string }>(
    repoPath,
    preference,
    connectionId,
    projectRef,
    async (projectRef, repoFlag) => {
      await acquire()
      try {
        await glabExecFileAsync(
          [
            'mr',
            'close',
            String(iid),
            '-R',
            repoFlag,
            ...glabHostnameArgs(projectRef, connectionId)
          ],
          glabRepoExecOptions(repoPath, connectionId, localGitOptions)
        )
        return { ok: true }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        // Why: glab returns a non-zero exit when the MR is already
        // closed — treat that as success since the desired state is
        // reached.
        if (msg.toLowerCase().includes('already')) {
          return { ok: true }
        }
        return { ok: false, error: msg }
      } finally {
        release()
      }
    },
    { ok: false, error: 'Could not resolve GitLab project for this repository' },
    localGitOptions
  )
}

export async function reopenMR(
  repoPath: string,
  iid: number,
  preference?: ForgeRemotePreference,
  connectionId?: string | null,
  projectRef?: ProjectRef | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<{ ok: true } | { ok: false; error: string }> {
  return withProjectRef<{ ok: true } | { ok: false; error: string }>(
    repoPath,
    preference,
    connectionId,
    projectRef,
    async (projectRef, repoFlag) => {
      await acquire()
      try {
        await glabExecFileAsync(
          [
            'mr',
            'reopen',
            String(iid),
            '-R',
            repoFlag,
            ...glabHostnameArgs(projectRef, connectionId)
          ],
          glabRepoExecOptions(repoPath, connectionId, localGitOptions)
        )
        return { ok: true }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.toLowerCase().includes('already')) {
          return { ok: true }
        }
        return { ok: false, error: msg }
      } finally {
        release()
      }
    },
    { ok: false, error: 'Could not resolve GitLab project for this repository' },
    localGitOptions
  )
}

export async function mergeMR(
  repoPath: string,
  iid: number,
  method: 'merge' | 'squash' | 'rebase' = 'merge',
  preference?: ForgeRemotePreference,
  connectionId?: string | null,
  projectRef?: ProjectRef | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<{ ok: true } | { ok: false; error: string }> {
  return withProjectRef<{ ok: true } | { ok: false; error: string }>(
    repoPath,
    preference,
    connectionId,
    projectRef,
    async (projectRef, repoFlag) => {
      await acquire()
      try {
        // Why: glab mr merge accepts --squash and --rebase flags;
        // omitting both does a regular merge commit. Map our union
        // to the right glab flag.
        const methodFlag =
          method === 'squash' ? ['--squash'] : method === 'rebase' ? ['--rebase'] : []
        await glabExecFileAsync(
          [
            'mr',
            'merge',
            String(iid),
            '-R',
            repoFlag,
            '--yes',
            ...methodFlag,
            ...glabHostnameArgs(projectRef, connectionId)
          ],
          glabRepoExecOptions(repoPath, connectionId, localGitOptions)
        )
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      } finally {
        release()
      }
    },
    { ok: false, error: 'Could not resolve GitLab project for this repository' },
    localGitOptions
  )
}

export async function addMRComment(
  repoPath: string,
  iid: number,
  body: string,
  preference?: ForgeRemotePreference,
  connectionId?: string | null,
  projectRef?: ProjectRef | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<{ ok: true; comment: MRComment } | { ok: false; error: string }> {
  return withProjectRef<{ ok: true; comment: MRComment } | { ok: false; error: string }>(
    repoPath,
    preference,
    connectionId,
    projectRef,
    async (projectRef) => {
      await acquire()
      try {
        const { stdout } = await glabExecFileAsync(
          [
            'api',
            ...glabHostnameArgs(projectRef, connectionId),
            '-X',
            'POST',
            `projects/${encodedProject(projectRef.path)}/merge_requests/${iid}/notes`,
            '-f',
            `body=${body}`
          ],
          glabRepoExecOptions(repoPath, connectionId, localGitOptions)
        )
        const data = JSON.parse(stdout) as {
          id?: number
          author?: { username?: string; avatar_url?: string; state?: string } | null
          body?: string
          created_at?: string
        }
        return {
          ok: true,
          comment: {
            id: data.id ?? Date.now(),
            author: data.author?.username ?? 'You',
            authorAvatarUrl: data.author?.avatar_url ?? '',
            body: data.body ?? body,
            createdAt: data.created_at ?? new Date().toISOString(),
            url: '',
            isBot: data.author?.state === 'bot'
          }
        }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      } finally {
        release()
      }
    },
    { ok: false, error: 'Could not resolve GitLab project for this repository' },
    localGitOptions
  )
}

export async function addMRInlineComment(
  repoPath: string,
  iid: number,
  input: GitLabMRInlineCommentInput,
  preference?: ForgeRemotePreference,
  connectionId?: string | null,
  projectRef?: ProjectRef | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<{ ok: true; comment: MRComment } | { ok: false; error: string }> {
  return withProjectRef<{ ok: true; comment: MRComment } | { ok: false; error: string }>(
    repoPath,
    preference,
    connectionId,
    projectRef,
    async (projectRef) => {
      const body = input.body.trim()
      if (!body) {
        return { ok: false, error: 'Comment body is required' }
      }
      await acquire()
      try {
        const oldPath = input.oldPath ?? input.path
        const { stdout } = await glabExecFileAsync(
          [
            'api',
            ...glabHostnameArgs(projectRef, connectionId),
            '-X',
            'POST',
            `projects/${encodedProject(projectRef.path)}/merge_requests/${iid}/discussions`,
            '-f',
            `body=${body}`,
            '-f',
            'position[position_type]=text',
            '-f',
            `position[base_sha]=${input.baseSha}`,
            '-f',
            `position[start_sha]=${input.startSha}`,
            '-f',
            `position[head_sha]=${input.headSha}`,
            '-f',
            `position[old_path]=${oldPath}`,
            '-f',
            `position[new_path]=${input.path}`,
            '-f',
            `position[new_line]=${input.line}`
          ],
          glabRepoExecOptions(repoPath, connectionId, localGitOptions)
        )
        const data = JSON.parse(stdout) as {
          id?: string
          notes?: {
            id?: number
            author?: { username?: string; avatar_url?: string; state?: string } | null
            body?: string
            created_at?: string
            position?: { new_path?: string; new_line?: number } | null
          }[]
        }
        const note = data.notes?.[0]
        return {
          ok: true,
          comment: {
            id: note?.id ?? Date.now(),
            author: note?.author?.username ?? 'You',
            authorAvatarUrl: note?.author?.avatar_url ?? '',
            body: note?.body ?? body,
            createdAt: note?.created_at ?? new Date().toISOString(),
            url: '',
            threadId: data.id,
            isResolved: false,
            isBot: note?.author?.state === 'bot',
            path: note?.position?.new_path ?? input.path,
            line: note?.position?.new_line ?? input.line
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { ok: false, error: classifyGlabError(msg).message }
      } finally {
        release()
      }
    },
    { ok: false, error: 'Could not resolve GitLab project for this repository' },
    localGitOptions
  )
}

export async function resolveMRDiscussion(
  repoPath: string,
  iid: number,
  discussionId: string,
  resolved: boolean,
  preference?: ForgeRemotePreference,
  connectionId?: string | null,
  projectRef?: ProjectRef | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GitLabDiscussionResolveResult> {
  return withProjectRef<GitLabDiscussionResolveResult>(
    repoPath,
    preference,
    connectionId,
    projectRef,
    async (projectRef) => {
      const trimmedDiscussionId = discussionId.trim()
      if (!trimmedDiscussionId) {
        return { ok: false, error: 'Discussion id is required' }
      }
      await acquire()
      try {
        // Why: GitLab resolves/reopens the whole discussion thread, not a single
        // note; this mirrors GitHub's thread-level resolve mutation.
        await glabExecFileAsync(
          [
            'api',
            ...glabHostnameArgs(projectRef, connectionId),
            '-X',
            'PUT',
            `projects/${encodedProject(projectRef.path)}/merge_requests/${iid}/discussions/${encodeURIComponent(trimmedDiscussionId)}`,
            '-f',
            `resolved=${resolved ? 'true' : 'false'}`
          ],
          glabRepoExecOptions(repoPath, connectionId, localGitOptions)
        )
        return { ok: true }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { ok: false, error: classifyGlabError(msg).message }
      } finally {
        release()
      }
    },
    { ok: false, error: 'Could not resolve GitLab project for this repository' },
    localGitOptions
  )
}

function mapRetriedPipelineJob(
  data: {
    id?: number
    pipeline?: { id?: number | null } | null
    name?: string
    stage?: string
    status?: string
    web_url?: string
    duration?: number | null
  },
  fallbackJobId: number
): GitLabPipelineJob {
  return {
    id: data.id ?? fallbackJobId,
    ...(typeof data.pipeline?.id === 'number' ? { pipelineId: data.pipeline.id } : {}),
    name: data.name ?? '',
    stage: data.stage ?? '',
    status: data.status ?? '',
    webUrl: data.web_url ?? '',
    duration: typeof data.duration === 'number' ? data.duration : null
  }
}

function mapGitLabReviewer(raw: {
  id?: number
  username?: string | null
  name?: string | null
  avatar_url?: string | null
  state?: string | null
}): GitLabAssignableUser | null {
  if (!raw.username) {
    return null
  }
  return {
    ...(typeof raw.id === 'number' ? { id: raw.id } : {}),
    username: raw.username,
    name: raw.name ?? null,
    avatarUrl: raw.avatar_url ?? '',
    ...(raw.state !== undefined ? { state: raw.state } : {})
  }
}

export async function updateMRReviewers(
  repoPath: string,
  iid: number,
  reviewerIds: number[],
  preference?: ForgeRemotePreference,
  connectionId?: string | null,
  projectRef?: ProjectRef | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GitLabMRReviewersUpdateResult> {
  return withProjectRef<GitLabMRReviewersUpdateResult>(
    repoPath,
    preference,
    connectionId,
    projectRef,
    async (projectRef) => {
      await acquire()
      try {
        const fields =
          reviewerIds.length > 0
            ? reviewerIds.flatMap((id) => ['-f', `reviewer_ids[]=${id}`])
            : ['-f', 'reviewer_ids=']
        const { stdout } = await glabExecFileAsync(
          [
            'api',
            ...glabHostnameArgs(projectRef, connectionId),
            '-X',
            'PUT',
            `projects/${encodedProject(projectRef.path)}/merge_requests/${iid}`,
            ...fields
          ],
          glabRepoExecOptions(repoPath, connectionId, localGitOptions)
        )
        const data = JSON.parse(stdout) as { reviewers?: Parameters<typeof mapGitLabReviewer>[0][] }
        return {
          ok: true,
          reviewers: (data.reviewers ?? [])
            .map(mapGitLabReviewer)
            .filter((u): u is GitLabAssignableUser => !!u)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { ok: false, error: classifyGlabError(msg).message }
      } finally {
        release()
      }
    },
    { ok: false, error: 'Could not resolve GitLab project for this repository' },
    localGitOptions
  )
}

export async function getJobTrace(
  repoPath: string,
  jobId: number,
  preference?: ForgeRemotePreference,
  connectionId?: string | null,
  projectRef?: ProjectRef | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GitLabJobTraceResult> {
  return withProjectRef<GitLabJobTraceResult>(
    repoPath,
    preference,
    connectionId,
    projectRef,
    async (projectRef) => {
      await acquire()
      try {
        const { stdout } = await glabExecFileAsync(
          [
            'api',
            ...glabHostnameArgs(projectRef, connectionId),
            `projects/${encodedProject(projectRef.path)}/jobs/${jobId}/trace`
          ],
          glabRepoExecOptions(repoPath, connectionId, localGitOptions)
        )
        return { ok: true, trace: stdout }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { ok: false, error: classifyGlabError(msg).message }
      } finally {
        release()
      }
    },
    { ok: false, error: 'Could not resolve GitLab project for this repository' },
    localGitOptions
  )
}

export async function retryJob(
  repoPath: string,
  jobId: number,
  preference?: ForgeRemotePreference,
  connectionId?: string | null,
  projectRef?: ProjectRef | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GitLabRetryJobResult> {
  return withProjectRef<GitLabRetryJobResult>(
    repoPath,
    preference,
    connectionId,
    projectRef,
    async (projectRef) => {
      await acquire()
      try {
        const { stdout } = await glabExecFileAsync(
          [
            'api',
            ...glabHostnameArgs(projectRef, connectionId),
            '-X',
            'POST',
            `projects/${encodedProject(projectRef.path)}/jobs/${jobId}/retry`
          ],
          glabRepoExecOptions(repoPath, connectionId, localGitOptions)
        )
        const trimmed = stdout.trim()
        return {
          ok: true,
          ...(trimmed ? { job: mapRetriedPipelineJob(JSON.parse(trimmed), jobId) } : {})
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { ok: false, error: classifyGlabError(msg).message }
      } finally {
        release()
      }
    },
    { ok: false, error: 'Could not resolve GitLab project for this repository' },
    localGitOptions
  )
}

export async function updateMR(
  repoPath: string,
  iid: number,
  updates: {
    title?: string
    body?: string
    addLabels?: string[]
    removeLabels?: string[]
  },
  preference?: ForgeRemotePreference,
  connectionId?: string | null,
  projectRef?: ProjectRef | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<{ ok: true } | { ok: false; error: string }> {
  return withProjectRef<{ ok: true } | { ok: false; error: string }>(
    repoPath,
    preference,
    connectionId,
    projectRef,
    async (projectRef) => {
      const fields: string[] = []
      const title = updates.title?.trim()
      if (updates.title !== undefined) {
        if (!title) {
          return { ok: false, error: 'Title is required' }
        }
        fields.push(`title=${title}`)
      }
      if (updates.body !== undefined) {
        fields.push(`description=${updates.body}`)
      }
      const addLabels = (updates.addLabels ?? []).filter((label) => label.trim().length > 0)
      const removeLabels = (updates.removeLabels ?? []).filter((label) => label.trim().length > 0)
      if (addLabels.length > 0) {
        fields.push(`add_labels=${addLabels.join(',')}`)
      }
      if (removeLabels.length > 0) {
        fields.push(`remove_labels=${removeLabels.join(',')}`)
      }
      if (fields.length === 0) {
        return { ok: true }
      }

      await acquire()
      try {
        await glabExecFileAsync(
          [
            'api',
            ...glabHostnameArgs(projectRef, connectionId),
            '-X',
            'PUT',
            `projects/${encodedProject(projectRef.path)}/merge_requests/${iid}`,
            ...fields.flatMap((field) => ['-f', field])
          ],
          glabRepoExecOptions(repoPath, connectionId, localGitOptions)
        )
        return { ok: true }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { ok: false, error: classifyGlabError(msg).message }
      } finally {
        release()
      }
    },
    { ok: false, error: 'Could not resolve GitLab project for this repository' },
    localGitOptions
  )
}

export async function listLabels(
  repoPath: string,
  preference?: ForgeRemotePreference,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<string[]> {
  const knownHosts = await getGlabKnownHosts(connectionId)
  const { source: projectRef } = await resolveProjectRemote(
    repoPath,
    preference,
    knownHosts,
    connectionId,
    localGitOptions
  )
  if (!projectRef) {
    return []
  }
  await acquire()
  try {
    const { stdout } = await glabExecFileAsync(
      [
        'api',
        ...glabHostnameArgs(projectRef, connectionId),
        '--paginate',
        `projects/${encodedProject(projectRef.path)}/labels`,
        '--jq',
        '.[].name'
      ],
      glabRepoExecOptions(repoPath, connectionId, localGitOptions)
    )
    return stdout
      .trim()
      .split('\n')
      .filter((label) => label.length > 0)
  } catch {
    return []
  } finally {
    release()
  }
}

export async function listAssignableUsers(
  repoPath: string,
  preference?: ForgeRemotePreference,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GitLabAssignableUser[]> {
  const knownHosts = await getGlabKnownHosts(connectionId)
  const { source: projectRef } = await resolveProjectRemote(
    repoPath,
    preference,
    knownHosts,
    connectionId,
    localGitOptions
  )
  if (!projectRef) {
    return []
  }
  await acquire()
  try {
    const { stdout } = await glabExecFileAsync(
      [
        'api',
        ...glabHostnameArgs(projectRef, connectionId),
        '--paginate',
        `projects/${encodedProject(projectRef.path)}/members/all?per_page=100`,
        '--jq',
        '.[] | {id, username, name, avatar_url, state}'
      ],
      glabRepoExecOptions(repoPath, connectionId, localGitOptions)
    )
    const users: GitLabAssignableUser[] = []
    for (const line of stdout.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) {
        continue
      }
      try {
        const user = JSON.parse(trimmed) as {
          id?: number
          username?: string
          name?: string | null
          avatar_url?: string | null
          state?: string | null
        }
        if (user.username) {
          users.push({
            ...(typeof user.id === 'number' ? { id: user.id } : {}),
            username: user.username,
            name: user.name ?? null,
            avatarUrl: user.avatar_url ?? '',
            ...(user.state !== undefined ? { state: user.state } : {})
          })
        }
      } catch {
        // Skip malformed NDJSON lines defensively.
      }
    }
    return users
  } catch {
    return []
  } finally {
    release()
  }
}

// Why: surface the remote-aware project-ref helper so callers that need the
// resolved project (e.g. the paste-URL UI) don't
// have to import from gl-utils directly.
export { getProjectRefForRemote }
