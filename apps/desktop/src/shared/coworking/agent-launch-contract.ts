import { z } from 'zod'

import type { TuiAgent } from '../types'

// Why: Coworking peers must opt into new wire values through a protocol-version change;
// deriving this list from Yiru's global catalog would silently widen older contracts.
export const COWORKING_AGENT_LAUNCH_IDS = [
  'claude',
  'claude-agent-teams',
  'openclaude',
  'codex',
  'autohand',
  'ante',
  'trae',
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

export type CoworkingAgentLaunchId = (typeof COWORKING_AGENT_LAUNCH_IDS)[number]

export const CoworkingAgentLaunchIdSchema = z.enum(COWORKING_AGENT_LAUNCH_IDS)

const COWORKING_AGENT_LAUNCH_ID_SET: ReadonlySet<string> = new Set(COWORKING_AGENT_LAUNCH_IDS)

export function isCoworkingAgentLaunchId(value: unknown): value is CoworkingAgentLaunchId {
  return typeof value === 'string' && COWORKING_AGENT_LAUNCH_ID_SET.has(value)
}
