import type { AgentPhase } from '@yiru/runtime-protocol/contract'

export type AgentPhaseChange = {
  phase: AgentPhase
  terminal: string
  title: string | null
  worktreeId: string
}
