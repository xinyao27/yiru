import type { RuntimeRpcResponse } from '@yiru/runtime-protocol/rpc-envelope'

import {
  isCoworkingMutationOperation,
  type CoworkingExecutionOperation
} from '../../shared/coworking/operation-contract'
import {
  CoworkingPairedRuntimeInvokeResponseSchema,
  parseCoworkingPairedRuntimeResult
} from '../../shared/coworking/paired-runtime-result-contract'
import { CoworkingExecutionError } from './execution-error'
import type { CoworkingHostOperationContext } from './execution-gateway'

type CoworkingPairedRuntimeAdmittedInvocationOptions = {
  operation: CoworkingExecutionOperation
  context: CoworkingHostOperationContext
  send(beforeSend: () => Promise<void>): Promise<RuntimeRpcResponse<unknown>>
}

/** Owns paired-runtime admission and the mutation outcome boundary around one RPC. */
export async function invokeAdmittedPairedRuntimeOperation(
  options: CoworkingPairedRuntimeAdmittedInvocationOptions
): Promise<unknown> {
  const mutation = isCoworkingMutationOperation(options.operation)
  let admitted = false
  try {
    const response = await options.send(async () => {
      if (options.context.signal.aborted) {
        throw new CoworkingExecutionError('resource_not_found')
      }
      if (!mutation) {
        return
      }
      if (!options.context.admissionGuard) {
        throw new CoworkingExecutionError('unauthorized')
      }
      await options.context.admissionGuard.beforeSideEffect()
      admitted = true
    })
    options.context.signal.throwIfAborted()
    if (!response.ok) {
      // Why: a typed downstream rejection proves no less-restricted fallback is safe.
      throw new CoworkingExecutionError('resource_unavailable')
    }
    const envelope = CoworkingPairedRuntimeInvokeResponseSchema.safeParse(response.result)
    if (!envelope.success) {
      throw projectedTransportError(mutation, admitted)
    }
    if (envelope.data.status === 'error') {
      throw new CoworkingExecutionError(envelope.data.code)
    }
    return parseCoworkingPairedRuntimeResult(options.operation, envelope.data.result)
  } catch (error) {
    if (error instanceof CoworkingExecutionError) {
      throw error
    }
    throw projectedTransportError(mutation, admitted)
  }
}

function projectedTransportError(mutation: boolean, admitted: boolean): CoworkingExecutionError {
  // Why: after admission, an untyped failure cannot prove whether the side effect happened.
  return new CoworkingExecutionError(
    mutation && admitted ? 'outcome_unknown' : 'resource_unavailable'
  )
}
