import { type, type ContractRouter } from '@orpc/contract'
import { z } from 'zod'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'

export type BrowserCssChange = {
  after: string
  before: string
  styleSheetUrl: string
}

export type BrowserElementEvidence = {
  column: number | null
  componentName: string | null
  fileName: string | null
  line: number | null
}

const BrowserWritebackTargetSchema = z.object({
  projectId: z.string().min(1),
  worktreeId: z.string().min(1)
})

const BrowserCssChangeSchema = z.object({
  after: z.string().max(128 * 1_024),
  before: z.string().max(128 * 1_024),
  styleSheetUrl: z.string().max(8_192)
})

const BrowserElementEvidenceSchema = z.object({
  column: z.number().int().positive().nullable(),
  componentName: z.string().trim().min(1).max(512).nullable(),
  fileName: z.string().trim().min(1).max(8_192).nullable(),
  line: z.number().int().positive().nullable()
})

export const browserWritebackContract = {
  applyColor: withAccess({ scope: 'project', tier: 'control' })
    .input(
      BrowserWritebackTargetSchema.extend({
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        intent: z.string().max(1_024).optional()
      })
    )
    .output(type<{ terminalHandle: string }>()),
  applyCss: withAccess({ scope: 'project', tier: 'control' })
    .input(
      BrowserWritebackTargetSchema.extend({
        changes: z.array(BrowserCssChangeSchema).min(1).max(32),
        pageUrl: z.string().url().max(8_192)
      })
    )
    .output(type<{ terminalHandle: string }>()),
  locateElement: withAccess({ scope: 'project', tier: 'control' })
    .input(
      BrowserWritebackTargetSchema.extend({
        evidence: BrowserElementEvidenceSchema,
        outerHtml: z.string().max(16_000),
        pageUrl: z.string().url().max(8_192),
        selector: z.string().min(1).max(2_048),
        styles: z
          .record(z.string(), z.string().max(8_192))
          .refine((value) => Object.keys(value).length <= 64)
      })
    )
    .output(type<{ terminalHandle: string }>()),
  recordVerification: withAccess({ scope: 'project', tier: 'control' })
    .input(
      BrowserWritebackTargetSchema.extend({
        detail: z.string().max(4_096),
        pageUrl: z.string().url().max(8_192),
        success: z.boolean(),
        terminalHandle: z.string().min(1).max(512)
      })
    )
    .output(type<{ eventId: number }>())
} satisfies ContractRouter<RuntimeProcedureMeta>
