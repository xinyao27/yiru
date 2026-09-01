import type { TuiAgent } from '@yiru/runtime-protocol/model/agent'

export type AgentProvider = {
  executableCandidates: readonly string[]
  id: TuiAgent
  label: string
  resumable: boolean
}
