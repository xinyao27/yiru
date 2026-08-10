import type { TuiAgent } from '@yiru/workbench-model/agent'
import { sanitizeRepoIcon } from '@yiru/workbench-model/workspace'

import { isRuntimeTuiAgent } from './input-schema.js'
import type {
  RuntimeRepoSourceControlAiOverrides,
  RuntimeSourceControlActionId,
  RuntimeSourceControlModelChoice,
  RuntimeSourceControlOperation
} from './repo-types.js'

const SOURCE_CONTROL_TEXT_ACTION_IDS = [
  'commitMessage',
  'pullRequest',
  'branchName'
] as const satisfies readonly RuntimeSourceControlOperation[]

const SOURCE_CONTROL_ACTION_IDS = [
  ...SOURCE_CONTROL_TEXT_ACTION_IDS,
  'fixCommitFailure',
  'fixPushFailure',
  'fixChecks',
  'resolveConflicts',
  'resolveComments'
] as const satisfies readonly RuntimeSourceControlActionId[]

const PR_CREATION_DEFAULT_KEYS = [
  'draft',
  'useTemplate',
  'generateDetailsOnOpen',
  'openAfterCreate'
] as const

type RuntimeSourceControlActionRecipe = NonNullable<
  NonNullable<RuntimeRepoSourceControlAiOverrides['actionOverrides']>[RuntimeSourceControlActionId]
>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSafeRecordKey(key: string): boolean {
  return key !== '' && key !== '__proto__' && key !== 'constructor' && key !== 'prototype'
}

function normalizeStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const normalized: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (isSafeRecordKey(key) && typeof item === 'string') {
      normalized[key] = item
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined
}

function normalizeAgentModelRecord(value: unknown): Partial<Record<TuiAgent, string>> | undefined {
  return normalizeStringRecord(value)
}

function normalizeHostAgentModelRecord(
  value: unknown
): Partial<Record<string, Partial<Record<TuiAgent, string>>>> | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const normalized: Partial<Record<string, Partial<Record<TuiAgent, string>>>> = {}
  for (const [hostKey, hostModels] of Object.entries(value)) {
    if (!isSafeRecordKey(hostKey)) {
      continue
    }
    const models = normalizeAgentModelRecord(hostModels)
    if (models) {
      normalized[hostKey] = models
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined
}

function normalizeModelChoice(value: unknown): RuntimeSourceControlModelChoice | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const choice: RuntimeSourceControlModelChoice = {}
  const selectedModelByAgent = normalizeAgentModelRecord(value.selectedModelByAgent)
  const selectedModelByAgentByHost = normalizeHostAgentModelRecord(value.selectedModelByAgentByHost)
  const selectedThinkingByModel = normalizeStringRecord(value.selectedThinkingByModel)
  if (selectedModelByAgent) {
    choice.selectedModelByAgent = selectedModelByAgent
  }
  if (selectedModelByAgentByHost) {
    choice.selectedModelByAgentByHost = selectedModelByAgentByHost
  }
  if (selectedThinkingByModel) {
    choice.selectedThinkingByModel = selectedThinkingByModel
  }
  return Object.keys(choice).length > 0 ? choice : undefined
}

function normalizeOperationRecord<T>(
  value: unknown,
  normalizeValue: (value: unknown) => T | undefined
): Partial<Record<RuntimeSourceControlOperation, T>> | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const normalized: Partial<Record<RuntimeSourceControlOperation, T>> = {}
  for (const operation of SOURCE_CONTROL_TEXT_ACTION_IDS) {
    if (!Object.prototype.hasOwnProperty.call(value, operation)) {
      continue
    }
    const item = normalizeValue(value[operation])
    if (item !== undefined) {
      normalized[operation] = item
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined
}

function normalizeActionRecipe(value: unknown): RuntimeSourceControlActionRecipe | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const normalized: RuntimeSourceControlActionRecipe = {}
  if (value.agentId === null || value.agentId === 'custom' || isRuntimeTuiAgent(value.agentId)) {
    normalized.agentId = value.agentId
  }
  if (typeof value.commandInputTemplate === 'string') {
    normalized.commandInputTemplate = value.commandInputTemplate
  }
  if (typeof value.agentArgs === 'string') {
    normalized.agentArgs = value.agentArgs
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined
}

function normalizeActionRecord(value: unknown) {
  if (!isRecord(value)) {
    return undefined
  }
  const normalized: Partial<
    Record<RuntimeSourceControlActionId, RuntimeSourceControlActionRecipe>
  > = {}
  for (const actionId of SOURCE_CONTROL_ACTION_IDS) {
    if (!Object.prototype.hasOwnProperty.call(value, actionId)) {
      continue
    }
    const raw = value[actionId]
    if (isRecord(raw)) {
      const item: RuntimeSourceControlActionRecipe = {
        ...normalizeActionRecipe(raw),
        ...(raw.commandInputTemplate === null ? { commandInputTemplate: null } : {}),
        ...(raw.agentArgs === null ? { agentArgs: null } : {})
      }
      if (Object.keys(item).length > 0) {
        normalized[actionId] = item
      }
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined
}

function commandTemplateFromInstruction(instruction: string): string {
  const trimmed = instruction.trim()
  return trimmed ? ['{basePrompt}', '', trimmed].join('\n') : '{basePrompt}'
}

function commandTemplateForOperation(
  operation: RuntimeSourceControlOperation,
  instruction: string
) {
  const trimmed = instruction.trim()
  if (!trimmed) {
    return '{basePrompt}'
  }
  return operation === 'branchName'
    ? [trimmed, '', '{basePrompt}'].join('\n')
    : commandTemplateFromInstruction(trimmed)
}

function normalizePrCreationDefaults(
  value: unknown
): RuntimeRepoSourceControlAiOverrides['prCreationDefaults'] {
  if (!isRecord(value)) {
    return undefined
  }
  const normalized: NonNullable<RuntimeRepoSourceControlAiOverrides['prCreationDefaults']> = {}
  for (const key of PR_CREATION_DEFAULT_KEYS) {
    const item = value[key]
    if (typeof item === 'boolean' || item === null) {
      normalized[key] = item
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined
}

export function normalizeRuntimeRepoSourceControlAiOverrides(
  value: unknown
): RuntimeRepoSourceControlAiOverrides | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const normalized: RuntimeRepoSourceControlAiOverrides = {}
  if (typeof value.enabled === 'boolean') {
    normalized.enabled = value.enabled
  }
  if (typeof value.customAgentCommand === 'string' && value.customAgentCommand.trim()) {
    normalized.customAgentCommand = value.customAgentCommand.trim()
  }
  const modelOverrides = normalizeOperationRecord(
    value.modelOverridesByOperation,
    normalizeModelChoice
  )
  const instructions = normalizeOperationRecord(value.instructionsByOperation, (item) =>
    typeof item === 'string' || item === null ? item : undefined
  )
  if (modelOverrides) {
    normalized.modelOverridesByOperation = modelOverrides
  }
  if (instructions) {
    normalized.instructionsByOperation = instructions
  }
  const actionOverrides = { ...normalizeActionRecord(value.actionOverrides) }
  for (const operation of SOURCE_CONTROL_TEXT_ACTION_IDS) {
    const instruction = instructions?.[operation]
    const existingTemplate = actionOverrides[operation]?.commandInputTemplate
    const isLegacyBranchTemplate =
      operation === 'branchName' &&
      typeof instruction === 'string' &&
      existingTemplate === commandTemplateFromInstruction(instruction)
    if (
      typeof instruction === 'string' &&
      (existingTemplate === undefined || isLegacyBranchTemplate)
    ) {
      actionOverrides[operation] = {
        ...actionOverrides[operation],
        commandInputTemplate: commandTemplateForOperation(operation, instruction)
      }
    }
  }
  if (Object.keys(actionOverrides).length > 0) {
    normalized.actionOverrides = actionOverrides
  }
  const prCreationDefaults = normalizePrCreationDefaults(value.prCreationDefaults)
  if (prCreationDefaults) {
    normalized.prCreationDefaults = prCreationDefaults
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined
}

export function normalizeRuntimeRepoBadgeColor(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const match = value.trim().match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  if (!match) {
    return null
  }
  const rawHex = match[1].toLowerCase()
  return `#${rawHex.length === 3 ? rawHex.replace(/./g, (part) => part + part) : rawHex}`
}

export { sanitizeRepoIcon }
