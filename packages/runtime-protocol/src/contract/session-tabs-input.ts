import type { TuiAgent } from '@yiru/workbench-model/agent'
import { MAX_QUICK_COMMAND_AGENT_PROMPT_LENGTH } from '@yiru/workbench-model/ui'
import { z } from 'zod'

import {
  isRuntimeTuiAgent,
  OptionalBoolean,
  SleepingAgentLaunchConfigSchema
} from './input-schema.js'

export const WorktreeTabSelector = z.object({
  worktree: requiredInputString('Missing worktree selector')
})

export const SessionTabsUnsubscribe = WorktreeTabSelector.extend({
  subscriptionId: z.string().min(1).optional()
})

export const SessionTabsUnsubscribeAll = z
  .object({ subscriptionId: z.string().min(1).optional() })
  .nullish()

export const ActivateTab = WorktreeTabSelector.extend({
  tabId: requiredInputString('Missing tab id'),
  leafId: z.string().max(128).optional(),
  notifyClients: OptionalBoolean
})

export type TerminalPaneLayoutNodeInput =
  | { type: 'leaf'; leafId: string }
  | {
      type: 'split'
      direction: 'horizontal' | 'vertical'
      first: TerminalPaneLayoutNodeInput
      second: TerminalPaneLayoutNodeInput
      ratio?: number
    }

const MAX_PANE_LAYOUT_DEPTH = 64
const MAX_PANE_LAYOUT_NODES = 1024
const UnknownRecordSchema = z.record(z.string(), z.unknown())

function isTerminalPaneLayoutNode(value: unknown): value is TerminalPaneLayoutNodeInput {
  let nodeCount = 0
  const stack: { raw: unknown; depth: number }[] = [{ raw: value, depth: 0 }]
  while (stack.length > 0) {
    const entry = stack.pop()
    if (!entry || entry.depth > MAX_PANE_LAYOUT_DEPTH || ++nodeCount > MAX_PANE_LAYOUT_NODES) {
      return false
    }
    const parsed = UnknownRecordSchema.safeParse(entry.raw)
    if (!parsed.success) {
      return false
    }
    const node = parsed.data
    if (node.type === 'leaf') {
      if (typeof node.leafId !== 'string' || node.leafId.length < 1 || node.leafId.length > 128) {
        return false
      }
      continue
    }
    if (node.type === 'split') {
      if (node.direction !== 'horizontal' && node.direction !== 'vertical') {
        return false
      }
      if (
        node.ratio !== undefined &&
        (typeof node.ratio !== 'number' || node.ratio < 0 || node.ratio > 1)
      ) {
        return false
      }
      stack.push(
        { raw: node.first, depth: entry.depth + 1 },
        { raw: node.second, depth: entry.depth + 1 }
      )
      continue
    }
    return false
  }
  return true
}

const TerminalPaneLayoutNodeSchema = z.custom<TerminalPaneLayoutNodeInput>(
  isTerminalPaneLayoutNode,
  { message: 'Invalid or too-deep pane layout tree' }
)

export const UpdatePaneLayout = WorktreeTabSelector.extend({
  tabId: requiredInputString('Missing tab id'),
  root: z.union([z.null(), TerminalPaneLayoutNodeSchema]),
  expandedLeafId: z.string().max(128).nullable().optional(),
  titlesByLeafId: z.record(z.string(), z.string()).optional()
})

export const SetTabProps = WorktreeTabSelector.extend({
  tabId: requiredInputString('Missing tab id'),
  color: z.string().max(64).nullable().optional(),
  isPinned: z.boolean().optional()
})

export const CreateTerminalTab = WorktreeTabSelector.extend({
  afterTabId: z.string().optional(),
  targetGroupId: z.string().optional(),
  command: z.string().optional(),
  cwd: z.string().min(1).optional(),
  env: z.record(z.string(), z.string()).optional(),
  envToDelete: z.array(z.string().min(1).max(256)).max(32).optional(),
  startupCommandDelivery: z.enum(['fast', 'shell-ready']).optional(),
  launchConfig: SleepingAgentLaunchConfigSchema,
  launchToken: z.string().min(1).max(128).optional(),
  agent: z.custom<TuiAgent>(isRuntimeTuiAgent, { message: 'Unknown agent preset' }).optional(),
  agentPrompt: z
    .string()
    .max(MAX_QUICK_COMMAND_AGENT_PROMPT_LENGTH)
    .refine((value) => value.trim().length > 0, { message: 'Agent prompt cannot be empty' })
    .optional(),
  launchAgent: z
    .custom<TuiAgent>(isRuntimeTuiAgent, { message: 'Unknown launch agent' })
    .optional(),
  activate: z.boolean().optional(),
  clientMutationId: z.string().min(1).max(128).optional()
}).superRefine((value, context) => {
  if (value.agentPrompt !== undefined && value.agent === undefined) {
    context.addIssue({
      code: 'custom',
      path: ['agentPrompt'],
      message: 'Agent prompt requires an agent preset'
    })
  }
  if (value.agentPrompt !== undefined && value.command !== undefined) {
    context.addIssue({
      code: 'custom',
      path: ['agentPrompt'],
      message: 'Agent prompt cannot be combined with a startup command'
    })
  }
})

const MoveTabBase = {
  worktree: WorktreeTabSelector.shape.worktree,
  tabId: requiredInputString('Missing tab id'),
  targetGroupId: requiredInputString('Missing target group id')
} as const

export const MoveTab = z.discriminatedUnion('kind', [
  z
    .object({
      ...MoveTabBase,
      kind: z.literal('reorder'),
      tabOrder: z.array(z.string().min(1)).min(1, 'Missing tab order')
    })
    .strict(),
  z
    .object({
      ...MoveTabBase,
      kind: z.literal('move-to-group'),
      index: z.number().int().nonnegative().optional()
    })
    .strict(),
  z
    .object({
      ...MoveTabBase,
      kind: z.literal('split'),
      splitDirection: z.enum(['left', 'right', 'up', 'down'])
    })
    .strict()
])

export const SaveMarkdownTab = ActivateTab.extend({
  baseVersion: requiredInputString('Missing base version'),
  content: z.string()
})

function requiredInputString(message: string) {
  return z
    .unknown()
    .transform((value) => (typeof value === 'string' ? value : ''))
    .pipe(z.string().min(1, message))
}

export type WorktreeTabSelectorInput = z.infer<typeof WorktreeTabSelector>
export type ActivateTabInput = z.infer<typeof ActivateTab>
export type CreateTerminalTabInput = z.infer<typeof CreateTerminalTab>
export type MoveTabInput = z.infer<typeof MoveTab>
export type SaveMarkdownTabInput = z.infer<typeof SaveMarkdownTab>
export type SessionTabsUnsubscribeInput = z.infer<typeof SessionTabsUnsubscribe>
export type SessionTabsUnsubscribeAllInput = z.infer<typeof SessionTabsUnsubscribeAll>
export type SetTabPropsInput = z.infer<typeof SetTabProps>
export type UpdatePaneLayoutInput = z.infer<typeof UpdatePaneLayout>
