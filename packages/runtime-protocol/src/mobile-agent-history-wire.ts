import { z } from 'zod'

import type { AiVaultListResult } from './ai-vault.js' with { 'resolution-mode': 'import' }
import { AI_VAULT_RUNTIME_CAPABILITY } from './protocol-version.js'

export const MOBILE_AGENT_HISTORY_LIST_ORPC_PATH = '/aiVault/listSessions'
export const MOBILE_AGENT_HISTORY_CAPABILITY = AI_VAULT_RUNTIME_CAPABILITY

export const MobileAgentHistoryListRequestSchema = z.object({
  limit: z.number().int().nonnegative().max(2000).optional(),
  force: z.boolean().optional(),
  compact: z.boolean().optional(),
  scopePaths: z.array(z.string().min(1).max(4096)).max(64).optional()
})

export const MobileAgentHistoryPreviewMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system', 'tool', 'unknown']),
  text: z.string(),
  timestamp: z.string().nullable()
})

export const MobileAgentHistorySessionSchema = z.object({
  id: z.string().min(1),
  agent: z.string().min(1),
  sessionId: z.string(),
  title: z.string(),
  cwd: z.string().nullable(),
  filePath: z.string(),
  codexHome: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
  modifiedAt: z.string(),
  messageCount: z.number().int().nonnegative(),
  queuedMessageCount: z.number().int().nonnegative(),
  subagentTranscriptCount: z.number().int().nonnegative(),
  previewMessages: z.array(MobileAgentHistoryPreviewMessageSchema),
  resumeCommand: z.string()
})

export const MobileAgentHistoryIssueSchema = z.object({
  agent: z.string().min(1),
  path: z.string(),
  message: z.string()
})

export const MobileAgentHistoryResultSchema = z.object({
  sessions: z.array(MobileAgentHistorySessionSchema),
  issues: z.array(MobileAgentHistoryIssueSchema),
  scannedAt: z.string()
})

export const MOBILE_AGENT_HISTORY_WIRE_IS_COMPATIBLE: AiVaultListResult extends z.infer<
  typeof MobileAgentHistoryResultSchema
>
  ? true
  : false = true
