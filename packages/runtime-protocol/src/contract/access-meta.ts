import { oc } from '@orpc/contract'
import { z } from 'zod'

export type RpcAccessScope = 'worktree' | 'project' | 'host'

export type RpcAccessTier = 'read' | 'control' | 'host'

export type RpcCallerClass = 'local' | 'mobile' | 'runtime' | 'coworking-host'

export type RpcAccess = {
  scope: RpcAccessScope
  tier: RpcAccessTier
  principals?: readonly RpcCallerClass[]
}

export type RuntimeProcedureMeta = {
  access: RpcAccess
  mobile: boolean
  legacyMethod?: string
}

export const RuntimeProcedureMetaSchema = z.object({
  access: z.object({
    scope: z.enum(['worktree', 'project', 'host']),
    tier: z.enum(['read', 'control', 'host']),
    principals: z.array(z.enum(['local', 'mobile', 'runtime', 'coworking-host'])).optional()
  }),
  mobile: z.boolean(),
  legacyMethod: z.string().min(1).optional()
})

const RUNTIME_ACCESS_ERRORS = {
  unauthorized: {
    status: 401,
    message: 'Unauthorized'
  },
  forbidden: {
    status: 403,
    message: 'Forbidden'
  }
} as const

export function withAccess(
  access: RpcAccess,
  options: { mobile?: boolean; legacyMethod?: string } = {}
) {
  return oc.errors(RUNTIME_ACCESS_ERRORS).$meta<RuntimeProcedureMeta>({
    access,
    mobile: options.mobile === true,
    legacyMethod: options.legacyMethod
  })
}
