import {
  CUSTOM_AGENT_ID,
  getCommitMessageAgentSpec,
  getCommitMessageModel,
  isCustomAgentId,
  listCommitMessageAgentCapabilities,
  resolveCommitMessageAgentChoice
} from '../commit-message/agent-spec'
import { LOCAL_COMMIT_MESSAGE_HOST_KEY } from '../commit-message/host-key'
import type { GlobalSettings, Repo, TuiAgent } from '../types'
import {
  readSourceControlActionDefault,
  resolveSourceControlActionCommandTemplate,
  type SourceControlActionId,
  type SourceControlActionRecipe
} from './ai-actions'
import { normalizeRepoSourceControlAiOverrides } from './ai-normalization'
import { hasActionAgentRecipe } from './ai-recipe-templates'
import {
  getDiscoveredModels,
  resolveActionRecipeForTextOperation,
  resolveInstructionsFromNormalized,
  resolvePrCreationDefaults,
  resolveThinkingLevel,
  selectConfiguredModelId
} from './ai-resolution-model'
import { normalizeSourceControlAiSettings } from './ai-settings'
import type { SourceControlAiOperation, SourceControlAiPrCreationDefaults } from './ai-types'

export { mergeLegacyCommitMessageAiIntoSourceControlAi } from './ai-legacy-migration'
export { normalizeRepoSourceControlAiOverrides } from './ai-normalization'
export {
  DEFAULT_SOURCE_CONTROL_AI_PR_CREATION_DEFAULTS,
  getDefaultSourceControlAiSettings,
  normalizeSourceControlAiSettings,
  projectSourceControlAiToLegacyCommitMessageAi,
  readSourceControlAiModelChoiceForHost,
  sourceControlAiSettingsFromLegacy
} from './ai-settings'

export type ResolvedSourceControlAiGenerationParams = {
  agentId: TuiAgent | 'custom'
  model: string
  thinkingLevel?: string
  customPrompt?: string
  commandInputTemplate?: string
  agentArgs?: string
  customAgentCommand?: string
  agentCommandOverride?: string
}

export type ResolvedSourceControlAiOperation = {
  enabled: boolean
  params: ResolvedSourceControlAiGenerationParams
  prCreationDefaults: Required<SourceControlAiPrCreationDefaults>
}

export type ResolveSourceControlAiResult =
  | { ok: true; value: ResolvedSourceControlAiOperation }
  | { ok: false; error: string }

type ResolveSourceControlAiInput = {
  settings: Pick<
    GlobalSettings,
    'defaultTuiAgent' | 'agentCmdOverrides' | 'commitMessageAi' | 'sourceControlAi'
  > &
    Partial<Pick<GlobalSettings, 'disabledTuiAgents'>>
  repo?: Pick<Repo, 'sourceControlAi'> | null
  operation: SourceControlAiOperation
  discoveryHostKey?: string
  prCreationProductDefaults?: SourceControlAiPrCreationDefaults
}

export type ResolveSourceControlAiPrCreationDefaultsInput = {
  settings: Pick<GlobalSettings, 'commitMessageAi' | 'sourceControlAi'>
  repo?: Pick<Repo, 'sourceControlAi'> | null
  prCreationProductDefaults?: SourceControlAiPrCreationDefaults
}

const OPERATION_LABEL: Record<SourceControlAiOperation, string> = {
  commitMessage: 'commit messages',
  pullRequest: 'pull request details',
  branchName: 'branch names'
}

function supportedSourceControlAiAgentSummary(): string {
  return `Supported agents: ${listCommitMessageAgentCapabilities()
    .map((capability) => capability.label)
    .join(', ')}, or Custom command.`
}

export function resolveSourceControlAiPrCreationDefaults(
  input: ResolveSourceControlAiPrCreationDefaultsInput
): Required<SourceControlAiPrCreationDefaults> {
  const source = normalizeSourceControlAiSettings(
    input.settings.sourceControlAi,
    input.settings.commitMessageAi
  )
  return resolvePrCreationDefaults(
    source,
    normalizeRepoSourceControlAiOverrides(input.repo?.sourceControlAi),
    input.prCreationProductDefaults
  )
}

export function resolveSourceControlAiEnabled(input: {
  settings: Pick<GlobalSettings, 'sourceControlAi' | 'commitMessageAi'> | null | undefined
  repo?: Pick<Repo, 'sourceControlAi'> | null
}): boolean {
  const source = normalizeSourceControlAiSettings(
    input.settings?.sourceControlAi,
    input.settings?.commitMessageAi
  )
  const repoOverrides = normalizeRepoSourceControlAiOverrides(input.repo?.sourceControlAi)
  return repoOverrides?.enabled ?? source.enabled
}

export function resolveSourceControlActionRecipe(input: {
  settings: Pick<GlobalSettings, 'sourceControlAi' | 'commitMessageAi'> | null | undefined
  repo?: Pick<Repo, 'sourceControlAi'> | null
  actionId: SourceControlActionId
}): SourceControlActionRecipe {
  const source = normalizeSourceControlAiSettings(
    input.settings?.sourceControlAi,
    input.settings?.commitMessageAi
  )
  const globalRecipe = readSourceControlActionDefault(source.actions, input.actionId)
  const repoRecipe = normalizeRepoSourceControlAiOverrides(input.repo?.sourceControlAi)
    ?.actionOverrides?.[input.actionId]
  if (!repoRecipe) {
    return {
      ...globalRecipe,
      commandInputTemplate: resolveSourceControlActionCommandTemplate(
        source.actions,
        input.actionId
      )
    }
  }
  return {
    ...globalRecipe,
    commandInputTemplate: resolveSourceControlActionCommandTemplate(source.actions, input.actionId),
    ...(repoRecipe.agentId !== undefined ? { agentId: repoRecipe.agentId } : {}),
    ...(typeof repoRecipe.commandInputTemplate === 'string'
      ? { commandInputTemplate: repoRecipe.commandInputTemplate.trim() }
      : {}),
    ...(typeof repoRecipe.agentArgs === 'string'
      ? { agentArgs: repoRecipe.agentArgs.trim() }
      : repoRecipe.agentArgs === null
        ? { agentArgs: '' }
        : {})
  }
}

export function resolveSourceControlAiForOperation(
  input: ResolveSourceControlAiInput
): ResolveSourceControlAiResult {
  const legacy = input.settings.commitMessageAi
  const source = normalizeSourceControlAiSettings(input.settings.sourceControlAi, legacy)
  const repoOverrides = normalizeRepoSourceControlAiOverrides(input.repo?.sourceControlAi)

  const prCreationDefaults = resolvePrCreationDefaults(
    source,
    repoOverrides,
    input.prCreationProductDefaults
  )
  const actionRecipe = resolveActionRecipeForTextOperation(source, repoOverrides, input.operation)
  if (!actionRecipe.commandInputTemplate.trim()) {
    return {
      ok: false,
      error: `Command template is empty for ${OPERATION_LABEL[input.operation]}.`
    }
  }
  // Why: action recipes own the new customization model. The legacy global
  // agent remains a fallback so existing users migrate without losing intent.
  const preferredAgent = hasActionAgentRecipe(actionRecipe) ? actionRecipe.agentId : source.agentId
  const agentChoice = resolveCommitMessageAgentChoice(
    preferredAgent,
    input.settings.defaultTuiAgent,
    input.settings.disabledTuiAgents
  )
  if (!agentChoice) {
    return {
      ok: false,
      error: `Choose a supported Source Control AI agent for this action in Settings -> Git -> Source Control AI. ${supportedSourceControlAiAgentSummary()}`
    }
  }

  const customAgentCommand =
    repoOverrides?.customAgentCommand?.trim() || source.customAgentCommand.trim()
  if (isCustomAgentId(agentChoice)) {
    if (!customAgentCommand) {
      return {
        ok: false,
        error: 'Custom command is empty. Add one in Settings -> Git -> Source Control AI.'
      }
    }
    return {
      ok: true,
      value: {
        enabled: true,
        params: {
          agentId: CUSTOM_AGENT_ID,
          model: '',
          customPrompt: resolveInstructionsFromNormalized(
            source,
            repoOverrides,
            input.operation,
            legacy?.customPrompt
          ),
          commandInputTemplate: actionRecipe.commandInputTemplate,
          ...(actionRecipe.agentArgs !== undefined ? { agentArgs: actionRecipe.agentArgs } : {}),
          customAgentCommand
        },
        prCreationDefaults
      }
    }
  }

  const agentId = agentChoice
  const actionAgentId = actionRecipe.agentId ?? agentId
  const resolvedActionAgentId =
    actionAgentId === agentId
      ? agentId
      : resolveCommitMessageAgentChoice(
          actionAgentId,
          input.settings.defaultTuiAgent,
          input.settings.disabledTuiAgents
        )
  if (!resolvedActionAgentId || isCustomAgentId(resolvedActionAgentId)) {
    return {
      ok: false,
      error: `Choose a supported Source Control AI agent for this action. ${supportedSourceControlAiAgentSummary()}`
    }
  }
  const spec = getCommitMessageAgentSpec(resolvedActionAgentId)
  if (!spec) {
    return {
      ok: false,
      error: `Agent "${resolvedActionAgentId}" does not support Source Control AI ${OPERATION_LABEL[input.operation]}. ${supportedSourceControlAiAgentSummary()}`
    }
  }

  const hostKey = input.discoveryHostKey ?? LOCAL_COMMIT_MESSAGE_HOST_KEY
  const configuredModelId = selectConfiguredModelId({
    source,
    legacy,
    repoOverrides,
    operation: input.operation,
    hostKey,
    agentId: resolvedActionAgentId
  })
  const selectedModelId = configuredModelId ?? spec.defaultModelId
  const discoveredModels = getDiscoveredModels(source, legacy, hostKey, resolvedActionAgentId)
  const model =
    spec.models.find((candidate) => candidate.id === selectedModelId) ??
    discoveredModels.find((candidate) => candidate.id === selectedModelId) ??
    getCommitMessageModel(resolvedActionAgentId, spec.defaultModelId)
  if (!model) {
    return { ok: false, error: `No model is available for ${spec.label}.` }
  }

  // Why: Pi spans providers with independent auth. When the user did not pick a
  // model, omitting --model lets Pi use the provider already configured in Pi.
  const usePiConfiguredDefault = resolvedActionAgentId === 'pi' && !configuredModelId
  const thinkingLevel = usePiConfiguredDefault
    ? undefined
    : resolveThinkingLevel({
        model,
        source,
        legacy,
        repoOverrides,
        operation: input.operation
      })
  const agentCommandOverride = input.settings.agentCmdOverrides?.[resolvedActionAgentId]?.trim()
  return {
    ok: true,
    value: {
      enabled: true,
      params: {
        agentId: resolvedActionAgentId,
        model: usePiConfiguredDefault ? '' : model.id,
        thinkingLevel,
        customPrompt: resolveInstructionsFromNormalized(
          source,
          repoOverrides,
          input.operation,
          legacy?.customPrompt
        ),
        commandInputTemplate: actionRecipe.commandInputTemplate,
        ...(actionRecipe.agentArgs !== undefined ? { agentArgs: actionRecipe.agentArgs } : {}),
        ...(customAgentCommand ? { customAgentCommand } : {}),
        ...(agentCommandOverride ? { agentCommandOverride } : {})
      },
      prCreationDefaults
    }
  }
}
