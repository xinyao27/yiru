import type { TuiAgent } from '@yiru/workbench-model/agent'
import { z } from 'zod'

const TUI_AGENT_IDS = [
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
const TUI_AGENT_ID_SET: ReadonlySet<string> = new Set(TUI_AGENT_IDS)

const TERMINAL_PANE_SPLIT_SOURCES = [
  'contextual_tour',
  'keyboard',
  'context_menu',
  'command',
  'unknown'
] as const

function requiredString(message: string) {
  return z
    .unknown()
    .transform((value) => (typeof value === 'string' ? value : ''))
    .pipe(z.string().min(1, message))
}

const OptionalFiniteNumber = z
  .unknown()
  .transform((value) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined))
  .pipe(z.union([z.number(), z.undefined()]))
  .optional()

const OptionalString = z
  .unknown()
  .transform((value) => (typeof value === 'string' && value.length > 0 ? value : undefined))
  .pipe(z.union([z.string(), z.undefined()]))
  .optional()

export const TerminalHandleInputSchema = z.object({
  terminal: requiredString('Missing terminal handle')
})

export const TerminalViewportInputSchema = z.object({
  cols: z.number().int().min(1).max(1000),
  rows: z.number().int().min(1).max(500)
})

export const TerminalSubscribeInputSchema = TerminalHandleInputSchema.extend({
  client: z
    .object({
      id: requiredString('Missing client ID'),
      type: z.enum(['mobile', 'desktop']).default('desktop')
    })
    .optional(),
  viewport: TerminalViewportInputSchema.optional(),
  capabilities: z
    .object({
      terminalBinaryStream: z.literal(1).optional(),
      desktopViewportClaims: z.literal(1).optional(),
      mobileInputLeaseOnly: z.literal(1).optional()
    })
    .optional()
})

export const TerminalMultiplexInputSchema = z
  .object({ bulkTicket: requiredString('Missing terminal bulk ticket') })
  .strict()

export const TerminalOpenMultiplexInputSchema = z
  .object({
    environmentId: requiredString('Missing environment ID'),
    clientInstanceId: requiredString('Missing client instance ID')
  })
  .strict()

export const TerminalListInputSchema = z.object({
  worktree: OptionalString,
  limit: OptionalFiniteNumber,
  requireFreshPtyLiveness: z.boolean().optional()
})

export const TerminalResolveActiveInputSchema = z.object({ worktree: OptionalString })

export const TerminalResolvePaneInputSchema = z.object({
  paneKey: requiredString('Missing pane key')
})

export const TerminalReadInputSchema = TerminalHandleInputSchema.extend({
  cursor: z
    .unknown()
    .transform((value) => {
      if (value === undefined) {
        return undefined
      }
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        return Number.NaN
      }
      return value
    })
    .pipe(
      z
        .number()
        .optional()
        .refine((value) => value === undefined || Number.isFinite(value), {
          message: 'Cursor must be a non-negative integer'
        })
    )
    .optional(),
  limit: OptionalFiniteNumber
})

export const TerminalRenameInputSchema = TerminalHandleInputSchema.extend({
  title: z.custom<string | null>((value) => value === null || typeof value === 'string', {
    message: 'Missing --title (pass empty string or null to reset)'
  })
})

export const TerminalSendInputSchema = TerminalHandleInputSchema.extend({
  text: OptionalString,
  enter: z.unknown().optional(),
  interrupt: z.unknown().optional(),
  requireAgentStatus: z.enum(['sendable']).optional(),
  inputKind: z.enum(['query-reply']).optional(),
  client: z
    .object({
      id: requiredString('Missing client ID'),
      type: z.enum(['mobile', 'desktop']).default('desktop').optional()
    })
    .optional(),
  viewport: z
    .object({
      cols: z.number().int().min(1).max(1000),
      rows: z.number().int().min(1).max(500)
    })
    .optional(),
  claimViewport: z.literal(true).optional()
})

export const TerminalWaitInputSchema = TerminalHandleInputSchema.extend({
  for: z.custom<'exit' | 'tui-idle'>((value) => value === 'exit' || value === 'tui-idle', {
    message: 'Invalid --for value. Supported: exit, tui-idle'
  }),
  timeoutMs: OptionalFiniteNumber
})

export const TerminalCreateInputSchema = z.object({
  worktree: OptionalString,
  viewport: z
    .object({
      cols: z.number().int().min(1).max(1000),
      rows: z.number().int().min(1).max(500)
    })
    .optional(),
  command: OptionalString,
  startupCommandDelivery: z.enum(['fast', 'shell-ready']).optional(),
  env: z.record(z.string(), z.string()).optional(),
  envToDelete: z.array(z.string().min(1).max(256)).max(32).optional(),
  launchConfig: z
    .object({
      agentCommand: z.string().optional(),
      agentArgs: z.string(),
      agentEnv: z.record(z.string(), z.string())
    })
    .optional(),
  launchToken: OptionalString,
  launchAgent: z
    .string()
    .refine((value): value is TuiAgent => TUI_AGENT_ID_SET.has(value))
    .optional(),
  title: OptionalString,
  focus: z.unknown().optional(),
  rendererBacked: z.unknown().optional(),
  activate: z.unknown().optional(),
  presentation: z.enum(['background', 'focused']).optional(),
  tabId: OptionalString,
  leafId: OptionalString
})

export const TerminalSplitInputSchema = TerminalHandleInputSchema.extend({
  direction: z
    .unknown()
    .transform((value) => (value === 'vertical' || value === 'horizontal' ? value : undefined))
    .pipe(z.union([z.enum(['vertical', 'horizontal']), z.undefined()]))
    .optional(),
  command: OptionalString,
  env: z.record(z.string(), z.string()).optional(),
  telemetrySource: z.enum(TERMINAL_PANE_SPLIT_SOURCES).optional()
})

export const TerminalStopInputSchema = z.object({
  worktree: requiredString('Missing worktree selector')
})

export const TerminalStopExactInputSchema = TerminalStopInputSchema.extend({
  expectedPtyIds: z.array(requiredString('Missing PTY ID')).min(1),
  keepHistory: z.boolean().optional(),
  targetOnly: z.boolean().optional()
})

export const TerminalResizeForClientInputSchema = z.discriminatedUnion('mode', [
  z.object({
    terminal: requiredString('Missing terminal handle'),
    mode: z.literal('mobile-fit'),
    cols: z.number().finite().positive(),
    rows: z.number().finite().positive(),
    clientId: requiredString('Missing client ID')
  }),
  z.object({
    terminal: requiredString('Missing terminal handle'),
    mode: z.literal('restore'),
    clientId: requiredString('Missing client ID')
  })
])

export const TerminalSetDisplayModeInputSchema = TerminalHandleInputSchema.extend({
  mode: z.enum(['auto', 'desktop']),
  client: z
    .object({
      id: requiredString('Missing client ID'),
      type: z.enum(['mobile', 'desktop']).default('desktop').optional()
    })
    .optional(),
  viewport: z
    .object({
      cols: z.number().int().positive(),
      rows: z.number().int().positive()
    })
    .optional()
})

export const TerminalUnsubscribeInputSchema = z.object({
  subscriptionId: requiredString('Missing subscription ID'),
  client: z.object({ id: requiredString('Missing client ID') }).optional()
})

export const TerminalUpdateViewportInputSchema = TerminalHandleInputSchema.extend({
  client: z.object({
    id: requiredString('Missing client ID'),
    type: z.enum(['mobile', 'desktop']).default('mobile').optional()
  }),
  viewport: z.object({
    cols: z.number().int().min(20).max(240),
    rows: z.number().int().min(8).max(120)
  }),
  claim: z.boolean().optional()
})

export const TerminalSetAutoRestoreFitInputSchema = z.object({
  ms: z.number().nullable()
})

export const TerminalEmptyInputSchema = z.object({})

export type TerminalHandleInput = z.infer<typeof TerminalHandleInputSchema>
export type TerminalViewportInput = z.infer<typeof TerminalViewportInputSchema>
export type TerminalSubscribeInput = z.infer<typeof TerminalSubscribeInputSchema>
export type TerminalMultiplexInput = z.infer<typeof TerminalMultiplexInputSchema>
export type TerminalOpenMultiplexInput = z.infer<typeof TerminalOpenMultiplexInputSchema>
export type TerminalListInput = z.infer<typeof TerminalListInputSchema>
export type TerminalResolveActiveInput = z.infer<typeof TerminalResolveActiveInputSchema>
export type TerminalResolvePaneInput = z.infer<typeof TerminalResolvePaneInputSchema>
export type TerminalReadInput = z.infer<typeof TerminalReadInputSchema>
export type TerminalRenameInput = z.infer<typeof TerminalRenameInputSchema>
export type TerminalSendInput = z.infer<typeof TerminalSendInputSchema>
export type TerminalWaitInput = z.infer<typeof TerminalWaitInputSchema>
export type TerminalCreateInput = z.infer<typeof TerminalCreateInputSchema>
export type TerminalSplitInput = z.infer<typeof TerminalSplitInputSchema>
export type TerminalStopInput = z.infer<typeof TerminalStopInputSchema>
export type TerminalStopExactInput = z.infer<typeof TerminalStopExactInputSchema>
export type TerminalResizeForClientInput = z.infer<typeof TerminalResizeForClientInputSchema>
export type TerminalSetDisplayModeInput = z.infer<typeof TerminalSetDisplayModeInputSchema>
export type TerminalUnsubscribeInput = z.infer<typeof TerminalUnsubscribeInputSchema>
export type TerminalUpdateViewportInput = z.infer<typeof TerminalUpdateViewportInputSchema>
export type TerminalSetAutoRestoreFitInput = z.infer<typeof TerminalSetAutoRestoreFitInputSchema>
