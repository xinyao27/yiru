import { type, type ContractRouter } from '@orpc/contract'
import { z } from 'zod'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'

export type DangerousApprovalOperation =
  | 'ritual.enable-archive'
  | 'security.manage-passkey'
  | `terminal.approve:${string}`

export type DangerousApprovalStatus = {
  configured: boolean
  credentialId: string | null
}

const BeginResultSchema = z.object({
  challenge: z.string().min(43).max(100),
  requestId: z.string().uuid()
})

const RegistrationResultSchema = BeginResultSchema.extend({
  userId: z.string().min(22).max(100)
})

const CeremonyResponseSchema = z.object({
  authenticatorData: z.string().max(4_096).optional(),
  clientDataJson: z.string().max(4_096),
  credentialId: z.string().min(1).max(2_048),
  publicKeySpki: z.string().max(4_096).optional(),
  signature: z.string().max(4_096).optional()
})

export const dangerousApprovalContract = {
  beginApproval: withAccess({ scope: 'host', tier: 'control' })
    .input(z.object({ operation: z.string().trim().min(1).max(1_024) }))
    .output(BeginResultSchema),
  beginRegistration: withAccess({ scope: 'host', tier: 'control' })
    .input(z.object({}))
    .output(RegistrationResultSchema),
  finishApproval: withAccess({ scope: 'host', tier: 'control' })
    .input(
      CeremonyResponseSchema.extend({
        operation: z.string().trim().min(1).max(1_024),
        requestId: z.string().uuid()
      })
    )
    .output(type<{ approvedUntil: number }>()),
  finishRegistration: withAccess({ scope: 'host', tier: 'control' })
    .input(CeremonyResponseSchema.extend({ requestId: z.string().uuid() }))
    .output(type<DangerousApprovalStatus>()),
  remove: withAccess({ scope: 'host', tier: 'control' })
    .input(z.object({}))
    .output(type<DangerousApprovalStatus>()),
  status: withAccess({ scope: 'host', tier: 'read' })
    .input(z.object({}))
    .output(type<DangerousApprovalStatus>())
} satisfies ContractRouter<RuntimeProcedureMeta>
