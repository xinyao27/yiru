import { LOCAL_EXECUTION_HOST_ID } from '@yiru/workbench-model/workspace'
import { coworkingLocalActualHostScopeKey } from '~main/coworking/canonical-host-path'
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

// Why: paired owner devices retain full-power behavior; only Coworking hosts are grant-bound.
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

export type RpcAccessDenial = {
  code: 'forbidden' | 'unauthorized'
  message: string
}

type RpcAdmissionMethod = Pick<RpcAnyMethod, 'access' | 'mobile' | 'name'>

export function adjudicateRpcAccess(
  method: RpcAdmissionMethod,
  context: { principal?: AuthenticatedRpcPrincipal; grantedAccess?: RpcAccess }
): RpcAccessDenial | null {
  const caller = callerClassOf(context.principal)

  if (caller === 'mobile' && !method.mobile) {
    return {
      code: 'forbidden',
      message: `Method '${method.name}' is not available to mobile clients`
    }
  }

  if (!principalsSatisfy(method.access, caller)) {
    return {
      code: 'unauthorized',
      message: `Method ${method.name} is not available to this admission path`
    }
  }

  if (!requiresGrant(caller)) {
    return null
  }

  // Why: a missing grant must lose access instead of silently becoming unrestricted.
  if (!context.grantedAccess) {
    return {
      code: 'unauthorized',
      message: `Method ${method.name} requires a grant that could not be resolved`
    }
  }

  if (!accessSatisfies(context.grantedAccess, method.access)) {
    return {
      code: 'unauthorized',
      message:
        `Method ${method.name} requires ${method.access.scope}/${method.access.tier}; ` +
        `grant provides ${context.grantedAccess.scope}/${context.grantedAccess.tier}`
    }
  }

  return null
}

export function denyAccess(
  method: RpcAnyMethod,
  meta: RpcEnvelopeMeta,
  requestId: string,
  context: { principal?: AuthenticatedRpcPrincipal; grantedAccess?: RpcAccess }
): RpcResponse | null {
  const denial = adjudicateRpcAccess(method, context)
  return denial ? errorResponse(requestId, meta, denial.code, denial.message) : null
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

const COWORKING_RUNTIME_HOST_SCOPE_KEY = coworkingLocalActualHostScopeKey(
  LOCAL_EXECUTION_HOST_ID,
  null
)

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

function redirectedProjectDenied(methodName: string): RpcAccessDenial {
  return {
    code: 'unauthorized',
    message: `Method ${methodName} may only target the project selected by its repo parameter`
  }
}

// Why: a Coworking host grant must not redirect owner credentials outside its selected project.
export async function adjudicateRedirectedProjectAccess(
  methodName: string,
  params: unknown,
  context: { principal?: AuthenticatedRpcPrincipal; runtime: YiruRuntimeService }
): Promise<RpcAccessDenial | null> {
  if (!requiresGrant(callerClassOf(context.principal))) {
    return null
  }
  // Why: method-specific Zod parsing validates these fields before this authorization boundary.
  const request = params as ProjectRedirectParams
  if (methodName === 'github.workItemByOwnerRepo') {
    const project = await context.runtime.getRepoSlug(request.repo).catch(() => null)
    return project &&
      request.owner &&
      request.ownerRepo &&
      sameGitHubProject(project, { owner: request.owner, repo: request.ownerRepo })
      ? null
      : redirectedProjectDenied(methodName)
  }

  const requestedGitLabProject =
    methodName === 'gitlab.workItemByPath'
      ? request.host && request.path
        ? { host: request.host, path: request.path }
        : null
      : GITLAB_PROJECT_REF_METHODS.has(methodName)
        ? (request.projectRef ?? null)
        : null
  if (!requestedGitLabProject) {
    return null
  }
  const project = await context.runtime.getGitLabRepoProjectRef(request.repo).catch(() => null)
  return project && sameGitLabProject(project, requestedGitLabProject)
    ? null
    : redirectedProjectDenied(methodName)
}

export async function denyRedirectedProjectAccess(
  method: RpcAnyMethod,
  params: unknown,
  meta: RpcEnvelopeMeta,
  requestId: string,
  context: { principal?: AuthenticatedRpcPrincipal; runtime: YiruRuntimeService }
): Promise<RpcResponse | null> {
  const denial = await adjudicateRedirectedProjectAccess(method.name, params, context)
  return denial ? errorResponse(requestId, meta, denial.code, denial.message) : null
}

// Why: a host grant is valid only in the exact machine namespace it was issued for.
export function grantedAccessForDevice(
  device: { scope: string; tier?: RpcAccessTier; hostScopeKey?: string } | null
): RpcAccess | null {
  if (
    !device ||
    device.scope !== 'coworking-host' ||
    !device.tier ||
    device.hostScopeKey !== COWORKING_RUNTIME_HOST_SCOPE_KEY
  ) {
    return null
  }
  return { scope: 'host', tier: device.tier }
}
