import { CompletionCoordinatorLayer5 } from './completion-coordinator-layer-5'
import type {
  AgentCompletionCoordinator,
  AgentCompletionCoordinatorOptions
} from './completion-coordinator-types'

export function createAgentCompletionCoordinator(
  options: AgentCompletionCoordinatorOptions
): AgentCompletionCoordinator {
  const coordinator = new CompletionCoordinatorLayer5(options)
  return {
    observeTitle: (title) => coordinator.observeTitle(title),
    observeClassifiedTitleCompletion: (title) =>
      coordinator.observeClassifiedTitleCompletion(title),
    observeTitleWorking: () => coordinator.observeTitleWorking(),
    observeOutputActivity: () => coordinator.observeOutputActivity(),
    observeHookStatus: (payload) => coordinator.observeHookStatus(payload),
    startProcessTracking: () => coordinator.startProcessTracking(),
    hasPendingHookDoneCompletion: () => coordinator.hasPendingHookDoneCompletion(),
    resetCompletionState: (resetOptions) => coordinator.resetCompletionState(resetOptions),
    dispose: () => coordinator.dispose()
  }
}
