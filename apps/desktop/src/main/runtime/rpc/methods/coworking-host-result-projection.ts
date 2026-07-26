import {
  isCoworkingMutationOperation,
  type CoworkingExecutionOperation
} from '../../../../shared/coworking/operation-contract'
import { parseCoworkingPairedRuntimeResult } from '../../../../shared/coworking/paired-runtime-result-contract'
import { CoworkingExecutionError } from '../../../coworking/execution-error'

export function projectCoworkingHostExecutionResult(
  operation: CoworkingExecutionOperation,
  value: unknown
): unknown {
  try {
    return parseCoworkingPairedRuntimeResult(operation, value)
  } catch (error) {
    if (isCoworkingMutationOperation(operation)) {
      // Why: malformed post-admission output cannot prove the side effect did not happen.
      throw new CoworkingExecutionError('outcome_unknown')
    }
    throw error
  }
}
