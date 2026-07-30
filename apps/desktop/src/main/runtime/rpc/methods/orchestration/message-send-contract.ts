import { z } from 'zod'

import {
  OptionalBoolean,
  OptionalString,
  requiredString
} from '../../../../../shared/runtime-method-contracts/runtime-method-params'
import { isGroupAddress } from '../../../orchestration/groups'

function getLifecycleGroupRecipientError(type: 'worker_done' | 'heartbeat'): string {
  return `${type} messages belong to one exact Dispatch and cannot target a group address.`
}

export const MessageSendParams = z
  .object({
    to: OptionalString,
    subject: requiredString('Missing --subject'),
    from: OptionalString,
    body: OptionalString,
    type: z
      .enum([
        'status',
        'dispatch',
        'worker_done',
        'merge_ready',
        'escalation',
        'handoff',
        'decision_gate',
        'question',
        'heartbeat'
      ])
      .optional(),
    priority: z.enum(['normal', 'high', 'urgent']).optional(),
    threadId: OptionalString,
    payload: OptionalString,
    // Why: the remint-stable pane identity verifies lifecycle ownership; the
    // caller-provided handle remains routing metadata only.
    senderPaneKey: OptionalString,
    run: OptionalString,
    devMode: OptionalBoolean
  })
  .superRefine((params, ctx) => {
    if (
      (params.type !== 'worker_done' && params.type !== 'heartbeat') ||
      !params.to ||
      !isGroupAddress(params.to)
    ) {
      return
    }
    // Why: lifecycle messages carry authority for one coordinator; fan-out
    // would create competing lifecycle state in unrelated terminals.
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: getLifecycleGroupRecipientError(params.type),
      path: ['to']
    })
  })
