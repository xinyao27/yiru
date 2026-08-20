import { z } from 'zod'

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
