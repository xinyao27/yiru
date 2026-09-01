import { type, type ContractRouter } from '@orpc/contract'
import { z } from 'zod'

import type { TuiAgent } from '../model/agent.js'
import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'

export type RuntimeLayoutPane =
  | { command: string; kind: 'command'; title: string }
  | { agent: TuiAgent; kind: 'agent'; prompt?: string; title: string }
  | { kind: 'shell'; title: string }

export type RuntimeLayoutRecipe = {
  name: string
  panes: RuntimeLayoutPane[]
}

export type RuntimeAppliedLayoutPane = {
  sessionId: string | null
  terminalHandle: string
  title: string
}

const LayoutListInputSchema = z.object({ worktree: z.string().trim().min(1) })

const LayoutApplyInputSchema = LayoutListInputSchema.extend({
  expectedRevision: z.number().int().nonnegative(),
  name: z.string().trim().min(1).max(128)
})

export const layoutContract = {
  apply: withAccess({ scope: 'worktree', tier: 'control' })
    .input(LayoutApplyInputSchema)
    .output(type<{ panes: RuntimeAppliedLayoutPane[]; revision: number }>()),
  list: withAccess({ scope: 'worktree', tier: 'read' })
    .input(LayoutListInputSchema)
    .output(type<{ recipes: RuntimeLayoutRecipe[] }>())
} satisfies ContractRouter<RuntimeProcedureMeta>
