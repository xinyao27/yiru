import type { TuiAgent } from '@yiru/workbench-model/agent'
import { z } from 'zod'

export const OptionalFiniteNumber = z
  .unknown()
  .transform((value) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined))
  .pipe(z.union([z.number(), z.undefined()]))
  .optional()

export const OptionalPositiveInt = z
  .unknown()
  .transform((value) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
  )
  .pipe(z.union([z.number(), z.undefined()]))
  .optional()

export const OptionalString = z
  .unknown()
  .transform((value) => (typeof value === 'string' && value.length > 0 ? value : undefined))
  .pipe(z.union([z.string(), z.undefined()]))
  .optional()

export const OptionalPlainString = z
  .unknown()
  .transform((value) => (typeof value === 'string' ? value : undefined))
  .pipe(z.union([z.string(), z.undefined()]))
  .optional()

export const OptionalBoolean = z
  .unknown()
  .transform((value) => (typeof value === 'boolean' ? value : undefined))
  .pipe(z.union([z.boolean(), z.undefined()]))
  .optional()

export const TriStateLinkedReviewNumber = z
  .unknown()
  .transform((value) => {
    if (value === null) {
      return null
    }
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
  })
  .pipe(z.union([z.number(), z.null(), z.undefined()]))
  .optional()

export function requiredString(message: string) {
  return z
    .unknown()
    .transform((value) => (typeof value === 'string' ? value : ''))
    .pipe(z.string().min(1, message))
}

export function requiredNumber(message: string) {
  return z
    .unknown()
    .transform((value) =>
      typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN
    )
    .pipe(z.number().refine((value) => Number.isFinite(value), { message }))
}

export const TUI_AGENT_VALUES = [
  'claude',
  'claude-agent-teams',
  'openclaude',
  'codex',
  'autohand',
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
  'devin',
  'ante',
  'trae'
] as const satisfies readonly TuiAgent[]

const TUI_AGENT_SET: ReadonlySet<string> = new Set(TUI_AGENT_VALUES)

export function isRuntimeTuiAgent(value: unknown): value is TuiAgent {
  return typeof value === 'string' && TUI_AGENT_SET.has(value)
}

export const OptionalTuiAgent = z
  .unknown()
  .superRefine((value, context) => {
    if (value !== undefined && !isRuntimeTuiAgent(value)) {
      context.addIssue({ code: 'custom', message: 'Unknown TUI agent' })
    }
  })
  .transform((value): TuiAgent | undefined => (isRuntimeTuiAgent(value) ? value : undefined))
  .optional()

export const WorkspaceSourceSchema = z.enum([
  'command_palette',
  'sidebar',
  'shortcut',
  'drag_drop',
  'onboarding',
  'terminal_context_menu',
  'unknown'
])

function hasUnsafeLaunchEnvChars(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x1f || code === 0x7f) {
      return true
    }
  }
  return false
}

function isUnsafeObjectKey(value: string): boolean {
  return value === '__proto__' || value === 'constructor' || value === 'prototype'
}

const SleepingAgentLaunchEnvSchema = z.preprocess(
  (raw) => {
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
      return undefined
    }
    const cleaned: Record<string, string> = Object.create(null)
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const trimmedKey = key.trim()
      if (
        trimmedKey.length === 0 ||
        isUnsafeObjectKey(trimmedKey) ||
        trimmedKey.includes('=') ||
        hasUnsafeLaunchEnvChars(trimmedKey) ||
        typeof value !== 'string' ||
        value.includes('\0')
      ) {
        return undefined
      }
      cleaned[trimmedKey] = value
    }
    return { ...cleaned }
  },
  z.record(z.string(), z.string())
)

const SleepingAgentLaunchConfigBaseSchema = z.object({
  agentCommand: z.string().optional(),
  agentArgs: z.string(),
  agentEnv: SleepingAgentLaunchEnvSchema,
  ompResumeFilePath: z
    .string()
    .min(1)
    .max(32 * 1024)
    .refine((value) => !hasUnsafeLaunchEnvChars(value))
    .optional()
})

export const SleepingAgentLaunchConfigSchema = z.preprocess((raw) => {
  const parsed = SleepingAgentLaunchConfigBaseSchema.safeParse(raw)
  return parsed.success ? parsed.data : undefined
}, SleepingAgentLaunchConfigBaseSchema.optional())
