import type { RuntimeRpcResponse } from '@yiru/runtime-protocol/rpc-envelope'

import {
  isSpoolMutationOperation,
  type SpoolExecutionOperation
} from '../../shared/spool/spool-operation-contract'
import {
  SpoolPairedRuntimeInvokeResponseSchema,
  parseSpoolPairedRuntimeResult
} from '../../shared/spool/spool-paired-runtime-result-contract'
import { SpoolExecutionError } from './spool-execution-error'
import type { SpoolHostOperationContext } from './spool-execution-gateway'

type SpoolPairedRuntimeAdmittedInvocationOptions = {
  operation: SpoolExecutionOperation
  context: SpoolHostOperationContext
  send(beforeSend: () => Promise<void>): Promise<RuntimeRpcResponse<unknown>>
}

/** Owns paired-runtime admission and the mutation outcome boundary around one RPC. */
export async function invokeAdmittedPairedRuntimeOperation(
  options: SpoolPairedRuntimeAdmittedInvocationOptions
): Promise<unknown> {
  const mutation = isSpoolMutationOperation(options.operation)
  let admitted = false
  try {
    const response = await options.send(async () => {
      if (options.context.signal.aborted) {
        throw new SpoolExecutionError('resource_not_found')
      }
      if (!mutation) {
        return
      }
      if (!options.context.admissionGuard) {
        throw new SpoolExecutionError('unauthorized')
      }
      await options.context.admissionGuard.beforeSideEffect()
      admitted = true
    })
    options.context.signal.throwIfAborted()
    if (!response.ok) {
      // Why: a typed downstream rejection proves no less-restricted fallback is safe.
      throw new SpoolExecutionError('resource_unavailable')
    }
    const envelope = SpoolPairedRuntimeInvokeResponseSchema.safeParse(response.result)
    if (!envelope.success) {
      throw projectedTransportError(mutation, admitted)
    }
    if (envelope.data.status === 'error') {
      throw new SpoolExecutionError(envelope.data.code)
    }
    return parseSpoolPairedRuntimeResult(options.operation, envelope.data.result)
  } catch (error) {
    if (error instanceof SpoolExecutionError) {
      throw error
    }
    throw projectedTransportError(mutation, admitted)
  }
}

function projectedTransportError(mutation: boolean, admitted: boolean): SpoolExecutionError {
  // Why: after admission, an untyped failure cannot prove whether the side effect happened.
  return new SpoolExecutionError(mutation && admitted ? 'outcome_unknown' : 'resource_unavailable')
}
