import type { AuthenticatedRpcPrincipal } from '~shared/rpc-principal'

import type { YiruRuntimeService } from '../yiru-runtime'
import {
  accessSatisfies,
  callerClassOf,
  principalsSatisfy,
  type RpcAccess,
  type RpcAccessTier,
  type RpcCallerClass
} from './access'
import type { RpcAnyMethod, RpcEnvelopeMeta, RpcResponse } from './core'
import { errorResponse } from './errors'

/**
 * Whether this caller class is bounded by an explicit grant.
 *
 * Why only `coworking-host`: `local` is the owner's own process, and `mobile` /
 * `runtime` are devices the owner paired with a full-power token. Narrowing
 * those is a separate product decision (see the §6.8 mobile note) — pretending
 * to enforce them here while their tokens stay all-powerful would be theatre.
 */
function requiresGrant(caller: RpcCallerClass): boolean {
  switch (caller) {
    case 'local':
    case 'mobile':
    case 'runtime':
      return false
    case 'coworking-host':
      return true
  }
}

/**
 * Returns an error response when this caller may not invoke this method, or
 * null to let the call through.
 */
export function denyAccess(
  method: RpcAnyMethod,
  meta: RpcEnvelopeMeta,
  requestId: string,
  context: { principal?: AuthenticatedRpcPrincipal; grantedAccess?: RpcAccess }
): RpcResponse | null {
  const caller = callerClassOf(context.principal)

  if (!principalsSatisfy(method.access, caller)) {
    return errorResponse(
      requestId,
      meta,
      'unauthorized',
      `Method ${method.name} is not available to this admission path`
    )
  }

  if (!requiresGrant(caller)) {
    return null
  }

  // Why: fail closed. A grant-bound caller with no resolvable grant is denied
  // rather than defaulted, so a transport that forgets to pass grantedAccess
  // loses access instead of silently gaining unrestricted access.
  if (!context.grantedAccess) {
    return errorResponse(
      requestId,
      meta,
      'unauthorized',
      `Method ${method.name} requires a grant that could not be resolved`
    )
  }

  if (!accessSatisfies(context.grantedAccess, method.access)) {
    return errorResponse(
      requestId,
      meta,
      'unauthorized',
      `Method ${method.name} requires ${method.access.scope}/${method.access.tier}; ` +
        `grant provides ${context.grantedAccess.scope}/${context.grantedAccess.tier}`
    )
  }

  return null
}

type ProjectRedirectParams = {
  repo: string
  owner?: string
  ownerRepo?: string
  host?: string
  path?: string
  projectRef?: { host: string; path: string }
}

const GITLAB_PROJECT_REF_METHODS = new Set([
  'gitlab.addMRComment',
  'gitlab.addMRInlineComment',
  'gitlab.resolveMRDiscussion',
  'gitlab.jobTrace',
  'gitlab.retryJob',
  'gitlab.mergeMR',
  'gitlab.updateMRState',
  'gitlab.updateMR',
  'gitlab.updateMRReviewers',
  'gitlab.workItemDetails'
])

function normalizedProjectPart(value: string): string {
  return value
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.git$/i, '')
    .toLowerCase()
}

function sameGitHubProject(
  actual: { owner: string; repo: string },
  requested: { owner: string; repo: string }
): boolean {
  return (
    normalizedProjectPart(actual.owner) === normalizedProjectPart(requested.owner) &&
    normalizedProjectPart(actual.repo) === normalizedProjectPart(requested.repo)
  )
}

function sameGitLabProject(
  actual: { host: string; path: string },
  requested: { host: string; path: string }
): boolean {
  return (
    actual.host.trim().toLowerCase() === requested.host.trim().toLowerCase() &&
    normalizedProjectPart(actual.path) === normalizedProjectPart(requested.path)
  )
}

function redirectedProjectDenied(
  method: RpcAnyMethod,
  meta: RpcEnvelopeMeta,
  requestId: string
): RpcResponse {
  return errorResponse(
    requestId,
    meta,
    'unauthorized',
    `Method ${method.name} may only target the project selected by its repo parameter`
  )
}

/**
 * Reject project-scoped parameters that redirect credential use to another repository.
 *
 * Why this runs only for grant-bound callers: the owner's existing local/mobile
 * workflows intentionally support pasting links from other repositories. A
 * Coworking host grant must make the declared project scope enforceable instead
 * of letting an arbitrary owner/path consume whichever token the repo selector chose.
 */
export async function denyRedirectedProjectAccess(
  method: RpcAnyMethod,
  params: unknown,
  meta: RpcEnvelopeMeta,
  requestId: string,
  context: { principal?: AuthenticatedRpcPrincipal; runtime: YiruRuntimeService }
): Promise<RpcResponse | null> {
  if (!requiresGrant(callerClassOf(context.principal))) {
    return null
  }
  // Why: method-specific Zod parsing has already validated these fields before
  // the dispatcher reaches this cross-method authorization boundary.
  const request = params as ProjectRedirectParams
  if (method.name === 'github.workItemByOwnerRepo') {
    const project = await context.runtime.getRepoSlug(request.repo).catch(() => null)
    return project &&
      request.owner &&
      request.ownerRepo &&
      sameGitHubProject(project, { owner: request.owner, repo: request.ownerRepo })
      ? null
      : redirectedProjectDenied(method, meta, requestId)
  }

  const requestedGitLabProject =
    method.name === 'gitlab.workItemByPath'
      ? request.host && request.path
        ? { host: request.host, path: request.path }
        : null
      : GITLAB_PROJECT_REF_METHODS.has(method.name)
        ? (request.projectRef ?? null)
        : null
  if (!requestedGitLabProject) {
    return null
  }
  const project = await context.runtime.getGitLabRepoProjectRef(request.repo).catch(() => null)
  return project && sameGitLabProject(project, requestedGitLabProject)
    ? null
    : redirectedProjectDenied(method, meta, requestId)
}

/**
 * Project a persisted device entry onto the access it was granted.
 *
 * Why a host-wide scope: a Coworking host grant is bounded by which *machine*
 * it covers (`hostScopeKey`), not by a worktree inside it — the tier is what
 * limits what the peer may do there. Returns null for the owner's own paired
 * devices, which carry no grant and are handled by requiresGrant above.
 */
export function grantedAccessForDevice(
  device: { scope: string; tier?: RpcAccessTier } | null
): RpcAccess | null {
  if (!device || device.scope !== 'coworking-host' || !device.tier) {
    return null
  }
  return { scope: 'host', tier: device.tier }
}
