import { z } from 'zod'

export const ORCHESTRATION_WORKER_READ_SOURCES = ['auto', 'transcript', 'terminal'] as const

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

export const OrchestrationWorkerStartInputSchema = z.object({
  task: requiredString('Missing --task'),
  on: OptionalString,
  run: OptionalString,
  from: requiredString('Missing --from'),
  worktree: OptionalString,
  name: OptionalString,
  repo: OptionalString,
  baseBranch: OptionalString,
  displayName: OptionalString,
  comment: OptionalString,
  setup: z.enum(['run', 'skip', 'inherit']).optional(),
  terminal: OptionalString,
  agent: OptionalString,
  retryOf: OptionalString,
  timeoutMs: OptionalFiniteNumber,
  devMode: z.boolean().optional()
})

export const OrchestrationWorkerDispatchInputSchema = z.object({
  dispatch: requiredString('Missing --dispatch')
})

export const OrchestrationWorkerReadInputSchema = OrchestrationWorkerDispatchInputSchema.extend({
  cursor: z.union([z.number().int().nonnegative(), z.string().min(1).max(2_048)]).optional(),
  limit: OptionalFiniteNumber,
  source: z.enum(ORCHESTRATION_WORKER_READ_SOURCES).optional()
})

export const OrchestrationFederationAttachStartInputSchema = z.object({
  dispatchId: requiredString('Missing Dispatch ID'),
  taskId: requiredString('Missing Task ID'),
  taskSpec: requiredString('Missing Task spec'),
  protocolVersion: z.union([z.literal(1), z.literal(2)]),
  worktree: requiredString('Missing remote worktree selector'),
  name: OptionalString,
  repo: OptionalString,
  baseBranch: OptionalString,
  displayName: OptionalString,
  comment: OptionalString,
  setup: z.enum(['run', 'skip', 'inherit']).optional(),
  setupSource: z.enum(['explicit_request', 'orchestration_default']).optional(),
  terminal: OptionalString,
  agent: OptionalString,
  timeoutMs: OptionalFiniteNumber,
  devMode: z.boolean().optional()
})

export const OrchestrationFederationDispatchInputSchema = z.object({
  dispatchId: requiredString('Missing Dispatch ID')
})

export const OrchestrationFederationReadInputSchema =
  OrchestrationFederationDispatchInputSchema.extend({
    cursor: OptionalFiniteNumber,
    limit: OptionalFiniteNumber
  })

export const OrchestrationFederationOutputReadInputSchema =
  OrchestrationFederationDispatchInputSchema.extend({
    cursor: z.union([z.number().int().nonnegative(), z.string().min(1).max(2_048)]).optional(),
    limit: OptionalFiniteNumber,
    source: z.enum(ORCHESTRATION_WORKER_READ_SOURCES).optional()
  })

export const OrchestrationFederationPullInputSchema = z.object({
  dispatchId: requiredString('Missing Dispatch ID'),
  afterSequence: OptionalFiniteNumber,
  limit: OptionalFiniteNumber
})

export const OrchestrationFederationAckInputSchema = z.object({
  dispatchId: requiredString('Missing Dispatch ID'),
  throughSequence: z.number().int().nonnegative()
})

export const OrchestrationFederationImportInputSchema = z.object({
  dispatchId: requiredString('Missing Dispatch ID'),
  items: z.array(
    z.object({
      dispatch_id: requiredString('Missing item Dispatch ID'),
      direction: z.literal('to_worker'),
      sequence: z.number().int().positive(),
      message_id: requiredString('Missing relay message ID'),
      kind: requiredString('Missing relay kind'),
      payload: requiredString('Missing relay payload')
    })
  )
})

export type OrchestrationWorkerStartInput = z.output<typeof OrchestrationWorkerStartInputSchema>
export type OrchestrationWorkerDispatchInput = z.output<
  typeof OrchestrationWorkerDispatchInputSchema
>
export type OrchestrationWorkerReadInput = z.output<typeof OrchestrationWorkerReadInputSchema>
export type OrchestrationFederationAttachStartInput = z.output<
  typeof OrchestrationFederationAttachStartInputSchema
>
export type OrchestrationFederationDispatchInput = z.output<
  typeof OrchestrationFederationDispatchInputSchema
>
export type OrchestrationFederationReadInput = z.output<
  typeof OrchestrationFederationReadInputSchema
>
export type OrchestrationFederationOutputReadInput = z.output<
  typeof OrchestrationFederationOutputReadInputSchema
>
export type OrchestrationFederationPullInput = z.output<
  typeof OrchestrationFederationPullInputSchema
>
export type OrchestrationFederationAckInput = z.output<typeof OrchestrationFederationAckInputSchema>
export type OrchestrationFederationImportInput = z.output<
  typeof OrchestrationFederationImportInputSchema
>
