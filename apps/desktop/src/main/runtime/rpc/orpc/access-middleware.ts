import { implement, type Implementer, type ImplementerInternalWithMiddlewares } from '@orpc/server'
import { RuntimeProcedureMetaSchema, runtimeContract } from '@yiru/runtime-protocol/contract'

import { adjudicateRpcAccess, type RpcAccessDenial } from '../access-adjudication'
import type { RuntimeOrpcContext } from './bridge'

export const runtimeImplementer: Implementer<
  typeof runtimeContract,
  RuntimeOrpcContext,
  RuntimeOrpcContext
> = implement(runtimeContract).$context<RuntimeOrpcContext>()

export const runtimeAccessMiddleware = runtimeImplementer.middleware(
  async ({ context, errors, next, path, procedure }) => {
    const parsedMeta = RuntimeProcedureMetaSchema.safeParse(procedure['~orpc'].meta)
    if (!parsedMeta.success) {
      throw errors.unauthorized({
        message: `Method ${path.join('.')} has no valid access declaration`
      })
    }

    const admission = context.resolveAdmission
      ? await context.resolveAdmission()
      : {
          principal: context.principal,
          grantedAccess: context.grantedAccess,
          authenticatedCallerFingerprint: context.authenticatedCallerFingerprint
        }
    const denial = adjudicateRpcAccess(
      {
        name: parsedMeta.data.legacyMethod ?? path.join('.'),
        access: parsedMeta.data.access,
        mobile: parsedMeta.data.mobile
      },
      admission
    )
    if (denial) {
      throwAccessDenial(denial, errors)
    }
    return next({ context: admission })
  }
)

export const runtimeImplementation: ImplementerInternalWithMiddlewares<
  typeof runtimeContract,
  RuntimeOrpcContext,
  RuntimeOrpcContext
> = runtimeImplementer.use(runtimeAccessMiddleware)

function throwAccessDenial(
  denial: RpcAccessDenial,
  errors: {
    unauthorized: (options: { message: string }) => Error
    forbidden: (options: { message: string }) => Error
  }
): never {
  switch (denial.code) {
    case 'unauthorized':
      throw errors.unauthorized({ message: denial.message })
    case 'forbidden':
      throw errors.forbidden({ message: denial.message })
  }
}
