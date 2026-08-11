import type {
  AutomationDispatchResult,
  AutomationPrecheckResult,
  AutomationRun
} from '~shared/automations-types'

import type { AutomationService } from './service'

let automationService: AutomationService | null = null

export function initializeShellAutomationService(service: AutomationService): void {
  automationService = service
}

function requireAutomationService(): AutomationService {
  if (!automationService) {
    throw new Error('unavailable_on_host: shell automations are not initialized')
  }
  return automationService
}

export function runShellAutomationPrecheck(args: {
  automationId: string
  runId: string
}): Promise<AutomationPrecheckResult | null> {
  return requireAutomationService().runPrecheck(args.automationId, args.runId)
}

export function markShellAutomationDispatchResult(
  result: AutomationDispatchResult
): Promise<AutomationRun> {
  return requireAutomationService().markDispatchResult(result)
}

export function markShellAutomationRendererReady(): void {
  requireAutomationService().setRendererReady()
}
