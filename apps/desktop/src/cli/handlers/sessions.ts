import {
  AI_VAULT_AGENTS,
  type AiVaultAgent,
  type AiVaultListResult,
  type AiVaultSession
} from '@yiru/workbench-model/agent'

import type { CommandHandler } from '../dispatch'
import {
  getOptionalPositiveIntegerFlag,
  getOptionalStringFlag,
  getRequiredStringFlag
} from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
import { formatSessionList } from '../session-format'

const aiVaultAgents = new Set<string>(AI_VAULT_AGENTS)

function getAgent(flags: Map<string, string | boolean>): AiVaultAgent | undefined {
  const agent = getOptionalStringFlag(flags, 'agent')
  if (agent === undefined) {
    return undefined
  }
  if (!aiVaultAgents.has(agent)) {
    throw new RuntimeClientError('invalid_argument', `Unknown AI Vault agent: ${agent}`)
  }
  return agent as AiVaultAgent
}

function filterSessions(args: {
  sessions: AiVaultSession[]
  agent?: AiVaultAgent
  query?: string
  limit?: number
}): AiVaultSession[] {
  const query = args.query?.trim().toLowerCase()
  const matches = args.sessions.filter((session) => {
    if (args.agent && session.agent !== args.agent) {
      return false
    }
    if (!query) {
      return true
    }
    return [
      session.title,
      session.cwd,
      session.branch,
      session.model,
      session.sessionId,
      ...session.previewMessages.map((message) => message.text)
    ].some((value) => value?.toLowerCase().includes(query))
  })
  return args.limit === undefined ? matches : matches.slice(0, args.limit)
}

async function listSessions(context: Parameters<CommandHandler>[0], query?: string): Promise<void> {
  const { flags, client, json } = context
  const agent = getAgent(flags)
  const limit = getOptionalPositiveIntegerFlag(flags, 'limit')
  // Why: filtering happens client-side, so the runtime scan must not stop at a
  // smaller page before matching sessions have been considered.
  const scanLimit = agent || query ? Math.max(limit ?? 1_000, 1_000) : limit
  const response = await client.call<AiVaultListResult>('aiVault.listSessions', {
    force: flags.get('force') === true,
    ...(scanLimit === undefined ? {} : { limit: scanLimit })
  })
  const result = {
    ...response.result,
    sessions: filterSessions({ sessions: response.result.sessions, agent, query, limit })
  }
  printResult({ ...response, result }, json, formatSessionList)
}

export const SESSION_HANDLERS: Record<string, CommandHandler> = {
  'sessions list': (context) => listSessions(context),
  'sessions search': async (context) => {
    const query = getRequiredStringFlag(context.flags, 'query').trim()
    if (!query) {
      throw new RuntimeClientError('invalid_argument', 'Search query cannot be empty.')
    }
    await listSessions(context, query)
  }
}
