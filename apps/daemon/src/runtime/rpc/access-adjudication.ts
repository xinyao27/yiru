import type { AuthenticatedRpcPrincipal } from '~main/rpc-principal'

import { callerClassOf, principalsSatisfy, type RpcAccess } from './access'
import type { RpcAnyMethod, RpcEnvelopeMeta, RpcResponse } from './core'
import { errorResponse } from './errors'

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
