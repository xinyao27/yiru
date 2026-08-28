import { isCustomAgentId } from '@yiru/runtime-protocol/workbench/commit-message/agent-spec'
import {
  SOURCE_CONTROL_ACTION_IDS,
  SOURCE_CONTROL_TEXT_ACTION_IDS
} from '@yiru/runtime-protocol/workbench/source-control/ai-actions'
import type { SourceControlAiSettings } from '@yiru/runtime-protocol/workbench/source-control/ai-types'
import { isTuiAgent } from '@yiru/runtime-protocol/workbench/tui-agent/config'
import type {
  CommitMessageAiSettings,
  GlobalSettings
} from '@yiru/runtime-protocol/workbench/types'
import { z } from 'zod'

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

const notificationSoundId = z.enum([
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
])

const telemetry = z.object({
  optedIn: z.boolean().nullable(),
  installId: z.string(),
  existedBeforeTelemetryRelease: z.boolean()
})

function createNotificationSettingsSchema(defaults: GlobalSettings['notifications']) {
  return z
    .object({
      enabled: z.boolean().catch(defaults.enabled),
      agentTaskComplete: z.boolean().catch(defaults.agentTaskComplete),
      terminalBell: z.boolean().catch(defaults.terminalBell),
      suppressWhenFocused: z.boolean().catch(defaults.suppressWhenFocused),
      customSoundId: notificationSoundId.catch(defaults.customSoundId),
      customSoundPath: z.string().nullable().catch(defaults.customSoundPath),
      customSoundVolume: finiteNumber.catch(defaults.customSoundVolume)
    })
    .catch(defaults)
}

export function createFeatureSettingSchemas(defaults: GlobalSettings) {
  return {
    notifications: createNotificationSettingsSchema(defaults.notifications),
    commitMessageAi: commitMessageAi.optional().catch(() => defaults.commitMessageAi),
    sourceControlAi: sourceControlAi.optional().catch(() => defaults.sourceControlAi),
    telemetry: telemetry.optional().catch(defaults.telemetry)
  }
}
