import type { AuthenticatedRpcPrincipal } from '~shared/rpc-principal'

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
