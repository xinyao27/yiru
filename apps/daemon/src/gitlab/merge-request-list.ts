import type {
  ForgeRemotePreference,
  GitLabWorkItem,
  ListMergeRequestsResult,
  MRListState
} from '@yiru/runtime-protocol/workbench/types'

import {
  acquire,
  classifyListError,
  getGlabKnownHosts,
  glabApiWithHeaders,
  glabExecFileAsync,
  glabHostnameArgs,
  glabRepoExecOptions,
  release,
  resolveProjectRemote,
  type LocalGitExecOptions,
  type ProjectRef
} from './gitlab-cli'
import { mapMRToWorkItem } from './mappers'
import { encodeGitLabProject } from './project-context'

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
    `projects/${encodeGitLabProject(projectRef.path)}/merge_requests?` +
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
        `projects/${encodeGitLabProject(projectRef.path)}/${resource}/${iid}`
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
