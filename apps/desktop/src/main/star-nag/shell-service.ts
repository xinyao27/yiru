import type { AgentValueMomentPreparation } from './agent-value-moment'

export type ShellStarNagService = {
  dismiss: () => void
  later: () => void
  complete: () => void
  disable: () => void
  openWeb: () => void
  starYiru: () => Promise<boolean>
  forceShow: () => void
  agentValueMoment: () => Promise<AgentValueMomentPreparation>
  showAgentValueMoment: () => void
  onboardingCompleted: () => Promise<void>
}

let shellStarNagService: ShellStarNagService | null = null

export function registerShellStarNagService(service: ShellStarNagService): void {
  shellStarNagService = service
}

export function getShellStarNagService(): ShellStarNagService {
  if (!shellStarNagService) {
    throw new Error('shell_star_nag_service_unavailable')
  }
  return shellStarNagService
}
