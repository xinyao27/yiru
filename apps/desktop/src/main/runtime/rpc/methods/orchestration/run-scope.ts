import { orchestrationSkillRecoveryData } from '../../../../../shared/orchestration-rpc-contract'
import { OrchestrationError } from '../../../orchestration/orchestration-error'
import type { RunRow } from '../../../orchestration/types'
import type { YiruRuntimeService } from '../../../yiru-runtime'

export function resolveRunScope(
  runtime: YiruRuntimeService,
  params: {
    runId?: string
    callerTerminalHandle?: string
    callerPaneKey?: string
    requireCurrentConsumer: boolean
  }
): RunRow {
  const db = runtime.getOrchestrationDb()
  const explicit = params.runId ? db.getRun(params.runId) : undefined
  if (params.runId && (!explicit || explicit.legacy === 1)) {
    throw new OrchestrationError('run_not_found', `Run ${params.runId} was not found.`)
  }

  if (!params.requireCurrentConsumer && explicit) {
    return explicit
  }
  if (!params.callerTerminalHandle) {
    throw new OrchestrationError(
      'run_required',
      'No Run is bound. Use orchestration run-create or run-use first. No effects were applied.',
      orchestrationSkillRecoveryData()
    )
  }
  const paneKey = params.callerPaneKey ?? runtime.getTerminalPaneKey(params.callerTerminalHandle)
  if (!paneKey) {
    throw new OrchestrationError(
      'stable_pane_required',
      'The coordinator terminal has no stable pane identity.'
    )
  }
  const current = db.getCurrentRunForPane(paneKey)
  if (!current) {
    if (explicit) {
      throw new OrchestrationError(
        'consumer_fenced',
        `This coordinator terminal is no longer bound to Run ${explicit.id}.`
      )
    }
    throw new OrchestrationError(
      'run_required',
      'No Run is bound. Use orchestration run-create or run-use first. No effects were applied.',
      orchestrationSkillRecoveryData()
    )
  }
  if (explicit && current.id !== explicit.id) {
    throw new OrchestrationError(
      'consumer_fenced',
      `This coordinator terminal is bound to ${current.id}, not ${explicit.id}.`
    )
  }
  return current
}
