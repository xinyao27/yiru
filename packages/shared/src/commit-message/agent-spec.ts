import { isTuiAgentEnabled } from '../tui-agent/selection'
import type { TuiAgent } from '../types'
import { labelFromModelId, withOpenAiThinking } from './agent-model-metadata'
import { CLAUDE_CODEX_COMMIT_MESSAGE_SPECS } from './agent-spec-claude-codex'
import { COPILOT_COMMIT_MESSAGE_SPECS } from './agent-spec-copilot'
import { OTHER_COMMIT_MESSAGE_AGENT_SPECS } from './agent-spec-other-providers'
import type {
  CommitMessageAgentCapability,
  CommitMessageAgentSpec,
  CommitMessageModel
} from './agent-spec-types'

export {
  parseAntigravityModels,
  parseCodexModels,
  parseCursorModels,
  parseLineModels,
  parsePiModels
} from './agent-model-parsers'
export type {
  CommitMessageAgentCapability,
  CommitMessageAgentSpec,
  CommitMessageModel,
  CommitMessageModelCapability,
  ThinkingLevel
} from './agent-spec-types'

export const COMMIT_MESSAGE_AGENT_SPECS: Partial<Record<TuiAgent, CommitMessageAgentSpec>> = {
  claude: CLAUDE_CODEX_COMMIT_MESSAGE_SPECS.claude,
  codex: CLAUDE_CODEX_COMMIT_MESSAGE_SPECS.codex,
  opencode: OTHER_COMMIT_MESSAGE_AGENT_SPECS.opencode,
  pi: OTHER_COMMIT_MESSAGE_AGENT_SPECS.pi,
  amp: OTHER_COMMIT_MESSAGE_AGENT_SPECS.amp,
  cursor: OTHER_COMMIT_MESSAGE_AGENT_SPECS.cursor,
  kimi: OTHER_COMMIT_MESSAGE_AGENT_SPECS.kimi,
  copilot: COPILOT_COMMIT_MESSAGE_SPECS.copilot,
  antigravity: OTHER_COMMIT_MESSAGE_AGENT_SPECS.antigravity
}

export const DEFAULT_COMMIT_MESSAGE_AGENT_ID: TuiAgent = 'claude'
export const CUSTOM_AGENT_ID = 'custom' as const
export type CustomAgentId = typeof CUSTOM_AGENT_ID
export type CommitMessageAgentChoice = TuiAgent | CustomAgentId
export type DefaultTuiAgentPreference = TuiAgent | 'blank' | null | undefined

export function isCustomAgentId(id: string | null | undefined): id is CustomAgentId {
  return id === CUSTOM_AGENT_ID
}

export function getCommitMessageAgentSpec(agentId: TuiAgent): CommitMessageAgentSpec | undefined {
  return COMMIT_MESSAGE_AGENT_SPECS[agentId]
}

export function resolveCommitMessageAgentChoice(
  configuredAgentId: CommitMessageAgentChoice | null | undefined,
  defaultTuiAgent: DefaultTuiAgentPreference,
  disabledTuiAgents?: Iterable<unknown> | null
): CommitMessageAgentChoice | null {
  if (configuredAgentId) {
    return configuredAgentId
  }
  if (
    defaultTuiAgent &&
    defaultTuiAgent !== 'blank' &&
    isTuiAgentEnabled(defaultTuiAgent, disabledTuiAgents)
  ) {
    return getCommitMessageAgentSpec(defaultTuiAgent) ? defaultTuiAgent : null
  }
  return isTuiAgentEnabled(DEFAULT_COMMIT_MESSAGE_AGENT_ID, disabledTuiAgents)
    ? DEFAULT_COMMIT_MESSAGE_AGENT_ID
    : null
}

export function getCommitMessageModel(
  agentId: TuiAgent,
  modelId: string
): CommitMessageModel | undefined {
  const spec = getCommitMessageAgentSpec(agentId)
  const model = spec?.models.find((candidate) => candidate.id === modelId)
  if (model || !spec || spec.modelSource !== 'dynamic' || modelId.trim().length === 0) {
    return model
  }
  return { id: modelId, label: labelFromModelId(modelId), ...withOpenAiThinking(modelId) }
}

export function getCommitMessageAgentCapability(
  agentId: TuiAgent
): CommitMessageAgentCapability | undefined {
  const spec = getCommitMessageAgentSpec(agentId)
  return spec ? toCommitMessageAgentCapability(spec) : undefined
}

export function listCommitMessageAgentIds(): TuiAgent[] {
  return Object.keys(COMMIT_MESSAGE_AGENT_SPECS) as TuiAgent[]
}

export function listCommitMessageAgentCapabilities(): CommitMessageAgentCapability[] {
  return listCommitMessageAgentIds()
    .map((id) => getCommitMessageAgentCapability(id))
    .filter((capability): capability is CommitMessageAgentCapability => Boolean(capability))
}

function toCommitMessageAgentCapability(
  spec: CommitMessageAgentSpec
): CommitMessageAgentCapability {
  return {
    id: spec.id,
    label: spec.label,
    modelSource: spec.modelSource,
    defaultModelId: spec.defaultModelId,
    // Why: renderer settings consume capabilities, never binary/argv contracts.
    models: spec.models.map((model) => ({
      id: model.id,
      label: model.label,
      ...(model.thinkingLevels ? { thinkingLevels: [...model.thinkingLevels] } : {}),
      ...(model.defaultThinkingLevel ? { defaultThinkingLevel: model.defaultThinkingLevel } : {})
    }))
  }
}
