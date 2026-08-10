import { z } from 'zod'

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

const OptionalBoolean = z
  .unknown()
  .transform((value) => (typeof value === 'boolean' ? value : undefined))
  .pipe(z.union([z.boolean(), z.undefined()]))
  .optional()

export const OrchestrationAskInputSchema = z
  .object({
    to: OptionalString,
    question: OptionalString,
    resume: OptionalString,
    options: OptionalString,
    timeoutMs: OptionalFiniteNumber,
    from: OptionalString,
    run: OptionalString
  })
  .superRefine((params, context) => {
    if ((params.question ? 1 : 0) + (params.resume ? 1 : 0) !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Choose exactly one of --question or --resume.'
      })
    }
  })

export const OrchestrationMessageReadInputSchema = z
  .object({
    terminal: OptionalString,
    terminalPaneKey: OptionalString,
    unread: OptionalBoolean,
    peek: OptionalBoolean,
    all: OptionalBoolean,
    types: OptionalString,
    format: OptionalBoolean,
    inject: OptionalBoolean,
    ack: OptionalString,
    run: OptionalString,
    wait: OptionalBoolean,
    timeoutMs: OptionalFiniteNumber
  })
  .superRefine((params, context) => {
    const modes = [
      params.unread === true,
      params.peek === true,
      params.all === true || (params.unread === false && params.peek !== true)
    ].filter(Boolean)
    if (modes.length > 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Choose at most one message read mode: --unread, --peek, or --all.'
      })
    }
  })

export const OrchestrationReplyInputSchema = z.object({
  id: requiredString('Missing --id'),
  body: requiredString('Missing --body'),
  from: OptionalString,
  run: OptionalString
})

export const OrchestrationInboxInputSchema = z.object({
  limit: OptionalFiniteNumber,
  terminal: OptionalString
})

export const OrchestrationMessageSendInputSchema = z
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
    senderPaneKey: OptionalString,
    run: OptionalString,
    devMode: OptionalBoolean
  })
  .superRefine((params, context) => {
    if (
      (params.type === 'worker_done' || params.type === 'heartbeat') &&
      params.to?.startsWith('@')
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${params.type} messages belong to one exact Dispatch and cannot target a group address.`,
        path: ['to']
      })
    }
  })

export type OrchestrationAskInput = z.output<typeof OrchestrationAskInputSchema>
export type OrchestrationMessageReadInput = z.output<typeof OrchestrationMessageReadInputSchema>
export type OrchestrationReplyInput = z.output<typeof OrchestrationReplyInputSchema>
export type OrchestrationInboxInput = z.output<typeof OrchestrationInboxInputSchema>
export type OrchestrationMessageSendInput = z.output<typeof OrchestrationMessageSendInputSchema>
