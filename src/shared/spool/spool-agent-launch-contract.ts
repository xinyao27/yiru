import { z } from 'zod'
import type { TuiAgent } from '../types'

// Why: Spool peers must opt into new wire values through a protocol-version change;
// deriving this list from Orca's global catalog would silently widen older contracts.
export const SPOOL_AGENT_LAUNCH_IDS = [
  'claude',
  'claude-agent-teams',
  'openclaude',
  'codex',
  'autohand',
  'ante',
  'opencode',
  'mimo-code',
  'pi',
  'omp',
  'gemini',
  'antigravity',
  'aider',
  'goose',
  'amp',
  'kilo',
  'kiro',
  'crush',
  'aug',
  'cline',
  'codebuff',
  'command-code',
  'continue',
  'cursor',
  'droid',
  'kimi',
  'mistral-vibe',
  'qwen-code',
  'rovo',
  'hermes',
  'openclaw',
  'copilot',
  'grok',
  'devin'
] as const satisfies readonly TuiAgent[]

export type SpoolAgentLaunchId = (typeof SPOOL_AGENT_LAUNCH_IDS)[number]

export const SpoolAgentLaunchIdSchema = z.enum(SPOOL_AGENT_LAUNCH_IDS)

const SPOOL_AGENT_LAUNCH_ID_SET: ReadonlySet<string> = new Set(SPOOL_AGENT_LAUNCH_IDS)

export function isSpoolAgentLaunchId(value: unknown): value is SpoolAgentLaunchId {
  return typeof value === 'string' && SPOOL_AGENT_LAUNCH_ID_SET.has(value)
}
