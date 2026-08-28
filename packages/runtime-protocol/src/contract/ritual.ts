import { type, type ContractRouter } from '@orpc/contract'
import { z } from 'zod'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'

export type RitualProjectResult = {
  detail: string
  projectId: string
  status: 'failed' | 'ready'
}

export type RitualSchedule = {
  archiveOnEndDay: boolean
  enabled: boolean
  endMinutes: number
  startMinutes: number
  timezone: string
  weekdays: number[]
}

export type RitualScheduleStatus = RitualSchedule & {
  lastEndAt: number | null
  lastFailure: string | null
  lastStartAt: number | null
}

export type RitualRunResult = {
  kind: 'end-day' | 'start-day'
  projects: RitualProjectResult[]
  summary: string
}

export const ritualContract = {
  getSchedule: withAccess({ scope: 'host', tier: 'read' })
    .input(z.object({}))
    .output(type<RitualScheduleStatus>()),
  run: withAccess({ scope: 'host', tier: 'control' })
    .input(z.object({ kind: z.enum(['end-day', 'start-day']) }))
    .output(type<RitualRunResult>()),
  setSchedule: withAccess({ scope: 'host', tier: 'control' })
    .input(
      z.object({
        archiveOnEndDay: z.boolean(),
        enabled: z.boolean(),
        endMinutes: z.number().int().min(0).max(1_439),
        startMinutes: z.number().int().min(0).max(1_439),
        timezone: z.string().trim().min(1).max(100),
        weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7)
      })
    )
    .output(type<RitualScheduleStatus>())
} satisfies ContractRouter<RuntimeProcedureMeta>
