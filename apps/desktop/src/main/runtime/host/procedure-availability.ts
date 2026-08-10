import { translateMain } from '~main/i18n/main-i18n'

import { errorResponse } from '../rpc/errors'
import { throwRuntimeOrpcFailure } from '../rpc/orpc/failure'
import type { RuntimeOrpcHandlerHooks } from '../rpc/orpc/request-metadata'
import { isNodeRuntimeHostProcedureMounted } from './router'

export const nodeRuntimeHostOrpcHandlerHooks: RuntimeOrpcHandlerHooks = {
  isProcedureMounted: isNodeRuntimeHostProcedureMounted,
  onError: (error, path) => {
    console.error(`[runtime-host] oRPC ${path.join('.')} failed:`, error)
  },
  onUnmatchedProcedure: async ({ context, path, requestId }) => {
    await context.resolveAdmission?.()
    const procedure = path.join('.') || '<root>'
    const message = translateMain(
      'runtimeHost.procedureUnavailable',
      'Procedure is not mounted on this runtime host'
    )
    console.error(`[runtime-host] ${message}: ${procedure}`)
    return throwRuntimeOrpcFailure(
      errorResponse(
        requestId ?? 'unknown',
        { runtimeId: context.runtime.getRuntimeId() },
        'unavailable_on_host',
        `${message}: ${procedure}`
      )
    )
  }
}
