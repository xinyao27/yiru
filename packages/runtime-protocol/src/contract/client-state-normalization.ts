import type { TuiAgent } from '@yiru/workbench-model/agent'

import { isRuntimeTuiAgent } from './input-schema.js'
import type { RuntimeWorkspaceTitlebarActionId, RuntimeWorktreeCardProperty } from './ui-types.js'

const UNSUPPORTED_TUI_AGENT_ARGS: Partial<Record<TuiAgent, readonly string[]>> = {
  opencode: ['--dangerously-skip-permissions'],
  kilo: ['--dangerously-skip-permissions']
}

const FIXED_WORKTREE_CARD_PROPERTIES: RuntimeWorktreeCardProperty[] = ['status', 'unread']
const DEFAULT_WORKTREE_CARD_PROPERTIES: RuntimeWorktreeCardProperty[] = [
  ...FIXED_WORKTREE_CARD_PROPERTIES,
  'comment',
  'ports',
  'inline-agents'
]
const WORKTREE_CARD_PROPERTY_ORDER: RuntimeWorktreeCardProperty[] = [
  'status',
  'unread',
  'branch',
  'comment',
  'ports',
  'inline-agents'
]
const DEFAULT_WORKSPACE_TITLEBAR_PINNED_IDS: readonly RuntimeWorkspaceTitlebarActionId[] = [
  'explorer',
  'source-control',
  'vault',
  'open-in'
]
const WORKSPACE_TITLEBAR_ACTION_IDS: ReadonlySet<string> = new Set([
  'explorer',
  'vault',
  'workspaces',
  'pr-checks',
  'source-control',
  'ports',
  'open-in',
  'commands'
])

function argPattern(arg: string): RegExp {
  return new RegExp(`(^|\\s)${arg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`, 'g')
}

function sanitizeTuiAgentLaunchArgs(agent: TuiAgent, args: string): string {
  const unsupportedArgs = UNSUPPORTED_TUI_AGENT_ARGS[agent]
  if (!unsupportedArgs) {
    return args.trim()
  }
  // Why: these agents removed, relocated, or never exposed the Claude-style
  // skip-permission flag on the interactive command Yiru launches.
  return unsupportedArgs.reduce((next, arg) => next.replace(argPattern(arg), ' '), args).trim()
}

function isWorkspaceTitlebarActionId(value: string): value is RuntimeWorkspaceTitlebarActionId {
  return WORKSPACE_TITLEBAR_ACTION_IDS.has(value)
}

export function normalizeRuntimeDisabledTuiAgents(value: unknown): TuiAgent[] {
  if (!Array.isArray(value)) {
    return []
  }
  const seen = new Set<TuiAgent>()
  for (const item of value) {
    if (isRuntimeTuiAgent(item)) {
      seen.add(item)
    }
  }
  return [...seen]
}

export function normalizeRuntimeTuiAgentArgsRecord(
  value: unknown
): Partial<Record<TuiAgent, string>> {
  const normalized: Partial<Record<TuiAgent, string>> = {}
  if (!value || typeof value !== 'object') {
    return normalized
  }
  for (const [agent, args] of Object.entries(value)) {
    if (!isRuntimeTuiAgent(agent) || typeof args !== 'string') {
      continue
    }
    normalized[agent] = sanitizeTuiAgentLaunchArgs(agent, args)
  }
  return normalized
}

export function normalizeRuntimeTuiAgentEnvRecord(
  value: unknown
): Partial<Record<TuiAgent, Record<string, string>>> {
  const normalized: Partial<Record<TuiAgent, Record<string, string>>> = {}
  if (!value || typeof value !== 'object') {
    return normalized
  }
  for (const [agent, env] of Object.entries(value)) {
    if (!isRuntimeTuiAgent(agent) || !env || typeof env !== 'object') {
      continue
    }
    const nextEnv: Record<string, string> = {}
    for (const [name, raw] of Object.entries(env)) {
      const key = name.trim()
      if (!key || typeof raw !== 'string') {
        continue
      }
      nextEnv[key] = raw
    }
    normalized[agent] = nextEnv
  }
  return normalized
}

export function normalizeRuntimeWorktreeCardProperties(
  properties: readonly unknown[] | null | undefined
): RuntimeWorktreeCardProperty[] {
  const normalized: RuntimeWorktreeCardProperty[] = [...FIXED_WORKTREE_CARD_PROPERTIES]
  const source = properties ?? DEFAULT_WORKTREE_CARD_PROPERTIES
  for (const property of WORKTREE_CARD_PROPERTY_ORDER) {
    if (source.includes(property) && !normalized.includes(property)) {
      normalized.push(property)
    }
  }
  return normalized
}

export function normalizeRuntimeWorkspaceTitlebarPinnedIds(
  ids: readonly unknown[] | null | undefined
): RuntimeWorkspaceTitlebarActionId[] {
  const source = ids ?? DEFAULT_WORKSPACE_TITLEBAR_PINNED_IDS
  const normalized: RuntimeWorkspaceTitlebarActionId[] = []
  for (const value of source) {
    if (typeof value !== 'string') {
      continue
    }
    // Why: Checks used to be a standalone panel; preserve its pin position
    // while migrating it to the combined source-control panel.
    const id = value === 'checks' ? 'source-control' : value
    if (!isWorkspaceTitlebarActionId(id) || normalized.includes(id)) {
      continue
    }
    normalized.push(id)
  }
  // Why: older builds only persisted panel IDs and omitted the formerly
  // always-on Open in action, so append it once during normalization.
  if (ids != null && !normalized.includes('open-in') && !ids.includes('open-in')) {
    normalized.push('open-in')
  }
  return normalized
}
