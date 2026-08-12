import { z } from 'zod'
import { isCustomAgentId } from '~shared/commit-message/agent-spec'
import type { PersistedNativeChatSessionOptions } from '~shared/native-chat/session-options'
import {
  SOURCE_CONTROL_ACTION_IDS,
  SOURCE_CONTROL_TEXT_ACTION_IDS
} from '~shared/source-control/ai-actions'
import type { SourceControlAiSettings } from '~shared/source-control/ai-types'
import { isTuiAgent } from '~shared/tui-agent/config'
import type { CommitMessageAiSettings, GlobalSettings } from '~shared/types'

const finiteNumber = z.number().finite()

const tuiAgent = z.string().transform((value, context) => {
  if (isTuiAgent(value)) {
    return value
  }
  context.addIssue({ code: 'custom' })
  return z.NEVER
})

const sourceControlAgent = z.string().transform((value, context) => {
  if (isTuiAgent(value) || isCustomAgentId(value)) {
    return value
  }
  context.addIssue({ code: 'custom' })
  return z.NEVER
})

const tuiAgentStringRecord = z.record(tuiAgent, z.string())
const selectedModelByAgentByHost = z.record(z.string(), tuiAgentStringRecord)
const stringRecord = z.record(z.string(), z.string())

const modelCapability = z.object({
  id: z.string(),
  label: z.string(),
  thinkingLevels: z.array(z.object({ id: z.string(), label: z.string() })).optional(),
  defaultThinkingLevel: z.string().optional()
})

const discoveredModelsByAgent = z.record(tuiAgent, z.array(modelCapability))
const discoveredModelsByAgentByHost = z.record(z.string(), discoveredModelsByAgent)

const commitMessageAi = z
  .object({
    enabled: z.boolean(),
    agentId: z.union([tuiAgent, z.literal('custom'), z.null()]),
    selectedModelByAgent: tuiAgentStringRecord,
    selectedModelByAgentByHost: selectedModelByAgentByHost.optional(),
    discoveredModelsByAgent: discoveredModelsByAgent.optional(),
    discoveredModelsByAgentByHost: discoveredModelsByAgentByHost.optional(),
    selectedThinkingByModel: stringRecord,
    customPrompt: z.string(),
    customAgentCommand: z.string()
  })
  .transform((value): CommitMessageAiSettings => value)

const sourceControlActionRecipe = z.object({
  agentId: z.union([sourceControlAgent, z.null()]).optional(),
  commandInputTemplate: z.string().optional(),
  agentArgs: z.string().optional()
})

const sourceControlActionDefaults = z.partialRecord(
  z.enum(SOURCE_CONTROL_ACTION_IDS),
  sourceControlActionRecipe
)

const sourceControlModelChoice = z.object({
  selectedModelByAgent: tuiAgentStringRecord.optional(),
  selectedModelByAgentByHost: selectedModelByAgentByHost.optional(),
  selectedThinkingByModel: stringRecord.optional()
})

const sourceControlAi = z
  .object({
    enabled: z.boolean(),
    actions: sourceControlActionDefaults.optional(),
    agentId: z.union([tuiAgent, z.literal('custom'), z.null()]),
    selectedModelByAgent: tuiAgentStringRecord,
    selectedModelByAgentByHost: selectedModelByAgentByHost.optional(),
    discoveredModelsByAgent: discoveredModelsByAgent.optional(),
    discoveredModelsByAgentByHost: discoveredModelsByAgentByHost.optional(),
    selectedThinkingByModel: stringRecord,
    customAgentCommand: z.string(),
    instructionsByOperation: z.partialRecord(z.enum(SOURCE_CONTROL_TEXT_ACTION_IDS), z.string()),
    modelOverridesByOperation: z
      .partialRecord(z.enum(SOURCE_CONTROL_TEXT_ACTION_IDS), sourceControlModelChoice)
      .optional(),
    prCreationDefaults: z
      .object({
        draft: z.boolean().optional(),
        useTemplate: z.boolean().optional(),
        generateDetailsOnOpen: z.boolean().optional(),
        openAfterCreate: z.boolean().optional()
      })
      .optional(),
    launchActionDefaults: sourceControlActionDefaults.optional()
  })
  .transform((value): SourceControlAiSettings => value)

const nativeChatSessionOptions = z
  .record(
    z.string(),
    z.object({
      model: z.string().optional(),
      valuesByModel: z
        .record(z.string(), z.record(z.string(), z.union([z.string(), z.boolean()])))
        .optional()
    })
  )
  .transform((value): PersistedNativeChatSessionOptions => value)

const notifications = z.object({
  enabled: z.boolean(),
  agentTaskComplete: z.boolean(),
  terminalBell: z.boolean(),
  suppressWhenFocused: z.boolean(),
  customSoundId: z.enum([
    'system',
    'two-tone',
    'bong',
    'thump',
    'blip',
    'sonar',
    'blop',
    'ding',
    'clack',
    'beep',
    'custom'
  ]),
  customSoundPath: z.string().nullable(),
  customSoundVolume: finiteNumber
})

const telemetry = z.object({
  optedIn: z.boolean().nullable(),
  installId: z.string(),
  existedBeforeTelemetryRelease: z.boolean()
})

const speechModelType = z.enum([
  'transducer',
  'paraformer',
  'whisper',
  'senseVoice',
  'nemo-ctc',
  'openai'
])

const voice = z.object({
  enabled: z.boolean(),
  sttModel: z.string(),
  modelsDir: z.string(),
  language: z.string(),
  dictationMode: z.enum(['toggle', 'hold']),
  terminalConfirmBeforeInsert: z.boolean(),
  userModels: z.array(
    z.object({
      id: z.string(),
      type: speechModelType,
      dir: z.string(),
      sampleRate: finiteNumber.optional()
    })
  ),
  openAiApiKeyConfigured: z.boolean()
})

export function createFeatureSettingSchemas(defaults: GlobalSettings) {
  return {
    nativeChatSessionOptions: nativeChatSessionOptions
      .optional()
      .catch(() => defaults.nativeChatSessionOptions),
    notifications: notifications.catch(defaults.notifications),
    commitMessageAi: commitMessageAi.optional().catch(() => defaults.commitMessageAi),
    sourceControlAi: sourceControlAi.optional().catch(() => defaults.sourceControlAi),
    telemetry: telemetry.optional().catch(defaults.telemetry),
    voice: voice.optional().catch(defaults.voice)
  }
}
