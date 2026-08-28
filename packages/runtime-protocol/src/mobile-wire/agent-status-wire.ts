import { z } from 'zod'

import type { AgentStatusInferInterruptInputSchema } from '../contract/agent-status.js' with {
  'resolution-mode': 'import'
}

export const MOBILE_AGENT_STATUS_INFER_INTERRUPT_ORPC_PATH = '/agentStatus/inferInterrupt'

// Why: the runtime contract is ESM-only while mobile wire modules also emit CommonJS.
// Keep this transport schema structurally aligned without importing across that boundary.
export const MobileAgentStatusInferInterruptRequestSchema = z.object({
  paneKey: z.string().min(1, 'Missing paneKey'),
  baselineUpdatedAt: z.number(),
  baselineStateStartedAt: z.number(),
  baselinePrompt: z.string(),
  baselineAgentType: z.string().optional(),
  intent: z.enum(['plain-escape', 'ctrl-c']),
  inputCount: z.number().int().optional()
})

export const MOBILE_AGENT_STATUS_INFER_INTERRUPT_WIRE_IS_COMPATIBLE: z.output<
  typeof AgentStatusInferInterruptInputSchema
> extends z.output<typeof MobileAgentStatusInferInterruptRequestSchema>
  ? true
  : never = true
