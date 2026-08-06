// Terminal statuses come from <task-notification> records in the parent
// transcript; 'running' is inferred from recent transcript activity.
export type AiVaultSubagentRunStatus = 'running' | 'completed' | 'failed' | 'stopped'

// Set only on Task subagent transcript rows (listed on demand under their
// parent session); null for every top-level scanned session.
export type AiVaultSessionSubagentInfo = {
  parentSessionId: string
  agentType: string | null
  status: AiVaultSubagentRunStatus | null
}
