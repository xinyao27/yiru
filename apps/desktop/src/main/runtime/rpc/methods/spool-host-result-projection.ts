import {
  isSpoolMutationOperation,
  type SpoolExecutionOperation
} from '../../../../shared/spool/operation-contract'
import { parseSpoolPairedRuntimeResult } from '../../../../shared/spool/paired-runtime-result-contract'
import { SpoolExecutionError } from '../../../spool/execution-error'

export function projectSpoolHostExecutionResult(
  operation: SpoolExecutionOperation,
  value: unknown
): unknown {
  try {
    return parseSpoolPairedRuntimeResult(operation, value)
  } catch (error) {
    if (isSpoolMutationOperation(operation)) {
      // Why: malformed post-admission output cannot prove the side effect did not happen.
      throw new SpoolExecutionError('outcome_unknown')
    }
    throw error
  }
}
